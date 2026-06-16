import type { Model } from "mongoose";
import { isDatabaseConnected } from "../config/database.js";
import { CompanyModel } from "../models/Company.js";
import { DriverModel } from "../models/Driver.js";
import { TripModel } from "../models/Trip.js";
import { VehicleModel } from "../models/Vehicle.js";
import { vehicleMaintenanceSummary, serviceStatus, toDateString } from "../services/maintenance.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

export const listCompanies = asyncHandler(async (_req, res) => {
  assertDatabase();
  res.json(await CompanyModel.find().sort({ companyName: 1 }));
});

export const listCustomersCompat = asyncHandler(async (_req, res) => {
  assertDatabase();
  const companies = await CompanyModel.find().sort({ companyName: 1 }).lean();
  res.json(companies.map((company) => ({
    id: String(company._id),
    name: company.companyName,
    gstNumber: company.gstNumber,
    contactPerson: company.contactPerson,
    address: company.address,
    email: company.email,
    phone: company.phone,
    locations: company.locations || []
  })));
});

export const listDrivers = asyncHandler(async (_req, res) => {
  assertDatabase();
  const rows = await DriverModel.find().sort({ name: 1 }).lean();
  res.json(rows.map((driver) => ({
    ...driver,
    id: String(driver._id),
    mobile: driver.phone,
    address: "",
    status: "Available"
  })));
});

export const listVehicles = asyncHandler(async (_req, res) => {
  assertDatabase();
  const rows = await VehicleModel.find().sort({ vehicleNumber: 1 }).lean();
  const maintenance = await vehicleMaintenanceSummary(rows.map((vehicle) => String(vehicle._id)));
  res.json(rows.map((vehicle) => {
    const summary = maintenance.get(String(vehicle._id)) || {};
    return {
      ...vehicle,
      id: String(vehicle._id),
      number: vehicle.vehicleNumber,
      type: "Truck",
      status: (summary.activeRepairs || 0) > 0 ? "Maintenance" : "Available",
      pucExpiry: vehicle.fitnessExpiry,
      serviceDue: summary.nextServiceDate ? toDateString(summary.nextServiceDate) : toDateString(vehicle.fitnessExpiry),
      totalMaintenanceCost: summary.totalMaintenanceCost || 0,
      lastServiceDate: summary.lastServiceDate ? toDateString(summary.lastServiceDate) : "",
      nextServiceDate: summary.nextServiceDate ? toDateString(summary.nextServiceDate) : "",
      nextServiceKM: summary.nextServiceKM || 0,
      dueServiceStatus: serviceStatus(summary.nextServiceDate, summary.nextServiceKM, summary.odometerReading),
      healthScore: summary.healthScore ?? 100,
      healthLabel: summary.healthLabel || "Excellent",
      activeRepairs: summary.activeRepairs || 0,
      completedServices: summary.completedServices || 0
    };
  }));
});

export const createCompany = createDocument(CompanyModel);
export const createDriver = createDocument(DriverModel);
export const createVehicle = createDocument(VehicleModel);
export const updateCompany = updateDocument(CompanyModel);
export const updateDriver = updateDocument(DriverModel);
export const updateVehicle = updateDocument(VehicleModel);
export const deleteCompany = asyncHandler(async (req, res) => {
  assertDatabase();
  const linkedTrips = await TripModel.countDocuments({ companyId: req.params.id });
  if (linkedTrips > 0) throw new HttpError(409, "Cannot delete company because trips exist.");

  const row = await CompanyModel.findByIdAndDelete(req.params.id);
  if (!row) throw new HttpError(404, "Record not found.");
  res.status(204).end();
});

export const deleteDriver = asyncHandler(async (req, res) => {
  assertDatabase();
  const activeTrip = await TripModel.findOne({ driverId: req.params.id, status: { $in: activeTripStatuses } }).lean();
  if (activeTrip) throw new HttpError(409, "Cannot delete driver because an active trip is assigned.");

  const row = await DriverModel.findByIdAndDelete(req.params.id);
  if (!row) throw new HttpError(404, "Record not found.");
  res.status(204).end();
});

export const deleteVehicle = asyncHandler(async (req, res) => {
  assertDatabase();
  const activeTrip = await TripModel.findOne({ vehicleId: req.params.id, status: { $in: activeTripStatuses } }).lean();
  if (activeTrip) throw new HttpError(409, "Cannot delete vehicle because an active trip is assigned.");

  const row = await VehicleModel.findByIdAndDelete(req.params.id);
  if (!row) throw new HttpError(404, "Record not found.");
  res.status(204).end();
});

const activeTripStatuses = ["Draft", "Assigned", "Loading", "In Transit", "Delivered"] as const;

function createDocument(model: Model<any>) {
  return asyncHandler(async (req, res) => {
    assertDatabase();
    res.status(201).json(await model.create(req.body));
  });
}

function updateDocument(model: Model<any>) {
  return asyncHandler(async (req, res) => {
    assertDatabase();
    const row = await model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!row) throw new HttpError(404, "Record not found.");
    res.json(row);
  });
}

function assertDatabase() {
  if (!isDatabaseConnected()) throw new HttpError(503, "MongoDB connection is required.");
}
