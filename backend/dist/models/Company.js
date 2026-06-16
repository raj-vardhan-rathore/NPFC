import { Schema, model } from "mongoose";
const documentSchema = new Schema({
    type: { type: String, required: true },
    url: { type: String, required: true },
    key: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
}, { _id: false });
const locationSchema = new Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    address: { type: String, required: true },
    createdDate: { type: String, required: true }
}, { _id: false });
const companySchema = new Schema({
    companyName: { type: String, required: true, trim: true, index: true },
    gstNumber: { type: String, required: true, trim: true, index: true },
    address: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    locations: { type: [locationSchema], default: [] },
    documentUrls: { type: [documentSchema], default: [] }
}, { timestamps: true, versionKey: false });
companySchema.index({ companyName: "text", gstNumber: "text", phone: "text" });
export const CompanyModel = model("Company", companySchema);
