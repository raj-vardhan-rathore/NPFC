import { HttpError } from "../utils/httpError.js";
export function rateLimit(maxRequests = 300, windowMs = 15 * 60 * 1000) {
    const buckets = new Map();
    return (req, _res, next) => {
        const now = Date.now();
        const key = req.ip || req.socket.remoteAddress || "unknown";
        const bucket = buckets.get(key);
        if (!bucket || bucket.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }
        bucket.count += 1;
        if (bucket.count > maxRequests) {
            return next(new HttpError(429, "Too many requests. Please retry later."));
        }
        next();
    };
}
