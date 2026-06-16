import { Schema, model, Types, type InferSchemaType } from "mongoose";

const biltyFileSchema = new Schema({
  url: { type: String, default: "" },
  key: { type: String, required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, required: true },
  fileSize: { type: Number, required: true, min: 0 },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: true });

const biltySchema = new Schema({
  biltyNumber: { type: String, required: true, trim: true, unique: true, index: true },
  tripId: { type: Types.ObjectId, ref: "Trip", required: true, unique: true, index: true },
  customerId: { type: Types.ObjectId, ref: "Company", required: true, index: true },
  vehicleId: { type: Types.ObjectId, ref: "Vehicle", required: true, index: true },
  driverId: { type: Types.ObjectId, ref: "Driver", required: true, index: true },
  uploadDate: { type: Date, default: Date.now, index: true },
  biltyDate: { type: Date },
  files: { type: [biltyFileSchema], default: [] },
  fileUrl: { type: String, default: "" },
  fileKey: { type: String, default: "" },
  fileType: { type: String, default: "" },
  fileSize: { type: Number, default: 0 },
  remarks: { type: String, trim: true },
  status: { type: String, enum: ["Uploaded", "Missing", "Pending"], default: "Uploaded", index: true },
  verificationStatus: { type: String, enum: ["Pending Verification", "Verified"], default: "Pending Verification", index: true },
  uploadedBy: { type: String, default: "System" },
  verifiedBy: { type: String },
  verifiedAt: { type: Date },
  ocrBiltyNumber: { type: String },
  ocrBiltyDate: { type: Date },
  consignor: { type: String },
  consignee: { type: String },
  vehicleNumber: { type: String }
}, { timestamps: true, versionKey: false });

biltySchema.index({ biltyNumber: "text", remarks: "text", consignor: "text", consignee: "text" });

export type BiltyDocument = InferSchemaType<typeof biltySchema>;
export const BiltyModel = model("Bilty", biltySchema);
