import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
const action = process.argv[2];
let active=0,maxActive=0;
if(action==='concurrent') {
 const original=childProcess.spawn;
 childProcess.spawn=function(...args){
  const child=original.apply(this,args);active++;maxActive=Math.max(maxActive,active);
  child.once('close',()=>active--);return child;
 };
 syncBuiltinESMExports();
}
const {default:plugin}=await import('../dist/index.js');
const hooks = await plugin({});
if(action === 'concurrent') {
 const transfers=[
  hooks.tool.session_backup_sync.execute({force:true},{}),
  hooks.tool.session_backup_restore.execute({confirm:true},{}),
  hooks.tool.session_backup_sync.execute({force:true},{})
 ];
 const pendingStatus=await hooks.tool.session_backup_status.execute({},{});
 const results=await Promise.all(transfers);
 const settledStatus=await hooks.tool.session_backup_status.execute({},{});
 console.log(JSON.stringify({maxActive,results,pendingStatus,settledStatus}));
} else if(action === 'scheduled') {
  console.log(await hooks.tool.session_backup_sync.execute({force:true},{}));
  const source=process.platform==='win32'?join(process.env.LOCALAPPDATA,'opencode','storage'):join(homedir(),'.local','share','opencode','storage');
  await writeFile(join(source,'session.json'),'synthetic event update');
  await hooks.event({event:{type:'message.updated'}});
  console.log(await hooks.tool.session_backup_status.execute({},{}));
} else {
  const result = action === 'sync'
    ? await hooks.tool.session_backup_sync.execute({force:true},{})
    : await hooks.tool.session_backup_restore.execute({confirm:true},{});
  console.log(result);
}
