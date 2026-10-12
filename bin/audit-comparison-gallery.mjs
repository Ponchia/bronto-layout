/** Static, offline-only side-by-side viewport comparison.
 * Shows previously captured PNG evidence. It never reads browser findings,
 * computes a visual diff, contacts a server or generates human defect labels.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';

const css = `
:root{font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f2f5f7;color:#1b2d3c}
header{background:#162e41;color:#f9fbfc;padding:2rem max(1rem,calc((100vw - 1300px)/2))}
header h1{font-size:clamp(1.55rem,3.3vw,2.35rem);line-height:1.17;margin:.3rem 0 .65rem}
header p{max-width:83ch;color:#e1eaf0;margin:.55rem 0}.eyebrow{font-size:.78rem;letter-spacing:.11em;text-transform:uppercase;font-weight:700}
main{max-width:1340px;margin:auto;padding:1.4rem 1rem 4rem}.guidance{background:white;border:1px solid #d9e2e8;border-radius:9px;padding:1rem 1.25rem}
nav{display:flex;flex-wrap:wrap;gap:.6rem;margin:1rem 0 1.7rem}a{color:#175d8d}nav a{padding:.35rem .65rem;background:white;border:1px solid #d0dce4;border-radius:5px;text-decoration:none}
a:focus-visible{outline:3px solid #b16e20;outline-offset:3px}.case{background:white;border:1px solid #d8e1e7;border-radius:11px;padding:1.1rem;margin:1.3rem 0;scroll-margin-top:1rem}
h2{margin:0 0 1rem;font-size:1.28rem}.columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;align-items:start}
figure{margin:0;min-width:0;border:1px solid #d7dfe6;border-radius:7px;overflow:hidden;background:#f1f4f6}
figure h3{font-size:.98rem;margin:0;padding:.7rem .9rem;background:#e5ebf0;color:#213f54}
figure a{display:block;min-width:0;max-height:680px;overflow:auto;text-align:center}figure img{display:block;max-width:100%;height:auto;margin:auto}
figcaption{padding:.75rem .9rem;font-size:.77rem;color:#526878;overflow-wrap:anywhere}code{font-size:.82em;word-break:break-all}
footer{color:#526878;margin:1.5rem 0;font-size:.83rem}
@media(max-width:720px){.columns{grid-template-columns:minmax(0,1fr)}figure a{max-height:440px}}
@media print{header{background:white;color:#162e41}header p{color:#263b4c}.case{break-inside:avoid}figure a{max-height:none}}
`;

function validRecord(record, directory, version, width) {
  const filename = `audit-${version}-${width}px.png`;
  if (!record || typeof record !== 'object' ||
      record.coverage !== 'viewport-only' ||
      typeof record.file !== 'string' ||
      path.resolve(record.file) !== path.resolve(directory, filename) ||
      typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) {
    throw new Error('Paired review gallery requires verified viewport evidence for ' + version + ' at ' + width + 'px');
  }
  return { filename, sha256:record.sha256 };
}

export function renderPairedAuditGallery(evidence, directory) {
  if (!Array.isArray(evidence) || !evidence.length || evidence.length > 200 ||
      typeof directory !== 'string' || !directory.trim()) {
    throw new Error('Comparison gallery needs a directory and 1..200 paired widths');
  }
  const seen = new Set();
  const cards = evidence.map(pair => {
    const width = pair?.width;
    if (!Number.isSafeInteger(width) || width < 200 || width > 10000 || seen.has(width)) {
      throw new Error('Invalid or repeated comparison gallery viewport width');
    }
    seen.add(width);
    const baseline=validRecord(pair.baseline,directory,'baseline',width);
    const candidate=validRecord(pair.candidate,directory,'candidate',width);
    const figure=(kind, meta) => `<figure><h3>${kind}</h3>
<a href="${meta.filename}" rel="noopener"><img src="${meta.filename}" alt="${kind} layout at ${width} CSS pixels" loading="lazy" decoding="async"></a>
<figcaption>${meta.filename} · Viewport-only PNG · SHA-256: <code>${meta.sha256}</code></figcaption></figure>`;
    return `<section class="case" id="width-${width}"><h2>${width} CSS pixels</h2>
<div class="columns">${figure('Baseline',baseline)}${figure('Candidate',candidate)}</div></section>`;
  });
  const links=evidence.map(pair=>`<a href="#width-${pair.width}">${pair.width}px</a>`).join('');
  const cssHash=createHash('sha256').update(css).digest('base64');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file:; style-src 'sha256-${cssHash}'; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
<meta name="referrer" content="no-referrer"><title>Bronto Layout · Paired viewport evidence</title>
<style>${css}</style></head><body>
<header><p class="eyebrow">Bronto Layout · visual evidence</p><h1>Before / after viewport comparison</h1>
<p>${evidence.length} paired width${evidence.length===1?'':'s'}, captured locally after each browser revision was independently measured.
These are screenshots for inspection, not automatic pixel diffs, defect labels, or a claim that either design is correct.</p></header>
<main><div class="guidance"><strong>Review guidance</strong><p>Compare the two rendered viewport images at the same CSS width. Inspect DOM and numerical audit findings separately; layout intent remains a human decision. Screenshots may reveal user-entered values or private content. The images below are viewport-only and do not certify below-fold, lazy, iframe or interactive states.</p><p>SHA-256 digests record what was captured, but viewing this local file does not re-validate the images. Check hashes against the JSON comparison report before relying on copied artifacts. No scripts, remote resources, uploads or storage are used.</p></div>
<nav aria-label="Jump to viewport width">${links}</nav>${cards.join('\n')}
<footer>Static offline evidence · No visual-diff algorithm or automated ground-truth labels · Bronto Layout</footer></main></body></html>`;
}
