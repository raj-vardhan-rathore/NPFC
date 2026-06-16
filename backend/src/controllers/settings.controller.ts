import { runMongoBackup } from "../services/backup.service.js";
import { SettingsService } from "../services/settings.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getSettings = asyncHandler(async (_req, res) => {
  res.json(await SettingsService.getSettings());
});

export const updateSettings = asyncHandler(async (req, res) => {
  res.json(await SettingsService.updateSettings(req.body, req.user?.name || req.user?.email || "System"));
});

export const getCompanySettings = asyncHandler(async (_req, res) => {
  res.json(await SettingsService.getCompanySettings());
});

export const updateCompanySettings = asyncHandler(async (req, res) => {
  res.json(await SettingsService.updateCompanySettings(req.body, req.user?.name || req.user?.email || "System"));
});

export const getPermissions = asyncHandler(async (_req, res) => {
  res.json(await SettingsService.getPermissions());
});

export const updatePermissions = asyncHandler(async (req, res) => {
  res.json(await SettingsService.updatePermissions(req.body, req.user?.name || req.user?.email || "System"));
});

export const createSettingsBackup = asyncHandler(async (_req, res) => {
  const result = await runMongoBackup();
  await SettingsService.recordBackup({ status: result.skipped ? "Skipped" : "Completed", strategy: "Manual Backup", details: result });
  res.status(202).json(await SettingsService.getSettings());
});
