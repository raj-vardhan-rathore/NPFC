import { Schema, model } from "mongoose";
const mixed = Schema.Types.Mixed;
const settingsSchema = new Schema({
    key: { type: String, required: true, unique: true, index: true },
    companySettings: { type: mixed, default: {} },
    userSettings: { type: mixed, default: {} },
    rolePermissions: { type: mixed, default: {} },
    notificationSettings: { type: mixed, default: {} },
    invoiceSettings: { type: mixed, default: {} },
    tripSettings: { type: mixed, default: {} },
    vehicleSettings: { type: mixed, default: {} },
    driverSettings: { type: mixed, default: {} },
    biltySettings: { type: mixed, default: {} },
    maintenanceSettings: { type: mixed, default: {} },
    expenseSettings: { type: mixed, default: {} },
    documentSettings: { type: mixed, default: {} },
    financialSettings: { type: mixed, default: {} },
    systemSettings: { type: mixed, default: {} },
    storageSettings: { type: mixed, default: {} },
    apiConfiguration: { type: mixed, default: {} },
    auditLogs: { type: [mixed], default: [] },
    backupHistory: { type: [mixed], default: [] }
}, { timestamps: true, versionKey: false });
export const SettingsModel = model("Settings", settingsSchema);
