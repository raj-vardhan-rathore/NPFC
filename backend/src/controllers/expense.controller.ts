import type { Response } from "express";
import { Types } from "mongoose";
import puppeteer from "puppeteer";
import { isDatabaseConnected } from "../config/database.js";
import { DriverModel } from "../models/Driver.js";
import { ManualExpenseModel } from "../models/ManualExpense.js";
import { TripModel } from "../models/Trip.js";
import { VehicleModel } from "../models/Vehicle.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";

type ExpenseStatus = "Paid" | "Unpaid" | "Partial";
type ExpenseSource = "Trips" | "Vehicles" | "Drivers" | "Manual";

type ExpenseRow = {
  id: string;
  category: string;
  expenseName: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  status: ExpenseStatus;
  source: ExpenseSource;
  date: string;
  vehicleId?: string;
  vehicleNumber?: string;
  driverId?: string;
  driverName?: string;
  companyId?: string;
  tripId?: string;
  tripNumber?: string;
  notes?: string;
  attachmentUrl?: string;
  attachmentKey?: string;
  recurring?: boolean;
  recurrenceFrequency?: string;
};

export const getExpenseDashboard = asyncHandler(async (req, res) => {
  assertDatabase();
  res.json(await buildExpenseDashboard(req.query));
});

export const listExpenses = asyncHandler(async (req, res) => {
  assertDatabase();
  const dashboard = await buildExpenseDashboard(req.query);
  res.json(dashboard.rows);
});

export const createExpense = asyncHandler(async (req, res) => {
  assertDatabase();
  const expense = await ManualExpenseModel.create(req.body);
  res.status(201).json(toManualExpenseRow(expense));
});

export const updateExpense = asyncHandler(async (req, res) => {
  assertDatabase();
  const expense = await ManualExpenseModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!expense) throw new HttpError(404, "Manual expense not found.");
  res.json(toManualExpenseRow(expense));
});

export const deleteExpense = asyncHandler(async (req, res) => {
  assertDatabase();
  const expense = await ManualExpenseModel.findByIdAndDelete(req.params.id);
  if (!expense) throw new HttpError(404, "Manual expense not found.");
  res.status(204).end();
});

export const exportExpenses = asyncHandler(async (req, res) => {
  assertDatabase();
  const dashboard = await buildExpenseDashboard(req.query);
  const format = String(req.query.format || "excel").toLowerCase();
  if (format === "pdf") return sendPdf(res, dashboard);
  return sendExcelCsv(res, dashboard.rows);
});

async function buildExpenseDashboard(query: any) {
  const filters = parseFilters(query);
  const [trips, vehicles, drivers, manualExpenses] = await Promise.all([
    TripModel.find(tripQuery(filters)).populate("vehicleId driverId companyId").select("tripId companyId vehicleId driverId freightAmount loadingDate status expenses").lean(),
    VehicleModel.find().select("vehicleNumber").lean(),
    DriverModel.find().select("name").lean(),
    ManualExpenseModel.find(manualQuery(filters)).populate("vehicleId").sort({ expenseDate: -1 }).lean()
  ]);

  const rows = [
    ...trips.flatMap((trip: any) => tripExpenseRows(trip)),
    ...manualExpenses.flatMap((expense: any) => expandManualExpense(expense, filters.to))
  ].filter((row) => applyRowFilters(row, filters));

  const completedTrips = trips.filter((trip: any) => ["Delivered", "Completed"].includes(trip.status));
  const revenue = completedTrips.reduce((sum: number, trip: any) => sum + (trip.freightAmount || 0), 0);
  const totalExpenses = rows.reduce((sum, row) => sum + row.amount, 0);
  const fuelExpense = rows.filter((row) => row.category === "Fuel").reduce((sum, row) => sum + row.amount, 0);
  const driverExpense = rows.filter((row) => row.category === "Driver").reduce((sum, row) => sum + row.amount, 0);
  const vehicleExpense = rows.filter((row) => ["Vehicle", "Maintenance"].includes(row.category)).reduce((sum, row) => sum + row.amount, 0);
  const otherExpense = rows.filter((row) => row.source === "Manual").reduce((sum, row) => sum + row.amount, 0);

  return {
    kpis: {
      totalExpenses,
      fuelExpense,
      driverExpense,
      vehicleExpense,
      otherExpense,
      totalRevenue: revenue,
      netProfit: revenue - totalExpenses
    },
    summary: summarizeRows(rows),
    rows: rows.sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    analytics: {
      category: groupAmount(rows, (row) => row.category),
      monthlyExpenseTrend: groupAmount(rows, (row) => monthLabel(row.date)),
      revenueVsExpense: revenueVsExpense(completedTrips, rows)
    },
    vehiclePerformance: vehiclePerformance(vehicles, completedTrips, rows),
    drilldowns: {
      fuel: fuelDrilldown(rows),
      maintenance: maintenanceDrilldown(rows),
      driver: driverDrilldown(rows, drivers)
    },
    filters: {
      categories: Array.from(new Set(rows.map((row) => row.category))).sort(),
      statuses: ["Paid", "Unpaid", "Partial"],
      sources: ["Trips", "Vehicles", "Drivers", "Manual"]
    }
  };
}

function tripExpenseRows(trip: any): ExpenseRow[] {
  return (trip.expenses || []).map((expense: any) => {
    const category = normalizeTripExpenseCategory(expense.type);
    const vehicle = trip.vehicleId;
    const driver = trip.driverId;
    const paidAmount = expense.status === "Partial" ? Number(expense.paidAmount || 0) : Number(expense.amount || 0);
    const status = normalizeStatus(expense.status || "Paid", paidAmount, expense.amount || 0);
    return {
      id: String(expense._id),
      category,
      expenseName: expense.type,
      amount: Number(expense.amount || 0),
      paidAmount: status === "Paid" ? Number(expense.amount || 0) : status === "Partial" ? paidAmount : 0,
      remainingAmount: status === "Paid" ? 0 : Math.max(Number(expense.amount || 0) - paidAmount, 0),
      status,
      source: "Trips",
      date: toDateString(expense.createdAt || trip.loadingDate),
      vehicleId: vehicle?._id ? String(vehicle._id) : String(trip.vehicleId || ""),
      vehicleNumber: vehicle?.vehicleNumber,
      driverId: driver?._id ? String(driver._id) : String(trip.driverId || ""),
      driverName: driver?.name,
      companyId: trip.companyId?._id ? String(trip.companyId._id) : String(trip.companyId || ""),
      tripId: String(trip._id),
      tripNumber: trip.tripId,
      notes: expense.remarks || "",
      attachmentUrl: expense.receiptUrl || "",
      attachmentKey: expense.receiptKey || ""
    };
  });
}

function toManualExpenseRow(expense: any, date = expense.expenseDate, virtualId = String(expense._id)): ExpenseRow {
  const paidAmount = Number(expense.paidAmount || 0);
  const amount = Number(expense.amount || 0);
  const status = normalizeStatus(expense.status, paidAmount, amount);
  return {
    id: virtualId,
    category: expense.category,
    expenseName: expense.expenseName,
    amount,
    paidAmount: status === "Paid" ? amount : status === "Partial" ? paidAmount : 0,
    remainingAmount: status === "Paid" ? 0 : Math.max(amount - paidAmount, 0),
    status,
    source: "Manual",
    date: toDateString(date),
    vehicleId: expense.vehicleId?._id ? String(expense.vehicleId._id) : expense.vehicleId ? String(expense.vehicleId) : "",
    vehicleNumber: expense.vehicleId?.vehicleNumber || "",
    notes: expense.notes || "",
    attachmentUrl: expense.attachmentUrl || "",
    attachmentKey: expense.attachmentKey || "",
    recurring: Boolean(expense.recurring),
    recurrenceFrequency: expense.recurrenceFrequency || ""
  };
}

function expandManualExpense(expense: any, rangeTo: Date) {
  const rows = [toManualExpenseRow(expense)];
  if (!expense.recurring || !expense.recurrenceFrequency) return rows;

  let occurrence = addFrequency(new Date(expense.expenseDate), expense.recurrenceFrequency);
  const recurringUntil = expense.recurringUntil ? new Date(expense.recurringUntil) : rangeTo;
  const limit = new Date(Math.min(+recurringUntil, +rangeTo));
  for (let index = 1; occurrence <= limit && index <= 36; index += 1) {
    rows.push(toManualExpenseRow(expense, occurrence, `${expense._id}:recurring:${index}`));
    occurrence = addFrequency(occurrence, expense.recurrenceFrequency);
  }
  return rows;
}

function parseFilters(query: any) {
  const now = new Date();
  const from = query.from ? new Date(String(query.from)) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = query.to ? new Date(String(query.to)) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return {
    from,
    to,
    vehicleId: stringFilter(query.vehicleId),
    driverId: stringFilter(query.driverId),
    companyId: stringFilter(query.companyId),
    category: stringFilter(query.category),
    status: stringFilter(query.status)
  };
}

function tripQuery(filters: ReturnType<typeof parseFilters>) {
  const query: any = { loadingDate: { $gte: filters.from, $lte: filters.to } };
  if (filters.vehicleId) query.vehicleId = new Types.ObjectId(filters.vehicleId);
  if (filters.driverId) query.driverId = new Types.ObjectId(filters.driverId);
  if (filters.companyId) query.companyId = new Types.ObjectId(filters.companyId);
  return query;
}

function manualQuery(filters: ReturnType<typeof parseFilters>) {
  const query: any = { expenseDate: { $lte: filters.to } };
  if (!filters.status) return query;
  query.status = filters.status;
  return query;
}

function applyRowFilters(row: ExpenseRow, filters: ReturnType<typeof parseFilters>) {
  const date = new Date(row.date);
  return date >= filters.from
    && date <= filters.to
    && (!filters.vehicleId || row.vehicleId === filters.vehicleId)
    && (!filters.driverId || row.driverId === filters.driverId)
    && (!filters.companyId || row.companyId === filters.companyId)
    && (!filters.category || row.category === filters.category)
    && (!filters.status || row.status === filters.status);
}

function summarizeRows(rows: ExpenseRow[]) {
  return Object.values(rows.reduce<Record<string, { category: string; amount: number; paidAmount: number; remainingAmount: number; status: ExpenseStatus; source: string }>>((acc, row) => {
    const key = `${row.category}:${row.source}`;
    acc[key] ||= { category: row.category, amount: 0, paidAmount: 0, remainingAmount: 0, status: "Paid", source: row.source };
    acc[key].amount += row.amount;
    acc[key].paidAmount += row.paidAmount;
    acc[key].remainingAmount += row.remainingAmount;
    acc[key].status = acc[key].remainingAmount <= 0 ? "Paid" : acc[key].paidAmount > 0 ? "Partial" : "Unpaid";
    return acc;
  }, {}));
}

function vehiclePerformance(vehicles: any[], trips: any[], rows: ExpenseRow[]) {
  return vehicles.map((vehicle: any) => {
    const id = String(vehicle._id);
    const revenue = trips.filter((trip: any) => String(trip.vehicleId?._id || trip.vehicleId) === id).reduce((sum: number, trip: any) => sum + (trip.freightAmount || 0), 0);
    const expense = rows.filter((row) => row.vehicleId === id).reduce((sum, row) => sum + row.amount, 0);
    return { vehicleId: id, vehicleNumber: vehicle.vehicleNumber, revenue, expense, profit: revenue - expense };
  }).sort((a, b) => b.profit - a.profit);
}

function fuelDrilldown(rows: ExpenseRow[]) {
  const fuelRows = rows.filter((row) => row.category === "Fuel");
  return {
    totalFuelCost: sumRows(fuelRows),
    vehicleWise: groupAmount(fuelRows, (row) => row.vehicleNumber || "Unassigned"),
    tripWise: groupAmount(fuelRows, (row) => row.tripNumber || "Manual"),
    monthlyTrend: groupAmount(fuelRows, (row) => monthLabel(row.date))
  };
}

function maintenanceDrilldown(rows: ExpenseRow[]) {
  return rows.filter((row) => row.expenseName.toLowerCase().includes("maintenance")).map((row) => ({
    vehicle: row.vehicleNumber || "Unassigned",
    date: row.date,
    amount: row.amount,
    description: row.notes || row.expenseName,
    linkedBill: row.attachmentUrl || row.attachmentKey || ""
  }));
}

function driverDrilldown(rows: ExpenseRow[], drivers: any[]) {
  return drivers.map((driver: any) => {
    const driverRows = rows.filter((row) => row.driverId === String(driver._id) || row.driverName === driver.name);
    const salary = driverRows.filter((row) => /salary/i.test(row.expenseName)).reduce((sum, row) => sum + row.amount, 0);
    const advance = driverRows.filter((row) => /advance/i.test(row.expenseName)).reduce((sum, row) => sum + row.amount, 0);
    return { driverId: String(driver._id), driverName: driver.name, salary, advance, total: salary + advance };
  }).filter((row) => row.total > 0);
}

function revenueVsExpense(trips: any[], rows: ExpenseRow[]) {
  const months = new Map<string, { month: string; revenue: number; expenses: number; profit: number }>();
  for (const trip of trips) {
    const month = monthLabel(trip.loadingDate);
    const row = months.get(month) || { month, revenue: 0, expenses: 0, profit: 0 };
    row.revenue += trip.freightAmount || 0;
    months.set(month, row);
  }
  for (const expense of rows) {
    const month = monthLabel(expense.date);
    const row = months.get(month) || { month, revenue: 0, expenses: 0, profit: 0 };
    row.expenses += expense.amount;
    months.set(month, row);
  }
  return Array.from(months.values()).map((row) => ({ ...row, profit: row.revenue - row.expenses })).sort((a, b) => a.month.localeCompare(b.month));
}

function groupAmount(rows: ExpenseRow[], keyFn: (row: ExpenseRow) => string) {
  return Object.values(rows.reduce<Record<string, { name: string; amount: number }>>((acc, row) => {
    const name = keyFn(row);
    acc[name] ||= { name, amount: 0 };
    acc[name].amount += row.amount;
    return acc;
  }, {})).sort((a, b) => b.amount - a.amount);
}

function normalizeTripExpenseCategory(type: string) {
  if (/diesel|fuel/i.test(type)) return "Fuel";
  if (/driver|advance|salary/i.test(type)) return "Driver";
  if (/maintenance|repair|tyre|tire/i.test(type)) return "Maintenance";
  if (/insurance|permit|rto/i.test(type)) return "Vehicle";
  return /toll|loading|unloading/i.test(type) ? "Trip Operations" : "Other";
}

function normalizeStatus(status: string, paidAmount: number, amount: number): ExpenseStatus {
  if (status === "Paid" || paidAmount >= amount) return "Paid";
  if (status === "Partial" || paidAmount > 0) return "Partial";
  return "Unpaid";
}

function addFrequency(date: Date, frequency: string) {
  const next = new Date(date);
  if (frequency === "Quarterly") next.setMonth(next.getMonth() + 3);
  else if (frequency === "Yearly") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

function sendExcelCsv(res: Response, rows: ExpenseRow[]) {
  const headers = ["Category", "Expense Name", "Amount", "Paid Amount", "Remaining Amount", "Status", "Source", "Date", "Vehicle", "Driver", "Trip", "Notes"];
  const csv = [headers, ...rows.map((row) => [row.category, row.expenseName, row.amount, row.paidAmount, row.remainingAmount, row.status, row.source, row.date, row.vehicleNumber || "", row.driverName || "", row.tripNumber || "", row.notes || ""])]
    .map((line) => line.map(csvCell).join(","))
    .join("\n");
  res.setHeader("Content-Type", "application/vnd.ms-excel");
  res.setHeader("Content-Disposition", "attachment; filename=expenses-report.xls");
  res.send(csv);
}

async function sendPdf(res: Response, dashboard: any) {
  const rows = (dashboard.summary.length ? dashboard.summary : [{ category: "No expenses", amount: 0, status: "Paid", source: "Filtered period" }])
    .map((row: any) => `<tr><td>${escapeHtml(row.category)}</td><td>${currency(row.amount)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.source)}</td></tr>`)
    .join("");
  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; color: #111827; padding: 28px; }
        h1 { margin: 0 0 8px; font-size: 24px; }
        .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
        .kpi { border: 1px solid #D1D5DB; border-radius: 8px; padding: 12px; }
        .label { color: #6B7280; font-size: 12px; text-transform: uppercase; }
        .value { margin-top: 6px; font-size: 18px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
        th, td { border-bottom: 1px solid #E5E7EB; padding: 9px; text-align: left; }
        th { color: #374151; background: #F9FAFB; }
      </style>
    </head>
    <body>
      <h1>NPFC Expenses Report</h1>
      <div>Generated from live ERP expense aggregations.</div>
      <div class="kpis">
        <div class="kpi"><div class="label">Total Expenses</div><div class="value">${currency(dashboard.kpis.totalExpenses)}</div></div>
        <div class="kpi"><div class="label">Total Revenue</div><div class="value">${currency(dashboard.kpis.totalRevenue)}</div></div>
        <div class="kpi"><div class="label">Net Profit</div><div class="value">${currency(dashboard.kpis.netProfit)}</div></div>
      </div>
      <table>
        <thead><tr><th>Category</th><th>Amount</th><th>Status</th><th>Source</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body>
  </html>`;
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=expenses-report.pdf");
    res.send(Buffer.from(pdf));
  } finally {
    await browser.close();
  }
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}

function sumRows(rows: ExpenseRow[]) {
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

function currency(amount: number) {
  return `INR ${Math.round(amount || 0).toLocaleString("en-IN")}`;
}

function monthLabel(value: string | Date) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toDateString(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function stringFilter(value: unknown) {
  const text = String(value || "");
  return text && text !== "All" ? text : "";
}

function assertDatabase() {
  if (!isDatabaseConnected()) throw new HttpError(503, "MongoDB connection is required.");
}
