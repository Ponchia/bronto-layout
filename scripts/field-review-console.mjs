/**
 * Optional offline, browser-editable HUMAN labeling surface for captured pages.
 * It consumes hash-verified evidence metadata only, never audit predictions.
 * It neither uploads data nor saves anything without a direct user click.
 * The original script-free gallery remains the default blind visual reference.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { KNOWN_DETECTORS } from './audit-benchmark-metrics.mjs';
import { FIELD_REVIEW_PROTOCOL } from './field-benchmark-core.mjs';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, x => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[x]);
const safeSource = value => {
  try {
    const parsed = new URL(value);
    if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.origin + parsed.pathname;
  } catch { return null; }
};
const safeImage = (file, root, output) => file
  ? path.relative(path.dirname(output), path.resolve(root,file))
    .split(path.sep).map(encodeURIComponent).join('/') : null;
const clientLiteral = value => JSON.stringify(value)
  .replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')
  .replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const labelChecks = (kind, names) => `<fieldset class="categories ${kind}"><legend>${kind === 'measured' ?
  'Measured observation codes (only if independently confirmed)' :
  'Review warning codes (only if independently confirmed)'}</legend>
  ${names.map(code => `<label><input type="checkbox" value="${escapeHTML(code)}">${escapeHTML(code)}</label>`).join('\n')}
</fieldset>`;

/** Self-contained browser logic. Stringify as source: no network, eval or storage. */
function installReviewConsole(dataset) {
  const known = new Map(dataset.cases.map(c => [c.id,c]));
  const cards = [...document.querySelectorAll('[data-case-id]')];
  const message = document.querySelector('#feedback');
  const counts = document.querySelector('#counts');
  const importInput = document.querySelector('#import-labels');
  const expectedCategories = dataset.detectors;
  const reviewProtocol = dataset.reviewProtocol;
  const get = (card, selector) => card.querySelector(selector);
  const decision = card => get(card,'.decision').value;
  const checked = (card, kind) => [...card.querySelectorAll('.'+kind+' input:checked')].map(el=>el.value);
  const labelRow = card => {
    const id = card.dataset.caseId;
    const state = decision(card);
    if (state === 'pending') return { id, reviewStatus: state };
    const record = {
      id, reviewStatus: state,
      reviewer: get(card,'.reviewer').value.trim(),
      reviewedAt: get(card,'.review-date').value,
      rationale: get(card,'.rationale').value.trim()
    };
    if (state === 'reviewed') {
      record.reviewedScreenshot = get(card,'.attest-screenshot').checked;
      record.reviewedRenderedPage = get(card,'.attest-page').checked;
      record.expectedMeasured = checked(card,'measured');
      record.expectedReview = checked(card,'review');
    }
    return record;
  };
  const goodDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  function validate(record) {
    if (!known.has(record.id)) return record.id+': unknown case';
    if (!['pending','reviewed','unreviewable'].includes(record.reviewStatus))
      return record.id+': invalid status';
    if (record.reviewStatus === 'pending') {
      if (Object.keys(record).some(k=>!['id','reviewStatus'].includes(k)))
        return record.id+': pending cases cannot contain review attestations or labels';
      return null;
    }
    if (typeof record.reviewer !== 'string' || record.reviewer.length < 3 ||
        !goodDate(record.reviewedAt) || typeof record.rationale !== 'string' ||
        record.rationale.length < 15) return record.id+': supply reviewer (3+ characters), valid date, and rationale (15+ characters)';
    if (record.reviewStatus === 'reviewed') {
      if (!known.get(record.id).ready) return record.id+': evidence failed verification; do not mark reviewed';
      if (record.reviewedScreenshot !== true || record.reviewedRenderedPage !== true)
        return record.id+': attest to independently inspecting both screenshot and rendered page';
      for (const [kind,allowed] of [['expectedMeasured',expectedCategories.measured],['expectedReview',expectedCategories.review]]) {
        if (!Array.isArray(record[kind]) || new Set(record[kind]).size !== record[kind].length ||
            record[kind].some(v=>!allowed.includes(v))) return record.id+': invalid '+kind+' values';
      }
    } else if ('expectedMeasured' in record || 'expectedReview' in record) {
      return record.id+': unreviewable cases cannot contain expected labels';
    }
    return null;
  }
  function show(note, isError=false) {
    message.textContent=note;
    message.classList.toggle('problem',isError);
    message.setAttribute('role',isError?'alert':'status');
  }
  function update() {
    const stats={pending:0,reviewed:0,unreviewable:0};
    for (const card of cards) {
      const state=decision(card);
      stats[state]++;
      get(card,'.review-fields').hidden=state==='pending';
      get(card,'.reviewed-fields').hidden=state!=='reviewed';
      get(card,'.state-summary').textContent=state==='pending'?'No human judgment recorded':
        state==='reviewed'?'Human review selected; attest and document observations':
          'Unreviewable; record the evidence limitation';
    }
    counts.textContent=stats.reviewed+' reviewed · '+stats.pending+' pending · '+stats.unreviewable+' unreviewable';
  }
  function download() {
    const records=cards.map(labelRow);
    const errors=records.map(validate).filter(Boolean);
    if (errors.length) {
      show('Cannot export: '+errors.slice(0,3).join(' | ')+(errors.length>3?' (and '+(errors.length-3)+' more)':''),true);
      const id=errors[0].split(':')[0];
      const card=cards.find(c=>c.dataset.caseId===id);
      card?.scrollIntoView({block:'center'});
      return;
    }
    const data={schemaVersion:1,datasetId:dataset.id,reviewProtocol,cases:records};
    const blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'});
    const href=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=href;
    link.download='bronto-human-labels-'+dataset.id.replace(/[^a-z0-9_-]/gi,'-')+'.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(href),1500);
    show('Local JSON export requested. Keep it private, verify the download, and score it later using the CLI.');
  }
  function loadRecord(card, record) {
    get(card,'.decision').value=record.reviewStatus;
    get(card,'.reviewer').value=record.reviewer??'';
    get(card,'.review-date').value=record.reviewedAt??'';
    get(card,'.rationale').value=record.rationale??'';
    get(card,'.attest-screenshot').checked=record.reviewedScreenshot===true;
    get(card,'.attest-page').checked=record.reviewedRenderedPage===true;
    for (const kind of ['measured','review']) {
      const values=record[kind==='measured'?'expectedMeasured':'expectedReview']??[];
      for (const option of card.querySelectorAll('.'+kind+' input')) option.checked=values.includes(option.value);
    }
  }
  async function importDraft() {
    const file=importInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 200000) throw new Error('Review JSON exceeds 200 KB');
      const input=JSON.parse(await file.text());
      if (input?.schemaVersion !== 1 || input.datasetId !== dataset.id ||
          !Array.isArray(input.cases) || input.cases.length > cards.length) {
        throw new Error('Dataset, schema version or case count mismatch');
      }
      const rows=new Map();
      for (const record of input.cases) {
        if (!record || typeof record.id!=='string' || !known.has(record.id) || rows.has(record.id))
          throw new Error('Unknown or duplicate case ID');
        const error=validate(record);
        if (error) throw new Error(error);
        rows.set(record.id,record);
      }
      // Import is transactional: validate the entire file before changing controls.
      for (const card of cards) loadRecord(card,rows.get(card.dataset.caseId)??{reviewStatus:'pending'});
      update();
      show('Imported '+rows.size+' reviewer declarations locally. Review them before exporting again.');
    } catch (error) {show('Import rejected: '+error.message,true);}
    finally {importInput.value='';}
  }
  for (const card of cards) get(card,'.decision').addEventListener('change',update);
  document.querySelector('#download-labels').addEventListener('click',download);
  importInput.addEventListener('change',importDraft);
  update();
}

/** Generate a standalone, CSP-hash-locked reviewer UI; no automatic labels. */
export function renderFieldReviewConsole(index, rows, capturesDir, outputFile) {
  if (!index || index.schemaVersion!==1 || typeof index.datasetId!=='string' ||
      !Array.isArray(rows) || rows.length>60 || typeof capturesDir!=='string' ||
      typeof outputFile!=='string') throw new Error('Invalid offline review console input');
  const unique=new Set();
  for (const row of rows) {
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(row.id) || unique.has(row.id))
      throw new Error('Invalid or repeated review case ID');
    unique.add(row.id);
  }
  const byCase = new Map((index.cases??[]).map(entry=>[entry.id,entry]));
  const cards=rows.map(row=>{
    const ready=row.readyForReview===true;
    // This is capture COVERAGE metadata, not an audit prediction or a label.
    // Known iframe interiors are excluded from whole-page field accuracy.
    const scope=byCase.get(row.id)?.contentCoverage;
    const scopeNote=scope==='known-uninspected-content'
      ? 'Known iframe/content gap: excluded from whole-page accuracy scoring.'
      : scope==='truncated'
        ? 'Incomplete DOM traversal: cannot claim full supported-scope coverage.'
        : scope==='supported-scope-measured'
          ? 'Top-document/open-shadow scope measured; other visual surfaces may remain unknown.'
          : 'Content coverage unknown; do not infer full-page correctness.';
    const site=safeSource(row.url);
    const screenshot=row.screenshotVerified
      ? safeImage(row.screenshotFile,capturesDir,outputFile):null;
    const full=row.fullPageEvidenceVerified===true
      ? safeImage(row.fullPageScreenshotFile,capturesDir,outputFile):null;
    const fig=(src,title)=>src
      ? `<figure><a href="${escapeHTML(src)}" target="_blank" rel="noopener"><img src="${escapeHTML(src)}" alt="${escapeHTML(title+' for '+row.id)}" loading="lazy" decoding="async"></a><figcaption>${escapeHTML(title)} · hash verified when this file was generated</figcaption></figure>`
      : `<p class="missing">${escapeHTML(title)}: unavailable or invalid hash. Do not claim reviewed.</p>`;
    return `<article class="case${ready?'':' unsafe'}" data-case-id="${escapeHTML(row.id)}" id="${escapeHTML(row.id)}">
      <div class="heading"><div><h2>${escapeHTML(row.id)}</h2><p>${escapeHTML(String(row.width))} CSS px${row.locale?' · '+escapeHTML(row.locale):''}</p></div><strong class="status">${ready?'Verified evidence':'Evidence unsafe'}</strong></div>
      <p>${site?`<a href="${escapeHTML(site)}" rel="noopener noreferrer" target="_blank">Independently inspect rendered page</a>`:'Source URL unavailable'}</p>
      <p class="hint"><strong>Coverage:</strong> ${escapeHTML(scopeNote)}</p>
      <div class="columns"><div class="evidence">${fig(screenshot,'Initial viewport screenshot')}
      ${row.fullPageEvidenceVerified!==null?`<details><summary>See bounded document evidence${row.fullPageTruncated?' (truncated)':''}</summary>${fig(full,'Bounded document screenshot')}<p>${row.fullPageTruncated?'Image excludes additional below-fold content.':'One static captured state only; lazy or interactive content may be missing.'}</p></details>`:
        '<p class="hint">No below-fold screenshot captured. Inspect the live page.</p>'}</div>
      <div class="labels"><label class="primary">Independent review status
        <select class="decision"><option value="pending">Pending (no judgment)</option>
        <option value="reviewed"${ready?'':' disabled'}>Reviewed after independent inspection</option>
        <option value="unreviewable">Unreviewable / evidence insufficient</option></select></label>
        <p class="state-summary">No human judgment recorded</p>
        <div class="review-fields" hidden><label>Reviewer identifier<input class="reviewer" type="text" maxlength="120" autocomplete="off" placeholder="Human reviewer"></label>
        <label>Review date<input class="review-date" type="date"></label>
        <label>Rationale and intentional exceptions<textarea class="rationale" rows="3" maxlength="12000" placeholder="What did you inspect? What was intentional, defective, or uncertain?"></textarea></label>
        <div class="reviewed-fields" hidden><label class="attest"><input type="checkbox" class="attest-screenshot"> I inspected the screenshot independently</label>
        <label class="attest"><input type="checkbox" class="attest-page"> I inspected the live rendered page and relevant states</label>
        ${labelChecks('measured',KNOWN_DETECTORS.measured)}
        ${labelChecks('review',KNOWN_DETECTORS.review)}
        <p class="hint">Leave a code unchecked only after deciding it was absent. An empty list is a deliberate human judgment, not an automatic clean result.</p></div></div></div></div>
    </article>`;
  }).join('\n');
  const clientData={id:index.datasetId,reviewProtocol:FIELD_REVIEW_PROTOCOL,
    cases:rows.map(row=>({id:row.id,ready:row.readyForReview===true})),
    detectors:KNOWN_DETECTORS};
  const script='('+installReviewConsole.toString()+')('+clientLiteral(clientData)+');';
  const scriptHash=createHash('sha256').update(script).digest('base64');
  const ready=rows.filter(row=>row.readyForReview).length;
  const contents=rows.map(row=>`<a href="#${escapeHTML(row.id)}">${escapeHTML(row.id)}</a>`).join(' · ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src 'self' file: data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'">
<meta name="referrer" content="no-referrer"><title>Independent human review console · ${escapeHTML(index.datasetId)}</title>
<style>
:root{font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light}
*{box-sizing:border-box}body{margin:0;background:#f1f3f5;color:#1d2a35}a{color:#145985}a:focus-visible,button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #d79534;outline-offset:2px}header{background:#182c40;color:white;padding:2rem max(1rem,calc((100vw - 1300px)/2))}header p{color:#e2e8ee;max-width:85ch}h1{font-size:clamp(1.55rem,3vw,2.3rem);margin:.25rem 0}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.76rem}main{max-width:1340px;margin:auto;padding:1.4rem 1rem 4rem}.toolbar{background:white;border:1px solid #dce2e8;border-radius:10px;padding:1rem;margin-bottom:1.3rem;display:flex;flex-wrap:wrap;align-items:center;gap:.9rem}.toolbar button,.import-file{font:inherit;background:#153c60;color:white;border:0;border-radius:6px;padding:.6rem .85rem;cursor:pointer}.import-file{background:#e4e9ee;color:#263d54;border:1px solid #c8d2dc}.import-file input{display:none}.toolbar #counts{margin-left:auto;font-weight:650}.notice{border-left:3px solid #6593b1;padding:.6rem .8rem;background:#f7fafc}.notice.problem{border-left-color:#bd4a40;background:#fff1ee}.case{background:white;border:1px solid #dbe2e8;border-radius:11px;padding:1.15rem;margin:1.15rem 0;box-shadow:0 2px 10px #152a3811}.case.unsafe{border-color:#b5684d;background:#fff8f2}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.heading h2{margin:0;font-size:1.16rem}.heading p{margin:.2rem 0;color:#556877}.status{font-size:.75rem;padding:.25rem .45rem;border-radius:5px;background:#e8f2e9;color:#285b3b}.unsafe .status{background:#f5dfd1;color:#7b3c26}.columns{display:grid;grid-template-columns:minmax(250px,.95fr) minmax(280px,1fr);gap:1.3rem}.evidence figure{margin:.65rem 0}figure a{display:block;background:#e7edf1;max-height:480px;overflow:auto;border:1px solid #d9e0e6;border-radius:6px;text-align:center}figure img{display:block;max-width:100%;height:auto;margin:auto}figcaption{font-size:.76rem;color:#62717c;margin-top:.3rem}details{margin-top:.6rem;border-top:1px solid #e0e6eb;padding-top:.5rem}details summary{cursor:pointer;font-weight:600}.labels{border-left:1px solid #e2e8ed;padding-left:1.25rem}label{display:block;font-weight:600;margin-bottom:.65rem}input[type=text],input[type=date],select,textarea{display:block;width:100%;font:inherit;background:white;border:1px solid #bdcbd5;padding:.55rem;border-radius:6px;margin-top:.25rem;color:#1d2a35}textarea{resize:vertical}.attest,.categories label{font-weight:400}.attest input,.categories input{margin-right:.4rem}.categories{margin:.8rem 0;padding:.7rem .85rem;border:1px solid #dce2e8;border-radius:7px}.categories legend{font-size:.82rem;font-weight:700;color:#425b70}.categories label{margin:.35rem 0;font-size:.84rem}.hint,.state-summary{font-size:.83rem;color:#536777}.missing{background:#faebe5;padding:.8rem;border-radius:6px;color:#7b3c26}footer{margin:2rem 0;color:#63717d;font-size:.83rem} [hidden]{display:none!important}
@media(max-width:740px){.columns{grid-template-columns:1fr}.labels{border-left:0;border-top:1px solid #e2e8ed;padding-left:0;padding-top:.8rem}.toolbar #counts{margin-left:0;width:100%}}
</style></head><body><header><div class="eyebrow">Bronto Layout · independent review</div><h1>Human labeling console</h1>
<p>Dataset <strong>${escapeHTML(index.datasetId)}</strong> · <strong>${ready}/${rows.length}</strong> case captures hash-verified at generation. This is evidence integrity, not a quality verdict.</p>
<p>Captured ${escapeHTML(index.capturedAt??'unknown date')} · source revision <code>${escapeHTML(index.sourceCommit??'unknown')}</code></p>
<p><strong>No audit predictions, remote scripts, server communication or automatic labels.</strong> Inspect the original rendered page before choosing labels. Inputs remain in this tab until you explicitly export a JSON file.</p></header>
<main><nav class="contents" aria-label="Jump to a captured state">${contents}</nav><div class="toolbar"><button type="button" id="download-labels">Export human labels JSON</button>
<label class="import-file">Import existing reviewer JSON<input id="import-labels" type="file" accept=".json,application/json"></label>
<span id="counts">0 reviewed</span></div><p class="notice" id="feedback" role="status">All cases begin pending. Do not mark a page clean without personally inspecting it. Exported files remain local and are not scored here.</p>
${cards}<footer>Offline labeling console. A declaration of human review does not prove a person actually inspected the live page. Verify exported JSON with <code>field-benchmark.mjs review-progress</code>, then score separately after independent review. Never publish private screenshots or reviewer notes.</footer></main>
<script>${script}</script></body></html>`;
}
