import { validWidth } from './contract.js';
import { widthRange } from './sweep.js';

/** Shared bounded viewport and media options for both batch job modes. */
export interface BatchJobBase {
  id: string;
  locale?: string;
  widths?: number[];
  scan?: string;
  cssBreakpoints?: boolean;
  colorScheme?: 'light' | 'dark';
  reducedMotion?: boolean;
  mobile?: boolean;
  layoutShifts?: boolean;
}

/** Backward-compatible v1 contract job: mode omitted still means check. */
export interface CheckBatchJob extends BatchJobBase {
  mode?: 'check';
  spec: string;
  url?: string;
  stableFor?: number;
  actions?: never;
  gridGapReview?: never;
  siblingOverlapReview?: never;
  frameInventory?: never;
  failOnCoverageGaps?: never;
  domLimit?: never;
}

/** Zero-contract mechanical audit with opt-in review-only diagnostics. */
export interface AuditBatchJob extends BatchJobBase {
  mode: 'audit';
  url: string;
  spec?: never;
  stableFor?: never;
  /** Declarative action file path, relative to manifest (never JavaScript). */
  actions?: string;
  gridGapReview?: boolean;
  siblingOverlapReview?: boolean;
  frameInventory?: boolean;
  failOnCoverageGaps?: boolean;
  domLimit?: number;
}

export type BatchJob = CheckBatchJob | AuditBatchJob;

export interface BatchManifest {
  /** Optional editor hint, ignored during batch execution and never fetched. */
  $schema?: string;
  schemaVersion: 1;
  jobs: BatchJob[];
}

const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const allowed = new Set(['id', 'mode', 'spec', 'url', 'locale', 'widths', 'scan', 'cssBreakpoints', 'colorScheme', 'reducedMotion', 'mobile', 'layoutShifts', 'stableFor',
  'actions', 'gridGapReview', 'siblingOverlapReview', 'frameInventory', 'failOnCoverageGaps', 'domLimit']);
const localePattern = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i;

/**
 * A finite declarative suite: no arbitrary scripts/commands; the runner
 * uses bounded 1..4 process concurrency. Fail closed before launching Chromium.
 */
export function parseBatchManifest(value: unknown): BatchManifest {
  if (!object(value) || value.schemaVersion !== 1 ||
      Object.keys(value).some(key => !['$schema', 'schemaVersion', 'jobs'].includes(key))) {
    throw new Error('Batch manifest must have schemaVersion 1 and jobs only');
  }
  if (value.$schema !== undefined && (!nonEmpty(value.$schema) || value.$schema.length > 1024)) {
    throw new Error('Batch $schema must be a nonempty editor reference (maximum 1024 characters)');
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
    const mode = job.mode ?? 'check';
    if (mode !== 'check' && mode !== 'audit') throw new Error(label + ' must use mode check or audit');
    if (mode === 'check') {
      if (!nonEmpty(job.spec)) throw new Error(label + ' requires a spec path');
      for (const field of ['actions','gridGapReview','siblingOverlapReview','frameInventory','failOnCoverageGaps','domLimit']) {
        if (job[field] !== undefined) throw new Error(label + ' ' + field + ' is only supported for audit');
      }
    } else {
      if (job.spec !== undefined) throw new Error(label + ' audit cannot contain a spec (zero-contract mode)');
      if (!nonEmpty(job.url)) throw new Error(label + ' audit requires an explicit URL');
      if (job.stableFor !== undefined) throw new Error(label + ' audit does not support stableFor without named selectors');
      if (job.actions !== undefined && (!nonEmpty(job.actions) || job.actions.length > 1024)) {
        throw new Error(label + ' requires a bounded declarative actions file path');
      }
      if (job.domLimit !== undefined && (typeof job.domLimit !== 'number' ||
        !Number.isSafeInteger(job.domLimit) || job.domLimit < 1000 || job.domLimit > 50000)) {
        throw new Error(label + ' domLimit must be an integer from 1000 to 50000');
      }
      for (const field of ['gridGapReview','siblingOverlapReview','frameInventory','failOnCoverageGaps']) {
        if (job[field] !== undefined && typeof job[field] !== 'boolean') {
          throw new Error(label + ' ' + field + ' must be boolean');
        }
      }
    }
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
