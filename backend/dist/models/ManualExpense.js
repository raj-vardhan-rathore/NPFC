import { Schema, model, Types } from "mongoose";
export const expenseStatuses = ["Paid", "Unpaid", "Partial"];
export const recurrenceFrequencies = ["Monthly", "Quarterly", "Yearly"];
const manualExpenseSchema = new Schema({
    expenseName: { type: String, required: true, trim: true, index: true },
    category: { type: String, required: true, trim: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    expenseDate: { type: Date, required: true, index: true },
    status: { type: String, enum: expenseStatuses, default: "Unpaid", index: true },
    paidAmount: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true },
    attachmentUrl: String,
    attachmentKey: String,
    vehicleId: { type: Types.ObjectId, ref: "Vehicle", index: true },
    maintenanceId: { type: Types.ObjectId, ref: "Maintenance", index: true },
    recurring: { type: Boolean, default: false, index: true },
    recurrenceFrequency: { type: String, enum: recurrenceFrequencies },
    recurringUntil: Date
}, { timestamps: true, versionKey: false });
manualExpenseSchema.pre("validate", function normalizePaidAmount() {
    if (this.status === "Paid")
        this.paidAmount = this.amount;
    if (this.status === "Unpaid")
        this.paidAmount = 0;
    if (this.status === "Partial")
        this.paidAmount = Math.min(this.paidAmount || 0, this.amount || 0);
});
export const ManualExpenseModel = model("ManualExpense", manualExpenseSchema);
