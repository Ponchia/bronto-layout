/** Declarative browser environment captured when a layout contract is discovered.
 * Environment flags belong to a contract so replay has the same starting state.
 */
export interface LayoutScenario {
  mobile?: boolean;
  locale?: string;
  colorScheme?: 'light' | 'dark';
  reducedMotion?: boolean;
  height?: number;
  readySelector?: string;
  settle?: number;
  stableFor?: number;
}
const names = new Set(['mobile', 'locale', 'colorScheme', 'reducedMotion', 'height', 'readySelector', 'settle', 'stableFor']);
const integer = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
export function parseLayoutScenario(value: unknown): LayoutScenario {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid layout contract: scenario must be an object');
  const scenario = value as Record<string, unknown>;
  for (const key of Object.keys(scenario))
    if (!names.has(key)) throw new Error('Invalid layout contract: unknown scenario field ' + key);
  for (const name of ['mobile', 'reducedMotion'])
    if (scenario[name] !== undefined && typeof scenario[name] !== 'boolean')
      throw new Error('Invalid layout contract: scenario.' + name + ' must be boolean');
  if (scenario.locale !== undefined &&
      (typeof scenario.locale !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i.test(scenario.locale)))
    throw new Error('Invalid layout contract: scenario.locale must be a locale tag');
  if (scenario.colorScheme !== undefined && !['light', 'dark'].includes(scenario.colorScheme as string))
    throw new Error('Invalid layout contract: scenario.colorScheme must be light or dark');
  if (scenario.height !== undefined && !integer(scenario.height, 200, 10000))
    throw new Error('Invalid layout contract: scenario.height must be 200..10000');
  if (scenario.settle !== undefined && !integer(scenario.settle, 0, 30000))
    throw new Error('Invalid layout contract: scenario.settle must be 0..30000');
  if (scenario.stableFor !== undefined && !integer(scenario.stableFor, 100, 5000))
    throw new Error('Invalid layout contract: scenario.stableFor must be 100..5000');
  if (scenario.readySelector !== undefined && (typeof scenario.readySelector !== 'string' ||
      !scenario.readySelector.trim() || scenario.readySelector.length > 2000))
    throw new Error('Invalid layout contract: scenario.readySelector must be a nonempty CSS selector');
  return scenario as LayoutScenario;
}
