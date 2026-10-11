import { validWidth } from './contract.js';
import { widthRange } from './sweep.js';

export interface BatchJob {
  id: string;
  spec: string;
  url?: string;
  locale?: string;
  widths?: number[];
  scan?: string;
  cssBreakpoints?: boolean;
  colorScheme?: 'light' | 'dark';
  reducedMotion?: boolean;
  mobile?: boolean;
  layoutShifts?: boolean;
  stableFor?: number;
}

export interface BatchManifest {
  schemaVersion: 1;
  jobs: BatchJob[];
}

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const allowed = new Set(['id', 'spec', 'url', 'locale', 'widths', 'scan', 'cssBreakpoints', 'colorScheme', 'reducedMotion', 'mobile', 'layoutShifts', 'stableFor']);
const localePattern = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i;

/**
 * A finite declarative suite; no scripts, arbitrary commands or concurrent
 * execution. Fail closed before launching a single browser.
 */
export function parseBatchManifest(value: unknown): BatchManifest {
  if (!object(value) || value.schemaVersion !== 1 ||
      Object.keys(value).some(key => !['schemaVersion', 'jobs'].includes(key))) {
    throw new Error('Batch manifest must have schemaVersion 1 and jobs only');
  }
  if (!Array.isArray(value.jobs) || value.jobs.length < 1 || value.jobs.length > 16) {
    throw new Error('Batch manifest needs 1 to 16 jobs');
  }
  const ids = new Set<string>();
  const jobs: BatchJob[] = value.jobs.map((job, index) => {
    const label = 'Batch job #' + (index + 1);
    if (!object(job) || Object.keys(job).some(key => !allowed.has(key))) {
      throw new Error(label + ' has unsupported fields');
    }
    if (!nonEmpty(job.id) || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(job.id) || ids.has(job.id)) {
      throw new Error(label + ' must have a unique simple id');
    }
    ids.add(job.id);
    if (!nonEmpty(job.spec)) throw new Error(label + ' requires a spec path');
    if (job.url !== undefined && !nonEmpty(job.url)) throw new Error(label + ' has invalid URL');
    if (job.locale !== undefined && (!nonEmpty(job.locale) || !localePattern.test(job.locale))) {
      throw new Error(label + ' has invalid locale');
    }
    if (job.widths !== undefined && (!Array.isArray(job.widths) || !job.widths.length ||
      job.widths.length > 200 || !job.widths.every(validWidth) ||
      new Set(job.widths).size !== job.widths.length)) {
      throw new Error(label + ' has invalid or duplicate viewport widths');
    }
    if (job.scan !== undefined) {
      if (!nonEmpty(job.scan) || !/^\d+:\d+:\d+$/.test(job.scan)) {
        throw new Error(label + ' scan must be MIN:MAX:STEP');
      }
      widthRange(...(job.scan.split(':').map(Number) as [number, number, number]));
    }
    if (job.widths !== undefined && job.scan !== undefined) {
      throw new Error(label + ' must choose widths or scan, not both');
    }
    if (job.cssBreakpoints !== undefined && typeof job.cssBreakpoints !== 'boolean') {
      throw new Error(label + ' cssBreakpoints must be boolean');
    }
    if (job.cssBreakpoints && !job.scan) throw new Error(label + ' CSS breakpoints require scan');
    if (job.colorScheme !== undefined && job.colorScheme !== 'light' && job.colorScheme !== 'dark') {
      throw new Error(label + ' colorScheme must be light or dark');
    }
    for (const key of ['reducedMotion', 'mobile', 'layoutShifts']) {
      if (job[key] !== undefined && typeof job[key] !== 'boolean') {
        throw new Error(label + ' ' + key + ' must be boolean');
      }
    }
    if (job.stableFor !== undefined && (
      !Number.isInteger(job.stableFor) || (job.stableFor as number) < 100 ||
      (job.stableFor as number) > 5000)) {
      throw new Error(label + ' stableFor must be an integer from 100 to 5000 ms');
    }
    // All public fields were checked above; reify this validated record.
    return job as unknown as BatchJob;
  });
  return { schemaVersion: 1, jobs };
}
