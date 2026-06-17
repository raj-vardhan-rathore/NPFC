import { Types } from "mongoose";
import puppeteer from "puppeteer";
import { isDatabaseConnected } from "../config/database.js";
import { CompanyModel } from "../models/Company.js";
import { DriverModel } from "../models/Driver.js";
import { InvoiceModel } from "../models/Invoice.js";
import { PaymentModel } from "../models/Payment.js";
import { TripModel } from "../models/Trip.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { invoicePaidAmount } from "../services/invoice.service.js";
export const listPayments = asyncHandler(async (req, res) => {
    assertDatabase();
    const filters = parseFilters(req.query);
    const rows = await PaymentModel.find(paymentQuery(filters))
        .populate("customerId driverId tripId vehicleId invoiceId allocations.invoiceId")
        .sort({ paymentDate: -1, createdAt: -1 })
        .lean();
    res.json(rows.map(toPaymentDto).filter((row) => matchesSearch(row, filters)));
});
export const createPayment = asyncHandler(async (req, res) => {
    assertDatabase();
    const body = await normalizePayload(req.body);
    const payment = await PaymentModel.create({
        ...body,
        createdBy: req.user?.name || "System",
        updatedBy: req.user?.name || "System",
        auditLog: [{ dateTime: new Date(), user: req.user?.name || "System", action: "Created", remarks: "Payment record created." }]
    });
    await syncLinkedInvoices(payment);
    res.status(201).json(toPaymentDto(await hydratePayment(payment._id)));
});
export const updatePayment = asyncHandler(async (req, res) => {
    assertDatabase();
    const existing = await PaymentModel.findById(req.params.id);
    if (!existing)
        throw new HttpError(404, "Payment not found.");
    const previousInvoiceIds = invoiceIdsForPayment(existing);
    const body = await normalizePayload(req.body, existing.toObject());
    Object.assign(existing, body, { updatedBy: req.user?.name || "System" });
    existing.auditLog.push({ dateTime: new Date(), user: req.user?.name || "System", action: "Updated", remarks: "Payment record updated." });
    await existing.save();
    await syncLinkedInvoices(existing, previousInvoiceIds);
    res.json(toPaymentDto(await hydratePayment(existing._id)));
});
export const deletePayment = asyncHandler(async (req, res) => {
    assertDatabase();
    if (req.user?.role !== "Admin")
        throw new HttpError(403, "Only Admin can delete payment records.");
    const payment = await PaymentModel.findByIdAndDelete(req.params.id);
    if (!payment)
        throw new HttpError(404, "Payment not found.");
    await syncLinkedInvoices(payment, invoiceIdsForPayment(payment));
    res.status(204).end();
});
export const exportPayments = asyncHandler(async (req, res) => {
    assertDatabase();
    const filters = parseFilters(req.query);
    const rows = (await PaymentModel.find(paymentQuery(filters))
        .populate("customerId driverId tripId vehicleId invoiceId allocations.invoiceId")
        .sort({ paymentDate: -1, createdAt: -1 })
        .lean())
        .map(toPaymentDto)
        .filter((row) => matchesSearch(row, filters));
    const format = String(req.query.format || "csv").toLowerCase();
    if (format === "pdf")
        return sendPdf(res, rows);
    return sendCsv(res, rows, format === "excel" ? "payments-report.xls" : "payments-report.csv");
});
async function normalizePayload(body, current = {}) {
    const direction = body.direction || current.direction || "Incoming";
    const category = body.category || current.category || (direction === "Incoming" ? "Invoice Payment" : "Miscellaneous");
    const amount = Number(body.amount ?? body.amountReceived ?? current.amount ?? current.amountReceived ?? 0);
    if (amount <= 0)
        throw new HttpError(400, "Payment amount must be greater than zero.");
    const allocations = normalizeAllocations(body.allocations ?? current.allocations ?? [], body.invoiceId ?? current.invoiceId, amount, category);
    const linkedInvoiceIds = allocations.map((allocation) => allocation.invoiceId);
    if (category === "Invoice Payment" && !linkedInvoiceIds.length)
        throw new HttpError(400, "Invoice Payment requires at least one linked invoice.");
    if (allocations.reduce((sum, allocation) => sum + allocation.amount, 0) > amount)
        throw new HttpError(400, "Invoice allocations cannot exceed payment amount.");
    const invoice = linkedInvoiceIds[0] ? await InvoiceModel.findById(linkedInvoiceIds[0]).populate({ path: "tripId", populate: "companyId vehicleId driverId" }).lean() : undefined;
    if (linkedInvoiceIds.length) {
        const count = await InvoiceModel.countDocuments({ _id: { $in: linkedInvoiceIds } });
        if (count !== linkedInvoiceIds.length)
            throw new HttpError(404, "One or more linked invoices were not found.");
    }
    const trip = invoice?.tripId;
    const partyType = body.partyType || current.partyType || (direction === "Incoming" ? "Customer" : "Vendor");
    const customerId = objectId(body.customerId ?? current.customerId ?? trip?.companyId?._id);
    const driverId = objectId(body.driverId ?? current.driverId ?? trip?.driverId?._id);
    const tripId = objectId(body.tripId ?? current.tripId ?? trip?._id);
    const vehicleId = objectId(body.vehicleId ?? current.vehicleId ?? trip?.vehicleId?._id);
    const partyName = await resolvePartyName({ partyType, partyName: body.partyName ?? current.partyName, customerId, driverId, vendorName: body.vendorName ?? current.vendorName, employeeName: body.employeeName ?? current.employeeName });
    return {
        direction,
        category,
        partyType,
        partyName,
        customerId,
        driverId,
        vendorName: body.vendorName ?? current.vendorName ?? "",
        employeeName: body.employeeName ?? current.employeeName ?? "",
        invoiceId: linkedInvoiceIds[0],
        allocations,
        tripId,
        vehicleId,
        expenseId: body.expenseId ?? current.expenseId ?? "",
        amount,
        amountReceived: amount,
        paymentDate: body.paymentDate ?? current.paymentDate,
        mode: body.mode ?? current.mode ?? "NEFT",
        referenceNumber: body.referenceNumber ?? current.referenceNumber ?? "",
        status: body.status ?? current.status ?? "Recorded",
        remarks: body.remarks ?? current.remarks ?? "",
        notes: body.notes ?? current.notes ?? "",
        proof: body.proof ?? current.proof
    };
}
function normalizeAllocations(allocations, invoiceId, amount, category) {
    const rows = Array.isArray(allocations) ? allocations : [];
    const normalized = rows
        .map((allocation) => ({ invoiceId: objectId(allocation.invoiceId), amount: Number(allocation.amount || 0) }))
        .filter((allocation) => allocation.invoiceId && allocation.amount > 0);
    if (!normalized.length && invoiceId && category === "Invoice Payment") {
        normalized.push({ invoiceId: objectId(invoiceId), amount });
    }
    return normalized;
}
async function syncLinkedInvoices(payment, previousInvoiceIds = []) {
    const ids = Array.from(new Set([...previousInvoiceIds, ...invoiceIdsForPayment(payment)]));
    for (const id of ids) {
        const invoice = await InvoiceModel.findById(id);
        if (!invoice)
            continue;
        const paid = await invoicePaidAmount(String(invoice._id));
        invoice.paymentStatus = paid >= invoice.invoiceAmount ? "Paid" : paid > 0 ? "Partially Paid" : "Generated";
        invoice.activityLog.push({ dateTime: new Date(), user: payment.updatedBy || payment.createdBy || "System", action: "Payment Synced", remarks: `${paid} received against invoice.` });
        await invoice.save();
        const tripPatch = { invoiceId: invoice._id };
        if (invoice.paymentStatus === "Paid")
            tripPatch.status = "Payment Received";
        else if (invoice.paymentStatus === "Partially Paid")
            tripPatch.status = "Invoice Generated";
        await TripModel.findByIdAndUpdate(invoice.tripId, { $set: tripPatch }).catch(() => undefined);
    }
}
function invoiceIdsForPayment(payment) {
    const ids = (payment.allocations || []).map((allocation) => String(allocation.invoiceId)).filter(Boolean);
    if (payment.invoiceId)
        ids.push(String(payment.invoiceId));
    return Array.from(new Set(ids));
}
async function hydratePayment(id) {
    return PaymentModel.findById(id).populate("customerId driverId tripId vehicleId invoiceId allocations.invoiceId").lean();
}
function toPaymentDto(payment) {
    const customer = payment.customerId || {};
    const driver = payment.driverId || {};
    const trip = payment.tripId || {};
    const vehicle = payment.vehicleId || {};
    const invoice = payment.invoiceId || {};
    const allocations = (payment.allocations || []).map((allocation) => ({
        invoiceId: String(allocation.invoiceId?._id || allocation.invoiceId),
        invoiceNumber: allocation.invoiceId?.invoiceNumber,
        amount: Number(allocation.amount || 0)
    }));
    const amount = Number(payment.amount ?? payment.amountReceived ?? 0);
    return {
        ...payment,
        id: String(payment._id),
        paymentId: payment.paymentId || `PAY-${String(payment._id).slice(-8).toUpperCase()}`,
        customerId: customer._id ? String(customer._id) : payment.customerId ? String(payment.customerId) : "",
        driverId: driver._id ? String(driver._id) : payment.driverId ? String(payment.driverId) : "",
        tripId: trip._id ? String(trip._id) : payment.tripId ? String(payment.tripId) : "",
        vehicleId: vehicle._id ? String(vehicle._id) : payment.vehicleId ? String(payment.vehicleId) : "",
        invoiceId: invoice._id ? String(invoice._id) : payment.invoiceId ? String(payment.invoiceId) : "",
        linkedInvoice: invoice.invoiceNumber || "",
        linkedTrip: trip.tripId || "",
        linkedVehicle: vehicle.vehicleNumber || "",
        linkedDriver: driver.name || "",
        partyName: payment.partyName || customer.companyName || driver.name || payment.vendorName || payment.employeeName || "Other",
        amount,
        amountReceived: amount,
        paymentDate: toDateString(payment.paymentDate),
        mode: payment.mode || "NEFT",
        referenceNumber: payment.referenceNumber || "",
        remarks: payment.remarks || payment.notes || "",
        allocations,
        proofUrl: payment.proof?.url || "",
        proofKey: payment.proof?.key || "",
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt
    };
}
function parseFilters(query) {
    return {
        from: query.from ? startOfDay(String(query.from)) : undefined,
        to: query.to ? endOfDay(String(query.to)) : undefined,
        customerId: stringFilter(query.customerId),
        driverId: stringFilter(query.driverId),
        vehicleId: stringFilter(query.vehicleId),
        tripId: stringFilter(query.tripId),
        invoiceId: stringFilter(query.invoiceId),
        category: stringFilter(query.category),
        mode: stringFilter(query.mode),
        direction: stringFilter(query.direction),
        status: stringFilter(query.status),
        minAmount: query.minAmount ? Number(query.minAmount) : undefined,
        maxAmount: query.maxAmount ? Number(query.maxAmount) : undefined,
        search: String(query.search || "").trim().toLowerCase()
    };
}
function paymentQuery(filters) {
    const query = {};
    if (filters.from || filters.to)
        query.paymentDate = {};
    if (filters.from)
        query.paymentDate.$gte = filters.from;
    if (filters.to)
        query.paymentDate.$lte = filters.to;
    if (filters.customerId)
        query.customerId = new Types.ObjectId(filters.customerId);
    if (filters.driverId)
        query.driverId = new Types.ObjectId(filters.driverId);
    if (filters.vehicleId)
        query.vehicleId = new Types.ObjectId(filters.vehicleId);
    if (filters.tripId)
        query.tripId = new Types.ObjectId(filters.tripId);
    if (filters.invoiceId)
        query.$or = [{ invoiceId: new Types.ObjectId(filters.invoiceId) }, { "allocations.invoiceId": new Types.ObjectId(filters.invoiceId) }];
    if (filters.category)
        query.category = filters.category;
    if (filters.mode)
        query.mode = filters.mode;
    if (filters.direction)
        query.direction = filters.direction;
    if (filters.status)
        query.status = filters.status;
    if (filters.minAmount !== undefined || filters.maxAmount !== undefined)
        query.amount = {};
    if (filters.minAmount !== undefined)
        query.amount.$gte = filters.minAmount;
    if (filters.maxAmount !== undefined)
        query.amount.$lte = filters.maxAmount;
    return query;
}
function matchesSearch(row, filters) {
    if (!filters.search)
        return true;
    return [row.paymentId, row.partyName, row.category, row.mode, row.referenceNumber, row.linkedInvoice, row.linkedTrip, row.linkedVehicle, row.linkedDriver]
        .join(" ")
        .toLowerCase()
        .includes(filters.search);
}
async function resolvePartyName(input) {
    if (input.partyName)
        return input.partyName;
    if (input.partyType === "Customer" && input.customerId) {
        const customer = await CompanyModel.findById(input.customerId).select("companyName").lean();
        return customer?.companyName || "";
    }
    if (input.partyType === "Driver" && input.driverId) {
        const driver = await DriverModel.findById(input.driverId).select("name").lean();
        return driver?.name || "";
    }
    return input.vendorName || input.employeeName || "Other";
}
function sendCsv(res, rows, filename) {
    const headers = ["Payment ID", "Date", "Direction", "Category", "Party Name", "Amount", "Payment Mode", "Linked Invoice", "Linked Trip", "Linked Vehicle", "Status", "Created By"];
    const csv = [headers, ...rows.map((row) => [row.paymentId, row.paymentDate, row.direction, row.category, row.partyName, row.amount, row.mode, row.linkedInvoice, row.linkedTrip, row.linkedVehicle, row.status, row.createdBy])]
        .map((line) => line.map(csvCell).join(","))
        .join("\n");
    res.setHeader("Content-Type", filename.endsWith(".xls") ? "application/vnd.ms-excel" : "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.send(csv);
}
async function sendPdf(res, rows) {
    const body = rows.map((row) => `<tr><td>${escapeHtml(row.paymentId)}</td><td>${escapeHtml(row.paymentDate)}</td><td>${escapeHtml(row.direction)}</td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.partyName)}</td><td>${currency(row.amount)}</td><td>${escapeHtml(row.status)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8" /><style>body{font-family:Arial,sans-serif;color:#111827;padding:28px}h1{margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left}th{background:#f9fafb}</style></head><body><h1>NPFC Payments Report</h1><table><thead><tr><th>Payment ID</th><th>Date</th><th>Direction</th><th>Category</th><th>Party</th><th>Amount</th><th>Status</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        const pdf = await page.pdf({ format: "A4", printBackground: true });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=payments-report.pdf");
        res.send(Buffer.from(pdf));
    }
    finally {
        await browser.close();
    }
}
function objectId(value) {
    const text = String(value || "");
    return Types.ObjectId.isValid(text) ? new Types.ObjectId(text) : undefined;
}
function stringFilter(value) {
    const text = String(value || "");
    return text && text !== "All" ? text : "";
}
function startOfDay(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
}
function endOfDay(value) {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
}
function toDateString(value) {
    return new Date(value).toISOString().slice(0, 10);
}
function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
function currency(amount) {
    return `INR ${Math.round(amount || 0).toLocaleString("en-IN")}`;
}
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}
function assertDatabase() {
    if (!isDatabaseConnected())
        throw new HttpError(503, "MongoDB connection is required.");
}
