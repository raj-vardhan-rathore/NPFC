import multer from "multer";
import { HttpError } from "../utils/httpError.js";
export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.mimetype))
            return cb(new HttpError(400, "Only PDF and image documents are allowed."));
        cb(null, true);
    }
});
