import { isDatabaseConnected } from "../config/database.js";
import { BiltyModel } from "../models/Bilty.js";
import { InvoiceModel } from "../models/Invoice.js";
import { PaymentModel } from "../models/Payment.js";
import { TripModel } from "../models/Trip.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { syncInvoiceForTrip } from "../services/invoice.service.js";

export const listTrips = asyncHandler(async (_req, res) => {
  assertDatabase();
  const rows = await TripModel.find().populate("companyId vehicleId driverId invoiceId").sort({ loadingDate: -1 }).lean();
  res.json(rows.map(toLegacyTrip));
});

export const createTrip = asyncHandler(async (req, res) => {
  assertDatabase();
  await assertUniqueTripId(req.body.tripId);
  res.status(201).json(await TripModel.create(req.body));
});

export const updateTrip = asyncHandler(async (req, res) => {
  assertDatabase();
  if (req.body.tripId) await assertUniqueTripId(req.body.tripId, String(req.params.id));
  const trip = await TripModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!trip) throw new HttpError(404, "Trip not found.");
  await syncInvoiceForTrip(String(trip._id), req.user?.name || "System");
  res.json(trip);
});

export const deleteTrip = asyncHandler(async (req, res) => {
  assertDatabase();
  const trip = await TripModel.findById(req.params.id);
  if (!trip) throw new HttpError(404, "Trip not found.");

  await deleteTripCascade(trip);
  await trip.deleteOne();
  res.status(204).end();
});

export const listRoutes = asyncHandler(async (_req, res) => {
  assertDatabase();

  const rows = await TripModel.find({ status: { $in: ["Delivered", "Completed", "In Transit"] } }).populate("companyId vehicleId").lean();
  res.json(rows.map((trip: any) => {
    const vehicle = toLegacyVehicle(trip.vehicleId);
    const customer = toLegacyCustomer(trip.companyId);
    return {
    id: trip._id,
    tripNumber: trip.tripId,
    vehicle,
    customer,
    from: trip.source,
    to: trip.destination,
    coordinates: [],
    revenue: trip.freightAmount,
    distanceKm: 0,
    tripsCompleted: trip.status === "Completed" ? 1 : 0,
    tripDate: trip.loadingDate
    };
  }));
});

function toLegacyTrip(trip: any) {
  const expenses = trip.expenses || [];
  const totalExpense = expenses.reduce((sum: number, expense: any) => sum + (expense.amount || 0), 0);
  const customer = toLegacyCustomer(trip.companyId);
  const vehicle = toLegacyVehicle(trip.vehicleId);
  const driver = toLegacyDriver(trip.driverId);
  return {
    ...trip,
    id: String(trip._id),
    tripNumber: trip.tripId,
    tripDate: trip.loadingDate,
    customerId: customer?.id || String(trip.companyId || ""),
    customer,
    vehicleId: vehicle?.id || String(trip.vehicleId || ""),
    vehicle,
    driverId: driver?.id || String(trip.driverId || ""),
    driver,
    loadingPoint: trip.source,
    unloadingPoint: trip.destination,
    items: trip.material ? [{ id: `${trip._id}-item-1`, item: trip.material, weight: Number(trip.weightMt || 0), rate: Number(trip.ratePerMt || 0) }] : undefined,
    distanceKm: 0,
    advance: 0,
    dieselExpense: 0,
    tollExpense: 0,
    loadingExpense: 0,
    unloadingExpense: 0,
    otherExpense: totalExpense,
    totalExpense,
    profit: trip.freightAmount - totalExpense
  };
}

function assertDatabase() {
  if (!isDatabaseConnected()) throw new HttpError(503, "MongoDB connection is required.");
}

async function assertUniqueTripId(tripId: string, exceptId?: string) {
  const existing = await TripModel.findOne({ tripId }).select("_id").lean();
  if (existing && String(existing._id) !== String(exceptId || "")) throw new HttpError(409, "Trip number already exists.");
}

async function deleteTripCascade(trip: any) {
  const invoices = await InvoiceModel.find({
    $or: [
      { tripId: trip._id },
      ...(trip.invoiceId ? [{ _id: trip.invoiceId }] : [])
    ]
  }).select("_id").lean();
  const invoiceIds = invoices.map((invoice) => String(invoice._id));

  if (invoiceIds.length) {
    await removeInvoiceLinkedPayments(invoiceIds, String(trip._id));
    await InvoiceModel.deleteMany({ _id: { $in: invoiceIds } });
  } else {
    await PaymentModel.deleteMany({ tripId: trip._id });
  }

  await BiltyModel.deleteMany({ tripId: trip._id });
}

async function removeInvoiceLinkedPayments(invoiceIds: string[], tripId: string) {
  const invoiceSet = new Set(invoiceIds);
  const payments = await PaymentModel.find({
    $or: [
      { tripId },
      { invoiceId: { $in: invoiceIds } },
      { "allocations.invoiceId": { $in: invoiceIds } }
    ]
  });

  for (const payment of payments) {
    const allocations = payment.allocations || [];
    const deletedAllocationAmount = allocations
      .filter((allocation: any) => invoiceSet.has(String(allocation.invoiceId)))
      .reduce((sum: number, allocation: any) => sum + Number(allocation.amount || 0), 0);
    const remainingAllocations = allocations.filter((allocation: any) => !invoiceSet.has(String(allocation.invoiceId)));
    const directlyLinked = invoiceSet.has(String(payment.invoiceId || "")) || String(payment.tripId || "") === tripId;

    if (directlyLinked || !remainingAllocations.length) {
      await payment.deleteOne();
      continue;
    }

    payment.allocations = remainingAllocations as any;
    payment.amount = Math.max(Number(payment.amount || 0) - deletedAllocationAmount, 0);
    payment.amountReceived = payment.amount;
    payment.invoiceId = remainingAllocations[0]?.invoiceId;
    payment.tripId = undefined as any;
    payment.auditLog.push({ dateTime: new Date(), user: "System", action: "Trip Deleted", remarks: "Removed allocation linked to deleted trip." });
    if (payment.amount <= 0) await payment.deleteOne();
    else await payment.save();
  }
}

function toLegacyCustomer(company: any) {
  if (!company) return undefined;
  return {
    ...company,
    id: String(company._id),
    name: company.companyName,
    locations: []
  };
}

function toLegacyVehicle(vehicle: any) {
  if (!vehicle) return undefined;
  return {
    ...vehicle,
    id: String(vehicle._id),
    number: vehicle.vehicleNumber,
    type: "Truck",
    status: "Available",
    pucExpiry: vehicle.fitnessExpiry,
    serviceDue: vehicle.fitnessExpiry
  };
}

function toLegacyDriver(driver: any) {
  if (!driver) return undefined;
  return {
    ...driver,
    id: String(driver._id),
    mobile: driver.phone,
    address: "",
    status: "Available"
  };
}
