import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,rmSync,existsSync} from 'node:fs';
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

test('case aliases follow the actual volume semantics',()=>{
 const root=mkdtempSync(join(tmpdir(),'backup-case-qa-'));
 try{
  const parent=join(root,'CaseParent');const source=join(parent,'Storage');
  mkdirSync(source,{recursive:true});
  const aliasParent=join(root,'caseparent');const aliasSource=join(aliasParent,'storage');
  if(existsSync(aliasSource)){
   assert.throws(()=>assertSeparateTrees(source,aliasSource),/separate directory trees/);
   assert.throws(()=>assertSeparateTrees(source,aliasParent),/separate directory trees/);
   assert.throws(()=>assertSeparateTrees(source,join(aliasSource,'future')),/separate directory trees/);
   assert.throws(()=>assertSeparateTrees(aliasParent,source),/separate directory trees/);
  }else{
   mkdirSync(aliasSource,{recursive:true});
   assert.doesNotThrow(()=>assertSeparateTrees(source,aliasSource));
   assert.doesNotThrow(()=>assertSeparateTrees(source,join(aliasSource,'future')));
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
