import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assertSeparateTrees} from '../dist/paths.js';
test('reject equal, nested, parent and symlinked overlapping paths',()=>{
 const root=mkdtempSync(join(tmpdir(),'backup-path-qa-'));
 try{
  const source=join(root,'source');mkdirSync(source);
  for(const destination of [source,root,join(source,'backup')]) assert.throws(()=>assertSeparateTrees(source,destination),/separate directory trees/);
  const alias=join(root,'alias');symlinkSync(source,alias,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>assertSeparateTrees(source,join(alias,'future')),/separate directory trees/);
  assert.doesNotThrow(()=>assertSeparateTrees(source,join(root,'separate','future')));
 }finally{rmSync(root,{recursive:true,force:true});}
});
