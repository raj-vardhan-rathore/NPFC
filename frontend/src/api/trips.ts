import type { Trip } from "../types";
import { apiRequest } from "./client";

export type TripExpensePayload = {
  type: string;
  amount: number;
  receiptUrl?: string;
  receiptKey?: string;
  remarks?: string;
};

export type TripPayload = {
  tripId: string;
  companyId: string;
  vehicleId: string;
  driverId: string;
  source: string;
  destination: string;
  material?: string;
  weightMt?: number;
  ratePerMt?: number;
  freightAmount: number;
  loadingDate: string;
  deliveryDate?: string;
  status?: string;
  expenses?: TripExpensePayload[];
};

export const listTrips = (token?: string) => apiRequest<Trip[]>("/api/trips", { token });
export const listRoutes = <T>(token?: string) => apiRequest<T>("/api/routes", { token });
export const createTrip = (token: string | undefined, body: TripPayload) => apiRequest("/api/trips", { token, method: "POST", body: JSON.stringify(body) });
export const updateTrip = (token: string | undefined, id: string, body: Partial<TripPayload>) => apiRequest(`/api/trips/${id}`, { token, method: "PATCH", body: JSON.stringify(body) });
export const deleteTrip = (token: string | undefined, id: string, force = false) => apiRequest<void>(`/api/trips/${id}${force ? "?force=true" : ""}`, { token, method: "DELETE" });
