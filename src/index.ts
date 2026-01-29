import type { PluginInput, Hooks } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir, platform } from "os";

function getDestination(): string {
  if (process.env.OPENCODE_BACKUP_PATH) {
    return process.env.OPENCODE_BACKUP_PATH;
  }
  if (platform() === "win32") {
    return join(homedir(), "Google Drive", "opencode-sessions");
  }
  return join(homedir(), "Library", "CloudStorage", "GoogleDrive", "My Drive", "opencode-sessions");
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
const SYNC_DEBOUNCE_MS = 30000;
const SYNC_DELAY_MS = 5000;

interface SyncResult {
  success: boolean;
  duration: number;
  error?: string;
}

async function runSync(): Promise<SyncResult> {
  const startTime = Date.now();

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
    return {
      success: false,
      duration: 0,
      error: `Source not found: ${source}`,
    };
  }

  return new Promise((resolve) => {
    if (platform() !== "win32") {
      const rsync = spawn("rsync", [
        "-av",
        "--delete",
        source + "/",
        destination + "/",
      ]);

      rsync.on("close", (code) => {
        resolve({
          success: code === 0,
          duration: Date.now() - startTime,
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
        "/NJH",
        "/NJS",
        `/LOG+:${logFile}`,
      ]);

      robocopy.on("close", (code) => {
        // robocopy: 0-7 success, 8+ error
        resolve({
          success: code !== null && code < 8,
          duration: Date.now() - startTime,
          error:
            code !== null && code >= 8
              ? `robocopy exited with code ${code}`
              : undefined,
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

    console.debug("[gdrive-sync] Starting session backup...");
    const result = await runSync();

    if (result.success) {
      console.debug(
        `[gdrive-sync] Backup complete in ${(result.duration / 1000).toFixed(1)}s`
      );
    } else {
      console.error(`[gdrive-sync] Backup failed: ${result.error}`);
    }
  }, SYNC_DELAY_MS);
}

const gdriveSessionSyncPlugin = async (_input: PluginInput): Promise<Hooks> => {
  source = getSource();
  destination = getDestination();

  console.debug("[gdrive-sync] Plugin loaded");
  console.debug(`[gdrive-sync] Source: ${source}`);
  console.debug(`[gdrive-sync] Destination: ${destination}`);

  return {
    event: async ({ event }) => {
      const syncEvents = [
        "message.updated",
        "session.deleted",
        "session.updated",
      ];

      if (syncEvents.includes(event.type)) {
        scheduleSync();
      }
    },

    tool: {
      gdrive_sync: tool({
        description:
          "Manually sync all OpenCode sessions to backup destination",
        args: {
          force: tool.schema
            .boolean()
            .optional()
            .describe("Force sync even if recently synced"),
        },
        async execute(args) {
          if (args.force) {
            lastSyncTime = 0;
          }

          const now = Date.now();
          if (now - lastSyncTime < SYNC_DEBOUNCE_MS && !args.force) {
            const waitTime = Math.ceil(
              (SYNC_DEBOUNCE_MS - (now - lastSyncTime)) / 1000
            );
            return `Sync skipped - last sync was ${Math.floor((now - lastSyncTime) / 1000)}s ago. Wait ${waitTime}s or use force=true.`;
          }

          lastSyncTime = Date.now();
          const result = await runSync();

          if (result.success) {
            return `Sync complete in ${(result.duration / 1000).toFixed(1)}s. Sessions backed up to ${destination}`;
          } else {
            return `Sync failed: ${result.error}`;
          }
        },
      }),
    },
  };
};

export default gdriveSessionSyncPlugin;
