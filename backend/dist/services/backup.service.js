import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import cron from "node-cron";
import { env, hasMongo } from "../config/env.js";
export async function runMongoBackup() {
    if (!hasMongo)
        return { skipped: true, reason: "MONGODB_URI is not set." };
    await fs.mkdir(env.backupDir, { recursive: true });
    const output = path.join(env.backupDir, `mongo-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    await new Promise((resolve, reject) => {
        const child = spawn("mongodump", [`--uri=${env.mongodbUri}`, `--out=${output}`], { stdio: "inherit" });
        child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`mongodump exited with code ${code}`)));
    });
    return { skipped: false, output };
}
export function scheduleBackups() {
    if (!env.backupEnabled)
        return;
    cron.schedule(env.backupCron, () => {
        runMongoBackup().catch((error) => console.error("Mongo backup failed:", error));
    });
}
