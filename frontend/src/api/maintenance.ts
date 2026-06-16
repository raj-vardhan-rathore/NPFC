import { apiRequest } from "./client";

export type MaintenanceStatus = "Scheduled" | "In Progress" | "Completed" | "Cancelled";

export type MaintenanceRecord = {
  id: string;
  jobCardNumber: string;
  vehicleId: string;
  vehicleNumber: string;
  vehicleType: string;
  maintenanceType: string;
  serviceCategory: string;
  maintenanceDate: string;
  garageName: string;
  mechanicName: string;
  contactNumber: string;
  odometerReading: number;
  labourCost: number;
  partsCost: number;
  otherCharges: number;
  totalCost: number;
  description: string;
  remarks: string;
  status: MaintenanceStatus;
  nextServiceDate: string;
  nextServiceKM: number;
  scheduleEveryMonths: number;
  scheduleEveryKM: number;
  dueStatus: "Upcoming" | "Due Soon" | "Overdue";
  documents: Array<{ type: string; url: string; key: string; fileName?: string; uploadedAt?: string }>;
  expenseId?: string;
};

export type TyreRecord = {
  id: string;
  vehicleId: string;
  vehicleNumber: string;
  tyreNumber: string;
  tyreBrand: string;
  tyrePosition: string;
  installDate: string;
  cost: number;
  currentKM: number;
  replacementDate: string;
  status: string;
};

export type AccidentRecord = {
  id: string;
  accidentDate: string;
  vehicleId: string;
  vehicleNumber: string;
  driverId: string;
  driverName: string;
  location: string;
  description: string;
  damageCost: number;
  insuranceClaimAmount: number;
  repairCost: number;
  claimStatus: "Pending" | "Approved" | "Rejected" | "Settled";
};

export type MaintenanceDashboard = {
  kpis: {
    totalMaintenanceCost: number;
    thisMonthCost: number;
    vehiclesUnderMaintenance: number;
    dueServices: number;
    overdueServices: number;
    completedServices: number;
    activeRepairs: number;
    totalGarageExpenses: number;
  };
  records: MaintenanceRecord[];
  reminders: Array<{ type: string; vehicleNumber: string; message: string; date: string }>;
  analytics: {
    maintenanceType: Array<{ name: string; amount: number }>;
    garageExpenses: Array<{ name: string; amount: number }>;
    monthlyCost: Array<{ name: string; amount: number }>;
  };
  tyres: TyreRecord[];
  accidents: AccidentRecord[];
  types: string[];
};

export type MaintenancePayload = {
  jobCardNumber?: string;
  vehicleId: string;
  maintenanceType: string;
  serviceCategory: string;
  maintenanceDate: string;
  garageName: string;
  mechanicName?: string;
  contactNumber?: string;
  odometerReading?: number;
  labourCost?: number;
  partsCost?: number;
  otherCharges?: number;
  description?: string;
  remarks?: string;
  status: MaintenanceStatus;
  nextServiceDate?: string;
  nextServiceKM?: number;
  scheduleEveryMonths?: number;
  scheduleEveryKM?: number;
};

export const getMaintenanceDashboard = (token: string | undefined, filters: Record<string, string>) => {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value && value !== "All"));
  return apiRequest<MaintenanceDashboard>(`/api/maintenance/dashboard?${params.toString()}`, { token });
};

export const getMaintenanceRecord = (token: string | undefined, id: string) => apiRequest<MaintenanceRecord & { serviceHistory: MaintenanceRecord[]; accidentLinks: AccidentRecord[]; expenseEntry: unknown; profitImpact: { expense: number; netProfitReduction: number } }>(`/api/maintenance/${id}`, { token });
export const createMaintenance = (token: string | undefined, body: MaintenancePayload) => apiRequest<MaintenanceRecord>("/api/maintenance", { token, method: "POST", body: JSON.stringify(body) });
export const updateMaintenance = (token: string | undefined, id: string, body: Partial<MaintenancePayload>) => apiRequest<MaintenanceRecord>(`/api/maintenance/${id}`, { token, method: "PATCH", body: JSON.stringify(body) });
export const deleteMaintenance = (token: string | undefined, id: string) => apiRequest<void>(`/api/maintenance/${id}`, { token, method: "DELETE" });
export const createTyre = (token: string | undefined, body: Omit<TyreRecord, "id" | "vehicleNumber">) => apiRequest<TyreRecord>("/api/maintenance/tyres", { token, method: "POST", body: JSON.stringify(body) });
export const createAccident = (token: string | undefined, body: Omit<AccidentRecord, "id" | "vehicleNumber" | "driverName">) => apiRequest<AccidentRecord>("/api/maintenance/accidents", { token, method: "POST", body: JSON.stringify(body) });
export const maintenanceExportUrl = (format: "excel" | "pdf", filters: Record<string, string>) => `/api/maintenance/export?${new URLSearchParams({ ...filters, format }).toString()}`;
