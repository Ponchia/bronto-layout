import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {renderPairedAuditGallery} from '../bin/audit-comparison-gallery.mjs';

const dir=path.join(os.tmpdir(),'bronto-gallery-unit');
const row=(width,base='a',candidate='b')=>({width,
 baseline:{file:path.join(dir,`audit-baseline-${width}px.png`),sha256:base.repeat(64),coverage:'viewport-only'},
 candidate:{file:path.join(dir,`audit-candidate-${width}px.png`),sha256:candidate.repeat(64),coverage:'viewport-only'}});

test('static comparison contact sheet is local-only and has a restrictive script-free CSP',()=>{
 const html=renderPairedAuditGallery([row(375),row(768)],dir);
 assert.equal((html.match(/<img /g)||[]).length,4);
 assert.equal((html.match(/<section class="case"/g)||[]).length,2);
 assert.match(html,/src="audit-baseline-375px\.png"/);
 assert.match(html,/src="audit-candidate-768px\.png"/);
 assert.match(html,/Content-Security-Policy/);
 assert.match(html,/default-src 'none'/);
 assert.match(html,/script-src 'none'/);
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/style-src 'sha256-[A-Za-z0-9+/=]+'/);
 assert.match(html,/not automatic pixel diffs/i);
 assert.match(html,/SHA-256/);
 assert.doesNotMatch(html,/<script[\s>]/i);
 assert.doesNotMatch(html,/src="https?:\/\//i);
 assert.doesNotMatch(html,/\b(eval|fetch|localStorage|XMLHttpRequest)\s*\(/);
});

test('renderer rejects injected paths, invalid hashes and ambiguous widths',()=>{
 assert.throws(()=>renderPairedAuditGallery([],dir),/1\.\.200/);
 assert.throws(()=>renderPairedAuditGallery([row(375),row(375)],dir),/repeated/);
 assert.throws(()=>renderPairedAuditGallery([{...row(375),width:'375<script>bad</script>'}],dir),/width/);
 assert.throws(()=>renderPairedAuditGallery([{...row(375),candidate:{
   ...row(375).candidate,sha256:'abc<script>'}}],dir),/verified viewport evidence/);
 assert.throws(()=>renderPairedAuditGallery([{...row(375),baseline:{
   ...row(375).baseline,file:'/tmp/unexpected.png'}}],dir),/verified viewport evidence/);
 assert.throws(()=>renderPairedAuditGallery([{...row(375),baseline:{
   ...row(375).baseline,coverage:'full-page'}}],dir),/verified viewport evidence/);
});
