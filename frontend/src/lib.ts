import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { apiRequest } from "./api/client";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

export const api = async <T>(path: string, token?: string, init?: RequestInit): Promise<T> => {
  return apiRequest<T>(path, { token, ...init });
};
