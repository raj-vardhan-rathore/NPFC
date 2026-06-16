import { apiRequest } from "./client";

export type ExpensePayload = {
  expenseName: string;
  category: string;
  amount: number;
  expenseDate: string;
  status: "Paid" | "Unpaid" | "Partial";
  paidAmount?: number;
  notes?: string;
  attachmentUrl?: string;
  attachmentKey?: string;
  recurring?: boolean;
  recurrenceFrequency?: "Monthly" | "Quarterly" | "Yearly";
  recurringUntil?: string;
};

export type ExpenseDashboard = {
  kpis: {
    totalExpenses: number;
    fuelExpense: number;
    driverExpense: number;
    vehicleExpense: number;
    otherExpense: number;
    totalRevenue: number;
    netProfit: number;
  };
  summary: ExpenseSummaryRow[];
  rows: ExpenseRow[];
  analytics: {
    category: Array<{ name: string; amount: number }>;
    monthlyExpenseTrend: Array<{ name: string; amount: number }>;
    revenueVsExpense: Array<{ month: string; revenue: number; expenses: number; profit: number }>;
  };
  vehiclePerformance: Array<{ vehicleId: string; vehicleNumber: string; revenue: number; expense: number; profit: number }>;
  drilldowns: {
    fuel: {
      totalFuelCost: number;
      vehicleWise: Array<{ name: string; amount: number }>;
      tripWise: Array<{ name: string; amount: number }>;
      monthlyTrend: Array<{ name: string; amount: number }>;
    };
    maintenance: Array<{ vehicle: string; date: string; amount: number; description: string; linkedBill: string }>;
    driver: Array<{ driverId: string; driverName: string; salary: number; advance: number; total: number }>;
  };
};

export type ExpenseSummaryRow = {
  category: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  status: "Paid" | "Unpaid" | "Partial";
  source: string;
};

export type ExpenseRow = {
  id: string;
  category: string;
  expenseName: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  status: "Paid" | "Unpaid" | "Partial";
  source: "Trips" | "Vehicles" | "Drivers" | "Manual";
  date: string;
  vehicleId?: string;
  vehicleNumber?: string;
  driverId?: string;
  driverName?: string;
  companyId?: string;
  tripId?: string;
  tripNumber?: string;
  notes?: string;
  attachmentUrl?: string;
  attachmentKey?: string;
  recurring?: boolean;
  recurrenceFrequency?: string;
};

export const getExpenseDashboard = (token: string | undefined, filters: Record<string, string>) => {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value && value !== "All"));
  return apiRequest<ExpenseDashboard>(`/api/expenses/dashboard?${params.toString()}`, { token });
};

export const listExpenses = <T>(token?: string) => apiRequest<T>("/api/expenses", { token });
export const createExpense = (token: string | undefined, body: ExpensePayload) => apiRequest("/api/expenses", { token, method: "POST", body: JSON.stringify(body) });
export const updateExpense = (token: string | undefined, id: string, body: Partial<ExpensePayload>) => apiRequest(`/api/expenses/${id}`, { token, method: "PATCH", body: JSON.stringify(body) });
export const deleteExpense = (token: string | undefined, id: string) => apiRequest<void>(`/api/expenses/${id}`, { token, method: "DELETE" });
