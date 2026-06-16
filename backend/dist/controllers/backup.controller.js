import { env } from "../config/env.js";
import { runMongoBackup } from "../services/backup.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
export const backupStatus = asyncHandler(async (_req, res) => {
    res.json({
        enabled: env.backupEnabled,
        cron: env.backupCron,
        backupDir: env.backupDir,
        strategy: "Scheduled mongodump with optional manual trigger. Store generated backup artifacts in durable off-host storage in production."
    });
});
export const runBackupNow = asyncHandler(async (_req, res) => {
    res.status(202).json(await runMongoBackup());
});
