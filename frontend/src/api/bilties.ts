import { apiRequest } from "./client";
import type { Bilty } from "../types";

export type BiltyPayload = {
  biltyNumber: string;
  tripId: string;
  biltyDate?: string;
  remarks?: string;
  verificationStatus?: string;
  files?: File[];
};

export const getBilties = (token: string | undefined) => apiRequest<Bilty[]>("/api/bilties", { token });

export const createBilty = (token: string | undefined, payload: BiltyPayload) => {
  const form = biltyForm(payload);
  return apiRequest<Bilty>("/api/bilties", { token, method: "POST", body: form });
};

export const updateBilty = (token: string | undefined, id: string, payload: BiltyPayload) => {
  const form = biltyForm(payload);
  return apiRequest<Bilty>(`/api/bilties/${id}`, { token, method: "PATCH", body: form });
};

export const verifyBilty = (token: string | undefined, id: string) => apiRequest<Bilty>(`/api/bilties/${id}/verify`, { token, method: "PATCH" });

export const deleteBilty = (token: string | undefined, id: string) => apiRequest<void>(`/api/bilties/${id}`, { token, method: "DELETE" });

export const downloadBilty = (token: string | undefined, key: string, filename?: string) => {
  const params = new URLSearchParams({ key });
  if (filename) params.set("filename", filename);
  return apiRequest<{ url: string }>(`/api/bilties/download?${params.toString()}`, { token });
};

function biltyForm(payload: BiltyPayload) {
  const form = new FormData();
  form.append("biltyNumber", payload.biltyNumber);
  form.append("tripId", payload.tripId);
  if (payload.biltyDate) form.append("biltyDate", payload.biltyDate);
  if (payload.remarks) form.append("remarks", payload.remarks);
  if (payload.verificationStatus) form.append("verificationStatus", payload.verificationStatus);
  for (const file of payload.files || []) form.append("files", file);
  return form;
}
