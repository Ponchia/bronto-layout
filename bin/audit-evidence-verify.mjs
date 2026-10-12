/** Offline, bounded integrity validation for copied paired audit screenshots.
 * Never opens a browser, uses a URL, follows evidence symlinks, executes HTML,
 * computes layout quality or generates human defect labels.
 */
import {createHash} from 'node:crypto';
import {lstat, stat, realpath, readFile} from 'node:fs/promises';
import path from 'node:path';

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const signature = Buffer.from([137,80,78,71,13,10,26,10]);
const validWidth = width => Number.isSafeInteger(width) && width >= 200 && width <= 10000;
const validHash = digest => typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validatedRows(report) {
  if (!isRecord(report) || report.schemaVersion !== 1 || report.mode !== 'audit-compare' ||
      !Array.isArray(report.sampledWidths) || !Array.isArray(report.comparisonEvidence) ||
      !report.comparisonEvidence.length || report.comparisonEvidence.length > 200 ||
      report.sampledWidths.length !== report.comparisonEvidence.length ||
      report.sampledWidths.some(width => !validWidth(width)) ||
      new Set(report.sampledWidths).size !== report.sampledWidths.length) {
    throw new Error('Evidence verification requires an audit-compare v1 report with 1..200 distinct paired viewport widths');
  }
  const samples = new Set(report.sampledWidths);
  const widths = new Set();
  for (const pair of report.comparisonEvidence) {
    if (!isRecord(pair) || !validWidth(pair.width) || widths.has(pair.width) || !samples.has(pair.width)) {
      throw new Error('Comparison evidence contains an unexpected, duplicate or invalid viewport width');
    }
    widths.add(pair.width);
    for (const version of ['baseline','candidate']) {
      const entry = pair[version];
      const filename = `audit-${version}-${pair.width}px.png`;
      if (!isRecord(entry) || entry.coverage !== 'viewport-only' || !validHash(entry.sha256) ||
          typeof entry.file !== 'string') {
        throw new Error('Invalid '+version+' screenshot evidence at '+pair.width+'px');
      }
      // The record may describe a DIFFERENT original machine's absolute path.
      // Validate the basename without ever dereferencing that arbitrary path.
      // Only a canonical filename under the explicitly supplied review directory
      // is opened; relative traversal or URLs in the report are not permitted.
      const posix = path.isAbsolute(entry.file) && path.basename(entry.file) === filename;
      const windows = path.win32.isAbsolute(entry.file) && path.win32.basename(entry.file) === filename;
      if (!posix && !windows) {
        throw new Error('Invalid '+version+' screenshot path provenance at '+pair.width+'px');
      }
    }
  }
  if (widths.size !== samples.size) throw new Error('Comparison evidence omits a sampled viewport');
  return [...report.comparisonEvidence].sort((a,b) => a.width-b.width);
}

async function checkImage(directory, width, version, entry) {
  const filename = `audit-${version}-${width}px.png`;
  const file = path.join(directory,filename);
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('Not a regular, non-symlink image file');
    if (info.size > MAX_IMAGE_BYTES || info.size < 33) throw new Error('Image is empty, truncated, or exceeds the 32 MiB verification cap');
    const resolved = await realpath(file);
    if (path.dirname(resolved) !== directory) throw new Error('Image resolves outside the selected evidence directory');
    const bytes = await readFile(file);
    if (bytes.length !== info.size) throw new Error('Image changed during verification');
    if (!bytes.subarray(0,8).equals(signature) || bytes.readUInt32BE(8) !== 13 ||
        bytes.toString('ascii',12,16) !== 'IHDR') throw new Error('PNG signature or IHDR header missing');
    const imageWidth = bytes.readUInt32BE(16), imageHeight = bytes.readUInt32BE(20);
    if (!imageWidth || !imageHeight || imageWidth > 50000 || imageHeight > 50000) {
      throw new Error('PNG dimensions are missing or out of bounds');
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== entry.sha256) throw new Error('SHA-256 checksum mismatch (modified screenshot)');
    return {status:'verified',filename,pixelWidth:imageWidth,pixelHeight:imageHeight,bytes:bytes.length};
  } catch (error) {
    // A failed/missing evidence image is never a clean result. Bound error text;
    // avoid disclosing original report paths or arbitrary file contents.
    const reason = error?.code === 'ENOENT' ? 'Screenshot is missing' :
      error?.message === 'SHA-256 checksum mismatch (modified screenshot)' ? 'Screenshot SHA-256 mismatch' :
      error?.message === 'Not a regular, non-symlink image file' ? 'Screenshot must be a regular non-symlink file' :
      error?.message === 'Image resolves outside the selected evidence directory' ? 'Screenshot path escapes evidence directory' :
      error?.message === 'PNG signature or IHDR header missing' ? 'Invalid PNG header' :
      error?.message === 'PNG dimensions are missing or out of bounds' ? 'Invalid PNG dimensions' :
      error?.message === 'Image is empty, truncated, or exceeds the 32 MiB verification cap' ? 'Invalid image length (limit 32 MiB)' :
      'Screenshot cannot be safely verified';
    return {status:'unsafe',filename,reason};
  }
}

/** Detect identity through exact paths, symlinks and hardlinks to protect
 * the original comparison report even on a failed verification command.
 */
export async function sameEvidenceFile(first, second) {
  if (path.resolve(first) === path.resolve(second)) return true;
  try {
    const [a,b] = await Promise.all([stat(first),stat(second)]);
    return a.dev === b.dev && a.ino === b.ino;
  } catch { return false; }
}

/** Verify only the saved PNG evidence, not visual correctness, DOM or audit labels. */
export async function verifyPairedAuditEvidence(report, evidenceDirectory) {
  if (typeof evidenceDirectory !== 'string' || !evidenceDirectory.trim()) {
    throw new Error('Evidence verification requires an existing local directory');
  }
  const pairs = validatedRows(report);
  const directory = await realpath(path.resolve(evidenceDirectory));
  let verifiedImages = 0;
  const records = [];
  for (const pair of pairs) {
    const baseline = await checkImage(directory,pair.width,'baseline',pair.baseline);
    const candidate = await checkImage(directory,pair.width,'candidate',pair.candidate);
    verifiedImages += Number(baseline.status === 'verified') + Number(candidate.status === 'verified');
    records.push({width:pair.width,baseline,candidate});
  }
  const totalImages = pairs.length * 2;
  return {
    schemaVersion:1,mode:'evidence-verify',status:verifiedImages === totalImages?'verified':'unsafe',
    summary:{pairedWidths:pairs.length,totalImages,verifiedImages,unsafeImages:totalImages-verifiedImages},
    records,
    limitations:[
      'SHA-256 checks file integrity against the supplied comparison report; the report itself must come from a trusted source',
      'PNG signature/IHDR is only a bounded structural precheck, not a complete image decode or visual quality validation',
      'This command does not inspect DOM, run a browser, make visual-diff claims or generate independent defect labels',
      'Original machine paths are provenance only; all files are read by exact canonical names under the chosen local evidence directory'
    ]
  };
}
