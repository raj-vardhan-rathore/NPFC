import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, hasS3 } from "../config/env.js";
import { s3Client } from "../config/s3.js";
import { HttpError } from "../utils/httpError.js";
function assertS3Configured() {
    if (!hasS3)
        throw new HttpError(500, "AWS S3 is not configured. Set AWS credentials and AWS_BUCKET_NAME.");
}
export async function uploadToS3(input) {
    assertS3Configured();
    const key = buildObjectKey(input);
    await s3Client.send(new PutObjectCommand({
        Bucket: env.awsBucketName,
        Key: key,
        Body: input.buffer,
        ContentType: input.contentType,
        ServerSideEncryption: "AES256"
    }));
    return {
        key,
        url: ""
    };
}
function buildObjectKey(input) {
    const ext = extension(input.filename);
    const date = input.date || new Date();
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    if (input.entity === "driver") {
        return `drivers/${sanitizePathPart(input.entityName || "driver")}_${sanitizePathPart(input.entityId || "unknown")}/${sanitizePathPart(input.documentType || "Document")}${ext}`;
    }
    if (input.entity === "vehicle") {
        return `vehicles/${sanitizePathPart(input.entityName || "vehicle")}/${sanitizePathPart(input.documentType || "Document")}${ext}`;
    }
    if (input.entity === "invoice") {
        const invoiceNumber = sanitizePathPart(input.invoiceNumber || input.filename.replace(/\.[^.]+$/, ""));
        return `invoices/${year}/${month}/INV-${invoiceNumber}.pdf`;
    }
    if (input.entity === "expense") {
        return `expenses/${sanitizePathPart(input.expenseType || input.documentType || "expense")}/${year}/${month}/${sanitizeFileName(input.filename)}`;
    }
    if (input.entity === "company") {
        return `companies/${sanitizePathPart(input.entityName || "company")}/${sanitizeFileName(input.filename)}`;
    }
    if (input.entity === "payment") {
        return `payments/${year}/${month}/${sanitizePathPart(input.entityId || "payment")}/${sanitizeFileName(input.filename)}`;
    }
    if (input.entity === "bilty") {
        return `bilties/${year}/${month}/${sanitizePathPart(input.entityName || "bilty")}/${Date.now()}-${sanitizeFileName(input.filename)}`;
    }
    return `${sanitizePathPart(input.folder)}/${Date.now()}-${sanitizeFileName(input.filename)}`;
}
function extension(filename) {
    const match = filename.match(/\.[a-zA-Z0-9]+$/);
    return match ? match[0].toLowerCase() : "";
}
function sanitizePathPart(value) {
    return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}
function sanitizeFileName(value) {
    const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return sanitized || `file-${Date.now()}`;
}
export async function deleteFromS3(key) {
    assertS3Configured();
    await s3Client.send(new DeleteObjectCommand({ Bucket: env.awsBucketName, Key: key }));
}
export async function getPreviewUrl(key) {
    assertS3Configured();
    return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: env.awsBucketName, Key: key }), { expiresIn: 60 * 10 });
}
export async function getDownloadUrl(key, filename) {
    assertS3Configured();
    const safeFilename = filename?.replace(/["\r\n]/g, "").trim();
    return getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: env.awsBucketName,
        Key: key,
        ResponseContentDisposition: safeFilename ? `attachment; filename="${safeFilename}"` : "attachment"
    }), { expiresIn: 60 * 10 });
}
