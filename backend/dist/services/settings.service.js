import { env, hasS3 } from "../config/env.js";
import { isDatabaseConnected } from "../config/database.js";
import { UserModel } from "../models/User.js";
import { SettingsModel } from "../models/Settings.js";
const modules = ["Dashboard", "Trips", "Vehicles", "Drivers", "Customers", "Invoices", "Payments", "Expenses", "Profit & Loss", "Maintenance", "Bilty", "Documents", "Reports", "Settings"];
const permissions = ["View", "Create", "Edit", "Delete", "Export", "Print", "Approve", "Manage"];
const enterpriseRoles = ["Super Admin", "Admin", "Accountant", "Operations Manager", "Fleet Manager", "Driver Manager", "Viewer"];
export const defaultSettings = {
    companySettings: {
        companyLogo: "",
        companyName: "NPFC Logistics",
        legalBusinessName: "NPFC Logistics",
        addressLine1: "Khasra No. 353",
        addressLine2: "Lajogi Nagar, Pahadia",
        city: "Indore",
        state: "Madhya Pradesh",
        country: "India",
        pincode: "452020",
        gstNumber: "23AABCN2000P1Z4",
        panNumber: "AABCN2000P",
        phoneNumber: "0731-XXXXXXX",
        alternatePhone: "",
        emailAddress: "operations@npfc.in",
        website: "",
        bankName: "HDFC Bank Ltd.",
        accountHolderName: "NPFC Logistics",
        accountNumber: "502000XXXXXXX",
        ifscCode: "HDFC0001234",
        upiId: "",
        authorizedSignatoryName: "Authorized Signatory",
        designation: "Accounts",
        digitalSignature: "",
        companyStamp: ""
    },
    userSettings: { passwordPolicy: "Minimum 8 characters", sessionTimeoutMinutes: 480, requireMfa: false },
    rolePermissions: Object.fromEntries(enterpriseRoles.map((role) => [
        role,
        Object.fromEntries(modules.map((module) => [module, Object.fromEntries(permissions.map((permission) => [permission, ["Super Admin", "Admin"].includes(role) || (role === "Viewer" ? permission === "View" : ["View", "Create", "Edit", "Export", "Print"].includes(permission))]))]))
    ])),
    notificationSettings: {
        dashboardNotifications: true,
        emailNotifications: true,
        systemAlerts: true,
        alertTypes: ["Insurance Expiry", "Permit Expiry", "Fitness Expiry", "License Expiry", "Service Due", "Service Overdue", "Missing Bilty", "Outstanding Payments", "Overdue Invoices"]
    },
    invoiceSettings: { invoiceNumberFormat: "INV-{YYYY}-{####}", gstEnabled: true, taxPercentage: 18, invoiceFooter: "Thank you for giving us the opportunity to serve you!", termsAndConditions: "Payment due as per agreed terms.", authorizedSignature: true, defaultPaymentTerms: "7 Days" },
    tripSettings: { tripNumberFormat: "TRIP-{YYYY}-{####}", tripStatuses: ["Trip Created", "Vehicle Assigned", "Loading Started", "Loaded", "In Transit", "Reached Destination", "Unloading Started", "Delivered", "Invoice Generated", "Payment Received"], defaultTripTypes: ["Full Truck Load", "Part Load", "Return Load"], tripApprovalWorkflow: true },
    vehicleSettings: { vehicleCategories: ["Truck", "Trailer", "Container", "Pickup"], fuelTypes: ["Diesel", "Petrol", "CNG"], vehicleStatuses: ["Active", "Inactive", "Under Maintenance", "Sold"] },
    driverSettings: { requiredDocuments: ["License", "Aadhaar", "PAN", "Medical Certificate"], licenseExpiryReminderDays: 30, documentExpiryReminderDays: 30 },
    biltySettings: { biltyNumberFormat: "BLTY-{YYYY}-{####}", verificationWorkflow: true, mandatoryBiltyUpload: true, missingBiltyAlerts: true },
    maintenanceSettings: { defaultServiceIntervals: ["Oil Change", "Tyre Replacement", "Battery Replacement", "Brake Service"], reminderRules: ["Date Based", "KM Based"] },
    expenseSettings: { categories: ["Diesel", "Toll", "Maintenance", "Insurance", "Permit", "Salary", "Office Expense", "Miscellaneous"], allowCustomCategories: true },
    documentSettings: { requiredVehicleDocuments: ["RC", "Insurance", "Permit", "Fitness", "Pollution"], requiredDriverDocuments: ["License", "Aadhaar", "PAN", "Medical"], expiryAlertDays: [7, 15, 30, 60, 90] },
    financialSettings: { currency: "INR", defaultTaxSettings: "GST 18%", profitCalculationRules: "Revenue minus trip, vehicle, driver, and office expenses", expenseCategories: ["Diesel", "Toll", "Maintenance", "Office Expense"], revenueCategories: ["Freight", "Detention", "Loading", "Other"], paymentTerms: ["7 Days", "15 Days", "30 Days"] },
    systemSettings: { theme: "Dark Mode", dateFormat: "dd/MM/yyyy", currencyFormat: "en-IN INR", timeZone: "Asia/Kolkata", language: "English", erpBranding: "NPFC Logistics ERP", erpVersion: "1.0.0" },
    storageSettings: { awsS3Configuration: hasS3 ? "Configured" : "Not Configured", bucketName: env.awsBucketName, storageUsage: "Calculated by S3 provider", documentRetentionRules: "7 Years", supportedFormats: ["PDF", "JPG", "PNG", "XLSX", "DOCX"] },
    apiConfiguration: { awsConfiguration: hasS3 ? "Enabled" : "Pending", emailServiceConfiguration: "Pending", futureWhatsAppApiSettings: "Reserved", futureSmsSettings: "Reserved" },
    auditLogs: [],
    backupHistory: []
};
let memorySettings = { ...defaultSettings };
export class SettingsService {
    static async getSettings() {
        const settings = await readSettings();
        const [activeUsers, totalUsers] = await userCounts();
        return {
            ...settings,
            dashboard: {
                companyProfileStatus: profileStatus(settings.companySettings),
                activeUsers,
                activeRoles: Object.keys(settings.rolePermissions || {}).length,
                notificationRules: settings.notificationSettings?.alertTypes?.length || 0,
                backupStatus: settings.backupHistory?.[0]?.status || "Ready",
                erpVersion: settings.systemSettings?.erpVersion || "1.0.0",
                lastBackupDate: settings.backupHistory?.[0]?.date || "No backup recorded",
                securityStatus: totalUsers > 0 ? "Protected" : "Needs admin user"
            }
        };
    }
    static async updateSettings(patch, user = "System") {
        const current = await readSettings();
        const next = mergeSettings(current, patch);
        next.auditLogs = [{ user, action: "Settings Updated", module: "Settings", date: new Date().toISOString(), ipAddress: "system" }, ...(next.auditLogs || [])].slice(0, 200);
        await writeSettings(next);
        return this.getSettings();
    }
    static async getCompanySettings() {
        return (await readSettings()).companySettings;
    }
    static async updateCompanySettings(patch, user = "System") {
        return this.updateSettings({ companySettings: patch }, user);
    }
    static async getPermissions() {
        return (await readSettings()).rolePermissions;
    }
    static async updatePermissions(rolePermissions, user = "System") {
        return this.updateSettings({ rolePermissions }, user);
    }
    static async recordBackup(entry) {
        const current = await readSettings();
        current.backupHistory = [{ date: new Date().toISOString(), ...entry }, ...(current.backupHistory || [])].slice(0, 50);
        await writeSettings(current);
    }
}
export class CompanySettingsService {
    static async getCompanySettings() {
        return SettingsService.getCompanySettings();
    }
    static formatAddress(company) {
        return [company.addressLine1, company.addressLine2, company.city, company.state, company.country, company.pincode].filter(Boolean).join(", ");
    }
}
export class RoleService {
    static async getPermissions() {
        return SettingsService.getPermissions();
    }
}
export class NotificationService {
    static async getSettings() {
        return (await SettingsService.getSettings()).notificationSettings;
    }
}
export class AuditService {
    static async log(entry) {
        const current = await readSettings();
        current.auditLogs = [{ date: new Date().toISOString(), ...entry }, ...(current.auditLogs || [])].slice(0, 200);
        await writeSettings(current);
    }
}
async function readSettings() {
    if (!isDatabaseConnected())
        return memorySettings;
    const record = await SettingsModel.findOneAndUpdate({ key: "global" }, { $setOnInsert: { key: "global", ...defaultSettings } }, { upsert: true, new: true, lean: true });
    const { _id, key, createdAt, updatedAt, ...payload } = record;
    return mergeSettings(defaultSettings, payload);
}
async function writeSettings(settings) {
    memorySettings = mergeSettings(defaultSettings, settings);
    if (!isDatabaseConnected())
        return;
    await SettingsModel.findOneAndUpdate({ key: "global" }, { $set: memorySettings }, { upsert: true, new: true });
}
function mergeSettings(base, patch) {
    if (Array.isArray(base) || Array.isArray(patch))
        return patch ?? base;
    if (!isPlain(base) || !isPlain(patch))
        return patch ?? base;
    const merged = { ...base };
    for (const [key, value] of Object.entries(patch))
        merged[key] = mergeSettings(base[key], value);
    return merged;
}
function isPlain(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
async function userCounts() {
    if (!isDatabaseConnected())
        return [0, 0];
    const total = await UserModel.countDocuments();
    return [total, total];
}
function profileStatus(company) {
    const required = ["companyName", "legalBusinessName", "addressLine1", "city", "state", "gstNumber", "panNumber", "phoneNumber", "emailAddress", "bankName", "accountNumber", "ifscCode", "authorizedSignatoryName"];
    const completed = required.filter((key) => String(company?.[key] || "").trim()).length;
    return `${Math.round((completed / required.length) * 100)}% Complete`;
}
