import plugin from '../dist/index.js';
import {writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
const hooks = await plugin({});
const action = process.argv[2];
if(action === 'scheduled') {
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
