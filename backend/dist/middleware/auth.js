import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { roles } from "../models/User.js";
import { HttpError } from "../utils/httpError.js";
export const requireAuth = (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
        return next(new HttpError(401, "Missing token."));
    try {
        const payload = jwt.verify(header.slice(7), env.jwtSecret);
        req.user = { id: payload.sub, email: payload.email, role: payload.role, name: payload.name };
        next();
    }
    catch {
        next(new HttpError(401, "Invalid token."));
    }
};
export function requireRole(...allowedRoles) {
    return (req, _res, next) => {
        if (!req.user)
            return next(new HttpError(401, "Authentication required."));
        if (req.user.role === "Super Admin" || req.user.role === "Admin" || allowedRoles.includes(req.user.role))
            return next();
        next(new HttpError(403, "You do not have permission to perform this action."));
    };
}
export function requireWriteAccess(...allowedRoles) {
    return (req, res, next) => {
        if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS")
            return next();
        if (req.user?.role === "Viewer")
            return next(new HttpError(403, "Viewer users have read-only access."));
        return requireRole(...allowedRoles)(req, res, next);
    };
}
export const roleMatrix = {
    allRoles: roles,
    finance: ["Super Admin", "Admin", "Accountant"],
    operations: ["Super Admin", "Admin", "Operations", "Operations Manager", "Fleet Manager", "Driver Manager"],
    readOnly: roles
};
