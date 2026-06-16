import { Types } from "mongoose";
import puppeteer from "puppeteer";
import { isDatabaseConnected } from "../config/database.js";
import { AccidentModel, MaintenanceModel, TyreModel, maintenanceTypes } from "../models/Maintenance.js";
import { syncMaintenanceExpense, serviceStatus, toDateString } from "../services/maintenance.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
export const listMaintenance = asyncHandler(async (req, res) => {
    assertDatabase();
    const filters = parseFilters(req.query);
    const query = maintenanceQuery(filters);
    const rows = await MaintenanceModel.find(query).populate("vehicleId").sort({ maintenanceDate: -1 }).limit(10000).lean();
    res.json(rows.map(toMaintenanceDto));
});
export const getMaintenanceDashboard = asyncHandler(async (req, res) => {
    assertDatabase();
    const filters = parseFilters(req.query);
    const query = maintenanceQuery(filters);
    const [rows, tyres, accidents] = await Promise.all([
        MaintenanceModel.find(query).populate("vehicleId").sort({ maintenanceDate: -1 }).limit(10000).lean(),
        TyreModel.find(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}).populate("vehicleId").sort({ installDate: -1 }).lean(),
        AccidentModel.find(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}).populate("vehicleId driverId").sort({ accidentDate: -1 }).lean()
    ]);
    const records = rows.map(toMaintenanceDto);
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const completed = records.filter((row) => row.status === "Completed");
    const active = records.filter((row) => ["Scheduled", "In Progress"].includes(row.status));
    const due = records.filter((row) => row.dueStatus === "Due Soon");
    const overdue = records.filter((row) => row.dueStatus === "Overdue");
    const garageExpenses = groupAmount(completed, (row) => row.garageName);
    const dashboard = {
        kpis: {
            totalMaintenanceCost: sum(completed, (row) => row.totalCost),
            thisMonthCost: sum(completed.filter((row) => new Date(row.maintenanceDate) >= monthStart), (row) => row.totalCost),
            vehiclesUnderMaintenance: new Set(active.map((row) => row.vehicleId)).size,
            dueServices: due.length,
            overdueServices: overdue.length,
            completedServices: completed.length,
            activeRepairs: active.filter((row) => row.status === "In Progress").length,
            totalGarageExpenses: sum(completed, (row) => row.totalCost)
        },
        records,
        reminders: [
            ...due.map((row) => ({ type: "Service Due", vehicleNumber: row.vehicleNumber, message: `${row.maintenanceType} due soon`, date: row.nextServiceDate })),
            ...overdue.map((row) => ({ type: "Service Overdue", vehicleNumber: row.vehicleNumber, message: `${row.maintenanceType} overdue`, date: row.nextServiceDate }))
        ].slice(0, 12),
        analytics: {
            maintenanceType: groupAmount(records, (row) => row.maintenanceType),
            garageExpenses,
            monthlyCost: groupAmount(records, (row) => row.maintenanceDate.slice(0, 7))
        },
        tyres: tyres.map(toTyreDto),
        accidents: accidents.map(toAccidentDto),
        types: maintenanceTypes
    };
    res.json(dashboard);
});
export const getMaintenanceRecord = asyncHandler(async (req, res) => {
    assertDatabase();
    const record = await MaintenanceModel.findById(req.params.id).populate("vehicleId expenseId").lean();
    if (!record)
        throw new HttpError(404, "Maintenance record not found.");
    const history = await MaintenanceModel.find({ vehicleId: record.vehicleId?._id || record.vehicleId }).populate("vehicleId").sort({ maintenanceDate: -1 }).limit(50).lean();
    const accidents = await AccidentModel.find({ vehicleId: record.vehicleId?._id || record.vehicleId }).populate("driverId").sort({ accidentDate: -1 }).lean();
    res.json({ ...toMaintenanceDto(record), serviceHistory: history.map(toMaintenanceDto), accidentLinks: accidents.map(toAccidentDto), expenseEntry: record.expenseId || null, profitImpact: { expense: Number(record.totalCost || 0), netProfitReduction: Number(record.totalCost || 0) } });
});
export const createMaintenance = asyncHandler(async (req, res) => {
    assertDatabase();
    const record = await MaintenanceModel.create({ ...req.body, jobCardNumber: req.body.jobCardNumber || await nextJobCard(), createdBy: req.user?.id });
    const populated = await record.populate("vehicleId");
    await syncMaintenanceExpense(populated);
    res.status(201).json(toMaintenanceDto(populated.toObject()));
});
export const updateMaintenance = asyncHandler(async (req, res) => {
    assertDatabase();
    const record = await MaintenanceModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate("vehicleId");
    if (!record)
        throw new HttpError(404, "Maintenance record not found.");
    await syncMaintenanceExpense(record);
    const refreshed = await MaintenanceModel.findById(record._id).populate("vehicleId").lean();
    res.json(toMaintenanceDto(refreshed));
});
export const deleteMaintenance = asyncHandler(async (req, res) => {
    assertDatabase();
    const record = await MaintenanceModel.findByIdAndDelete(req.params.id);
    if (!record)
        throw new HttpError(404, "Maintenance record not found.");
    await syncMaintenanceExpense({ ...record.toObject(), status: "Cancelled" });
    res.status(204).end();
});
export const createTyre = asyncHandler(async (req, res) => {
    assertDatabase();
    const row = await TyreModel.create(req.body);
    res.status(201).json(toTyreDto(await row.populate("vehicleId")));
});
export const createAccident = asyncHandler(async (req, res) => {
    assertDatabase();
    const row = await AccidentModel.create(req.body);
    res.status(201).json(toAccidentDto(await row.populate("vehicleId driverId")));
});
export const exportMaintenance = asyncHandler(async (req, res) => {
    assertDatabase();
    const filters = parseFilters(req.query);
    const rows = (await MaintenanceModel.find(maintenanceQuery(filters)).populate("vehicleId").sort({ maintenanceDate: -1 }).lean()).map(toMaintenanceDto);
    if (String(req.query.format || "excel").toLowerCase() === "pdf")
        return sendPdf(res, rows);
    const headers = ["Job Card", "Vehicle", "Type", "Category", "Garage", "Date", "Odometer", "Cost", "Status", "Next Service", "Due Status"];
    const csv = [headers, ...rows.map((row) => [row.jobCardNumber, row.vehicleNumber, row.maintenanceType, row.serviceCategory, row.garageName, row.maintenanceDate, row.odometerReading, row.totalCost, row.status, row.nextServiceDate, row.dueStatus])]
        .map((line) => line.map(csvCell).join(",")).join("\n");
    res.setHeader("Content-Type", "application/vnd.ms-excel");
    res.setHeader("Content-Disposition", "attachment; filename=maintenance-report.xls");
    res.send(csv);
});
function parseFilters(query) {
    const now = new Date();
    const from = query.from ? new Date(String(query.from)) : new Date(now.getFullYear() - 5, 0, 1);
    const to = query.to ? new Date(String(query.to)) : new Date(now.getFullYear() + 1, 11, 31, 23, 59, 59, 999);
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    return {
        from,
        to,
        vehicleId: stringFilter(query.vehicleId),
        maintenanceType: stringFilter(query.maintenanceType),
        garageName: stringFilter(query.garageName),
        status: stringFilter(query.status),
        minCost: Number(query.minCost || 0),
        maxCost: Number(query.maxCost || 0)
    };
}
function maintenanceQuery(filters) {
    const query = { maintenanceDate: { $gte: filters.from, $lte: filters.to } };
    if (filters.vehicleId)
        query.vehicleId = new Types.ObjectId(filters.vehicleId);
    if (filters.maintenanceType)
        query.maintenanceType = filters.maintenanceType;
    if (filters.garageName)
        query.garageName = new RegExp(filters.garageName, "i");
    if (filters.status)
        query.status = filters.status;
    if (filters.minCost || filters.maxCost)
        query.totalCost = { ...(filters.minCost ? { $gte: filters.minCost } : {}), ...(filters.maxCost ? { $lte: filters.maxCost } : {}) };
    return query;
}
function toMaintenanceDto(record) {
    const vehicle = record?.vehicleId;
    return {
        id: String(record._id),
        jobCardNumber: record.jobCardNumber,
        vehicleId: String(vehicle?._id || record.vehicleId || ""),
        vehicleNumber: vehicle?.vehicleNumber || "",
        vehicleType: vehicle?.vehicleType || "Truck",
        maintenanceType: record.maintenanceType,
        serviceCategory: record.serviceCategory,
        maintenanceDate: toDateString(record.maintenanceDate),
        garageName: record.garageName,
        mechanicName: record.mechanicName || "",
        contactNumber: record.contactNumber || "",
        odometerReading: Number(record.odometerReading || 0),
        labourCost: Number(record.labourCost || 0),
        partsCost: Number(record.partsCost || 0),
        otherCharges: Number(record.otherCharges || 0),
        totalCost: Number(record.totalCost || 0),
        description: record.description || "",
        remarks: record.remarks || "",
        status: record.status,
        nextServiceDate: record.nextServiceDate ? toDateString(record.nextServiceDate) : "",
        nextServiceKM: record.nextServiceKM || 0,
        scheduleEveryMonths: record.scheduleEveryMonths || 0,
        scheduleEveryKM: record.scheduleEveryKM || 0,
        dueStatus: serviceStatus(record.nextServiceDate, record.nextServiceKM, record.odometerReading),
        documents: record.documents || [],
        expenseId: record.expenseId ? String(record.expenseId?._id || record.expenseId) : "",
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
    };
}
function toTyreDto(row) {
    return { id: String(row._id), vehicleId: String(row.vehicleId?._id || row.vehicleId || ""), vehicleNumber: row.vehicleId?.vehicleNumber || "", tyreNumber: row.tyreNumber, tyreBrand: row.tyreBrand, tyrePosition: row.tyrePosition, installDate: toDateString(row.installDate), cost: Number(row.cost || 0), currentKM: Number(row.currentKM || 0), replacementDate: row.replacementDate ? toDateString(row.replacementDate) : "", status: row.status };
}
function toAccidentDto(row) {
    return { id: String(row._id), accidentDate: toDateString(row.accidentDate), vehicleId: String(row.vehicleId?._id || row.vehicleId || ""), vehicleNumber: row.vehicleId?.vehicleNumber || "", driverId: String(row.driverId?._id || row.driverId || ""), driverName: row.driverId?.name || "", location: row.location, description: row.description, damageCost: Number(row.damageCost || 0), insuranceClaimAmount: Number(row.insuranceClaimAmount || 0), repairCost: Number(row.repairCost || 0), claimStatus: row.claimStatus, documents: row.documents || [] };
}
async function nextJobCard() {
    const count = await MaintenanceModel.countDocuments();
    return `JC-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;
}
function groupAmount(rows, fn) {
    return Object.values(rows.reduce((acc, row) => {
        const name = fn(row) || "Unassigned";
        acc[name] ||= { name, amount: 0 };
        acc[name].amount += Number(row.totalCost || 0);
        return acc;
    }, {})).sort((a, b) => b.amount - a.amount);
}
async function sendPdf(res, rows) {
    const htmlRows = rows.slice(0, 100).map((row) => `<tr><td>${escapeHtml(row.jobCardNumber)}</td><td>${escapeHtml(row.vehicleNumber)}</td><td>${escapeHtml(row.maintenanceType)}</td><td>${escapeHtml(row.garageName)}</td><td>${currency(row.totalCost)}</td><td>${escapeHtml(row.status)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;color:#111;padding:28px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}th{background:#f3f4f6}</style></head><body><h1>NPFC Maintenance Report</h1><table><thead><tr><th>Job Card</th><th>Vehicle</th><th>Type</th><th>Garage</th><th>Cost</th><th>Status</th></tr></thead><tbody>${htmlRows}</tbody></table></body></html>`;
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=maintenance-report.pdf");
        res.send(Buffer.from(await page.pdf({ format: "A4", printBackground: true })));
    }
    finally {
        await browser.close();
    }
}
function sum(rows, fn) {
    return rows.reduce((total, row) => total + Number(fn(row) || 0), 0);
}
function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
function currency(amount) {
    return `INR ${Math.round(amount || 0).toLocaleString("en-IN")}`;
}
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}
function stringFilter(value) {
    const text = String(value || "");
    return text && text !== "All" ? text : "";
}
function assertDatabase() {
    if (!isDatabaseConnected())
        throw new HttpError(503, "MongoDB connection is required.");
}
