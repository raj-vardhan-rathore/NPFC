import { isDatabaseConnected } from "../config/database.js";
import { hasS3 } from "../config/env.js";
import { InvoiceModel } from "../models/Invoice.js";
import { PaymentModel } from "../models/Payment.js";
import { TripModel } from "../models/Trip.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { createInvoiceForTrip, uploadInvoicePdf } from "../services/invoice.service.js";
export const listInvoices = asyncHandler(async (_req, res) => {
    assertDatabase();
    const rows = await InvoiceModel.find().populate({ path: "tripId", populate: "companyId vehicleId driverId" }).sort({ createdAt: -1 }).lean();
    const payments = await PaymentModel.find({ direction: "Incoming", category: "Invoice Payment", status: { $ne: "Cancelled" } }).select("invoiceId allocations amount amountReceived").lean();
    const paidMap = payments.reduce((map, payment) => {
        if (payment.allocations?.length) {
            for (const allocation of payment.allocations) {
                const key = String(allocation.invoiceId);
                map.set(key, (map.get(key) || 0) + Number(allocation.amount || 0));
            }
        }
        else if (payment.invoiceId) {
            const key = String(payment.invoiceId);
            map.set(key, (map.get(key) || 0) + Number(payment.amount ?? payment.amountReceived ?? 0));
        }
        return map;
    }, new Map());
    res.json(rows.map((invoice) => {
        const trip = invoice.tripId || {};
        const customer = trip.companyId || {};
        const paid = paidMap.get(String(invoice._id)) || 0;
        const outstandingAmount = Math.max(invoice.invoiceAmount - paid, 0);
        const status = outstandingAmount <= 0 ? "Paid" : paid > 0 ? "Partially Paid" : invoice.paymentStatus;
        return {
            ...invoice,
            id: String(invoice._id),
            tripId: String(trip._id || invoice.tripId),
            customerId: String(customer._id || ""),
            invoiceDate: invoice.createdAt,
            dueDate: invoice.createdAt,
            amount: invoice.invoiceAmount,
            outstandingAmount,
            status,
            pdfPath: invoice.pdfUrl,
            pdfKey: invoice.pdfKey,
            emailStatus: invoice.sentStatus
        };
    }));
});
export const generateInvoice = asyncHandler(async (req, res) => {
    assertDatabase();
    const invoice = await createInvoiceForTrip(req.body.tripId, req.user?.name || "System");
    res.status(201).json(invoice);
});
export const regenerateInvoice = asyncHandler(async (req, res) => {
    assertDatabase();
    const invoice = await InvoiceModel.findById(req.params.id);
    if (!invoice)
        throw new HttpError(404, "Invoice not found.");
    res.json(await uploadInvoicePdf(invoice));
});
export const updateInvoice = asyncHandler(async (req, res) => {
    assertDatabase();
    const invoice = await InvoiceModel.findById(req.params.id);
    if (!invoice)
        throw new HttpError(404, "Invoice not found.");
    Object.assign(invoice, req.body);
    invoice.activityLog.push({ dateTime: new Date(), user: req.user?.name || "System", action: "Invoice Edited", remarks: "Invoice fields updated." });
    await invoice.save();
    res.json(hasS3 ? await uploadInvoicePdf(invoice) : invoice);
});
export const deleteInvoice = asyncHandler(async (req, res) => {
    assertDatabase();
    const invoice = await InvoiceModel.findById(req.params.id);
    if (!invoice)
        throw new HttpError(404, "Invoice not found.");
    await removeInvoicePayments(String(invoice._id));
    await TripModel.updateMany({ $or: [{ invoiceId: invoice._id }, { _id: invoice.tripId }] }, { $unset: { invoiceId: "" }, $set: { status: "Delivered" } });
    await invoice.deleteOne();
    res.status(204).end();
});
async function removeInvoicePayments(invoiceId) {
    const payments = await PaymentModel.find({ $or: [{ invoiceId }, { "allocations.invoiceId": invoiceId }] });
    for (const payment of payments) {
        const allocations = payment.allocations || [];
        const removedAmount = allocations
            .filter((allocation) => String(allocation.invoiceId) === invoiceId)
            .reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0);
        const remainingAllocations = allocations.filter((allocation) => String(allocation.invoiceId) !== invoiceId);
        const directlyLinked = String(payment.invoiceId || "") === invoiceId;
        if (directlyLinked || !remainingAllocations.length) {
            await payment.deleteOne();
            continue;
        }
        payment.allocations = remainingAllocations;
        payment.amount = Math.max(Number(payment.amount || 0) - removedAmount, 0);
        payment.amountReceived = payment.amount;
        payment.invoiceId = remainingAllocations[0]?.invoiceId;
        payment.auditLog.push({ dateTime: new Date(), user: "System", action: "Invoice Deleted", remarks: "Removed allocation linked to deleted invoice." });
        if (payment.amount <= 0)
            await payment.deleteOne();
        else
            await payment.save();
    }
}
function assertDatabase() {
    if (!isDatabaseConnected())
        throw new HttpError(503, "MongoDB connection is required.");
}
