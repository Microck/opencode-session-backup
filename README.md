# opencode-session-backup

OpenCode plugin that automatically backs up sessions to Google Drive (or any folder).

## Install

```bash
cd ~/.opencode
npm install opencode-session-backup
```

## Configuration

Set backup destination via environment variable:

```bash
export OPENCODE_BACKUP_PATH="/path/to/backup/folder"
```

### Default Paths

| Platform | Default Destination |
|----------|---------------------|
| Windows | `~/Google Drive/opencode-sessions` |
| macOS | `~/Library/CloudStorage/GoogleDrive/My Drive/opencode-sessions` |
| Linux | Set `OPENCODE_BACKUP_PATH` |

## How It Works

- Auto-syncs after messages, session updates, and deletions
- Debounced: 30s minimum between syncs
- Uses `robocopy` (Windows) or `rsync` (Unix) for fast incremental sync
- Provides `gdrive_sync` tool for manual trigger

## Manual Sync

Use the `gdrive_sync` tool in OpenCode:

```
gdrive_sync force=true
```

## Restore Sessions

Copy backed up files back to OpenCode storage:

**Windows:**
```powershell
robocopy "G:\My Drive\opencode-sessions" "$env:LOCALAPPDATA\opencode\storage" /MIR
```

**macOS/Linux:**
```bash
rsync -av --delete ~/path/to/backup/ ~/.local/share/opencode/storage/
```

## License

MIT
