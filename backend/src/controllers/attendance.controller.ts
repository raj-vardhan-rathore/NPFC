import { DriverAttendanceModel } from "../models/DriverAttendance.js";
import { DriverModel } from "../models/Driver.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { isDatabaseConnected } from "../config/database.js";

export const listAttendance = asyncHandler(async (req, res) => {
  assertDatabase();
  const query: any = {};
  if (req.query.driverId) query.driverId = req.query.driverId;
  if (req.query.from || req.query.to) query.date = {};
  if (req.query.from) query.date.$gte = startOfDay(String(req.query.from));
  if (req.query.to) query.date.$lte = endOfDay(String(req.query.to));
  const rows = await DriverAttendanceModel.find(query).populate("driverId").sort({ date: -1 }).lean();
  res.json(rows.map(toAttendanceDto));
});

export const upsertAttendance = asyncHandler(async (req, res) => {
  assertDatabase();
  const driver = await DriverModel.findById(req.body.driverId).lean();
  if (!driver) throw new HttpError(404, "Driver not found.");
  const date = startOfDay(String(req.body.date));
  const row = await DriverAttendanceModel.findOneAndUpdate(
    { driverId: req.body.driverId, date },
    {
      driverId: req.body.driverId,
      date,
      status: req.body.status,
      remarks: req.body.remarks || "",
      updatedBy: req.user?.name || "System",
      $setOnInsert: { createdBy: req.user?.name || "System" }
    },
    { new: true, upsert: true, runValidators: true }
  ).populate("driverId").lean();
  res.status(201).json(toAttendanceDto(row));
});

export const updateAttendance = asyncHandler(async (req, res) => {
  assertDatabase();
  const row = await DriverAttendanceModel.findByIdAndUpdate(
    req.params.id,
    { ...req.body, updatedBy: req.user?.name || "System" },
    { new: true, runValidators: true }
  ).populate("driverId").lean();
  if (!row) throw new HttpError(404, "Attendance entry not found.");
  res.json(toAttendanceDto(row));
});

export const deleteAttendance = asyncHandler(async (req, res) => {
  assertDatabase();
  const row = await DriverAttendanceModel.findByIdAndDelete(req.params.id);
  if (!row) throw new HttpError(404, "Attendance entry not found.");
  res.status(204).end();
});

function toAttendanceDto(row: any) {
  const driver = row.driverId || {};
  return {
    ...row,
    id: String(row._id),
    driverId: driver._id ? String(driver._id) : String(row.driverId || ""),
    driverName: driver.name || "",
    date: toDateString(row.date)
  };
}

function startOfDay(value: string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: string) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function toDateString(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function assertDatabase() {
  if (!isDatabaseConnected()) throw new HttpError(503, "MongoDB connection is required.");
}
