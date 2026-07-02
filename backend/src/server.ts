import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import morgan from "morgan";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { backupStatus, runBackupNow } from "./controllers/backup.controller.js";
import { createBilty, deleteBilty, downloadBiltyFile, listBilties, updateBilty, verifyBilty } from "./controllers/bilty.controller.js";
import { login, createUser, listUsers } from "./controllers/auth.controller.js";
import { deleteAttendance, listAttendance, updateAttendance, upsertAttendance } from "./controllers/attendance.controller.js";
import { dashboard } from "./controllers/dashboard.controller.js";
import { documentReport, listDocuments } from "./controllers/document.controller.js";
import { createExpense, deleteExpense, exportExpenses, getExpenseDashboard, listExpenses, updateExpense } from "./controllers/expense.controller.js";
import { deleteInvoice, generateInvoice, listInvoices, regenerateInvoice, updateInvoice } from "./controllers/invoice.controller.js";
import { createAccident, createMaintenance, createTyre, deleteMaintenance, exportMaintenance, getMaintenanceDashboard, getMaintenanceRecord, listMaintenance, updateMaintenance } from "./controllers/maintenance.controller.js";
import { createCompany, createDriver, createVehicle, deleteCompany, deleteDriver, deleteVehicle, listCompanies, listCustomersCompat, listDrivers, listVehicles, updateCompany, updateDriver, updateVehicle } from "./controllers/master.controller.js";
import { createPayment, deletePayment, exportPayments, listPayments, updatePayment } from "./controllers/payment.controller.js";
import { exportProfitLossExcel, exportProfitLossPdf, generateProfitLossStatementController, getProfitLossCashflow, getProfitLossCustomers, getProfitLossDrivers, getProfitLossExpenses, getProfitLossKpis, getProfitLossReceivables, getProfitLossRevenue, getProfitLossTrips, getProfitLossVehicles } from "./controllers/profit-loss.controller.js";
import { exportReportExcel, exportReportPdf, getBiltyReports, getComplianceReports, getDriverReports, getFinancialReports, getMaintenanceReports, getReportsDashboard, getTripReports, getVehicleReports, scheduleReport } from "./controllers/report.controller.js";
import { createSettingsBackup, getCompanySettings, getPermissions, getSettings, updateCompanySettings, updatePermissions, updateSettings } from "./controllers/settings.controller.js";
import { createTrip, deleteTrip, listRoutes, listTrips, updateTrip } from "./controllers/trip.controller.js";
import { sendTripStatusUpdate } from "./controllers/status.controller.js";
import { deleteDocument, previewDocument, uploadDocument } from "./controllers/upload.controller.js";
import { requireAuth, requireRole, requireWriteAccess, roleMatrix } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { upload } from "./middleware/upload.js";
import { validate } from "./middleware/validate.js";
import {
  authLoginSchema,
  attendanceSchema,
  attendanceUpdateSchema,
  companySchema,
  companyUpdateSchema,
  driverSchema,
  driverUpdateSchema,
  expenseSchema,
  expenseUpdateSchema,
  invoiceGenerateSchema,
  invoiceUpdateSchema,
  paymentSchema,
  paymentUpdateSchema,
  tripSchema,
  tripUpdateSchema,
  userCreateSchema,
  vehicleSchema,
  vehicleUpdateSchema,
  statusUpdateSchema
} from "./validation/schemas.js";
import { scheduleBackups } from "./services/backup.service.js";
import { bootstrapDefaultAdmin } from "./services/admin-bootstrap.service.js";

const app = express();

app.use(helmet());
app.set("etag", "strong");
app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(rateLimit());
app.use(express.json({ limit: "2mb" }));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
app.use("/storage", express.static(path.resolve(process.cwd(), "..", "storage")));
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", _req.method === "GET" ? "private, max-age=15, stale-while-revalidate=45" : "no-store");
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "NPFC Logistics SaaS API" });
});

app.post("/api/auth/login", validate(authLoginSchema), login);

const api = express.Router();

api.use(requireAuth);
api.get("/dashboard", dashboard);
api.get("/backups", requireRole("Admin"), backupStatus);
api.post("/backups/run", requireRole("Admin"), runBackupNow);

api.get("/settings", requireRole("Admin"), getSettings);
api.patch("/settings", requireRole("Admin"), updateSettings);
api.get("/settings/company", requireRole(...roleMatrix.readOnly), getCompanySettings);
api.patch("/settings/company", requireRole("Admin"), updateCompanySettings);
api.get("/settings/permissions", requireRole("Admin"), getPermissions);
api.patch("/settings/permissions", requireRole("Admin"), updatePermissions);
api.post("/settings/backups/run", requireRole("Admin"), createSettingsBackup);

api.get("/users", requireRole("Admin"), listUsers);
api.post("/users", requireRole("Admin"), validate(userCreateSchema), createUser);

api.get("/companies", requireRole(...roleMatrix.readOnly), listCompanies);
api.post("/companies", requireWriteAccess("Operations"), validate(companySchema), createCompany);
api.patch("/companies/:id", requireWriteAccess("Operations"), validate(companyUpdateSchema), updateCompany);
api.delete("/companies/:id", requireWriteAccess("Operations"), deleteCompany);
api.get("/customers", requireRole(...roleMatrix.readOnly), listCustomersCompat);

api.get("/drivers", requireRole(...roleMatrix.readOnly), listDrivers);
api.post("/drivers", requireWriteAccess("Operations"), validate(driverSchema), createDriver);
api.patch("/drivers/:id", requireWriteAccess("Operations"), validate(driverUpdateSchema), updateDriver);
api.delete("/drivers/:id", requireWriteAccess("Operations"), deleteDriver);

api.get("/vehicles", requireRole(...roleMatrix.readOnly), listVehicles);
api.post("/vehicles", requireWriteAccess("Operations"), validate(vehicleSchema), createVehicle);
api.patch("/vehicles/:id", requireWriteAccess("Operations"), validate(vehicleUpdateSchema), updateVehicle);
api.delete("/vehicles/:id", requireWriteAccess("Operations"), deleteVehicle);

api.get("/trips", requireRole(...roleMatrix.readOnly), listTrips);
api.post("/trips", requireWriteAccess("Operations"), validate(tripSchema), createTrip);
api.patch("/trips/:id", requireWriteAccess("Operations"), validate(tripUpdateSchema), updateTrip);
api.delete("/trips/:id", requireWriteAccess("Operations"), deleteTrip);
api.post("/trips/:id/status-message", requireWriteAccess("Operations", "Accountant"), validate(statusUpdateSchema), sendTripStatusUpdate);
api.get("/routes", requireRole(...roleMatrix.readOnly), listRoutes);

api.get("/attendance", requireRole(...roleMatrix.readOnly), listAttendance);
api.post("/attendance", requireWriteAccess("Operations"), validate(attendanceSchema), upsertAttendance);
api.patch("/attendance/:id", requireWriteAccess("Operations"), validate(attendanceUpdateSchema), updateAttendance);
api.delete("/attendance/:id", requireWriteAccess("Operations"), deleteAttendance);

api.get("/invoices", requireRole(...roleMatrix.readOnly), listInvoices);
api.post("/invoices/generate", requireWriteAccess("Operations", "Accountant"), validate(invoiceGenerateSchema), generateInvoice);
api.patch("/invoices/:id", requireWriteAccess("Accountant"), validate(invoiceUpdateSchema), updateInvoice);
api.post("/invoices/:id/regenerate", requireWriteAccess("Accountant"), regenerateInvoice);
api.delete("/invoices/:id", requireWriteAccess("Accountant"), deleteInvoice);

api.get("/payments", requireRole(...roleMatrix.readOnly), listPayments);
api.get("/payments/export", requireRole(...roleMatrix.readOnly), exportPayments);
api.post("/payments", requireWriteAccess("Accountant"), validate(paymentSchema), createPayment);
api.patch("/payments/:id", requireWriteAccess("Accountant"), validate(paymentUpdateSchema), updatePayment);
api.delete("/payments/:id", requireRole("Admin"), deletePayment);

api.get("/expenses", requireRole(...roleMatrix.readOnly), listExpenses);
api.get("/expenses/dashboard", requireRole(...roleMatrix.readOnly), getExpenseDashboard);
api.get("/expenses/export", requireRole(...roleMatrix.readOnly), exportExpenses);
api.post("/expenses", requireWriteAccess("Operations", "Accountant"), validate(expenseSchema), createExpense);
api.patch("/expenses/:id", requireWriteAccess("Operations", "Accountant"), validate(expenseUpdateSchema), updateExpense);
api.delete("/expenses/:id", requireWriteAccess("Operations", "Accountant"), deleteExpense);

api.get("/maintenance", requireRole(...roleMatrix.readOnly), listMaintenance);
api.get("/maintenance/dashboard", requireRole(...roleMatrix.readOnly), getMaintenanceDashboard);
api.get("/maintenance/export", requireRole(...roleMatrix.readOnly), exportMaintenance);
api.get("/maintenance/:id", requireRole(...roleMatrix.readOnly), getMaintenanceRecord);
api.post("/maintenance", requireWriteAccess("Operations", "Accountant"), createMaintenance);
api.patch("/maintenance/:id", requireWriteAccess("Operations", "Accountant"), updateMaintenance);
api.delete("/maintenance/:id", requireWriteAccess("Operations", "Accountant"), deleteMaintenance);
api.post("/maintenance/tyres", requireWriteAccess("Operations", "Accountant"), createTyre);
api.post("/maintenance/accidents", requireWriteAccess("Operations", "Accountant"), createAccident);

api.get("/bilties", requireRole(...roleMatrix.readOnly), listBilties);
api.get("/bilties/download", requireRole(...roleMatrix.readOnly), downloadBiltyFile);
api.post("/bilties", requireWriteAccess("Operations", "Accountant"), upload.array("files", 10), createBilty);
api.patch("/bilties/:id", requireWriteAccess("Operations", "Accountant"), upload.array("files", 10), updateBilty);
api.patch("/bilties/:id/verify", requireWriteAccess("Operations", "Accountant"), verifyBilty);
api.delete("/bilties/:id", requireRole("Admin"), deleteBilty);

api.get("/documents", requireRole(...roleMatrix.readOnly), listDocuments);
api.get("/documents/report", requireRole(...roleMatrix.readOnly), documentReport);

api.get("/profit-loss/kpis", requireRole(...roleMatrix.readOnly), getProfitLossKpis);
api.get("/profit-loss/trips", requireRole(...roleMatrix.readOnly), getProfitLossTrips);
api.get("/profit-loss/vehicles", requireRole(...roleMatrix.readOnly), getProfitLossVehicles);
api.get("/profit-loss/customers", requireRole(...roleMatrix.readOnly), getProfitLossCustomers);
api.get("/profit-loss/drivers", requireRole(...roleMatrix.readOnly), getProfitLossDrivers);
api.get("/profit-loss/expenses", requireRole(...roleMatrix.readOnly), getProfitLossExpenses);
api.get("/profit-loss/revenue", requireRole(...roleMatrix.readOnly), getProfitLossRevenue);
api.get("/profit-loss/cashflow", requireRole(...roleMatrix.readOnly), getProfitLossCashflow);
api.get("/profit-loss/receivables", requireRole(...roleMatrix.readOnly), getProfitLossReceivables);
api.post("/profit-loss/generate-statement", requireRole(...roleMatrix.readOnly), generateProfitLossStatementController);
api.get("/profit-loss/export/pdf", requireRole(...roleMatrix.readOnly), exportProfitLossPdf);
api.get("/profit-loss/export/excel", requireRole(...roleMatrix.readOnly), exportProfitLossExcel);

api.get("/reports/dashboard", requireRole(...roleMatrix.readOnly), getReportsDashboard);
api.get("/reports/financial", requireRole(...roleMatrix.readOnly), getFinancialReports);
api.get("/reports/trips", requireRole(...roleMatrix.readOnly), getTripReports);
api.get("/reports/vehicles", requireRole(...roleMatrix.readOnly), getVehicleReports);
api.get("/reports/drivers", requireRole(...roleMatrix.readOnly), getDriverReports);
api.get("/reports/maintenance", requireRole(...roleMatrix.readOnly), getMaintenanceReports);
api.get("/reports/bilty", requireRole(...roleMatrix.readOnly), getBiltyReports);
api.get("/reports/compliance", requireRole(...roleMatrix.readOnly), getComplianceReports);
api.post("/reports/export/pdf", requireRole(...roleMatrix.readOnly), exportReportPdf);
api.post("/reports/export/excel", requireRole(...roleMatrix.readOnly), exportReportExcel);
api.post("/reports/schedule", requireWriteAccess("Accountant"), scheduleReport);

api.post("/uploads/:entity/:id", requireWriteAccess("Operations", "Accountant"), upload.single("file"), uploadDocument);
api.get("/uploads/preview", requireRole(...roleMatrix.readOnly), previewDocument);
api.delete("/uploads", requireWriteAccess("Operations", "Accountant"), deleteDocument);

app.use("/api", api);
app.use((_req, _res, next) => next(notFound()));
app.use(errorHandler);

connectDatabase()
  .then(async () => {
    await bootstrapDefaultAdmin();
    scheduleBackups();
    app.listen(env.port, () => {
      console.log(`NPFC Logistics SaaS API running on http://localhost:${env.port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start API:", error);
    process.exit(1);
  });
