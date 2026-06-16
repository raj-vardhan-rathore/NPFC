import { isDatabaseConnected } from "../config/database.js";
import { DocumentService } from "../services/document.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
export const listDocuments = asyncHandler(async (_req, res) => {
    assertDatabase();
    res.json(await DocumentService.getAllDocuments());
});
export const documentReport = asyncHandler(async (_req, res) => {
    assertDatabase();
    const payload = await DocumentService.getAllDocuments();
    res.json(DocumentService.generateComplianceReport(payload.documents));
});
function assertDatabase() {
    if (!isDatabaseConnected())
        throw new HttpError(503, "MongoDB connection is required.");
}
