import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir, platform } from "os";

interface PluginConfig {
  backupPath?: string;
}

function getDefaultDestination(): string {
  if (platform() === "win32") {
    const spanishPath = "G:/Mi unidad/opencode-sessions";
    if (existsSync("G:/Mi unidad")) {
      return spanishPath;
    }
    return join(homedir(), "Google Drive", "opencode-sessions");
  }
  return join(
    homedir(),
    "Library",
    "CloudStorage",
    "GoogleDrive",
    "My Drive",
    "opencode-sessions"
  );
}

function getSource(): string {
  if (platform() === "win32") {
    return join(
      process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
      "opencode",
      "storage"
    );
  }
  return join(homedir(), ".local", "share", "opencode", "storage");
}

let destination = "";
let source = "";
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let lastSyncTime = 0;
let lastSyncSuccess = true;
let syncCount = 0;
const SYNC_DEBOUNCE_MS = 30000;
const SYNC_DELAY_MS = 5000;

interface SyncResult {
  success: boolean;
  duration: number;
  filesChanged?: number;
  error?: string;
}

async function runSync(): Promise<SyncResult> {
  const startTime = Date.now();

  if (!destination) {
    return { success: false, duration: 0, error: "No backup path configured" };
  }

  if (!existsSync(destination)) {
    try {
      mkdirSync(destination, { recursive: true });
    } catch (err) {
      return {
        success: false,
        duration: 0,
        error: `Failed to create destination: ${err}`,
      };
    }
  }

  if (!existsSync(source)) {
    return { success: false, duration: 0, error: `Source not found: ${source}` };
  }

  return new Promise((resolve) => {
    if (platform() !== "win32") {
      const rsync = spawn("rsync", [
        "-av",
        "--delete",
        "--stats",
        source + "/",
        destination + "/",
      ]);

      let output = "";
      rsync.stdout.on("data", (data) => (output += data));

      rsync.on("close", (code) => {
        const filesMatch = output.match(/Number of regular files transferred: (\d+)/);
        resolve({
          success: code === 0,
          duration: Date.now() - startTime,
          filesChanged: filesMatch ? parseInt(filesMatch[1]) : undefined,
          error: code !== 0 ? `rsync exited with code ${code}` : undefined,
        });
      });

      rsync.on("error", (err) => {
        resolve({
          success: false,
          duration: Date.now() - startTime,
          error: `rsync error: ${err.message}`,
        });
      });
    } else {
      const logFile = join(destination, "sync.log");
      const robocopy = spawn("robocopy", [
        source,
        destination,
        "/MIR",
        "/MT:8",
        "/R:2",
        "/W:1",
        "/NP",
        "/NDL",
        `/LOG+:${logFile}`,
      ]);

      let output = "";
      robocopy.stdout.on("data", (data) => (output += data));

      robocopy.on("close", (code) => {
        // robocopy: 0-7 success, 8+ error
        const copiedMatch = output.match(/Files\s*:\s*\d+\s+(\d+)/);
        resolve({
          success: code !== null && code < 8,
          duration: Date.now() - startTime,
          filesChanged: copiedMatch ? parseInt(copiedMatch[1]) : undefined,
          error: code !== null && code >= 8 ? `robocopy exited with code ${code}` : undefined,
        });
      });

      robocopy.on("error", (err) => {
        resolve({
          success: false,
          duration: Date.now() - startTime,
          error: `robocopy error: ${err.message}`,
        });
      });
    }
  });
}

async function runRestore(): Promise<SyncResult> {
  const startTime = Date.now();

  if (!destination || !existsSync(destination)) {
    return { success: false, duration: 0, error: `Backup not found: ${destination}` };
  }

  if (!existsSync(source)) {
    try {
      mkdirSync(source, { recursive: true });
    } catch (err) {
      return { success: false, duration: 0, error: `Failed to create source: ${err}` };
    }
  }

  return new Promise((resolve) => {
    if (platform() !== "win32") {
      const rsync = spawn("rsync", ["-av", "--delete", destination + "/", source + "/"]);

      rsync.on("close", (code) => {
        resolve({
          success: code === 0,
          duration: Date.now() - startTime,
          error: code !== 0 ? `rsync exited with code ${code}` : undefined,
        });
      });

      rsync.on("error", (err) => {
        resolve({ success: false, duration: Date.now() - startTime, error: `rsync error: ${err.message}` });
      });
    } else {
      const robocopy = spawn("robocopy", [destination, source, "/MIR", "/MT:8", "/R:2", "/W:1", "/NP", "/NDL"]);

      robocopy.on("close", (code) => {
        resolve({
          success: code !== null && code < 8,
          duration: Date.now() - startTime,
          error: code !== null && code >= 8 ? `robocopy exited with code ${code}` : undefined,
        });
      });

      robocopy.on("error", (err) => {
        resolve({ success: false, duration: Date.now() - startTime, error: `robocopy error: ${err.message}` });
      });
    }
  });
}

function scheduleSync() {
  const now = Date.now();

  if (now - lastSyncTime < SYNC_DEBOUNCE_MS) {
    return;
  }

  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  syncTimeout = setTimeout(async () => {
    syncTimeout = null;
    lastSyncTime = Date.now();

    console.debug("[session-backup] Starting backup...");
    const result = await runSync();
    lastSyncSuccess = result.success;

    if (result.success) {
      syncCount++;
      console.debug(`[session-backup] Backup complete in ${(result.duration / 1000).toFixed(1)}s`);
    } else {
      console.error(`[session-backup] Backup failed: ${result.error}`);
    }
  }, SYNC_DELAY_MS);
}

function getBackupStats(): { sessions: number; size: string; lastModified: Date | null } {
  if (!destination || !existsSync(destination)) {
    return { sessions: 0, size: "0 B", lastModified: null };
  }

  let totalSize = 0;
  let lastModified: Date | null = null;
  let sessions = 0;

  const sessionDir = join(destination, "session");
  if (existsSync(sessionDir)) {
    const dirs = readdirSync(sessionDir);
    for (const dir of dirs) {
      const dirPath = join(sessionDir, dir);
      const stat = statSync(dirPath);
      if (stat.isDirectory()) {
        sessions++;
        const files = readdirSync(dirPath);
        for (const file of files) {
          const fileStat = statSync(join(dirPath, file));
          totalSize += fileStat.size;
          if (!lastModified || fileStat.mtime > lastModified) {
            lastModified = fileStat.mtime;
          }
        }
      }
    }
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = totalSize;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return {
    sessions,
    size: `${size.toFixed(1)} ${units[unitIndex]}`,
    lastModified,
  };
}

const gdriveSessionSyncPlugin = async (input: PluginInput): Promise<Hooks> => {
  source = getSource();
  destination = process.env.OPENCODE_BACKUP_PATH || getDefaultDestination();

  console.debug("[session-backup] Plugin loaded");
  console.debug(`[session-backup] Source: ${source}`);
  console.debug(`[session-backup] Destination: ${destination}`);

  return {
    config: async (config) => {
      const pluginConfig = (config as Record<string, unknown>)["session-backup"] as PluginConfig | undefined;
      if (pluginConfig?.backupPath) {
        destination = pluginConfig.backupPath;
        console.debug(`[session-backup] Config override: ${destination}`);
      }
    },

    event: async ({ event }) => {
      const syncEvents = ["message.updated", "session.deleted", "session.updated"];
      if (syncEvents.includes(event.type)) {
        scheduleSync();
      }
    },

    tool: {
      session_backup_sync: tool({
        description: "Sync all OpenCode sessions to backup destination",
        args: {
          force: tool.schema.boolean().optional().describe("Force sync even if recently synced"),
        },
        async execute(args) {
          if (args.force) {
            lastSyncTime = 0;
          }

          const now = Date.now();
          if (now - lastSyncTime < SYNC_DEBOUNCE_MS && !args.force) {
            const waitTime = Math.ceil((SYNC_DEBOUNCE_MS - (now - lastSyncTime)) / 1000);
            return `Sync skipped - last sync ${Math.floor((now - lastSyncTime) / 1000)}s ago. Wait ${waitTime}s or force=true.`;
          }

          lastSyncTime = Date.now();
          const result = await runSync();
          lastSyncSuccess = result.success;

          if (result.success) {
            syncCount++;
            const files = result.filesChanged !== undefined ? `, ${result.filesChanged} files changed` : "";
            return `Backup complete in ${(result.duration / 1000).toFixed(1)}s${files}. Destination: ${destination}`;
          }
          return `Backup failed: ${result.error}`;
        },
      }),

      session_backup_restore: tool({
        description: "Restore OpenCode sessions from backup (overwrites current sessions)",
        args: {
          confirm: tool.schema.boolean().describe("Must be true to confirm restore"),
        },
        async execute(args) {
          if (!args.confirm) {
            return "Restore requires confirm=true. WARNING: This will overwrite all current sessions with backup data.";
          }

          const result = await runRestore();
          if (result.success) {
            return `Restore complete in ${(result.duration / 1000).toFixed(1)}s. Restart OpenCode to see restored sessions.`;
          }
          return `Restore failed: ${result.error}`;
        },
      }),

      session_backup_status: tool({
        description: "Show backup status and statistics",
        args: {},
        async execute() {
          const stats = getBackupStats();
          const pending = syncTimeout !== null;
          const timeSinceSync = lastSyncTime ? Math.floor((Date.now() - lastSyncTime) / 1000) : null;

          const lines = [
            `Backup path: ${destination}`,
            `Source path: ${source}`,
            `Sessions backed up: ${stats.sessions}`,
            `Backup size: ${stats.size}`,
            `Last backup: ${stats.lastModified ? stats.lastModified.toLocaleString() : "never"}`,
            `Last sync: ${timeSinceSync !== null ? `${timeSinceSync}s ago` : "never"}`,
            `Last sync success: ${lastSyncSuccess ? "yes" : "no"}`,
            `Syncs this session: ${syncCount}`,
            `Sync pending: ${pending ? "yes" : "no"}`,
          ];

          return lines.join("\n");
        },
      }),
    },
  };
};

export default gdriveSessionSyncPlugin;
