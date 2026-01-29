# Session Backup Plugin for Opencode


  opencode plugin that backs up your sessions to google drive (or anywhere) so you stop losing work when things crash.


  <a href="https://www.npmjs.com/package/opencode-session-backup"><img src="https://img.shields.io/npm/v/opencode-session-backup.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/opencode-session-backup"><img src="https://img.shields.io/npm/dw/opencode-session-backup.svg" alt="npm downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>


---

## what you get

- **auto-backup** after every message, session update, and deletion
- **incremental sync** using robocopy (windows) or rsync (unix)
- **debounced** so it doesn't hammer your disk (30s minimum between syncs)
- **restore tool** to get your sessions back after a crash
- **status tool** to see backup stats

---

## install

```bash
cd ~/.opencode
npm install opencode-session-backup
```

that's it. plugin loads automatically.

---

## configuration

<details open>
<summary><b>option 1: opencode config (recommended)</b></summary>

add to your opencode config:

```json
{
  "session-backup": {
    "backupPath": "/path/to/backup/folder"
  }
}
```

</details>

<details>
<summary><b>option 2: environment variable</b></summary>

```bash
export OPENCODE_BACKUP_PATH="/path/to/backup/folder"
```

</details>

### debug mode

enable debug logging:

<details open>
<summary><b>opencode config</b></summary>

```json
{
  "session-backup": {
    "backupPath": "/path/to/backup/folder",
    "debug": true
  }
}
```

</details>

<details>
<summary><b>environment variable</b></summary>

```bash
export OPENCODE_BACKUP_DEBUG="true"
```

</details>

### default paths

| platform | default destination |
|----------|---------------------|
| windows | `~/Google Drive/opencode-sessions` |
| macos | `~/Library/CloudStorage/GoogleDrive/My Drive/opencode-sessions` |
| linux | set via config or env var |

---

## tools

### `session_backup_sync`

manual backup. use when you want to force a sync.

```
session_backup_sync force=true
```

### `session_backup_status`

shows backup stats: session count, size, last sync time, pending syncs.

```
session_backup_status
```

example output:
```
Backup path: G:\Mi unidad\opencode-sessions
Sessions backed up: 47
Backup size: 12.3 MB
Last backup: 1/29/2026, 9:15:00 PM
Last sync success: yes
Syncs this session: 3
```

### `session_backup_restore`

restores sessions from backup. requires confirmation because it overwrites current sessions.

```
session_backup_restore confirm=true
```

> restart opencode after restore to see your sessions.

---

## how it works

1. plugin hooks into opencode events (`message.updated`, `session.updated`, `session.deleted`)
2. schedules a sync after 5s delay (debounced)
3. runs robocopy/rsync with `/MIR` flag for incremental sync
4. logs to `sync.log` in backup folder

```
opencode storage  ──robocopy/rsync──▶  backup folder
     │                                      │
     └── session/                           └── session/
     └── message/                           └── message/
     └── part/                              └── part/
     └── todo/                              └── todo/
```

---

## troubleshoot

### backup not running

check if destination exists and is writable:

```powershell
# windows
Test-Path "G:\Mi unidad\opencode-sessions"

# unix
ls -la ~/Library/CloudStorage/GoogleDrive/My\ Drive/opencode-sessions
```

### restore not working

make sure backup folder exists and has data:

```bash
session_backup_status
```

if `Sessions backed up: 0`, your backup is empty.

### google drive sync conflicts

google drive desktop can lock files during sync. if you see errors, wait for drive to finish syncing or use a local folder instead.

---

## license

MIT
