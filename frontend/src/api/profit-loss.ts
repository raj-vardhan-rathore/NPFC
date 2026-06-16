import { apiRequest, getApiBaseUrl } from "./client";

export type ProfitLossFilters = Record<string, string | number | undefined>;

export type ProfitLossKpiCard = {
  key: string;
  label: string;
  amount: number;
  growth: number;
  trend: "up" | "down";
  suffix?: string;
};

export type ProfitLossKpis = {
  cards: ProfitLossKpiCard[];
  totals: Record<string, number>;
  leaders: Record<string, any>;
  period: { from: string; to: string };
};

export type ProfitTripRow = {
  id: string;
  tripNumber: string;
  date: string;
  customer: string;
  vehicleNumber: string;
  driver: string;
  route: string;
  revenue: number;
  expense: number;
  profit: number;
  profitPercent: number;
  status: string;
  revenueBreakdown: Array<{ name: string; amount: number }>;
  expenseBreakdown: Array<{ name: string; amount: number }>;
  paymentHistory: Array<Record<string, any>>;
  documents: Array<Record<string, any>>;
  auditLogs: Array<Record<string, any>>;
};

const query = (filters?: ProfitLossFilters) => {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== "All") params.set(key, String(value));
  });
  return params.toString();
};

const path = (endpoint: string, filters?: ProfitLossFilters) => `/api/profit-loss/${endpoint}${query(filters) ? `?${query(filters)}` : ""}`;

export const getProfitLossKpis = (token?: string, filters?: ProfitLossFilters) => apiRequest<ProfitLossKpis>(path("kpis", filters), { token });
export const getProfitLossTrips = (token?: string, filters?: ProfitLossFilters) => apiRequest<ProfitTripRow[]>(path("trips", filters), { token });
export const getProfitLossVehicles = (token?: string, filters?: ProfitLossFilters) => apiRequest<any[]>(path("vehicles", filters), { token });
export const getProfitLossCustomers = (token?: string, filters?: ProfitLossFilters) => apiRequest<any[]>(path("customers", filters), { token });
export const getProfitLossDrivers = (token?: string, filters?: ProfitLossFilters) => apiRequest<any[]>(path("drivers", filters), { token });
export const getProfitLossExpenses = (token?: string, filters?: ProfitLossFilters) => apiRequest<any>(path("expenses", filters), { token });
export const getProfitLossRevenue = (token?: string, filters?: ProfitLossFilters) => apiRequest<any>(path("revenue", filters), { token });
export const getProfitLossCashflow = (token?: string, filters?: ProfitLossFilters) => apiRequest<any>(path("cashflow", filters), { token });
export const getProfitLossReceivables = (token?: string, filters?: ProfitLossFilters) => apiRequest<any>(path("receivables", filters), { token });
export const generateProfitLossStatement = (token: string | undefined, body: ProfitLossFilters & { reportType: string }) => apiRequest<any>("/api/profit-loss/generate-statement", { token, method: "POST", body: JSON.stringify(body) });
export const profitLossExportUrl = (filters: ProfitLossFilters, format: "pdf" | "excel") => `${getApiBaseUrl()}/api/profit-loss/export/${format}?${query(filters)}`;
