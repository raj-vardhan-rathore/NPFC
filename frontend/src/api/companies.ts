import type { Customer } from "../types";
import { apiRequest } from "./client";

export type CompanyPayload = {
  companyName: string;
  gstNumber: string;
  address: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  locations?: Customer["locations"];
};

export const listCompanies = (token?: string) => apiRequest<Customer[]>("/api/customers", { token });
export const createCompany = (token: string | undefined, body: CompanyPayload) => apiRequest("/api/companies", { token, method: "POST", body: JSON.stringify(body) });
export const updateCompany = (token: string | undefined, id: string, body: Partial<CompanyPayload>) => apiRequest(`/api/companies/${id}`, { token, method: "PATCH", body: JSON.stringify(body) });
export const deleteCompany = (token: string | undefined, id: string) => apiRequest<void>(`/api/companies/${id}`, { token, method: "DELETE" });
