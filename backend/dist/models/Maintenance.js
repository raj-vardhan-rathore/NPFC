import { Schema, model, Types } from "mongoose";
export const maintenanceStatuses = ["Scheduled", "In Progress", "Completed", "Cancelled"];
export const maintenanceTypes = [
    "Engine Oil Change",
    "Tyre Replacement",
    "Battery Replacement",
    "Brake Service",
    "Clutch Repair",
    "Suspension Repair",
    "Engine Repair",
    "Gearbox Repair",
    "Electrical Work",
    "Body Repair",
    "Accident Repair",
    "Washing",
    "Greasing",
    "General Service"
];
const documentSchema = new Schema({
    type: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    key: { type: String, required: true },
    fileName: { type: String, trim: true },
    uploadedAt: { type: Date, default: Date.now }
}, { _id: false });
const maintenanceSchema = new Schema({
    jobCardNumber: { type: String, required: true, unique: true, index: true },
    vehicleId: { type: Types.ObjectId, ref: "Vehicle", required: true, index: true },
    maintenanceType: { type: String, required: true, trim: true, index: true },
    serviceCategory: { type: String, required: true, trim: true, index: true },
    maintenanceDate: { type: Date, required: true, index: true },
    garageName: { type: String, required: true, trim: true, index: true },
    mechanicName: { type: String, trim: true },
    contactNumber: { type: String, trim: true },
    odometerReading: { type: Number, default: 0, min: 0 },
    labourCost: { type: Number, default: 0, min: 0 },
    partsCost: { type: Number, default: 0, min: 0 },
    otherCharges: { type: Number, default: 0, min: 0 },
    totalCost: { type: Number, default: 0, min: 0, index: true },
    description: { type: String, trim: true },
    remarks: { type: String, trim: true },
    status: { type: String, enum: maintenanceStatuses, default: "Scheduled", index: true },
    nextServiceDate: { type: Date, index: true },
    nextServiceKM: { type: Number, min: 0 },
    scheduleEveryMonths: { type: Number, min: 0 },
    scheduleEveryKM: { type: Number, min: 0 },
    expenseId: { type: Types.ObjectId, ref: "ManualExpense", index: true },
    documents: { type: [documentSchema], default: [] },
    createdBy: { type: Types.ObjectId, ref: "User" }
}, { timestamps: true, versionKey: false });
maintenanceSchema.index({ vehicleId: 1, maintenanceDate: -1 });
maintenanceSchema.index({ status: 1, nextServiceDate: 1 });
maintenanceSchema.index({ jobCardNumber: "text", maintenanceType: "text", garageName: "text", serviceCategory: "text" });
maintenanceSchema.pre("validate", function calculateTotal() {
    this.totalCost = Number(this.labourCost || 0) + Number(this.partsCost || 0) + Number(this.otherCharges || 0);
});
export const MaintenanceModel = model("Maintenance", maintenanceSchema);
const tyreSchema = new Schema({
    vehicleId: { type: Types.ObjectId, ref: "Vehicle", required: true, index: true },
    tyreNumber: { type: String, required: true, trim: true, index: true },
    tyreBrand: { type: String, required: true, trim: true },
    tyrePosition: { type: String, required: true, trim: true, index: true },
    installDate: { type: Date, required: true, index: true },
    cost: { type: Number, default: 0, min: 0 },
    currentKM: { type: Number, default: 0, min: 0 },
    replacementDate: Date,
    status: { type: String, enum: ["Active", "Due Soon", "Replaced", "Damaged"], default: "Active", index: true }
}, { timestamps: true, versionKey: false });
tyreSchema.index({ vehicleId: 1, tyrePosition: 1 });
export const TyreModel = model("Tyre", tyreSchema);
const accidentSchema = new Schema({
    accidentDate: { type: Date, required: true, index: true },
    vehicleId: { type: Types.ObjectId, ref: "Vehicle", required: true, index: true },
    driverId: { type: Types.ObjectId, ref: "Driver", index: true },
    location: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    damageCost: { type: Number, default: 0, min: 0 },
    insuranceClaimAmount: { type: Number, default: 0, min: 0 },
    repairCost: { type: Number, default: 0, min: 0 },
    claimStatus: { type: String, enum: ["Pending", "Approved", "Rejected", "Settled"], default: "Pending", index: true },
    documents: { type: [documentSchema], default: [] }
}, { timestamps: true, versionKey: false });
accidentSchema.index({ vehicleId: 1, accidentDate: -1 });
export const AccidentModel = model("Accident", accidentSchema);
