/**
 * Static, offline-first visual contact sheet for independently reviewing page
 * screenshots. No scripts, detector results, auto-generated labels or uploads.
 * All dynamic HTML (including paths) is escaped before it reaches the page.
 */
import path from 'node:path';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[char]);

function localImageReference(outputFile, captureRoot, name) {
  if (!name || typeof name !== 'string') return null;
  // Paths are checked against the capture root separately during hashing.
  const absolute = path.resolve(captureRoot, name);
  const relative = path.relative(path.dirname(outputFile), absolute);
  // Fragment/query characters and HTML syntax cannot change what file loads.
  return relative.split(path.sep).map(encodeURIComponent).join('/');
}
function sourceSite(url) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.origin + parsed.pathname; // never export URL query tokens
  } catch { return null; }
}
const figure = (href, description, status) => href
  ? `<figure><a class="preview" href="${escapeHTML(href)}" target="_blank" rel="noopener"><img src="${escapeHTML(href)}" alt="${escapeHTML(description)}" loading="lazy" decoding="async"></a><figcaption>${escapeHTML(description)} · ${escapeHTML(status)}</figcaption></figure>`
  : `<p class="missing" role="status">${escapeHTML(description)}: unavailable or integrity check failed. Do not score.</p>`;

/** Rows must come from hash-verified capture evidence, NOT from audit predictions. */
export function renderFieldReviewGallery(index, rows, capturesDir, outputFile) {
  if (!index || index.schemaVersion !== 1 || !Array.isArray(rows) || rows.length > 60 ||
      typeof index.datasetId !== 'string' || typeof capturesDir !== 'string' || typeof outputFile !== 'string') {
    throw new Error('Invalid capture index or review gallery data');
  }
  const verified = rows.filter(row => row.readyForReview).length;
  const cards = rows.map(item => {
    const site = sourceSite(item.url);
    const shortSite = site ? new URL(site).hostname : 'Site URL unavailable';
    const viewport = item.screenshotVerified
      ? localImageReference(outputFile, capturesDir, item.screenshotFile) : null;
    const full = item.fullPageEvidenceVerified === true
      ? localImageReference(outputFile, capturesDir, item.fullPageScreenshotFile) : null;
    const needsFull = item.fullPageEvidenceVerified !== null;
    const ready = item.readyForReview;
    return `<article class="case ${ready ? 'ready' : 'unverified'}" id="${escapeHTML(item.id)}">
      <div class="case-header"><div><h2>${escapeHTML(item.id)}</h2><p class="site">${escapeHTML(shortSite)} · ${escapeHTML(item.width)} CSS px${item.locale ? ' · '+escapeHTML(item.locale) : ''}</p></div><span class="status">${ready ? 'Evidence verified' : 'Incomplete evidence'}</span></div>
      <p class="meta">${site ? `<a href="${escapeHTML(site)}" target="_blank" rel="noopener noreferrer">Open rendered site for independent inspection</a>` : 'Source URL unavailable'}</p>
      ${figure(viewport, 'Initial viewport screenshot', item.screenshotVerified ? 'SHA-256 verified at gallery generation' : 'unverified')}
      ${needsFull ? `<details><summary>Additional bounded document screenshot${item.fullPageTruncated ? ' — truncated' : ''}</summary>
        ${figure(full, 'Bounded document screenshot', item.fullPageEvidenceCoverage ?? 'unknown coverage')}
        <p class="meta">${item.fullPageTruncated ? 'Document exceeds bounded capture; remaining content is NOT shown.' : 'Only this rendered state was captured; lazy/interactive content may still be missing.'}</p>
      </details>` : `<p class="meta">Viewport-only archive. Below-fold content must be reviewed in the live page.</p>`}
      <p class="verify">Audit report SHA-256: ${item.reportVerified ? 'verified' : 'MISSING OR MISMATCHED'} · Image evidence: ${ready ? 'verified' : 'NOT VERIFIED'}</p>
      <p class="notes">Human review pending. Record intended exceptions and confirmed defects separately, before examining any automatic audit report.</p>
    </article>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><title>Independent field review · ${escapeHTML(index.datasetId)}</title>
<style>
:root{font:15px/1.48 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light}
*{box-sizing:border-box}body{margin:0;background:#f3f5f6;color:#17222e}header{background:#172b40;color:#f9fafb;padding:2.2rem max(1rem,calc((100vw - 1260px)/2)) 1.65rem}h1{font-size:clamp(1.5rem,3.5vw,2.3rem);line-height:1.16;margin:.2rem 0 .7rem}header p{max-width:70ch;color:#d7e0e8;margin:.6rem 0}header strong{color:#fff}.eyebrow{font-size:.8rem;letter-spacing:.13em;text-transform:uppercase;font-weight:700}main{max-width:1290px;margin:0 auto;padding:1.3rem 1rem 4rem}.summary{background:#fff;border:1px solid #dce2e7;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.35rem}.summary p{margin:.4rem 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));align-items:start;gap:1.1rem}.case{background:#fff;border:1px solid #dce2e7;border-radius:11px;padding:1rem;min-width:0;box-shadow:0 2px 11px #17222e09}.case.unverified{border-color:#b75b2e;background:#fff8f3}.case-header{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:.6rem}h2{font-size:1.04rem;margin:0;overflow-wrap:anywhere}.site{font-size:.8rem;color:#546473;margin:.3rem 0}.status{font-size:.72rem;font-weight:700;border-radius:6px;padding:.24rem .42rem;background:#ecf4ef;color:#205539}.unverified .status{background:#fff0e7;color:#914521}a{color:#175781;overflow-wrap:anywhere}a:focus-visible,summary:focus-visible{outline:3px solid #db853a;outline-offset:2px}.meta{color:#566775;font-size:.8rem}.preview{display:flex;align-items:flex-start;justify-content:center;max-height:390px;overflow:auto;border-radius:7px;background:#e9edf0;border:1px solid #dce2e7}.preview img{width:auto;max-width:100%;height:auto;display:block}.preview:hover{outline:2px solid #8faabd}figure{margin:.8rem 0}figcaption{font-size:.77rem;color:#617181;margin-top:.35rem}.missing{padding:.8rem;background:#fff1e6;border:1px dashed #bd845b;border-radius:6px;color:#713b14}details{border-top:1px solid #e5e9ed;margin-top:.85rem;padding-top:.65rem}summary{cursor:pointer;font-weight:600;color:#2a536f}.verify{border-top:1px solid #e5e9ed;padding-top:.75rem;font-size:.77rem;color:#617181}.notes{font-size:.79rem;color:#596b78}footer{margin:2rem 0 0;color:#566775;font-size:.83rem}
@media print{header{color:#17222e;background:white}.grid{display:block}.case{break-inside:avoid;margin-bottom:1.4rem;box-shadow:none}.preview{max-height:220px}details:not([open]){display:none}}
</style></head><body>
<header><p class="eyebrow">Bronto Layout · independent evidence</p><h1>Field review contact sheet</h1>
<p>Dataset <strong>${escapeHTML(index.datasetId)}</strong> · Source commit <code>${escapeHTML(index.sourceCommit ?? 'unknown')}</code></p>
<p>Captured ${escapeHTML(index.capturedAt ?? 'unknown')} · <strong>${verified}/${rows.length}</strong> cases have hash-verified evidence.</p>
<p>No detector predictions, automatic labels, defect claims or remote scripts are included. Review the running website independently before reading the audit JSON.</p></header>
<main><section class="summary" aria-label="Review guidance"><p><strong>Review procedure:</strong> Compare the screenshot with the rendered page at the recorded CSS width. Inspect below-the-fold and interactive states, note intentional layout choices, and record uncertainty. A passing screenshot hash means the file is unchanged, <strong>not that the design is correct.</strong></p><p>Use the separate review worksheet and label schema to record human observations. Screenshots are local files and may be incomplete due to clipping, lazy loading, embedded frames or page changes. Any incomplete evidence must not be scored.</p></section>
<div class="grid">${cards}</div><footer>This document is generated entirely offline. It does not submit data, store human labels, or interpret the automatic audit findings. Hash checks reflect files as they existed when this gallery was generated.</footer></main></body></html>`;
}
