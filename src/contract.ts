import type { Edge, LayoutRule } from './core.js';
import type { LayoutAction } from './actions.js';

export interface LayoutContract {
  schemaVersion?: 1;
  url?: string;
  widths?: number[];
  actions?: LayoutAction[];
  selectors: Record<string, string>;
  rules: LayoutRule[];
}
const TYPES = new Set(['document-overflow', 'align-edge', 'centered', 'contained', 'non-overlapping', 'equal-gaps', 'image-aspect', 'gap-range', 'same-size', 'size-range', 'selector-count', 'no-clipping']);
const EDGES = new Set<Edge>(['left', 'right', 'top', 'bottom', 'center-x', 'center-y', 'inline-start', 'inline-end']);
const AXES = new Set(['x', 'y']);
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function string(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function nonNegative(value: unknown) { return finite(value) && value >= 0; }
export function validWidth(width: unknown): width is number { return Number.isInteger(width) && (width as number) >= 200 && (width as number) <= 10000; }
function requireThat(ok: boolean, message: string): asserts ok { if (!ok) throw new Error(`Invalid layout contract: ${message}`); }
export function parseContract(input: unknown): LayoutContract {
  requireThat(record(input), 'expected a JSON object');
  const allowedContractFields = new Set(['schemaVersion', 'url', 'widths', 'selectors', 'rules', 'actions']);
  for (const name of Object.keys(input)) requireThat(allowedContractFields.has(name), `unknown top-level field ${name}`);
  requireThat(input.schemaVersion === undefined || input.schemaVersion === 1, 'schemaVersion must be 1');
  requireThat(input.url === undefined || string(input.url), 'url must be a non-empty string');
  requireThat(record(input.selectors), 'selectors must be an object mapping aliases to CSS selectors');
  for (const [alias, selector] of Object.entries(input.selectors)) {
    requireThat(string(alias) && alias !== 'viewport', `invalid selector alias ${JSON.stringify(alias)}`);
    requireThat(string(selector), `selector ${alias} must be a non-empty CSS selector`);
  }
  if (input.widths !== undefined) {
    requireThat(Array.isArray(input.widths) && input.widths.length > 0 && input.widths.every(validWidth), 'widths must contain integers from 200 to 10000');
    requireThat(new Set(input.widths).size === input.widths.length, 'widths must not contain duplicates');
  }
  if (input.actions !== undefined) {
    requireThat(Array.isArray(input.actions) && input.actions.length <= 30, 'actions must be an array of at most 30 steps');
    for (const [i, value] of input.actions.entries()) {
      requireThat(record(value), `actions[${i}] must be an object`);
      requireThat(['click', 'fill', 'wait-for', 'scroll-into-view', 'pause'].includes(value.type as string), `actions[${i}] has unsupported type`);
      const type = value.type as string;
      const fields = type === 'pause' ? ['type', 'milliseconds'] : type === 'fill' ? ['type', 'selector', 'value'] : ['type', 'selector'];
      for (const field of Object.keys(value)) requireThat(fields.includes(field), `actions[${i}] has unknown field ${field}`);
      if (type === 'pause') requireThat(Number.isInteger(value.milliseconds) && (value.milliseconds as number) >= 0 && (value.milliseconds as number) <= 5000, `actions[${i}].milliseconds must be 0..5000`);
      else requireThat(string(value.selector) && (value.selector as string).length <= 2000, `actions[${i}].selector must be a CSS selector`);
      if (type === 'fill') requireThat(typeof value.value === 'string' && value.value.length <= 10000, `actions[${i}].value must be a string up to 10000 characters`);
    }
  }
  requireThat(Array.isArray(input.rules) && input.rules.length > 0, 'rules must contain at least one rule');
  const ids = new Set<string>();
  const aliases = input.selectors;
  const requireAlias = (name: unknown, context: string, allowViewport = false) => {
    requireThat(string(name) && (Object.hasOwn(aliases, name) || (allowViewport && name === 'viewport')), `${context} refers to an undeclared selector alias: ${String(name)}`);
  };
  for (const [i, candidate] of input.rules.entries()) {
    requireThat(record(candidate), `rule ${i} must be an object`);
    const rule = candidate;
    requireThat(string(rule.id), `rule ${i} has no id`);
    requireThat(!ids.has(rule.id), `duplicate rule id: ${rule.id}`);
    ids.add(rule.id);
    requireThat(string(rule.type) && TYPES.has(rule.type), `${rule.id} has unsupported type: ${String(rule.type)}`);
    const fields = new Set(['id', 'type', 'description', 'tolerance', 'minWidth', 'maxWidth']);
    const ownFields: Record<string, string[]> = {
      'document-overflow': [], 'align-edge': ['a', 'b', 'edgeA', 'edgeB'],
      centered: ['element', 'in', 'axis'], contained: ['element', 'in', 'axis'],
      'non-overlapping': ['a', 'b'], 'equal-gaps': ['elements', 'axis'],
      'image-aspect': ['element', 'tolerancePercent'], 'gap-range': ['a', 'b', 'axis', 'min', 'max'],
      'same-size': ['a', 'b', 'axis'], 'size-range': ['element', 'axis', 'min', 'max'],
      'selector-count': ['element', 'min', 'max', 'exactly'], 'no-clipping': ['element', 'axis']
    };
    for (const name of ownFields[rule.type]) fields.add(name);
    for (const name of Object.keys(rule)) requireThat(fields.has(name), `${rule.id} has unknown field ${name}`);
    requireThat(rule.description === undefined || typeof rule.description === 'string', `${rule.id} description must be text`);
    for (const key of ['minWidth', 'maxWidth', 'tolerance']) {
      requireThat(rule[key] === undefined || nonNegative(rule[key]), `${rule.id} ${key} must be a nonnegative finite number`);
    }
    requireThat(rule.minWidth === undefined || validWidth(rule.minWidth), `${rule.id} minWidth must be an integer from 200 to 10000`);
    requireThat(rule.maxWidth === undefined || validWidth(rule.maxWidth), `${rule.id} maxWidth must be an integer from 200 to 10000`);
    requireThat(rule.minWidth === undefined || rule.maxWidth === undefined || (rule.minWidth as number) <= (rule.maxWidth as number), `${rule.id} minWidth exceeds maxWidth`);
    if (['align-edge', 'non-overlapping', 'gap-range', 'same-size'].includes(rule.type)) {
      requireAlias(rule.a, `${rule.id}.a`); requireAlias(rule.b, `${rule.id}.b`);
    }
    if (['centered', 'contained'].includes(rule.type)) {
      requireAlias(rule.element, `${rule.id}.element`); requireAlias(rule.in, `${rule.id}.in`, true);
    }
    if (['image-aspect', 'selector-count', 'no-clipping', 'size-range'].includes(rule.type)) requireAlias(rule.element, `${rule.id}.element`);
    if (rule.type === 'align-edge') {
      requireThat(EDGES.has(rule.edgeA as Edge), `${rule.id} edgeA is invalid`);
      requireThat(rule.edgeB === undefined || EDGES.has(rule.edgeB as Edge), `${rule.id} edgeB is invalid`);
    }
    if (['centered', 'gap-range', 'equal-gaps'].includes(rule.type)) requireThat(AXES.has(rule.axis as string), `${rule.id} axis must be x or y`);
    if (rule.type === 'contained') requireThat(rule.axis === undefined || ['x', 'y', 'both'].includes(rule.axis as string), `${rule.id} axis must be x, y or both`);
    if (rule.type === 'no-clipping') requireThat(rule.axis === undefined || ['x', 'y', 'both'].includes(rule.axis as string), `${rule.id} axis must be x, y or both`);
    if (rule.type === 'equal-gaps') {
      requireThat(Array.isArray(rule.elements) && rule.elements.length >= 3, `${rule.id} requires at least three elements`);
      for (const alias of rule.elements) requireAlias(alias, `${rule.id}.elements`);
      requireThat(new Set(rule.elements).size === rule.elements.length, `${rule.id} elements must be distinct`);
    }
    if (rule.type === 'same-size') requireThat(['width', 'height', 'both'].includes(rule.axis as string), `${rule.id} axis must be width, height or both`);
    if (rule.type === 'size-range') requireThat(['width', 'height'].includes(rule.axis as string), `${rule.id} axis must be width or height`);
    if (rule.type === 'gap-range' || rule.type === 'size-range') {
      requireThat(rule.min === undefined || nonNegative(rule.min), `${rule.id} min must be >= 0`);
      requireThat(rule.max === undefined || nonNegative(rule.max), `${rule.id} max must be >= 0`);
      requireThat(rule.min === undefined || rule.max === undefined || (rule.min as number) <= (rule.max as number), `${rule.id} min exceeds max`);
    }
    if (rule.type === 'size-range') requireThat(rule.min !== undefined || rule.max !== undefined, `${rule.id} specify min or max`);
    if (rule.type === 'selector-count') {
      for (const key of ['min', 'max', 'exactly']) {
        requireThat(rule[key] === undefined || (Number.isInteger(rule[key]) && (rule[key] as number) >= 0), `${rule.id} ${key} must be a nonnegative integer`);
      }
      requireThat(rule.exactly === undefined || (rule.min === undefined && rule.max === undefined), `${rule.id} exactly cannot be combined with min/max`);
      requireThat(rule.min === undefined || rule.max === undefined || (rule.min as number) <= (rule.max as number), `${rule.id} min exceeds max`);
      requireThat(rule.exactly !== undefined || rule.min !== undefined || rule.max !== undefined, `${rule.id} specify exactly, min or max`);
    }
    if (rule.type === 'image-aspect') requireThat(rule.tolerancePercent === undefined || nonNegative(rule.tolerancePercent), `${rule.id} tolerancePercent must be >=0`);
  }
  return input as unknown as LayoutContract;
}
