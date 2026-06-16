import { Types } from "mongoose";
import { ManualExpenseModel } from "../models/ManualExpense.js";
import { MaintenanceModel } from "../models/Maintenance.js";

export type MaintenanceExpenseRow = {
  id: string;
  source: "Maintenance";
  category: "Maintenance";
  name: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  date: string;
  tripId: string;
  tripNumber: string;
  vehicleId: string;
  vehicleNumber: string;
  driverId: string;
  driverName: string;
  customerId: string;
  customer: string;
  route: string;
};

export async function syncMaintenanceExpense(record: any) {
  if (record.status !== "Completed") {
    if (record.expenseId) await ManualExpenseModel.findByIdAndDelete(record.expenseId).catch(() => undefined);
    if (record.expenseId) await MaintenanceModel.findByIdAndUpdate(record._id, { $unset: { expenseId: "" } });
    return;
  }

  const vehicle = record.vehicleId?.vehicleNumber ? record.vehicleId : undefined;
  const body = {
    expenseName: `${record.maintenanceType} ${record.totalCost}`,
    category: "Maintenance",
    amount: Number(record.totalCost || 0),
    expenseDate: record.maintenanceDate,
    status: "Paid" as const,
    paidAmount: Number(record.totalCost || 0),
    notes: `Synced from maintenance job card ${record.jobCardNumber}${vehicle ? ` for ${vehicle.vehicleNumber}` : ""}`,
    attachmentUrl: record.documents?.[0]?.url || "",
    attachmentKey: record.documents?.[0]?.key || "",
    vehicleId: vehicle?._id || record.vehicleId,
    maintenanceId: record._id
  };

  if (record.expenseId) {
    await ManualExpenseModel.findByIdAndUpdate(record.expenseId, body, { runValidators: true });
    return;
  }

  const expense: any = await ManualExpenseModel.create(body);
  await MaintenanceModel.findByIdAndUpdate(record._id, { expenseId: expense._id });
}

export async function maintenanceExpenseRows(filters: { from: Date; to: Date; vehicleId?: string; status?: string }) {
  const query: any = { status: "Completed", maintenanceDate: { $gte: filters.from, $lte: filters.to } };
  if (filters.vehicleId) query.vehicleId = new Types.ObjectId(filters.vehicleId);
  const rows = await MaintenanceModel.find(query).populate("vehicleId").sort({ maintenanceDate: -1 }).lean();
  return rows.map((record: any): MaintenanceExpenseRow => ({
    id: String(record._id),
    source: "Maintenance",
    category: "Maintenance",
    name: record.maintenanceType,
    amount: Number(record.totalCost || 0),
    paidAmount: Number(record.totalCost || 0),
    remainingAmount: 0,
    date: toDateString(record.maintenanceDate),
    tripId: "",
    tripNumber: "",
    vehicleId: String(record.vehicleId?._id || record.vehicleId || ""),
    vehicleNumber: record.vehicleId?.vehicleNumber || "",
    driverId: "",
    driverName: "",
    customerId: "",
    customer: "",
    route: "Maintenance"
  }));
}

export async function vehicleMaintenanceSummary(vehicleIds: string[]) {
  if (!vehicleIds.length) return new Map<string, any>();
  const ids = vehicleIds.map((id) => new Types.ObjectId(id));
  const [costs, latest, active, accidents] = await Promise.all([
    MaintenanceModel.aggregate([
      { $match: { vehicleId: { $in: ids }, status: "Completed" } },
      { $group: { _id: "$vehicleId", totalMaintenanceCost: { $sum: "$totalCost" }, completedServices: { $sum: 1 } } }
    ]),
    MaintenanceModel.aggregate([
      { $match: { vehicleId: { $in: ids } } },
      { $sort: { maintenanceDate: -1 } },
      { $group: { _id: "$vehicleId", lastServiceDate: { $first: "$maintenanceDate" }, nextServiceDate: { $first: "$nextServiceDate" }, nextServiceKM: { $first: "$nextServiceKM" }, odometerReading: { $first: "$odometerReading" } } }
    ]),
    MaintenanceModel.aggregate([
      { $match: { vehicleId: { $in: ids }, status: { $in: ["Scheduled", "In Progress"] } } },
      { $group: { _id: "$vehicleId", activeRepairs: { $sum: 1 } } }
    ]),
    MaintenanceModel.aggregate([
      { $match: { vehicleId: { $in: ids }, maintenanceType: /accident/i } },
      { $group: { _id: "$vehicleId", accidentCount: { $sum: 1 } } }
    ])
  ]);

  const map = new Map<string, any>();
  for (const row of [...costs, ...latest, ...active, ...accidents]) {
    const id = String(row._id);
    map.set(id, { ...(map.get(id) || {}), ...row });
  }
  for (const [id, row] of map) {
    const score = calculateHealthScore(row);
    map.set(id, { ...row, healthScore: score, healthLabel: healthLabel(score) });
  }
  return map;
}

export function serviceStatus(nextServiceDate?: Date | string, nextServiceKM?: number, odometerReading?: number) {
  const dateDays = nextServiceDate ? daysUntil(nextServiceDate) : 9999;
  const kmRemaining = nextServiceKM && odometerReading ? nextServiceKM - odometerReading : 999999;
  if (dateDays < 0 || kmRemaining < 0) return "Overdue";
  if (dateDays <= 15 || kmRemaining <= 500) return "Due Soon";
  return "Upcoming";
}

export function calculateHealthScore(row: any) {
  let score = 100;
  if (serviceStatus(row.nextServiceDate, row.nextServiceKM, row.odometerReading) === "Overdue") score -= 25;
  if ((row.activeRepairs || 0) > 0) score -= Math.min((row.activeRepairs || 0) * 10, 25);
  score -= Math.min((row.accidentCount || 0) * 8, 24);
  if ((row.completedServices || 0) > 12) score -= 8;
  return Math.max(score, 0);
}

export function healthLabel(score: number) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 55) return "Average";
  return "Poor";
}

export function toDateString(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function daysUntil(value: string | Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((+date - +now) / 86400000);
}
