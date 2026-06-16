import { DriverModel } from "../models/Driver.js";
import { InvoiceModel } from "../models/Invoice.js";
import { TripModel } from "../models/Trip.js";
import { VehicleModel } from "../models/Vehicle.js";
import { PaymentModel } from "../models/Payment.js";
import { CompanyModel } from "../models/Company.js";
import { ManualExpenseModel } from "../models/ManualExpense.js";

export async function getSaasDashboard() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);
  const [
    totalTrips,
    activeTripsCount,
    deliveredTrips,
    pendingInvoices,
    paidInvoices,
    activeTrips,
    pendingInvoiceRows,
    vehiclesExpiringSoon,
    vehiclesExpired,
    driverLicensesExpiringSoon,
    driverLicensesExpired,
    collectedRows,
    freightRows,
    expenseRows,
    totalVehicles,
    totalDrivers,
    totalCompanies,
    totalPayments,
    manualExpenseRows
  ] = await Promise.all([
    TripModel.countDocuments(),
    TripModel.countDocuments({ status: { $in: ["Assigned", "Loading", "In Transit"] } }),
    TripModel.countDocuments({ status: { $in: ["Delivered", "Completed"] } }),
    InvoiceModel.countDocuments({ paymentStatus: { $in: ["Draft", "Generated", "Sent", "Partially Paid"] } }),
    InvoiceModel.countDocuments({ paymentStatus: "Paid" }),
    TripModel.find({ status: { $in: ["Assigned", "Loading", "In Transit"] } }).populate("companyId vehicleId driverId").sort({ loadingDate: -1 }).limit(10).lean(),
    InvoiceModel.find({ paymentStatus: { $in: ["Draft", "Generated", "Sent", "Partially Paid"] } }).sort({ createdAt: -1 }).limit(10).lean(),
    VehicleModel.find({ $or: [{ insuranceExpiry: { $gte: now, $lte: soon } }, { fitnessExpiry: { $gte: now, $lte: soon } }, { permitExpiry: { $gte: now, $lte: soon } }] }).lean(),
    VehicleModel.find({ $or: [{ insuranceExpiry: { $lt: now } }, { fitnessExpiry: { $lt: now } }, { permitExpiry: { $lt: now } }] }).lean(),
    DriverModel.find({ licenseExpiry: { $gte: now, $lte: soon } }).lean(),
    DriverModel.find({ licenseExpiry: { $lt: now } }).lean(),
    PaymentModel.find({ paymentDate: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } }).lean(),
    TripModel.aggregate([{ $group: { _id: null, total: { $sum: "$freightAmount" } } }]),
    TripModel.aggregate([{ $unwind: { path: "$expenses", preserveNullAndEmptyArrays: true } }, { $group: { _id: null, total: { $sum: "$expenses.amount" } } }]),
    VehicleModel.countDocuments(),
    DriverModel.countDocuments(),
    CompanyModel.countDocuments(),
    PaymentModel.countDocuments(),
    ManualExpenseModel.find().lean()
  ]);

  const amountCollectedThisMonth = collectedRows.reduce((sum, payment) => sum + Number(payment.amountReceived ?? (payment as any).amount ?? 0), 0);
  const revenue = freightRows[0]?.total || 0;
  const manualExpenses = manualExpenseRows.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const expenses = (expenseRows[0]?.total || 0) + manualExpenses;
  const pendingPayments = pendingInvoiceRows.reduce((sum, invoice) => sum + Number(invoice.invoiceAmount || 0), 0);
  const outstanding = pendingPayments;
  const monthlyRevenue = groupMonthly(deliveredTrips ? await TripModel.find().select("loadingDate freightAmount").lean() : [], "loadingDate", "freightAmount");
  const monthlyExpense = groupMonthly([
    ...manualExpenseRows.map((expense: any) => ({ date: expense.expenseDate, amount: expense.amount })),
    ...await tripExpenseTimeline()
  ], "date", "amount");

  return {
    kpis: {
      totalTrips,
      activeTrips: activeTripsCount,
      deliveredTrips,
      pendingInvoices,
      paidInvoices,
      vehiclesExpiringSoon: vehiclesExpiringSoon.length,
      driverLicensesExpiringSoon: driverLicensesExpiringSoon.length,
      vehiclesExpired: vehiclesExpired.length,
      driverLicensesExpired: driverLicensesExpired.length,
      amountCollectedThisMonth,
      trucksOnRoad: activeTripsCount,
      pendingPayments,
      todayRevenue: revenue,
      revenue,
      outstanding,
      expenses,
      totalVehicles,
      totalDrivers,
      totalCompanies,
      totalPayments
    },
    activeTrips: activeTrips.map((trip: any) => ({
      ...trip,
      id: String(trip._id),
      tripNumber: trip.tripId,
      tripDate: trip.loadingDate,
      loadingPoint: trip.source,
      unloadingPoint: trip.destination
    })),
    pendingPayments: pendingInvoiceRows.map((invoice: any) => ({
      ...invoice,
      id: String(invoice._id),
      amount: invoice.invoiceAmount,
      outstandingAmount: invoice.invoiceAmount,
      status: invoice.paymentStatus
    })),
    revenueAnalytics: monthlyRevenue.map((row) => {
      const expense = monthlyExpense.find((item) => item.label === row.label)?.expenses || 0;
      return { label: row.label, revenue: row.revenue, expenses: expense, profit: row.revenue - expense };
    }),
    finance: { revenue, expenses, profit: revenue - expenses },
    alerts: {
      vehicles: vehiclesExpiringSoon,
      drivers: driverLicensesExpiringSoon,
      expiredVehicles: vehiclesExpired,
      expiredDrivers: driverLicensesExpired
    }
  };
}

async function tripExpenseTimeline() {
  const rows = await TripModel.find().select("loadingDate expenses").lean();
  return rows.flatMap((trip: any) => (trip.expenses || []).map((expense: any) => ({ date: trip.loadingDate, amount: expense.amount })));
}

function groupMonthly(rows: any[], dateKey: string, amountKey: string) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const date = new Date(row[dateKey]);
    if (Number.isNaN(date.getTime())) return;
    const label = date.toLocaleString("en-IN", { month: "short", year: "2-digit" });
    map.set(label, (map.get(label) || 0) + Number(row[amountKey] || 0));
  });
  return Array.from(map.entries()).slice(-6).map(([label, amount]) => ({ label, revenue: amount, expenses: amount }));
}
