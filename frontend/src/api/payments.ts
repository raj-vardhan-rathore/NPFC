import type { Payment } from "../types";
import { apiRequest } from "./client";

export type PaymentPayload = {
  direction?: "Incoming" | "Outgoing";
  category?: string;
  amount?: number;
  amountReceived?: number;
  paymentDate: string;
  partyType?: "Customer" | "Driver" | "Vendor" | "Employee" | "Other";
  partyName?: string;
  customerId?: string;
  driverId?: string;
  invoiceId?: string;
  allocations?: Array<{ invoiceId: string; amount: number }>;
  tripId?: string;
  vehicleId?: string;
  expenseId?: string;
  mode?: "Cash" | "UPI" | "IMPS" | "NEFT" | "RTGS" | "Cheque" | "Bank Transfer" | "Other";
  referenceNumber?: string;
  status?: "Recorded" | "Pending" | "Cancelled" | "Reconciled";
  remarks?: string;
  notes?: string;
  proof?: { url?: string; key?: string; fileName?: string; contentType?: string };
};

export type PaymentFilters = Record<string, string | number | undefined>;

const query = (filters?: PaymentFilters) => {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== "All") params.set(key, String(value));
  });
  return params.toString();
};

export const listPayments = (token?: string, filters?: PaymentFilters) => apiRequest<Payment[]>(`/api/payments${query(filters) ? `?${query(filters)}` : ""}`, { token });
export const createPayment = (token: string | undefined, body: PaymentPayload) => apiRequest("/api/payments", { token, method: "POST", body: JSON.stringify(body) });
export const updatePayment = (token: string | undefined, id: string, body: Partial<PaymentPayload>) => apiRequest(`/api/payments/${id}`, { token, method: "PATCH", body: JSON.stringify(body) });
export const deletePayment = (token: string | undefined, id: string) => apiRequest<void>(`/api/payments/${id}`, { token, method: "DELETE" });
export const exportPaymentsUrl = (filters: PaymentFilters, format: "csv" | "excel" | "pdf") => `/api/payments/export?${query({ ...filters, format })}`;
