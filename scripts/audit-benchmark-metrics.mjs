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

export const LOCALIZABLE_CODES = Object.freeze([
  'broken-image', 'possible-text-clipping'
]);

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
  if (data.localization !== undefined) {
    const codes = distinctStrings(data.localization?.codes, 'localization.codes');
    if (codes.size !== LOCALIZABLE_CODES.length ||
        [...codes].some(code => !LOCALIZABLE_CODES.includes(code))) {
      throw new Error('Localization must list the exact supported element-path detector codes');
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
    if (data.localization) {
      if (!sample.expectedLocations || typeof sample.expectedLocations !== 'object' ||
          Array.isArray(sample.expectedLocations) ||
          Object.keys(sample.expectedLocations).length !== data.localization.codes.length) {
        throw new Error(sample.id + ' must label all declared element-path detector codes');
      }
      for (const code of data.localization.codes) {
        const paths = distinctStrings(sample.expectedLocations[code], sample.id + '.expectedLocations.' + code);
        if ([...paths].some(value => !value.startsWith('#') || value.length > 350)) {
          throw new Error(sample.id + ': expected element paths must be bounded, exact ID-based locators');
        }
        const expectedCodes = code === 'broken-image' ? sample.expectedMeasured : sample.expectedReview;
        if (paths.size && !expectedCodes.includes(code)) {
          throw new Error(sample.id + ': positive element labels require a positive detector code');
        }
        if (!paths.size && expectedCodes.includes(code)) {
          throw new Error(sample.id + ': expected positive detector code has no element localization ground truth');
        }
      }
      if (Object.keys(sample.expectedLocations).some(code => !data.localization.codes.includes(code))) {
        throw new Error(sample.id + ': unknown element-path detector code');
      }
    } else if (sample.expectedLocations !== undefined) {
      throw new Error(sample.id + ': expectedLocations requires a localization declaration');
    }
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
  const localized = rows.some(row => row.expectedLocations !== undefined)
    ? scoreLabeledElementLocations(rows) : undefined;
  return {
    ...(localized ? { localization: localized } : {}),
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


/**
 * Exact element-location scoring for explicitly labeled code/path pairs.
 *
 * Unlike detector/viewport accuracy, there is no sensible universe of true
 * negatives among all possible DOM paths. Only TP, FP and FN are defined.
 * Missing element evidence or truncated records exclude the case and are
 * counted as incomplete, never as a correct empty prediction.
 */
export function scoreLabeledElementLocations(rows) {
  const perCode = Object.fromEntries(LOCALIZABLE_CODES.map(code => [code, { tp:0, fp:0, fn:0 }]));
  const incomplete = [];
  const caseResults = [];
  let evaluatedCases = 0;
  let matchingCases = 0;
  const distinct = (paths, label) => distinctStrings(paths, label);
  for (const row of rows) {
    if (row.expectedLocations === undefined) continue;
    if (row.complete !== true || row.localizationComplete !== true) {
      const reason = row.localizationError || row.error || 'No complete element-level evidence';
      incomplete.push({ id:row.id, reason });
      caseResults.push({ id:row.id, status:'incomplete', reason });
      continue;
    }
    const mismatches = [];
    for (const code of LOCALIZABLE_CODES) {
      const expected = distinct(row.expectedLocations[code], row.id+'.expectedLocations.'+code);
      const observed = distinct(row.observedLocations?.[code], row.id+'.observedLocations.'+code);
      const counts = perCode[code];
      for (const path of expected) {
        if (observed.has(path)) counts.tp++;
        else { counts.fn++; mismatches.push({ code, path, type:'false-negative' }); }
      }
      for (const path of observed) {
        if (!expected.has(path)) { counts.fp++; mismatches.push({ code, path, type:'false-positive' }); }
      }
    }
    evaluatedCases++;
    if (!mismatches.length) matchingCases++;
    caseResults.push({ id:row.id, status:mismatches.length?'mismatch':'match', mismatches });
  }
  const totals = { tp:0, fp:0, fn:0 };
  const named = Object.fromEntries(Object.entries(perCode).map(([code,counts]) => {
    for (const key of ['tp','fp','fn']) totals[key] += counts[key];
    return [code, {
      ...counts,
      precision:counts.tp+counts.fp ? counts.tp/(counts.tp+counts.fp) : null,
      recall:counts.tp+counts.fn ? counts.tp/(counts.tp+counts.fn) : null
    }];
  }));
  return {
    labeledCases:caseResults.length,
    evaluatedCases,
    matchingCases,
    incompleteCases:incomplete.length,
    incomplete,
    caseResults,
    tp:totals.tp, fp:totals.fp, fn:totals.fn,
    precision:totals.tp+totals.fp ? totals.tp/(totals.tp+totals.fp) : null,
    recall:totals.tp+totals.fn ? totals.tp/(totals.tp+totals.fn) : null,
    perCode:named,
    classificationUnit:'exact detector-code and browser DOM element path',
    trueNegativesDefined:false,
    representativeOfProductionSites:false
  };
}
