import { apiRequest, getApiBaseUrl } from "./client";

export type ReportCategory = "financial" | "trips" | "vehicles" | "drivers" | "maintenance" | "bilty" | "compliance";
export type ReportFilters = Record<string, string | number | undefined>;

export type ReportDefinition = {
  name: string;
  columns: string[];
  rows: Array<Record<string, any>>;
  totalRows: number;
};

export type ReportPayload = {
  category: ReportCategory;
  reports: ReportDefinition[];
  summaryCards: Array<{ label: string; value?: number; amount?: number; suffix?: string }>;
  charts: Record<string, any>;
};

export type ReportsDashboard = {
  kpis: Record<string, number>;
  charts: Record<string, any>;
  period: { from: string; to: string };
};

const query = (filters?: ReportFilters) => {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== "All") params.set(key, String(value));
  });
  return params.toString();
};

const withQuery = (path: string, filters?: ReportFilters) => {
  const params = query(filters);
  return params ? `${path}?${params}` : path;
};

export const getReportsDashboard = (token?: string, filters?: ReportFilters) =>
  apiRequest<ReportsDashboard>(withQuery("/api/reports/dashboard", filters), { token });

export const getReportCategory = (token: string | undefined, category: ReportCategory, filters?: ReportFilters) =>
  apiRequest<ReportPayload>(withQuery(`/api/reports/${category}`, filters), { token });

export async function exportReport(token: string | undefined, category: ReportCategory, filters: ReportFilters, format: "pdf" | "excel") {
  const response = await fetch(`${getApiBaseUrl()}/api/reports/export/${format}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ category, filters })
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "Export failed.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `npfc-${category}-report.${format === "pdf" ? "pdf" : "xls"}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const scheduleReport = (token: string | undefined, body: Record<string, any>) =>
  apiRequest<any>("/api/reports/schedule", { token, method: "POST", body: JSON.stringify(body) });
