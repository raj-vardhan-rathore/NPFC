import { Schema, model, Types } from "mongoose";
export const attendanceStatuses = ["Present", "Absent"];
const driverAttendanceSchema = new Schema({
    driverId: { type: Types.ObjectId, ref: "Driver", required: true, index: true },
    date: { type: Date, required: true, index: true },
    status: { type: String, enum: attendanceStatuses, required: true, index: true },
    remarks: { type: String, default: "", trim: true },
    createdBy: { type: String, default: "System" },
    updatedBy: { type: String, default: "System" }
}, { timestamps: true, versionKey: false });
driverAttendanceSchema.index({ driverId: 1, date: 1 }, { unique: true });
export const DriverAttendanceModel = model("DriverAttendance", driverAttendanceSchema);
