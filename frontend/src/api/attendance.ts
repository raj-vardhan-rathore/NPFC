import { apiRequest } from "./client";

export type AttendanceStatus = "Present" | "Absent";

export type AttendanceEntry = {
  id: string;
  driverId: string;
  driverName?: string;
  date: string;
  status: AttendanceStatus;
  remarks?: string;
};

export type AttendancePayload = {
  driverId: string;
  date: string;
  status: AttendanceStatus;
  remarks?: string;
};

const query = (filters?: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
};

export const listAttendance = (token?: string, filters?: Record<string, string | undefined>) => apiRequest<AttendanceEntry[]>(`/api/attendance${query(filters) ? `?${query(filters)}` : ""}`, { token });
export const saveAttendance = (token: string | undefined, body: AttendancePayload) => apiRequest<AttendanceEntry>("/api/attendance", { token, method: "POST", body: JSON.stringify(body) });
export const updateAttendance = (token: string | undefined, id: string, body: Partial<AttendancePayload>) => apiRequest<AttendanceEntry>(`/api/attendance/${id}`, { token, method: "PATCH", body: JSON.stringify(body) });
export const deleteAttendance = (token: string | undefined, id: string) => apiRequest<void>(`/api/attendance/${id}`, { token, method: "DELETE" });
