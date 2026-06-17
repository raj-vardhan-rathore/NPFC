import { Schema, model } from "mongoose";
const documentSchema = new Schema({
    type: { type: String, enum: ["RC", "Insurance", "Permit", "Fitness", "PUC", "Road Tax", "Other"], required: true },
    url: { type: String, required: true },
    key: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
}, { _id: false });
const vehicleSchema = new Schema({
    vehicleNumber: { type: String, required: true, trim: true, unique: true, index: true },
    rcNumber: { type: String, required: true, trim: true },
    type: { type: String, default: "Truck", trim: true },
    insuranceExpiry: { type: Date, required: true, index: true },
    fitnessExpiry: { type: Date, required: true, index: true },
    permitExpiry: { type: Date, required: true, index: true },
    pucExpiry: { type: Date, index: true },
    ownerName: { type: String, required: true, trim: true },
    documentUrls: { type: [documentSchema], default: [] }
}, { timestamps: true, versionKey: false });
export const VehicleModel = model("Vehicle", vehicleSchema);
