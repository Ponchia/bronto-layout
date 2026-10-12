#!/usr/bin/env node
/** Fast developer loop without launching Chrome; full `npm test` remains the release gate. */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const suite=path.join(root,'tests');
const browserOnly=new Set(['modern-web.test.mjs','uniform-gaps.test.mjs','breakpoints.test.mjs','field-benchmark.test.mjs']);
const files=readdirSync(suite).filter(file=>file.endsWith('.test.mjs') &&
 !file.startsWith('cli-') && file!=='cli.test.mjs' && !browserOnly.has(file)).sort()
 .map(file=>path.join('tests',file));
if(!files.length)throw new Error('No pure/portable test files discovered');
const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...files],{
 cwd:root,env:process.env,stdio:'inherit',timeout:120000
});
if(result.error)throw result.error;
process.exitCode=result.status??2;
