import puppeteer from "puppeteer";
import { Types } from "mongoose";
import { BiltyModel } from "../models/Bilty.js";
import { CompanyModel } from "../models/Company.js";
import { DriverModel } from "../models/Driver.js";
import { InvoiceModel } from "../models/Invoice.js";
import { AccidentModel, MaintenanceModel, TyreModel } from "../models/Maintenance.js";
import { ManualExpenseModel } from "../models/ManualExpense.js";
import { PaymentModel } from "../models/Payment.js";
import { TripModel } from "../models/Trip.js";
import { VehicleModel } from "../models/Vehicle.js";
import { DocumentService } from "./document.service.js";
import {
  calculateCashFlow,
  calculateCustomerProfit,
  calculateDriverAnalysis,
  calculateExpenseAnalytics,
  calculateKPIs,
  calculateReceivables,
  calculateRevenueAnalytics,
  calculateTripProfit,
  calculateVehicleProfit,
  generateProfitLossStatement,
  parseProfitLossFilters
} from "./profit-loss.service.js";
import { CompanySettingsService } from "./settings.service.js";

export type ReportFilters = ReturnType<typeof parseReportFilters>;

export type ReportCategory =
  | "financial"
  | "trips"
  | "vehicles"
  | "drivers"
  | "maintenance"
  | "bilty"
  | "compliance";

type ReportSchedule = {
  id: string;
  reportCategory: ReportCategory;
  reportName: string;
  frequency: "Daily" | "Weekly" | "Monthly" | "Custom";
  delivery: "Email";
  recipients: string[];
  formats: Array<"PDF" | "Excel">;
  customSchedule?: string;
  filters: Record<string, unknown>;
  createdAt: string;
  nextRunAt: string;
};

const reportSchedules: ReportSchedule[] = [];

export function parseReportFilters(query: any) {
  const now = new Date();
  const from = query.from ? startOfDay(String(query.from)) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = query.to ? endOfDay(String(query.to)) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from,
    to,
    vehicleId: stringFilter(query.vehicleId),
    driverId: stringFilter(query.driverId),
    customerId: stringFilter(query.customerId || query.companyId),
    companyId: stringFilter(query.companyId || query.customerId),
    route: stringFilter(query.route),
    tripId: stringFilter(query.tripId),
    branch: stringFilter(query.branch),
    reportType: stringFilter(query.reportType),
    search: stringFilter(query.search)
  };
}

export class ReportService {
  static async getDashboard(filters: ReportFilters) {
    const [kpis, trips, vehicles, drivers, receivables, bilties, documents] = await Promise.all([
      calculateKPIs(asProfitFilters(filters)),
      calculateTripProfit(asProfitFilters(filters)),
      VehicleModel.countDocuments(),
      DriverModel.countDocuments(),
      calculateReceivables(asProfitFilters(filters)),
      BiltyModel.find(biltyQuery(filters)).lean(),
      DocumentService.getAllDocuments()
    ]);

    const missingBilties = await missingBiltyRows(filters);
    const expiringDocuments = documents.documents.filter((document) => document.status === "Expiring Soon").length;
    const totalTrips = trips.length;
    const activeVehicleIds = new Set(trips.map((trip: any) => trip.vehicleId).filter(Boolean));
    const activeDriverIds = new Set(trips.map((trip: any) => trip.driverId).filter(Boolean));

    return {
      kpis: {
        totalRevenue: kpis.totals.totalRevenue,
        totalExpenses: kpis.totals.totalExpenses,
        netProfit: kpis.totals.netProfit,
        totalTrips,
        activeVehicles: activeVehicleIds.size || vehicles,
        activeDrivers: activeDriverIds.size || drivers,
        outstandingPayments: receivables.outstanding,
        pendingCollections: receivables.invoices.filter((invoice: any) => invoice.outstanding > 0).length,
        missingBilties: missingBilties.length + bilties.filter((bilty) => bilty.status === "Missing").length,
        expiringDocuments
      },
      charts: {
        revenueTrends: (await calculateRevenueAnalytics(asProfitFilters(filters))).trend,
        expenseTrends: (await calculateExpenseAnalytics(asProfitFilters(filters))).monthlyTrend,
        profitTrends: (await calculateKPIs(asProfitFilters(filters))).period ? await profitTrend(filters) : [],
        vehiclePerformance: await calculateVehicleProfit(asProfitFilters(filters)),
        customerRevenue: (await calculateRevenueAnalytics(asProfitFilters(filters))).customerRevenue,
        collectionTrends: (await calculateRevenueAnalytics(asProfitFilters(filters))).collectionTrend
      },
      period: { from: dateString(filters.from), to: dateString(filters.to) }
    };
  }

  static async getFinancialReports(filters: ReportFilters) {
    const [kpis, trips, vehicles, customers, drivers, expenses, revenue, cashflow, receivables] = await Promise.all([
      calculateKPIs(asProfitFilters(filters)),
      calculateTripProfit(asProfitFilters(filters)),
      calculateVehicleProfit(asProfitFilters(filters)),
      calculateCustomerProfit(asProfitFilters(filters)),
      calculateDriverAnalysis(asProfitFilters(filters)),
      calculateExpenseAnalytics(asProfitFilters(filters)),
      calculateRevenueAnalytics(asProfitFilters(filters)),
      calculateCashFlow(asProfitFilters(filters)),
      calculateReceivables(asProfitFilters(filters))
    ]);

    return {
      category: "financial",
      reports: [
        report("Profit & Loss Report", trips, ["tripNumber", "date", "customer", "vehicleNumber", "driver", "revenue", "expense", "profit", "status"]),
        report("Revenue Report", revenue.tripRevenue, ["name", "amount"]),
        report("Expense Report", expenses.byCategory, ["name", "amount"]),
        report("Cash Flow Report", [{ name: "Cash In", amount: cashflow.cashIn }, { name: "Cash Out", amount: cashflow.cashOut }, { name: "Net Cash Flow", amount: cashflow.netCashFlow }], ["name", "amount"]),
        report("Outstanding Payments Report", receivables.invoices.filter((invoice: any) => invoice.outstanding > 0), ["invoiceNumber", "company", "amount", "received", "outstanding", "dueDate", "status"]),
        report("Customer Ledger", customers, ["customer", "trips", "revenue", "expenseAllocation", "profit", "outstanding"]),
        report("Driver Ledger", drivers, ["driver", "trips", "revenueGenerated", "advances", "payments", "pendingSettlement"]),
        report("Vehicle Expense Report", vehicles, ["vehicleNumber", "trips", "revenue", "expenses", "profit", "dieselCost", "maintenanceCost"])
      ],
      summaryCards: kpis.cards,
      charts: { revenue, expenses, cashflow, receivables }
    };
  }

  static async getTripReports(filters: ReportFilters) {
    const rows = await calculateTripProfit(asProfitFilters(filters));
    const statusRows = groupCount(rows, (row: any) => row.status);
    const routeRows = groupRows(rows, (row: any) => row.route, (row: any) => row.revenue, (row: any) => row.expense);
    const customerRows = groupRows(rows, (row: any) => row.customer, (row: any) => row.revenue, (row: any) => row.expense);
    const columns = ["tripNumber", "date", "customer", "vehicleNumber", "driver", "revenue", "expense", "profit", "status"];
    return {
      category: "trips",
      reports: [
        report("Trip Summary Report", rows, columns),
        report("Trip Profitability Report", rows, columns),
        report("Trip Status Report", statusRows, ["name", "count"]),
        report("Route Performance Report", routeRows, ["name", "trips", "revenue", "expenses", "profit"]),
        report("Customer Wise Trip Report", customerRows, ["name", "trips", "revenue", "expenses", "profit"])
      ],
      summaryCards: summaryFromTripRows(rows),
      charts: { statusRows, routeRows, customerRows }
    };
  }

  static async getVehicleReports(filters: ReportFilters) {
    const [vehicles, tyres, maintenance] = await Promise.all([
      calculateVehicleProfit(asProfitFilters(filters)),
      TyreModel.find(filters.vehicleId ? { vehicleId: objectId(filters.vehicleId) } : {}).populate("vehicleId").lean(),
      maintenanceRows(filters)
    ]);
    const columns = ["vehicleNumber", "trips", "revenue", "expenses", "profit", "dieselCost", "maintenanceCost", "utilizationPercent"];
    const rows = vehicles.map((row: any) => ({ ...row, fuelCost: row.dieselCost, utilizationPercent: Math.min(row.trips * 8, 100) }));
    return {
      category: "vehicles",
      reports: [
        report("Vehicle Profitability Report", rows, columns),
        report("Vehicle Expense Report", rows, columns),
        report("Fuel Consumption Report", rows, ["vehicleNumber", "trips", "fuelCost", "revenue", "profit"]),
        report("Maintenance Report", maintenance, ["vehicle", "maintenanceType", "date", "cost", "garage", "status"]),
        report("Vehicle Utilization Report", rows, ["vehicleNumber", "trips", "utilizationPercent", "revenue", "profit"]),
        report("Tyre Report", tyres.map(tyreDto), ["vehicleNumber", "tyreNumber", "tyreBrand", "tyrePosition", "installDate", "cost", "status"])
      ],
      summaryCards: summaryFromVehicleRows(rows),
      charts: { vehiclePerformance: rows, maintenance }
    };
  }

  static async getDriverReports(filters: ReportFilters) {
    const rows = await calculateDriverAnalysis(asProfitFilters(filters));
    const columns = ["driver", "trips", "revenueGenerated", "advances", "payments", "pendingSettlement"];
    return {
      category: "drivers",
      reports: [
        report("Driver Performance Report", rows, columns),
        report("Driver Advance Report", rows, ["driver", "trips", "advances", "payments", "pendingSettlement"]),
        report("Driver Settlement Report", rows, columns),
        report("Driver Trip Report", rows, ["driver", "trips", "revenueGenerated", "netContribution"]),
        report("Driver Cost Analysis", rows, ["driver", "costImpact", "advances", "payments", "netContribution"])
      ],
      summaryCards: [
        card("Drivers", rows.length),
        card("Trips", sum(rows, (row: any) => row.trips)),
        card("Advances", sum(rows, (row: any) => row.advances)),
        card("Pending Settlement", sum(rows, (row: any) => row.pendingSettlement))
      ],
      charts: { driverPerformance: rows }
    };
  }

  static async getMaintenanceReports(filters: ReportFilters) {
    const [rows, accidents] = await Promise.all([maintenanceRows(filters), accidentRows(filters)]);
    return {
      category: "maintenance",
      reports: [
        report("Maintenance Cost Report", rows, ["vehicle", "maintenanceType", "date", "cost", "garage", "status"]),
        report("Vehicle Maintenance Report", rows, ["vehicle", "maintenanceType", "date", "cost", "garage", "status"]),
        report("Service Due Report", rows.filter((row) => row.dueStatus === "Due Soon"), ["vehicle", "maintenanceType", "nextServiceDate", "garage", "status", "dueStatus"]),
        report("Overdue Service Report", rows.filter((row) => row.dueStatus === "Overdue"), ["vehicle", "maintenanceType", "nextServiceDate", "garage", "status", "dueStatus"]),
        report("Accident Report", accidents, ["vehicle", "driver", "date", "location", "cost", "status"]),
        report("Garage Expense Report", groupRows(rows, (row) => row.garage, (row) => row.cost), ["name", "trips", "revenue"]),
        report("Vehicle Health Report", rows, ["vehicle", "maintenanceType", "date", "cost", "status", "dueStatus"])
      ],
      summaryCards: [
        card("Maintenance Cost", sum(rows, (row) => row.cost)),
        card("Open Jobs", rows.filter((row) => ["Scheduled", "In Progress"].includes(row.status)).length),
        card("Overdue Service", rows.filter((row) => row.dueStatus === "Overdue").length),
        card("Accidents", accidents.length)
      ],
      charts: { maintenanceTrends: groupRows(rows, (row) => String(row.date).slice(0, 7), (row) => row.cost) }
    };
  }

  static async getBiltyReports(filters: ReportFilters) {
    const uploaded = await BiltyModel.find(biltyQuery(filters)).populate("tripId customerId vehicleId driverId").sort({ uploadDate: -1 }).lean();
    const rows = uploaded.map(biltyDto);
    const missing = await missingBiltyRows(filters);
    const columns = ["biltyNumber", "tripNumber", "customer", "vehicle", "driver", "uploadDate", "verificationStatus"];
    return {
      category: "bilty",
      reports: [
        report("Bilty Register", rows, columns),
        report("Missing Bilty Report", missing, columns),
        report("Verified Bilty Report", rows.filter((row) => row.verificationStatus === "Verified"), columns),
        report("Pending Bilty Report", rows.filter((row) => row.verificationStatus !== "Verified"), columns),
        report("Vehicle Wise Bilty Report", groupCount(rows, (row) => row.vehicle), ["name", "count"]),
        report("Customer Wise Bilty Report", groupCount(rows, (row) => row.customer), ["name", "count"])
      ],
      summaryCards: [
        card("Uploaded Bilties", rows.length),
        card("Missing Bilties", missing.length),
        card("Verified", rows.filter((row) => row.verificationStatus === "Verified").length),
        card("Pending", rows.filter((row) => row.verificationStatus !== "Verified").length)
      ],
      charts: { statusRows: groupCount(rows, (row) => row.verificationStatus) }
    };
  }

  static async getComplianceReports(filters: ReportFilters) {
    const repository = await DocumentService.getAllDocuments();
    const rows = repository.documents.filter((document) => documentMatches(document, filters)).map((document) => ({
      id: document.id,
      document: document.documentName,
      owner: document.ownerName || document.vehicleNumber || document.driverName || document.tripNumber,
      documentType: document.documentType,
      expiryDate: document.expiryDate,
      status: document.status,
      daysRemaining: daysUntil(document.expiryDate),
      category: document.category,
      linkedRecord: document.linkedRecord
    }));
    const columns = ["document", "owner", "documentType", "expiryDate", "status", "daysRemaining"];
    return {
      category: "compliance",
      reports: [
        report("Document Compliance Report", rows, columns),
        report("Missing Documents Report", rows.filter((row) => row.status === "Missing"), columns),
        report("Expired Documents Report", rows.filter((row) => row.status === "Expired"), columns),
        report("Expiring Documents Report", rows.filter((row) => row.status === "Expiring Soon"), columns),
        report("Vehicle Compliance Report", rows.filter((row) => row.category === "Vehicle"), columns),
        report("Driver Compliance Report", rows.filter((row) => row.category === "Driver"), columns)
      ],
      summaryCards: [
        card("Compliance Score", repository.compliance.overall, "%"),
        card("Missing", rows.filter((row) => row.status === "Missing").length),
        card("Expired", rows.filter((row) => row.status === "Expired").length),
        card("Expiring", rows.filter((row) => row.status === "Expiring Soon").length)
      ],
      charts: { compliance: repository.compliance, statusRows: groupCount(rows, (row) => row.status) }
    };
  }

  static async generatePDFReport(category: ReportCategory, filters: ReportFilters) {
    const payload = await this.categoryPayload(category, filters);
    const html = await reportHtml(payload);
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      return Buffer.from(await page.pdf({ format: "A4", printBackground: true, margin: { top: "14mm", right: "12mm", bottom: "14mm", left: "12mm" } }));
    } finally {
      await browser.close();
    }
  }

  static async generateExcelReport(category: ReportCategory, filters: ReportFilters) {
    const payload = await this.categoryPayload(category, filters);
    const company = await CompanySettingsService.getCompanySettings();
    const lines: string[][] = [[`${company.companyName || "NPFC"} ${titleCase(category)} Reports`], [CompanySettingsService.formatAddress(company)], [`GST ${company.gstNumber || ""}`], [`Period ${dateString(filters.from)} to ${dateString(filters.to)}`], []];
    for (const item of payload.reports) {
      lines.push([item.name], item.columns);
      item.rows.forEach((row: any) => lines.push(item.columns.map((column: string) => String(row[column] ?? ""))));
      lines.push([]);
    }
    return lines.map((line) => line.map(csvCell).join(",")).join("\n");
  }

  static scheduleReport(input: any) {
    const frequency = input.frequency || "Daily";
    const schedule: ReportSchedule = {
      id: `RPT-SCH-${Date.now()}`,
      reportCategory: input.reportCategory || "financial",
      reportName: input.reportName || "Profit & Loss Report",
      frequency,
      delivery: "Email",
      recipients: String(input.recipients || input.email || "").split(",").map((item) => item.trim()).filter(Boolean),
      formats: Array.isArray(input.formats) ? input.formats : ["PDF"],
      customSchedule: input.customSchedule || "",
      filters: input.filters || {},
      createdAt: new Date().toISOString(),
      nextRunAt: nextRunAt(frequency, input.customSchedule)
    };
    reportSchedules.unshift(schedule);
    return { message: "Report schedule saved.", schedule, schedules: reportSchedules.slice(0, 25) };
  }

  static async categoryPayload(category: ReportCategory, filters: ReportFilters): Promise<any> {
    if (category === "trips") return this.getTripReports(filters);
    if (category === "vehicles") return this.getVehicleReports(filters);
    if (category === "drivers") return this.getDriverReports(filters);
    if (category === "maintenance") return this.getMaintenanceReports(filters);
    if (category === "bilty") return this.getBiltyReports(filters);
    if (category === "compliance") return this.getComplianceReports(filters);
    return this.getFinancialReports(filters);
  }
}

async function profitTrend(filters: ReportFilters) {
  const statement = await generateProfitLossStatement(asProfitFilters(filters), "Profit Trends");
  return statement.monthlyTrendAnalysis;
}

async function maintenanceRows(filters: ReportFilters) {
  const query: any = { maintenanceDate: { $gte: filters.from, $lte: filters.to } };
  if (filters.vehicleId) query.vehicleId = objectId(filters.vehicleId);
  const rows = await MaintenanceModel.find(query).populate("vehicleId").sort({ maintenanceDate: -1 }).lean();
  return rows.map((row: any) => ({
    id: String(row._id),
    vehicleId: String(row.vehicleId?._id || row.vehicleId || ""),
    vehicle: row.vehicleId?.vehicleNumber || "Unassigned",
    maintenanceType: row.maintenanceType,
    date: dateString(row.maintenanceDate),
    cost: Number(row.totalCost || 0),
    garage: row.garageName,
    status: row.status,
    nextServiceDate: row.nextServiceDate ? dateString(row.nextServiceDate) : "",
    dueStatus: serviceStatus(row.nextServiceDate)
  }));
}

async function accidentRows(filters: ReportFilters) {
  const query: any = { accidentDate: { $gte: filters.from, $lte: filters.to } };
  if (filters.vehicleId) query.vehicleId = objectId(filters.vehicleId);
  if (filters.driverId) query.driverId = objectId(filters.driverId);
  const rows = await AccidentModel.find(query).populate("vehicleId driverId").sort({ accidentDate: -1 }).lean();
  return rows.map((row: any) => ({
    id: String(row._id),
    vehicle: row.vehicleId?.vehicleNumber || "",
    driver: row.driverId?.name || "",
    date: dateString(row.accidentDate),
    location: row.location,
    cost: Number(row.repairCost || row.damageCost || 0),
    status: row.claimStatus
  }));
}

async function missingBiltyRows(filters: ReportFilters) {
  const trips = await TripModel.find(tripQuery(filters)).populate("companyId vehicleId driverId").sort({ loadingDate: -1 }).lean();
  const bilties = await BiltyModel.find({ tripId: { $in: trips.map((trip) => trip._id) } }).lean();
  const covered = new Set(bilties.map((bilty) => String(bilty.tripId)));
  return trips.filter((trip) => !covered.has(String(trip._id))).map((trip: any) => ({
    id: `missing-${trip._id}`,
    biltyNumber: "Missing",
    tripNumber: trip.tripId,
    customer: trip.companyId?.companyName || "",
    vehicle: trip.vehicleId?.vehicleNumber || "",
    driver: trip.driverId?.name || "",
    uploadDate: "",
    verificationStatus: "Missing",
    status: "Missing"
  }));
}

function biltyDto(row: any) {
  return {
    id: String(row._id),
    biltyNumber: row.biltyNumber,
    tripNumber: row.tripId?.tripId || "",
    customer: row.customerId?.companyName || "",
    vehicle: row.vehicleId?.vehicleNumber || row.vehicleNumber || "",
    driver: row.driverId?.name || "",
    uploadDate: dateString(row.uploadDate),
    verificationStatus: row.verificationStatus,
    status: row.status
  };
}

function tyreDto(row: any) {
  return {
    id: String(row._id),
    vehicleNumber: row.vehicleId?.vehicleNumber || "",
    tyreNumber: row.tyreNumber,
    tyreBrand: row.tyreBrand,
    tyrePosition: row.tyrePosition,
    installDate: dateString(row.installDate),
    cost: Number(row.cost || 0),
    status: row.status
  };
}

function report(name: string, rows: any[], columns: string[]) {
  return { name, columns, rows, totalRows: rows.length };
}

function card(label: string, value: number, suffix = "") {
  return { label, value, suffix };
}

function summaryFromTripRows(rows: any[]) {
  return [
    card("Trips", rows.length),
    card("Revenue", sum(rows, (row) => row.revenue)),
    card("Expenses", sum(rows, (row) => row.expense)),
    card("Profit", sum(rows, (row) => row.profit))
  ];
}

function summaryFromVehicleRows(rows: any[]) {
  return [
    card("Vehicles", rows.length),
    card("Trips", sum(rows, (row) => row.trips)),
    card("Revenue", sum(rows, (row) => row.revenue)),
    card("Profit", sum(rows, (row) => row.profit))
  ];
}

function tripQuery(filters: ReportFilters) {
  const query: any = { loadingDate: { $gte: filters.from, $lte: filters.to } };
  if (filters.vehicleId) query.vehicleId = objectId(filters.vehicleId);
  if (filters.driverId) query.driverId = objectId(filters.driverId);
  if (filters.customerId) query.companyId = objectId(filters.customerId);
  if (filters.tripId) query._id = objectId(filters.tripId);
  if (filters.route) query.$or = [{ source: new RegExp(filters.route, "i") }, { destination: new RegExp(filters.route, "i") }];
  return query;
}

function biltyQuery(filters: ReportFilters) {
  const query: any = { uploadDate: { $gte: filters.from, $lte: filters.to } };
  if (filters.vehicleId) query.vehicleId = objectId(filters.vehicleId);
  if (filters.driverId) query.driverId = objectId(filters.driverId);
  if (filters.customerId) query.customerId = objectId(filters.customerId);
  if (filters.tripId) query.tripId = objectId(filters.tripId);
  return query;
}

function documentMatches(document: any, filters: ReportFilters) {
  return (!filters.vehicleId || document.linkedRecordId === filters.vehicleId || document.vehicleNumber)
    && (!filters.driverId || document.linkedRecordId === filters.driverId || document.driverName)
    && (!filters.tripId || document.linkedRecordId === filters.tripId || document.tripNumber)
    && (!filters.search || JSON.stringify(document).toLowerCase().includes(filters.search.toLowerCase()));
}

function asProfitFilters(filters: ReportFilters) {
  return parseProfitLossFilters({
    from: dateString(filters.from),
    to: dateString(filters.to),
    vehicleId: filters.vehicleId,
    driverId: filters.driverId,
    customerId: filters.customerId,
    companyId: filters.companyId,
    route: filters.route,
    tripId: filters.tripId,
    branch: filters.branch
  });
}

function groupCount<T>(rows: T[], keyFn: (row: T) => string) {
  return Object.values(rows.reduce<Record<string, { name: string; count: number }>>((acc, row) => {
    const name = keyFn(row) || "Unassigned";
    acc[name] ||= { name, count: 0 };
    acc[name].count += 1;
    return acc;
  }, {})).sort((a, b) => b.count - a.count);
}

function groupRows<T>(rows: T[], keyFn: (row: T) => string, revenueFn: (row: T) => number, expenseFn: (row: T) => number = () => 0) {
  return Object.values(rows.reduce<Record<string, { name: string; trips: number; revenue: number; expenses: number; profit: number }>>((acc, row) => {
    const name = keyFn(row) || "Unassigned";
    acc[name] ||= { name, trips: 0, revenue: 0, expenses: 0, profit: 0 };
    acc[name].trips += 1;
    acc[name].revenue += Number(revenueFn(row) || 0);
    acc[name].expenses += Number(expenseFn(row) || 0);
    acc[name].profit = acc[name].revenue - acc[name].expenses;
    return acc;
  }, {})).sort((a, b) => b.profit - a.profit);
}

function serviceStatus(nextServiceDate?: Date | string) {
  if (!nextServiceDate) return "On Track";
  const days = daysUntil(dateString(nextServiceDate));
  if (days < 0) return "Overdue";
  if (days <= 15) return "Due Soon";
  return "On Track";
}

function nextRunAt(frequency: string, customSchedule?: string) {
  const date = new Date();
  if (frequency === "Weekly") date.setDate(date.getDate() + 7);
  else if (frequency === "Monthly") date.setMonth(date.getMonth() + 1);
  else if (frequency === "Custom" && customSchedule) return customSchedule;
  else date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function objectId(value: string) {
  return new Types.ObjectId(value);
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

function dateString(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

function stringFilter(value: unknown) {
  const text = String(value || "");
  return text && text !== "All" ? text : "";
}

function daysUntil(value: string) {
  if (!value) return 0;
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((+date - +now) / 86400000);
}

function sum<T>(rows: T[], fn: (row: T) => number) {
  return rows.reduce((total, row) => total + Number(fn(row) || 0), 0);
}

function titleCase(value: string) {
  return value.replace(/(^|-)([a-z])/g, (_match, separator, letter) => `${separator ? " " : ""}${letter.toUpperCase()}`);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function reportHtml(payload: any) {
  const company = await CompanySettingsService.getCompanySettings();
  const first = payload.reports[0] || { name: "Report", columns: [], rows: [] };
  const rows = first.rows.slice(0, 250).map((row: any) => `<tr>${first.columns.map((column: string) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#111827;padding:28px}h1{margin:0 0 4px}.company{border-bottom:2px solid #0F172A;margin-bottom:18px;padding-bottom:12px}.company div{font-size:11px;color:#475569}p{color:#475569;margin:0 0 18px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}.card{border:1px solid #CBD5E1;border-radius:6px;padding:10px}.label{font-size:11px;color:#64748B;text-transform:uppercase}.value{font-size:18px;font-weight:700;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #CBD5E1;padding:6px;text-align:left;vertical-align:top}th{background:#E2E8F0}</style></head><body><section class="company"><h1>${escapeHtml(company.companyName || "NPFC")} ${escapeHtml(first.name)}</h1><div>${escapeHtml(CompanySettingsService.formatAddress(company))}</div><div>GST: ${escapeHtml(company.gstNumber || "-")} | PAN: ${escapeHtml(company.panNumber || "-")} | ${escapeHtml(company.emailAddress || "")}</div></section><p>Generated from live ERP source records</p><div class="cards">${(payload.summaryCards || []).slice(0, 8).map((item: any) => `<div class="card"><div class="label">${escapeHtml(item.label)}</div><div class="value">${escapeHtml(item.value)}${escapeHtml(item.suffix || "")}</div></div>`).join("")}</div><table><thead><tr>${first.columns.map((column: string) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows || "<tr><td>No data</td></tr>"}</tbody></table></body></html>`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}
