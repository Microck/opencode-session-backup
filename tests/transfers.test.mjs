import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {join,delimiter,isAbsolute} from 'node:path';
import {execFile,spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const driver=fileURLToPath(new URL('./driver.mjs',import.meta.url));
async function fixture(run) {
 const root=await mkdtemp(join(tmpdir(),'session-backup-qa-'));
 const source=process.platform==='win32'?join(root,'local','opencode','storage'):join(root,'.local','share','opencode','storage');
 const destination=join(root,'backup');
 await mkdir(source,{recursive:true});await mkdir(destination,{recursive:true});
 const env={...process.env,HOME:root,USERPROFILE:root,LOCALAPPDATA:join(root,'local'),OPENCODE_BACKUP_PATH:destination};
 try{await run({root,source,destination,env});}finally{await rm(root,{recursive:true,force:true});}
}
test('restore drains large child output instead of hanging', {skip:process.platform==='win32'},async()=>{
 await fixture(async({root,env})=>{
  const bin=join(root,'bin');await mkdir(bin);
  const command=join(bin,'rsync');
  await writeFile(command,`#!${process.execPath}\nprocess.stdout.write(Buffer.alloc(2*1024*1024,120));process.stderr.write(Buffer.alloc(2*1024*1024,120));`);
  await chmod(command,0o700);
  const {stdout}=await exec(process.execPath,[driver,'restore'],{env:{...env,PATH:bin+delimiter+env.PATH},timeout:5000});
  assert.match(stdout,/Restore complete/);
 });
});
test('native backup and restore preserve synthetic session bytes', {skip:process.platform!=='win32'&&spawnSync('rsync',['--version']).error?.code==='ENOENT'},async()=>{
 await fixture(async({source,destination,env})=>{
  await writeFile(join(source,'session.json'),'synthetic original');
  const backup=await exec(process.execPath,[driver,'sync'],{env,timeout:15000});
  assert.match(backup.stdout,/Backup complete/);
  assert.equal(await readFile(join(destination,'session.json'),'utf8'),'synthetic original');
  await writeFile(join(source,'session.json'),'synthetic changed');
  const restored=await exec(process.execPath,[driver,'restore'],{env,timeout:15000});
  assert.match(restored.stdout,/Restore complete/);
  assert.equal(await readFile(join(source,'session.json'),'utf8'),'synthetic original');
 });
});

test('updates during cooldown remain scheduled', {skip:process.platform!=='win32'&&spawnSync('rsync',['--version']).error?.code==='ENOENT',timeout:45000},async()=>{
 await fixture(async({source,destination,env})=>{
  await writeFile(join(source,'session.json'),'synthetic original');
  const result=await exec(process.execPath,[driver,'scheduled'],{env,timeout:40000});
  assert.match(result.stdout,/Sync pending: yes/);
  assert.equal(await readFile(join(destination,'session.json'),'utf8'),'synthetic event update');
 });
});

test('sync and restore transfer subprocesses never overlap',async()=>{
 await fixture(async({root,source,env})=>{
  await writeFile(join(source,'session.json'),'synthetic original');
  if(process.platform!=='win32'){
   const bin=join(root,'bin');await mkdir(bin);
   const command=join(bin,'rsync');
   await writeFile(command,`#!${process.execPath}\nsetTimeout(()=>console.log('Number of regular files transferred: 1'),100);`);
   await chmod(command,0o700);env.PATH=bin+delimiter+env.PATH;
  }
  const {stdout}=await exec(process.execPath,[driver,'concurrent'],{env,timeout:15000});
  const result=JSON.parse(stdout);
  assert.equal(result.maxActive,1);
  assert.equal(result.results.length,3);
  assert(result.results.every(value=>/^(Backup|Restore) complete/.test(value)));
 });
});

test('relative destination names are absolute native command arguments', {skip:process.platform==='win32'},async()=>{
 await fixture(async({root,env})=>{
  const bin=join(root,'bin');await mkdir(bin);
  const argsFile=join(root,'args.json');const command=join(bin,'rsync');
  await writeFile(command,`#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.ARGS_FILE,JSON.stringify(process.argv.slice(2)));`);
  await chmod(command,0o700);
  await exec(process.execPath,[driver,'sync'],{cwd:root,env:{...env,OPENCODE_BACKUP_PATH:'--backup',ARGS_FILE:argsFile,PATH:bin+delimiter+env.PATH},timeout:5000});
  const args=JSON.parse(await readFile(argsFile,'utf8'));
  assert(isAbsolute(args.at(-1)));
  assert.equal(await realpath(args.at(-1)),await realpath(join(root,'--backup')));
 });
});
