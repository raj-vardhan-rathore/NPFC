import type { Vehicle } from "../types";
import { apiRequest } from "./client";

export type VehiclePayload = {
  vehicleNumber: string;
  rcNumber: string;
  type?: string;
  insuranceExpiry: string;
  fitnessExpiry: string;
  permitExpiry: string;
  pucExpiry?: string;
  ownerName: string;
};

export const listVehicles = (token?: string) => apiRequest<Vehicle[]>("/api/vehicles", { token });
export const createVehicle = (token: string | undefined, body: VehiclePayload) => apiRequest("/api/vehicles", { token, method: "POST", body: JSON.stringify(body) });
export const updateVehicle = (token: string | undefined, id: string, body: Partial<VehiclePayload>) => apiRequest(`/api/vehicles/${id}`, { token, method: "PATCH", body: JSON.stringify(body) });
export const deleteVehicle = (token: string | undefined, id: string) => apiRequest<void>(`/api/vehicles/${id}`, { token, method: "DELETE" });

