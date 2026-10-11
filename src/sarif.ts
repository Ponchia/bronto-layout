import type { LayoutReport } from './core.js';
import type { LayoutComparison } from './compare.js';

/** SARIF 2.1.0 with DOM-only locations. DOM selectors are properties, NOT fake source line numbers. */
export function toSarif(url: string, reports: readonly LayoutReport[], onlyRegressions?: LayoutComparison) {
  const regressionIds = new Set(onlyRegressions?.changes.filter(c => c.kind === 'regression').map(c => `${c.width}:${c.ruleId}`));
  const failures = reports.flatMap(report => report.findings
    .filter(f => f.status === 'fail' && (!onlyRegressions || regressionIds.has(`${report.viewport.width}:${f.id}`)))
    .map(f => ({ viewport: report.viewport, finding: f })));
  const rules = new Map<string, { id: string; shortDescription: { text: string }; properties: { type: string } }>();
  for (const { finding } of failures) {
    rules.set(finding.id, { id: finding.id, shortDescription: { text: finding.description ?? `${finding.type} layout constraint` }, properties: { type: finding.type } });
  }
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: { driver: { name: 'Bronto Layout', informationUri: 'https://github.com/Ponchia/bronto-layout', rules: [...rules.values()] } },
      results: failures.map(({ viewport, finding }) => ({
        ruleId: finding.id,
        level: 'error',
        message: { text: `${viewport.width}px: ${finding.message}` },
        locations: [{ physicalLocation: { artifactLocation: { uri: url } } }],
        properties: { viewportWidth: viewport.width, viewportHeight: viewport.height,
          direction: viewport.direction, code: finding.code, type: finding.type, selectors: finding.paths,
          deviation: finding.deviation, tolerance: finding.tolerance, expected: finding.expected, measured: finding.measured }
      }))
    }]
  };
}
