import { isDatabaseConnected } from "../config/database.js";
import { ReportService, parseReportFilters } from "../services/report.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
export const getReportsDashboard = asyncHandler(async (req, res) => {
    assertDatabase();
    res.json(await ReportService.getDashboard(parseReportFilters(req.query)));
});
export const getFinancialReports = asyncHandler(async (req, res) => {
    assertDatabase();
    res.json(await ReportService.getFinancialReports(parseReportFilters(req.query)));
});
export const getTripReports = asyncHandler(async (req, res) => {
    assertDatabase();
    res.json(await ReportService.getTripReports(parseReportFilters(req.query)));
});
export const getVehicleReports = asyncHandler(async (req, res) => {
    assertDatabase();
    res.json(await ReportService.getVehicleReports(parseReportFilters(req.query)));
});
export const getDriverReports = asyncHandler(async (req, res) => {
    assertDatabase();
    res.json(await ReportService.getDriverReports(parseReportFilters(req.query)));
});
export const getMaintenanceReports = asyncHandler(async (req, res) => {
    assertDatabase();
    res.json(await ReportService.getMaintenanceReports(parseReportFilters(req.query)));
});
export const getBiltyReports = asyncHandler(async (req, res) => {
    assertDatabase();
    res.json(await ReportService.getBiltyReports(parseReportFilters(req.query)));
});
export const getComplianceReports = asyncHandler(async (req, res) => {
    assertDatabase();
    res.json(await ReportService.getComplianceReports(parseReportFilters(req.query)));
});
export const exportReportPdf = asyncHandler(async (req, res) => {
    assertDatabase();
    const category = categoryFrom(req.body.category || req.body.reportCategory);
    const pdf = await ReportService.generatePDFReport(category, parseReportFilters({ ...req.query, ...(req.body.filters || req.body) }));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=npfc-${category}-report.pdf`);
    res.send(pdf);
});
export const exportReportExcel = asyncHandler(async (req, res) => {
    assertDatabase();
    const category = categoryFrom(req.body.category || req.body.reportCategory);
    const csv = await ReportService.generateExcelReport(category, parseReportFilters({ ...req.query, ...(req.body.filters || req.body) }));
    res.setHeader("Content-Type", "application/vnd.ms-excel");
    res.setHeader("Content-Disposition", `attachment; filename=npfc-${category}-report.xls`);
    res.send(csv);
});
export const scheduleReport = asyncHandler(async (req, res) => {
    assertDatabase();
    res.status(201).json(ReportService.scheduleReport(req.body));
});
function categoryFrom(value) {
    const category = String(value || "financial");
    if (["financial", "trips", "vehicles", "drivers", "maintenance", "bilty", "compliance"].includes(category))
        return category;
    return "financial";
}
function assertDatabase() {
    if (!isDatabaseConnected())
        throw new HttpError(503, "MongoDB connection is required.");
}
