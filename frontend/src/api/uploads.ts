import { apiRequest } from "./client";

export type UploadEntity = "driver" | "vehicle" | "invoice" | "expense" | "company" | "payment" | "maintenance";

export type UploadResult = {
  key: string;
  url: string;
  record?: unknown;
};

export async function uploadFile(token: string | undefined, entity: UploadEntity, id: string, file: File, type = "Document", replace = false) {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  form.append("replace", String(replace));
  return apiRequest<UploadResult>(`/api/uploads/${entity}/${id}`, { token, method: "POST", body: form });
}

export const previewUpload = (token: string | undefined, key: string, download = false, filename?: string) => {
  const params = new URLSearchParams({ key });
  if (download) params.set("download", "true");
  if (filename) params.set("filename", filename);
  return apiRequest<{ url: string }>(`/api/uploads/preview?${params.toString()}`, { token });
};

export const deleteUpload = (token: string | undefined, key: string, entity?: UploadEntity, id?: string) => {
  const params = new URLSearchParams({ key });
  if (entity) params.set("entity", entity);
  if (id) params.set("id", id);
  return apiRequest<void>(`/api/uploads?${params.toString()}`, { token, method: "DELETE" });
};
