import { isDatabaseConnected } from "../config/database.js";
import { DriverModel } from "../models/Driver.js";
import { VehicleModel } from "../models/Vehicle.js";
import { InvoiceModel } from "../models/Invoice.js";
import { TripModel } from "../models/Trip.js";
import { CompanyModel } from "../models/Company.js";
import { PaymentModel } from "../models/Payment.js";
import { MaintenanceModel } from "../models/Maintenance.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { deleteFromS3, getDownloadUrl, getPreviewUrl, uploadToS3 } from "../services/storage.service.js";
const folders = {
    driver: "driver-documents",
    vehicle: "vehicle-documents",
    invoice: "invoices",
    expense: "expense-receipts",
    company: "companies",
    payment: "payment-proofs",
    maintenance: "maintenance-documents"
};
export const uploadDocument = asyncHandler(async (req, res) => {
    if (!req.file)
        throw new HttpError(400, "File is required.");
    const entity = req.params.entity;
    const id = String(req.params.id);
    const type = normalizeDocumentType(entity, String(req.body.type || req.query.type || "Document"));
    const replace = req.body.replace === "true" || req.body.replace === true || req.query.replace === "true";
    if (!folders[entity])
        throw new HttpError(400, "Unsupported upload entity.");
    const keyContext = await resolveKeyContext(entity, id, type);
    const uploaded = await uploadToS3({
        folder: folders[entity],
        filename: req.file.originalname,
        contentType: req.file.mimetype,
        buffer: req.file.buffer,
        entity,
        entityId: id,
        entityName: keyContext.entityName,
        documentType: type,
        expenseType: keyContext.expenseType,
        invoiceNumber: keyContext.invoiceNumber
    });
    const record = isDatabaseConnected() ? await attachDocument(entity, id, type, uploaded.url, uploaded.key, replace) : undefined;
    res.status(201).json({ ...uploaded, record });
});
export const previewDocument = asyncHandler(async (req, res) => {
    const key = Array.isArray(req.query.key) ? req.query.key[0] : req.query.key;
    const download = req.query.download === "true";
    const filename = Array.isArray(req.query.filename) ? req.query.filename[0] : req.query.filename;
    if (!key)
        throw new HttpError(400, "S3 key is required.");
    res.json({ url: download ? await getDownloadUrl(String(key), filename ? String(filename) : undefined) : await getPreviewUrl(String(key)) });
});
export const deleteDocument = asyncHandler(async (req, res) => {
    const key = Array.isArray(req.query.key) ? req.query.key[0] : req.query.key;
    if (!key)
        throw new HttpError(400, "S3 key is required.");
    await deleteFromS3(String(key));
    if (isDatabaseConnected())
        await detachDocument(req.query.entity, String(req.query.id || ""), String(key));
    res.status(204).end();
});
async function attachDocument(entity, id, type, url, key, replace) {
    const document = { type, url, key, uploadedAt: new Date() };
    if (entity === "driver") {
        if (replace)
            await removeReplacedDriverDocuments(id, type);
        return DriverModel.findByIdAndUpdate(id, { $push: { documentUrls: document } }, { new: true });
    }
    if (entity === "vehicle") {
        if (replace)
            await removeReplacedVehicleDocuments(id, type);
        return VehicleModel.findByIdAndUpdate(id, { $push: { documentUrls: document } }, { new: true });
    }
    if (entity === "invoice")
        return InvoiceModel.findByIdAndUpdate(id, { pdfUrl: url, pdfKey: key });
    if (entity === "expense")
        return TripModel.updateOne({ "expenses._id": id }, { $set: { "expenses.$.receiptUrl": url, "expenses.$.receiptKey": key } });
    if (entity === "company")
        return CompanyModel.findByIdAndUpdate(id, { $push: { documentUrls: document } }, { new: true });
    if (entity === "payment")
        return PaymentModel.findByIdAndUpdate(id, { proof: { ...document, fileName: type, contentType: "" } }, { new: true });
    if (entity === "maintenance")
        return MaintenanceModel.findByIdAndUpdate(id, { $push: { documents: { ...document, fileName: type } } }, { new: true });
}
async function removeReplacedDriverDocuments(id, type) {
    const driver = await DriverModel.findById(id).lean();
    await Promise.all((driver?.documentUrls || []).filter((document) => document.type === type).map((document) => deleteFromS3(document.key).catch(() => undefined)));
    await DriverModel.findByIdAndUpdate(id, { $pull: { documentUrls: { type } } });
}
async function removeReplacedVehicleDocuments(id, type) {
    const vehicle = await VehicleModel.findById(id).lean();
    await Promise.all((vehicle?.documentUrls || []).filter((document) => document.type === type).map((document) => deleteFromS3(document.key).catch(() => undefined)));
    await VehicleModel.findByIdAndUpdate(id, { $pull: { documentUrls: { type } } });
}
async function detachDocument(entity, id, key) {
    if (entity === "driver" && id)
        return DriverModel.findByIdAndUpdate(id, { $pull: { documentUrls: { key } } });
    if (entity === "vehicle" && id)
        return VehicleModel.findByIdAndUpdate(id, { $pull: { documentUrls: { key } } });
    if (entity === "invoice" && id)
        return InvoiceModel.findByIdAndUpdate(id, { $unset: { pdfUrl: "", pdfKey: "" } });
    if (entity === "expense" && id)
        return TripModel.updateOne({ "expenses._id": id }, { $unset: { "expenses.$.receiptUrl": "", "expenses.$.receiptKey": "" } });
    if (entity === "company" && id)
        return CompanyModel.findByIdAndUpdate(id, { $pull: { documentUrls: { key } } });
    if (entity === "payment" && id)
        return PaymentModel.findByIdAndUpdate(id, { $unset: { proof: "" } });
    if (entity === "maintenance" && id)
        return MaintenanceModel.findByIdAndUpdate(id, { $pull: { documents: { key } } });
}
async function resolveKeyContext(entity, id, type) {
    if (!isDatabaseConnected())
        return {};
    if (entity === "driver") {
        const driver = await DriverModel.findById(id).lean();
        return { entityName: driver?.name };
    }
    if (entity === "vehicle") {
        const vehicle = await VehicleModel.findById(id).lean();
        return { entityName: vehicle?.vehicleNumber };
    }
    if (entity === "invoice") {
        const invoice = await InvoiceModel.findById(id).lean();
        return { invoiceNumber: invoice?.invoiceNumber };
    }
    if (entity === "expense")
        return { expenseType: type };
    if (entity === "company") {
        const company = await CompanyModel.findById(id).lean();
        return { entityName: company?.companyName };
    }
    if (entity === "payment")
        return { entityName: id };
    if (entity === "maintenance") {
        const record = await MaintenanceModel.findById(id).populate("vehicleId").lean();
        return { entityName: record?.jobCardNumber || id };
    }
    return {};
}
function normalizeDocumentType(entity, type) {
    const normalized = type.trim();
    if (entity === "driver") {
        if (/license/i.test(normalized))
            return "License";
        if (/aadhaar|aadhar/i.test(normalized))
            return "Aadhaar";
        if (/pan/i.test(normalized))
            return "PAN";
    }
    if (entity === "vehicle") {
        if (/insurance/i.test(normalized))
            return "Insurance";
        if (/permit/i.test(normalized))
            return "Permit";
        if (/fitness/i.test(normalized))
            return "Fitness";
        if (/puc|pollution/i.test(normalized))
            return "PUC";
        if (/rc|registration/i.test(normalized))
            return "RC";
    }
    return normalized;
}
