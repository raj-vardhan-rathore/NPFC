import type { Driver } from "../types";
import { apiRequest } from "./client";

export type DriverPayload = {
  name: string;
  phone: string;
  licenseNumber: string;
  licenseExpiry: string;
  aadhaarNumber?: string;
};

export const listDrivers = (token?: string) => apiRequest<Driver[]>("/api/drivers", { token });
export const createDriver = (token: string | undefined, body: DriverPayload) => apiRequest("/api/drivers", { token, method: "POST", body: JSON.stringify(body) });
export const updateDriver = (token: string | undefined, id: string, body: Partial<DriverPayload>) => apiRequest(`/api/drivers/${id}`, { token, method: "PATCH", body: JSON.stringify(body) });
export const deleteDriver = (token: string | undefined, id: string) => apiRequest<void>(`/api/drivers/${id}`, { token, method: "DELETE" });

