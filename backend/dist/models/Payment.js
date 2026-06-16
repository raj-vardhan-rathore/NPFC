import { Schema, model, Types } from "mongoose";
export const paymentDirections = ["Incoming", "Outgoing"];
export const incomingPaymentCategories = ["Invoice Payment", "Advance Received", "Security Deposit", "Adjustment", "Other"];
export const outgoingPaymentCategories = ["Driver Advance", "Driver Payment", "Fuel Payment", "Maintenance Payment", "Toll Payment", "Vendor Payment", "Salary Payment", "Insurance Payment", "Miscellaneous", "Other"];
export const paymentModes = ["Cash", "UPI", "IMPS", "NEFT", "RTGS", "Cheque", "Bank Transfer", "Other"];
export const partyTypes = ["Customer", "Driver", "Vendor", "Employee", "Other"];
export const paymentStatuses = ["Recorded", "Pending", "Cancelled", "Reconciled"];
const allocationSchema = new Schema({
    invoiceId: { type: Types.ObjectId, ref: "Invoice", required: true },
    amount: { type: Number, required: true, min: 0.01 }
}, { _id: false });
const proofSchema = new Schema({
    url: { type: String, default: "" },
    key: { type: String, default: "" },
    fileName: { type: String, default: "" },
    contentType: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now }
}, { _id: false });
const auditSchema = new Schema({
    dateTime: { type: Date, default: Date.now },
    user: { type: String, required: true },
    action: { type: String, required: true },
    remarks: { type: String, default: "" }
}, { _id: false });
const paymentSchema = new Schema({
    paymentId: { type: String, unique: true, sparse: true, index: true },
    direction: { type: String, enum: paymentDirections, default: "Incoming", index: true },
    category: { type: String, default: "Invoice Payment", trim: true, index: true },
    partyType: { type: String, enum: partyTypes, default: "Customer", index: true },
    partyName: { type: String, default: "", trim: true, index: true },
    customerId: { type: Types.ObjectId, ref: "Company", index: true },
    driverId: { type: Types.ObjectId, ref: "Driver", index: true },
    vendorName: { type: String, default: "", trim: true },
    employeeName: { type: String, default: "", trim: true },
    invoiceId: { type: Types.ObjectId, ref: "Invoice", index: true },
    allocations: { type: [allocationSchema], default: [] },
    tripId: { type: Types.ObjectId, ref: "Trip", index: true },
    vehicleId: { type: Types.ObjectId, ref: "Vehicle", index: true },
    expenseId: { type: String, default: "", index: true },
    amount: { type: Number, min: 0 },
    amountReceived: { type: Number, min: 0 },
    paymentDate: { type: Date, required: true, index: true },
    mode: { type: String, enum: paymentModes, default: "NEFT", index: true },
    referenceNumber: { type: String, default: "", trim: true, index: true },
    status: { type: String, enum: paymentStatuses, default: "Recorded", index: true },
    remarks: { type: String, default: "" },
    notes: { type: String, default: "" },
    proof: { type: proofSchema, default: undefined },
    createdBy: { type: String, default: "System", index: true },
    updatedBy: { type: String, default: "System" },
    auditLog: { type: [auditSchema], default: [] }
}, { timestamps: true, versionKey: false });
paymentSchema.index({ paymentDate: -1, direction: 1, category: 1 });
paymentSchema.index({ partyName: "text", referenceNumber: "text", paymentId: "text", category: "text" });
paymentSchema.pre("validate", async function normalizePayment() {
    const amount = Number(this.amount ?? this.amountReceived ?? 0);
    this.amount = amount;
    this.amountReceived = amount;
    this.partyName = this.partyName || this.vendorName || this.employeeName || "";
    if (!this.paymentId && !this.isNew)
        this.paymentId = `PAY-${String(this._id).slice(-8).toUpperCase()}`;
});
paymentSchema.post("save", async function ensurePaymentId(doc) {
    if (doc.paymentId)
        return;
    doc.paymentId = `PAY-${String(doc._id).slice(-8).toUpperCase()}`;
    await PaymentModel.updateOne({ _id: doc._id }, { $set: { paymentId: doc.paymentId } });
});
export const PaymentModel = model("Payment", paymentSchema);
