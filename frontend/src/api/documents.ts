import { apiRequest } from "./client";

export type RepositoryDocumentStatus = "Active" | "Expiring Soon" | "Expired" | "Missing";
export type RepositoryDocumentCategory = "Vehicle" | "Driver" | "Trip" | "Bilty" | "Invoice" | "Maintenance";

export type RepositoryDocument = {
  id: string;
  documentName: string;
  documentType: string;
  category: RepositoryDocumentCategory;
  linkedModule: string;
  linkedRecord: string;
  linkedRecordId?: string;
  documentNumber: string;
  uploadDate: string;
  expiryDate: string;
  status: RepositoryDocumentStatus;
  ownerName: string;
  customerName: string;
  vehicleNumber: string;
  driverName: string;
  tripNumber: string;
  biltyNumber: string;
  uploadedBy: string;
  fileSize: number;
  fileType: string;
  fileName: string;
  fileUrl: string;
  fileKey: string;
  notes: string;
  countdown: string;
  verificationStatus?: string;
};

export type DocumentRepositoryPayload = {
  documents: RepositoryDocument[];
  kpis: {
    totalDocuments: number;
    vehicleDocuments: number;
    driverDocuments: number;
    tripDocuments: number;
    biltyDocuments: number;
    activeDocuments: number;
    expiringSoon: number;
    expiredDocuments: number;
    missingDocuments: number;
    complianceScore: number;
  };
  compliance: {
    vehicle: number;
    driver: number;
    trip: number;
    overall: number;
  };
};

export const getDocumentRepository = (token: string | undefined) => {
  return apiRequest<DocumentRepositoryPayload>("/api/documents", { token });
};

export const getDocumentReport = (token: string | undefined) => {
  return apiRequest<{ generatedAt: string; compliance: DocumentRepositoryPayload["compliance"]; summary: DocumentRepositoryPayload["kpis"]; documents: RepositoryDocument[] }>("/api/documents/report", { token });
};
