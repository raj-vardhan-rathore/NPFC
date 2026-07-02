export type ApiInit = RequestInit & { token?: string; retries?: number };

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
export const getApiBaseUrl = () => API_BASE_URL;

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const CACHE_TTL_MS = 60_000;
const cachedGet = new Map<string, { savedAt: number; value: unknown }>();
const cacheablePaths = [/^\/api\/dashboard$/, /^\/api\/vehicles/, /^\/api\/companies/, /^\/api\/drivers/, /^\/api\/settings$/];

export async function apiRequest<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { retries = 1 } = init;
  const method = (init.method || "GET").toUpperCase();
  const cacheKey = `${init.token || "anon"}:${path}`;

  if (method === "GET" && cacheablePaths.some((pattern) => pattern.test(path))) {
    const cached = cachedGet.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return cached.value as T;
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await send<T>(path, init);
      if (method === "GET" && cacheablePaths.some((pattern) => pattern.test(path))) {
        cachedGet.set(cacheKey, { savedAt: Date.now(), value: result });
      } else if (method !== "GET") {
        cachedGet.clear();
      }
      return result;
    } catch (error) {
      if (attempt >= retries || !(error instanceof ApiError) || !RETRY_STATUSES.has(error.status)) throw error;
      await delay(250 * (attempt + 1));
    }
  }

  throw new Error("Request failed.");
}

async function send<T>(path: string, init: ApiInit): Promise<T> {
  const { token, headers, body, retries: _retries, ...requestInit } = init;
  const isFormData = body instanceof FormData;
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...requestInit,
    body,
    headers: {
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    }
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, payload.message || response.statusText, payload.details);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
