import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });
export const env = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: Number(process.env.PORT ?? 8000),
    frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
    mongodbUri: process.env.MONGODB_URI ?? "",
    jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    awsRegion: process.env.AWS_REGION ?? "ap-south-1",
    awsBucketName: process.env.AWS_BUCKET_NAME ?? "",
    backupCron: process.env.BACKUP_CRON ?? "0 2 * * *",
    backupEnabled: process.env.BACKUP_ENABLED === "true",
    backupDir: process.env.BACKUP_DIR ?? "backups"
};
export const hasMongo = Boolean(env.mongodbUri);
export const hasS3 = Boolean(env.awsAccessKeyId && env.awsSecretAccessKey && env.awsBucketName);
const missing = [
    ["MONGODB_URI", env.mongodbUri],
    ["JWT_SECRET", env.jwtSecret && env.jwtSecret !== "dev-secret" ? env.jwtSecret : ""],
    ["AWS_ACCESS_KEY_ID", env.awsAccessKeyId],
    ["AWS_SECRET_ACCESS_KEY", env.awsSecretAccessKey],
    ["AWS_REGION", env.awsRegion],
    ["AWS_BUCKET_NAME", env.awsBucketName]
].filter(([, value]) => !value).map(([key]) => key);
if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}
