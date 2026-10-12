/** Strict, pure CLI argument and approved scenario configuration.
 * Kept separate from CDP/browser orchestration to enable fast, direct tests.
 */
import { parseArgs as parseNodeArgs } from 'node:util';
import { widthRange } from '../dist/sweep.js';

export const HELP = `Bronto Layout — browser-native spatial contracts

Usage:
  bronto-layout doctor [--json] [--chrome PATH]
  bronto-layout check --spec layout.json [--url URL] [--json|--sarif] [--report FILE]
  bronto-layout audit --url URL [--actions steps.json] [--widths 320,375,768,1280] [--json --compact]
  bronto-layout audit --baseline URL --url URL [--json --compact]
  bronto-layout inspect --url URL [--selector name=CSS ...] [--width 375] [--json]
  bronto-layout init [--url URL] [--out bronto-layout.json]
  bronto-layout suggest --url URL [--selector name=CSS ...] [--actions steps.json] [--out draft.json]
  bronto-layout review-draft --draft draft.json [--url NEW_URL] [--json]
  bronto-layout approve --draft draft.json --accept id[,id...] --out contract.json
  bronto-layout scan --spec layout.json --scan 320:1440:80 [--refine] [--json]
  bronto-layout compare --spec layout.json --baseline URL --url URL [--scan 320:1440:80] [--refine]
  bronto-layout validate --spec layout.json [--json]
  bronto-layout batch --manifest batch.json [--json --compact] [--parallel 2] [--dry-run]

Options:
  --spec FILE           Versioned layout contract (JSON; not needed for audit)
  --manifest FILE       Batch jobs referencing individual layout contracts
  --dry-run             Validate and preview a batch without opening a browser
  --parallel N          Batch only: 1..4 independent Chromium jobs (default 1)
  --url URL|FILE        Target website, local HTML fixture, or development server
  --baseline URL|FILE   Original website or fixture for compare or audit
  --widths CSV          Widths to check: 320,375,768,1280
  --width N             Single viewport width (for inspect or check)
  --height N            Viewport height (default: 900)
  --mobile              Emulate a touch/mobile browser viewport (suggest saves this)
  --desktop             Explicitly disable a saved mobile scenario
  --locale TAG          Emulate locale and Accept-Language (e.g. ar, it-IT)
  --color-scheme MODE   Browser color preference: light or dark
  --reduced-motion     Emulate prefers-reduced-motion: reduce
  --normal-motion      Explicitly disable a saved reduced-motion scenario
  --scan MIN:MAX:STEP   Sample a responsive width range (maximum 200 coarse samples)
  --refine              Bisect observed state changes to one-pixel intervals
  --css-breakpoints     Add CSS media-query boundary widths to --scan (including audit)
  --max-samples N       Maximum samples, including refinement (default: 200)
  --selector name=CSS   Named selector for inspect or suggest; can be repeated
  --draft FILE          Candidate draft for review-draft or approve
  --actions FILE        Declarative JSON interactions for suggest or audit (no JS eval; audit repeats per viewport)
  --accept CSV          Proposal IDs chosen for approval
  --css-sources         Include matched CSS hints in inspect or failed check widths
  --container-queries   Inspect CSS @container conditions and observed container sizes
  --layout-shifts       Collect browser-observed loading/hydration shift events
  --ready-selector CSS  Wait for element to exist after page navigation
  --settle MS           Additional fixed delay for rendering (default: 0)
  --stable-for MS       Require selected DOM geometry unchanged for 100..5000ms
  --timeout MS          Navigation and CDP operation timeout (default: 15000)
  --chrome PATH         Chrome/Chromium executable (autodetected otherwise)
  --no-sandbox          Explicitly disable Chromium sandbox (unsafe on untrusted URLs)
  --json                Machine-readable JSON to stdout
  --compact             With --json: actionable findings, sampled widths, and totals
  --sarif               SARIF 2.1.0 output (failures in check; regressions in compare)
  --report FILE         Write machine-readable JSON or SARIF report to disk
  --evidence-dir DIR    Annotated check screenshots; raw audit viewport screenshots
  --full-page-evidence  Audit with --evidence-dir: bounded CSS document screenshot (not a correctness check)
  --fail-on-skip        Treat unmeasurable contract rules as failures in CI
  --fail-on-coverage-gaps  Audit: exit 2 for known uninspected content (e.g. iframes)
  --frame-inventory     Audit: opt-in CDP frame-tree/DOMSnapshot evidence (not inner-frame checks)
  --out FILE            Output path for init (default: bronto-layout.json)
  --force               Overwrite an existing file with init
  --help                Show this help
  --version             Show current CLI version

Backward compatible: --spec file.json without a subcommand means check.
Exit codes: check 0 pass / 1 violation; compare 0 no regression / 1 regression; 2 input/runtime failure.
A compare result with previously failing rules is not a full clean bill of health.
No account, network service, hosted subscription, Playwright, or Puppeteer required.
`;

const OPTIONS = {
  spec: { type: 'string' }, manifest: { type: 'string' }, parallel: { type: 'string' }, url: { type: 'string' }, baseline: { type: 'string' }, widths: { type: 'string' },
  width: { type: 'string' }, height: { type: 'string' }, mobile: { type: 'boolean' }, desktop: { type: 'boolean' }, locale: { type: 'string' },
  'color-scheme': { type: 'string' }, 'reduced-motion': { type: 'boolean' }, 'normal-motion': { type: 'boolean' }, scan: { type: 'string' },
  refine: { type: 'boolean' }, 'css-breakpoints': { type: 'boolean' }, 'max-samples': { type: 'string' },
  selector: { type: 'string', multiple: true }, 'css-sources': { type: 'boolean' }, 'container-queries': { type: 'boolean' }, 'layout-shifts': { type: 'boolean' },
  'ready-selector': { type: 'string' }, settle: { type: 'string' }, 'stable-for': { type: 'string' }, timeout: { type: 'string' },
  chrome: { type: 'string' }, 'no-sandbox': { type: 'boolean' }, json: { type: 'boolean' }, compact: { type: 'boolean' }, sarif: { type: 'boolean' }, report: { type: 'string' },
  'evidence-dir': { type: 'string' }, 'fail-on-coverage-gaps': { type: 'boolean' }, 'frame-inventory': { type: 'boolean' }, 'full-page-evidence': { type: 'boolean' },
  out: { type: 'string' }, draft: { type: 'string' }, actions: { type: 'string' }, accept: { type: 'string' }, force: { type: 'boolean' }, 'fail-on-skip': { type: 'boolean' }, 'dry-run': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' }
};
export function argsFromCLI(args) {
  const parsed = parseNodeArgs({ args, options: OPTIONS, allowPositionals: true, strict: true });
  const positionals = parsed.positionals;
  const command = positionals[0] ?? 'check';
  if (!['doctor', 'check', 'scan', 'inspect', 'init', 'compare', 'validate', 'batch', 'audit', 'suggest', 'review-draft', 'approve'].includes(command) || positionals.length > 1) {
    throw new Error(`Unknown command: ${positionals.join(' ')}. Run --help for available commands.`);
  }
  return { command, ...parsed.values };
}
export function int(value, label, min, max) {
  const number = Number(value);
  if (!/^(0|[1-9]\d*)$/.test(String(value)) || !Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}`);
  }
  return number;
}
/** Explicit CLI overrides win; absent flags inherit the approved contract scenario. */
export function withApprovedScenario(a, scenario) {
  if (!scenario) return a;
  const inherited = {
    ...(scenario.mobile !== undefined ? { mobile: scenario.mobile } : {}),
    ...(scenario.reducedMotion !== undefined ? { 'reduced-motion': scenario.reducedMotion } : {}),
    ...(scenario.colorScheme !== undefined ? { 'color-scheme': scenario.colorScheme } : {}),
    ...(scenario.locale !== undefined ? { locale: scenario.locale } : {}),
    ...(scenario.height !== undefined ? { height: String(scenario.height) } : {}),
    ...(scenario.readySelector !== undefined ? { 'ready-selector': scenario.readySelector } : {}),
    ...(scenario.settle !== undefined ? { settle: String(scenario.settle) } : {}),
    ...(scenario.stableFor !== undefined ? { 'stable-for': String(scenario.stableFor) } : {})
  };
  const merged = { ...inherited, ...a };
  if (a.desktop) merged.mobile = false;
  if (a['normal-motion']) merged['reduced-motion'] = false;
  return merged;
}
export function scenarioFromExplicitFlags(a) {
  const scenario = {
    ...(a.mobile !== undefined || a.desktop ? { mobile: !a.desktop } : {}),
    ...(a['reduced-motion'] !== undefined || a['normal-motion'] ? { reducedMotion: !a['normal-motion'] } : {}),
    ...(a['color-scheme'] !== undefined ? { colorScheme: a['color-scheme'] } : {}),
    ...(a.locale !== undefined ? { locale: a.locale } : {}),
    ...(a.height !== undefined ? { height: Number(a.height) } : {}),
    ...(a['ready-selector'] !== undefined ? { readySelector: a['ready-selector'] } : {}),
    ...(a.settle !== undefined ? { settle: Number(a.settle) } : {}),
    ...(a['stable-for'] !== undefined ? { stableFor: Number(a['stable-for']) } : {})
  };
  return Object.keys(scenario).length ? scenario : undefined;
}
export function configFromArgs(a) {
  if (a.mobile && a.desktop) throw new Error('--mobile and --desktop cannot be combined');
  if (a['reduced-motion'] && a['normal-motion']) throw new Error('--reduced-motion and --normal-motion cannot be combined');
  if (a.locale && !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/i.test(a.locale)) throw new Error('--locale must be a valid language tag');
  if (a['color-scheme'] && !['light', 'dark'].includes(a['color-scheme'])) throw new Error('--color-scheme must be light or dark');
  const timeout = int(a.timeout ?? '15000', '--timeout', 100, 120000);
  const stableFor = a['stable-for'] === undefined ? 0 : int(a['stable-for'], '--stable-for', 100, 5000);
  if (stableFor >= timeout) throw new Error('--stable-for must be shorter than --timeout');
  return {
    height: int(a.height ?? '900', '--height', 200, 10000),
    timeout,
    settle: int(a.settle ?? '0', '--settle', 0, 30000),
    stableFor,
    maxSamples: int(a['max-samples'] ?? '200', '--max-samples', 1, 2000),
    readySelector: a['ready-selector'] ?? undefined,
    mobile: Boolean(a.mobile && !a.desktop),
    locale: a.locale ?? undefined,
    colorScheme: a['color-scheme'] ?? undefined,
    reducedMotion: Boolean(a['reduced-motion'] && !a['normal-motion']),
    collectShifts: Boolean(a['layout-shifts']),
  };
}
export function getWidths(a, spec) {
  if (a.scan) {
    const parts = a.scan.split(':');
    if (parts.length !== 3) throw new Error('--scan requires MIN:MAX:STEP (for example 320:1440:80)');
    return widthRange(...parts.map(value => int(value, '--scan', 1, 10000)));
  }
  if (a.width !== undefined) return [int(a.width, '--width', 200, 10000)];
  if (a.widths !== undefined) {
    const widths = a.widths.split(',').map(value => int(value, '--widths', 200, 10000));
    if (!widths.length || new Set(widths).size !== widths.length) throw new Error('--widths must contain distinct widths');
    return widths;
  }
  return spec?.widths ?? [1280];
}
/** Validate option compatibility before launching Chromium or reading a site. */
export function validateCommandOptions(a) {
  if (a.json && a.sarif) throw new Error('Choose --json or --sarif, not both');
  if (a.compact && (!a.json || !['check', 'scan', 'compare', 'batch', 'audit'].includes(a.command))) {
    throw new Error('--compact requires --json with check, scan, or compare');
  }
  if (a['css-breakpoints'] && !a.scan) throw new Error('--css-breakpoints requires --scan MIN:MAX:STEP');
  if (a['css-breakpoints'] && !['check', 'scan', 'compare', 'audit'].includes(a.command)) throw new Error('--css-breakpoints applies only to check, scan and compare');
  if (a['css-sources'] && !['inspect', 'check', 'scan'].includes(a.command)) throw new Error('--css-sources applies only to inspect, check and scan');
  if (a['container-queries'] && a.command !== 'inspect') throw new Error('--container-queries currently applies only to inspect');
  if (a['layout-shifts'] && !['inspect', 'check', 'scan', 'compare', 'batch', 'audit'].includes(a.command)) throw new Error('--layout-shifts applies only to inspect, check, scan, compare and batch');
  if (a['stable-for'] !== undefined && !['inspect', 'check', 'scan', 'compare', 'batch', 'audit'].includes(a.command)) throw new Error('--stable-for applies only to inspect, check, scan, compare and batch');
  if (a.baseline && !['compare', 'audit'].includes(a.command)) throw new Error('--baseline applies only to compare or audit');
  if (a.command === 'audit' && a.spec) throw new Error('audit is zero-contract; omit --spec');
  if (a.command === 'audit' && a.sarif) throw new Error('audit supports structured JSON; SARIF belongs to explicit contract checks');
  if (a.command === 'audit' && a['stable-for'] !== undefined) throw new Error('audit --stable-for requires named selectors; use inspect or check with a contract instead');
  if (a.command === 'audit' && a['fail-on-skip']) throw new Error('audit has no contract skips; remove --fail-on-skip');
  if (a.command === 'audit' && a.refine) throw new Error('audit does not infer contracts for --refine; use scan with a contract');
  if (a['full-page-evidence'] && (a.command !== 'audit' || a.baseline || !a['evidence-dir']))
    throw new Error('--full-page-evidence requires audit --evidence-dir DIR without --baseline');
  if (a.command === 'audit' && a.baseline && a['evidence-dir']) throw new Error('Compared audit screenshots are not yet supported');
  if (a.command === 'batch' && !a.manifest) throw new Error('batch requires --manifest FILE');
  if (a['dry-run'] && a.command !== 'batch') throw new Error('--dry-run applies only to batch');
  if (a['fail-on-coverage-gaps'] && a.command !== 'audit') throw new Error('--fail-on-coverage-gaps applies only to audit');
  if (a['frame-inventory'] && a.command !== 'audit') throw new Error('--frame-inventory applies only to audit');
  if (a.actions && !['suggest', 'audit'].includes(a.command)) throw new Error('--actions applies only to suggest or audit; checks replay saved contract.actions');
  if (a.command === 'review-draft' &&
      ['spec','width','widths','scan','refine','selector','actions','mobile','desktop',
        'reduced-motion','normal-motion','color-scheme','locale','height','settle',
        'stable-for','ready-selector','css-breakpoints','layout-shifts'].some(key => a[key] !== undefined)) {
    throw new Error('review-draft replays the original widths, scenario and actions; recreate a draft to change them');
  }
  if (a.parallel !== undefined && a.command !== 'batch') throw new Error('--parallel applies only to batch');
  if (a.command !== 'batch' && a.manifest) throw new Error('--manifest applies only to batch');
  if (a.command === 'batch' && a.spec) throw new Error('batch reads contracts from its manifest; omit --spec');
  if (a.command === 'batch' && a.sarif) throw new Error('batch supports JSON reports, not SARIF');
  configFromArgs(a);
}
