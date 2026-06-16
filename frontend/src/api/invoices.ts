import type { Invoice } from "../types";
import { apiRequest } from "./client";

export type InvoiceUpdatePayload = {
  notes?: string;
  remarks?: string;
  additionalCharges?: number;
  sentStatus?: string;
  paymentStatus?: "Draft" | "Generated" | "Sent" | "Partially Paid" | "Paid" | "Cancelled";
};

export const listInvoices = (token?: string) => apiRequest<Invoice[]>("/api/invoices", { token });
export const generateInvoice = (token: string | undefined, tripId: string) => apiRequest<Invoice>("/api/invoices/generate", { token, method: "POST", body: JSON.stringify({ tripId }) });
export const updateInvoice = (token: string | undefined, id: string, body: InvoiceUpdatePayload) => apiRequest<Invoice>(`/api/invoices/${id}`, { token, method: "PATCH", body: JSON.stringify(body) });
export const regenerateInvoice = (token: string | undefined, id: string) => apiRequest<Invoice>(`/api/invoices/${id}/regenerate`, { token, method: "POST" });
export const deleteInvoice = (token: string | undefined, id: string) => apiRequest<void>(`/api/invoices/${id}`, { token, method: "DELETE" });
