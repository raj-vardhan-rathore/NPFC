import { isDatabaseConnected } from "../config/database.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
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
  generateCustomerStatement,
  generateDriverStatement,
  generateProfitLossStatement,
  generateStatementCsv,
  generateStatementPdf,
  generateTripStatement,
  generateVehicleStatement,
  parseProfitLossFilters
} from "../services/profit-loss.service.js";

export const getProfitLossKpis = asyncHandler(async (req, res) => {
  assertDatabase();
  res.json(await calculateKPIs(parseProfitLossFilters(req.query)));
});

export const getProfitLossTrips = asyncHandler(async (req, res) => {
  assertDatabase();
  res.json(await calculateTripProfit(parseProfitLossFilters(req.query)));
});

export const getProfitLossVehicles = asyncHandler(async (req, res) => {
  assertDatabase();
  res.json(await calculateVehicleProfit(parseProfitLossFilters(req.query)));
});

export const getProfitLossCustomers = asyncHandler(async (req, res) => {
  assertDatabase();
  res.json(await calculateCustomerProfit(parseProfitLossFilters(req.query)));
});

export const getProfitLossDrivers = asyncHandler(async (req, res) => {
  assertDatabase();
  res.json(await calculateDriverAnalysis(parseProfitLossFilters(req.query)));
});

export const getProfitLossExpenses = asyncHandler(async (req, res) => {
  assertDatabase();
  res.json(await calculateExpenseAnalytics(parseProfitLossFilters(req.query)));
});

export const getProfitLossRevenue = asyncHandler(async (req, res) => {
  assertDatabase();
  res.json(await calculateRevenueAnalytics(parseProfitLossFilters(req.query)));
});

export const getProfitLossCashflow = asyncHandler(async (req, res) => {
  assertDatabase();
  res.json(await calculateCashFlow(parseProfitLossFilters(req.query)));
});

export const getProfitLossReceivables = asyncHandler(async (req, res) => {
  assertDatabase();
  res.json(await calculateReceivables(parseProfitLossFilters(req.query)));
});

export const generateProfitLossStatementController = asyncHandler(async (req, res) => {
  assertDatabase();
  res.json(await statementFor(req.body.reportType, parseProfitLossFilters({ ...req.query, ...req.body })));
});

export const exportProfitLossPdf = asyncHandler(async (req, res) => {
  assertDatabase();
  const statement = await statementFor(String(req.query.reportType || "Profit & Loss Statement"), parseProfitLossFilters(req.query));
  const pdf = await generateStatementPdf(statement);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=profit-loss-statement.pdf");
  res.send(pdf);
});

export const exportProfitLossExcel = asyncHandler(async (req, res) => {
  assertDatabase();
  const statement = await statementFor(String(req.query.reportType || "Profit & Loss Statement"), parseProfitLossFilters(req.query));
  res.setHeader("Content-Type", "application/vnd.ms-excel");
  res.setHeader("Content-Disposition", "attachment; filename=profit-loss-statement.xls");
  res.send(generateStatementCsv(statement));
});

async function statementFor(reportType: string, filters: ReturnType<typeof parseProfitLossFilters>) {
  if (reportType === "Vehicle Profitability Statement") return generateVehicleStatement(filters);
  if (reportType === "Company Profitability Statement") return generateCustomerStatement(filters);
  if (reportType === "Driver Cost Statement") return generateDriverStatement(filters);
  if (reportType === "Trip Profitability Statement") return generateTripStatement(filters);
  return generateProfitLossStatement(filters, "Profit & Loss Statement");
}

function assertDatabase() {
  if (!isDatabaseConnected()) throw new HttpError(503, "MongoDB connection is required.");
}
