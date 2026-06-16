import type { RequestHandler } from "express";
import { HttpError } from "../utils/httpError.js";

type Bucket = {
  count: number;
  resetAt: number;
};

export function rateLimit(maxRequests = 300, windowMs = 15 * 60 * 1000): RequestHandler {
  const buckets = new Map<string, Bucket>();

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
