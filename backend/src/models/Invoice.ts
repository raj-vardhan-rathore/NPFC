import { Schema, model, Types, type HydratedDocument, type InferSchemaType } from "mongoose";

const activitySchema = new Schema({
  dateTime: { type: Date, default: Date.now },
  user: { type: String, required: true },
  action: { type: String, required: true },
  remarks: { type: String, default: "" }
}, { _id: false });

const invoiceSchema = new Schema({
  invoiceNumber: { type: String, required: true, unique: true, index: true },
  tripId: { type: Types.ObjectId, ref: "Trip", required: true, unique: true, index: true },
  invoiceAmount: { type: Number, required: true, min: 0 },
  paymentStatus: { type: String, enum: ["Draft", "Generated", "Sent", "Partially Paid", "Paid", "Cancelled"], default: "Generated", index: true },
  pdfUrl: { type: String, default: "" },
  pdfKey: { type: String, default: "" },
  notes: { type: String, default: "" },
  remarks: { type: String, default: "" },
  additionalCharges: { type: Number, default: 0, min: 0 },
  sentStatus: { type: String, default: "Not Sent" },
  activityLog: { type: [activitySchema], default: [] },
  createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true, versionKey: false });

export type Invoice = InferSchemaType<typeof invoiceSchema>;
export type InvoiceDocument = HydratedDocument<Invoice>;
export const InvoiceModel = model("Invoice", invoiceSchema);
