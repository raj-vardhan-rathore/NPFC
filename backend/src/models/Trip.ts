import { Schema, model, Types, type InferSchemaType } from "mongoose";

const expenseSchema = new Schema({
  type: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  receiptUrl: String,
  receiptKey: String,
  remarks: String,
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const tripSchema = new Schema({
  tripId: { type: String, required: true, unique: true, index: true },
  companyId: { type: Types.ObjectId, ref: "Company", required: true, index: true },
  vehicleId: { type: Types.ObjectId, ref: "Vehicle", required: true, index: true },
  driverId: { type: Types.ObjectId, ref: "Driver", required: true, index: true },
  source: { type: String, required: true, trim: true },
  destination: { type: String, required: true, trim: true },
  material: { type: String, trim: true },
  weightMt: { type: Number, min: 0 },
  ratePerMt: { type: Number, min: 0 },
  freightAmount: { type: Number, required: true, min: 0 },
  loadingDate: { type: Date, required: true, index: true },
  deliveryDate: { type: Date },
  status: { type: String, enum: ["Draft", "Trip Created", "Assigned", "Vehicle Assigned", "Loading", "Loading Started", "Loaded", "In Transit", "Reached Destination", "Unloading Started", "Delivered", "Invoice Generated", "Payment Received", "Completed", "Cancelled"], default: "Draft", index: true },
  expenses: { type: [expenseSchema], default: [] },
  invoiceId: { type: Types.ObjectId, ref: "Invoice", index: true }
}, { timestamps: true, versionKey: false });

tripSchema.index({ tripId: "text", source: "text", destination: "text" });

export type TripDocument = InferSchemaType<typeof tripSchema>;
export const TripModel = model("Trip", tripSchema);
