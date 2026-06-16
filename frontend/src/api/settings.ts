import { apiRequest } from "./client";

export type SettingsPayload = Record<string, any> & {
  companySettings: Record<string, any>;
  rolePermissions: Record<string, Record<string, Record<string, boolean>>>;
  dashboard: Record<string, string | number>;
};

export function getSettings(token?: string) {
  return apiRequest<SettingsPayload>("/api/settings", { token });
}

export function updateSettings(token: string | undefined, payload: Record<string, unknown>) {
  return apiRequest<SettingsPayload>("/api/settings", { token, method: "PATCH", body: JSON.stringify(payload) });
}

export function runSettingsBackup(token?: string) {
  return apiRequest<SettingsPayload>("/api/settings/backups/run", { token, method: "POST" });
}
