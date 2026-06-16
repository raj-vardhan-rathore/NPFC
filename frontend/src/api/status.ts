import { apiRequest } from "./client";

export const sendStatusUpdate = (token: string | undefined, tripId: string, status: string) => (
  apiRequest<{ ok: boolean; message: string }>(`/api/trips/${tripId}/status-message`, {
    token,
    method: "POST",
    body: JSON.stringify({ status })
  })
);
