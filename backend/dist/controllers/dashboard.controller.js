import { isDatabaseConnected } from "../config/database.js";
import { getSaasDashboard } from "../services/dashboard.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
export const dashboard = asyncHandler(async (_req, res) => {
    if (isDatabaseConnected())
        return res.json(await getSaasDashboard());
    throw new HttpError(503, "MongoDB connection is required.");
});
