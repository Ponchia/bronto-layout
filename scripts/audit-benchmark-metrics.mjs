/** Deterministic per-case, per-detector labels and confusion matrices.
 *
 * Each labeled unit is one (fixture, viewport width, detector code). This
 * deliberately does NOT measure object detection accuracy per DOM element.
 * Cases marked incomplete are excluded from accuracy denominators and
 * reported separately, never treated as true negatives.
 */
export const KNOWN_DETECTORS = Object.freeze({
  measured: Object.freeze(['document-horizontal-overflow', 'broken-image']),
  review: Object.freeze([
    'possible-text-clipping', 'pending-image', 'embedded-frame-uninspected'
  ])
});

function distinctStrings(values, label) {
  if (!Array.isArray(values) || values.some(value =>
      typeof value !== 'string' || !value.trim())) {
    throw new Error(label + ' must be an array of nonempty strings');
  }
  const unique = new Set(values);
  if (unique.size !== values.length) throw new Error(label + ' must not contain duplicates');
  return unique;
}

export function validateBenchmarkManifest(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      data.schemaVersion !== 1 || typeof data.id !== 'string' ||
      typeof data.labelSource !== 'string' || !data.labelSource.trim() ||
      !data.detectors || !Array.isArray(data.cases) ||
      data.cases.length < 1 || data.cases.length > 48) {
    throw new Error('Benchmark must have schemaVersion 1, id, labelSource, detectors, and 1..48 cases');
  }
  const categories = ['measured', 'review'];
  for (const category of categories) {
    const supplied = distinctStrings(data.detectors[category], category);
    const expected = new Set(KNOWN_DETECTORS[category]);
    if (supplied.size !== expected.size || [...supplied].some(code => !expected.has(code))) {
      throw new Error('Benchmark detector taxonomy differs from checked audit codes for ' + category);
    }
  }
  const seen = new Set();
  for (const sample of data.cases) {
    if (!sample || typeof sample !== 'object' || Array.isArray(sample) ||
      typeof sample.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,80}$/.test(sample.id) ||
      seen.has(sample.id) ||
      typeof sample.fixture !== 'string' || !/^[a-z0-9][a-z0-9_.-]*\.html$/i.test(sample.fixture) ||
      !Number.isInteger(sample.width) || sample.width < 200 || sample.width > 10000 ||
      typeof sample.labelReason !== 'string' || !sample.labelReason.trim()) {
      throw new Error('Benchmark has duplicate/invalid case ID, fixture, width, or missing human rationale');
    }
    seen.add(sample.id);
    for (const category of categories) {
      const list = category === 'measured' ? 'expectedMeasured' : 'expectedReview';
      const values = distinctStrings(sample[list], sample.id + '.' + list);
      for (const code of values) {
        if (!KNOWN_DETECTORS[category].includes(code)) {
          throw new Error(sample.id + ': ' + code + ' cannot be labeled as ' + category);
        }
      }
    }
  }
  return data;
}

const newCounts = () => ({ tp:0, fp:0, fn:0, tn:0 });
function addCounts(target, delta) {
  for (const key of ['tp','fp','fn','tn']) target[key] += delta[key];
}
function ratios(counts) {
  return {
    ...counts,
    precision: counts.tp + counts.fp ? counts.tp / (counts.tp + counts.fp) : null,
    recall: counts.tp + counts.fn ? counts.tp / (counts.tp + counts.fn) : null
  };
}

/**
 * rows: [{id,expectedMeasured,expectedReview,observedMeasured,observedReview,
 *         complete:boolean,error?:string}]
 *
 * Returns factual dataset-specific outcomes only. A missing report is never
 * silently counted as a true negative or a false negative.
 */
export function scoreLabeledAuditCases(rows, detectors=KNOWN_DETECTORS) {
  const byCode = {};
  for (const category of ['measured','review']) {
    byCode[category] = Object.fromEntries(detectors[category].map(code => [code,newCounts()]));
  }
  const measured = newCounts();
  const review = newCounts();
  let evaluatedCases = 0;
  let matchingCases = 0;
  const cases = [];
  const incomplete = [];
  for (const row of rows) {
    if (row.complete !== true) {
      incomplete.push({id:row.id,reason:row.error || 'Incomplete browser observation'});
      cases.push({id:row.id,status:'incomplete',reason:row.error || 'Incomplete browser observation'});
      continue;
    }
    const mismatches = [];
    for (const category of ['measured','review']) {
      const expected = distinctStrings(row[category === 'measured' ? 'expectedMeasured' : 'expectedReview'], row.id+'.expected.'+category);
      const observed = distinctStrings(row[category === 'measured' ? 'observedMeasured' : 'observedReview'],row.id+'.observed.'+category);
      for (const code of observed) {
        if (!detectors[category].includes(code)) throw new Error('Unrecognized observed '+category+' code '+code+' in '+row.id);
      }
      for (const code of detectors[category]) {
        const yesExpected = expected.has(code), yesObserved = observed.has(code);
        const key = yesExpected
          ? yesObserved ? 'tp' : 'fn'
          : yesObserved ? 'fp' : 'tn';
        byCode[category][code][key]++;
        (category==='measured'?measured:review)[key]++;
        if (key==='fp' || key==='fn') {
          mismatches.push({category,code,type:key==='fp'?'false-positive':'false-negative'});
        }
      }
    }
    evaluatedCases++;
    if (!mismatches.length) matchingCases++;
    cases.push({id:row.id,status:mismatches.length?'mismatch':'match',mismatches});
  }
  return {
    evaluatedCases,matchingCases,incompleteCases:incomplete.length,
    incomplete,caseResults:cases,
    measured:ratios(measured),review:ratios(review),
    perCode:Object.fromEntries(['measured','review'].map(category=>[
      category,Object.fromEntries(Object.entries(byCode[category]).map(
        ([code,counts])=>[code,ratios(counts)]
      ))
    ])),
    classificationUnit:'one labeled detector code per independent fixture+viewport case',
    representativeOfProductionSites:false
  };
}
