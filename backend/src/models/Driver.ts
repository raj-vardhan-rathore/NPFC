import { Schema, model, type InferSchemaType } from "mongoose";

const documentSchema = new Schema({
  type: { type: String, enum: ["License", "Aadhaar", "PAN", "Driver Photo", "Other"], required: true },
  url: { type: String, required: true },
  key: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const driverSchema = new Schema({
  name: { type: String, required: true, trim: true, index: true },
  phone: { type: String, required: true, trim: true, index: true },
  licenseNumber: { type: String, required: true, trim: true, index: true },
  licenseExpiry: { type: Date, required: true, index: true },
  aadhaarNumber: { type: String, trim: true },
  documentUrls: { type: [documentSchema], default: [] }
}, { timestamps: true, versionKey: false });

export type DriverDocument = InferSchemaType<typeof driverSchema>;
export const DriverModel = model("Driver", driverSchema);
