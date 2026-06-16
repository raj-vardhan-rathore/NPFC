import { BiltyModel } from "../models/Bilty.js";
import { DriverModel } from "../models/Driver.js";
import { InvoiceModel } from "../models/Invoice.js";
import { MaintenanceModel } from "../models/Maintenance.js";
import { TripModel } from "../models/Trip.js";
import { VehicleModel } from "../models/Vehicle.js";
const vehicleRequiredDocuments = ["RC", "Insurance", "Permit", "Fitness", "PUC"];
const driverRequiredDocuments = ["License", "Aadhaar", "PAN", "Medical"];
const tripRequiredDocuments = ["Bilty", "POD", "Customer Attachments"];
export class DocumentService {
    static async getAllDocuments() {
        const [vehicles, drivers, trips, bilties, invoices, maintenance] = await Promise.all([
            VehicleModel.find().sort({ vehicleNumber: 1 }).lean(),
            DriverModel.find().sort({ name: 1 }).lean(),
            TripModel.find().populate("companyId vehicleId driverId").sort({ loadingDate: -1 }).lean(),
            BiltyModel.find().populate("tripId customerId vehicleId driverId").sort({ uploadDate: -1 }).lean(),
            InvoiceModel.find().populate({ path: "tripId", populate: "companyId vehicleId driverId" }).sort({ createdAt: -1 }).lean(),
            MaintenanceModel.find().populate("vehicleId").sort({ maintenanceDate: -1 }).lean()
        ]);
        const documents = [
            ...this.getVehicleDocumentsFromRows(vehicles),
            ...this.getDriverDocumentsFromRows(drivers),
            ...this.getTripDocumentsFromRows(trips, bilties),
            ...this.getBiltyDocumentsFromRows(bilties),
            ...this.getInvoiceDocumentsFromRows(invoices),
            ...this.getMaintenanceDocumentsFromRows(maintenance),
            ...this.getMissingDocumentsFromRows(vehicles, drivers, trips, bilties)
        ];
        return {
            documents,
            kpis: this.calculateKpis(documents),
            compliance: this.calculateComplianceScore(documents)
        };
    }
    static async getVehicleDocuments() {
        const vehicles = await VehicleModel.find().sort({ vehicleNumber: 1 }).lean();
        return this.getVehicleDocumentsFromRows(vehicles);
    }
    static async getDriverDocuments() {
        const drivers = await DriverModel.find().sort({ name: 1 }).lean();
        return this.getDriverDocumentsFromRows(drivers);
    }
    static async getTripDocuments() {
        const [trips, bilties] = await Promise.all([
            TripModel.find().populate("companyId vehicleId driverId").sort({ loadingDate: -1 }).lean(),
            BiltyModel.find().populate("tripId customerId vehicleId driverId").sort({ uploadDate: -1 }).lean()
        ]);
        return this.getTripDocumentsFromRows(trips, bilties);
    }
    static async getBiltyDocuments() {
        const bilties = await BiltyModel.find().populate("tripId customerId vehicleId driverId").sort({ uploadDate: -1 }).lean();
        return this.getBiltyDocumentsFromRows(bilties);
    }
    static async getMissingDocuments() {
        const [vehicles, drivers, trips, bilties] = await Promise.all([
            VehicleModel.find().lean(),
            DriverModel.find().lean(),
            TripModel.find().populate("companyId vehicleId driverId").lean(),
            BiltyModel.find().lean()
        ]);
        return this.getMissingDocumentsFromRows(vehicles, drivers, trips, bilties);
    }
    static async getExpiredDocuments() {
        const payload = await this.getAllDocuments();
        return payload.documents.filter((document) => document.status === "Expired");
    }
    static async getExpiringDocuments(days = 60) {
        const payload = await this.getAllDocuments();
        return payload.documents.filter((document) => {
            const remaining = daysUntil(document.expiryDate);
            return remaining >= 0 && remaining <= days;
        });
    }
    static calculateComplianceScore(documents) {
        const required = documents.filter((document) => document.status === "Missing" || hasComplianceExpiry(document));
        const compliant = required.filter((document) => document.status === "Active").length;
        const score = required.length ? Math.round((compliant / required.length) * 100) : 100;
        const byCategory = (category) => {
            const rows = required.filter((document) => document.category === category);
            return rows.length ? Math.round((rows.filter((document) => document.status === "Active").length / rows.length) * 100) : 100;
        };
        return {
            vehicle: byCategory("Vehicle"),
            driver: byCategory("Driver"),
            trip: byCategory("Trip"),
            overall: score
        };
    }
    static generateComplianceReport(documents) {
        const compliance = this.calculateComplianceScore(documents);
        return {
            generatedAt: new Date().toISOString(),
            compliance,
            summary: this.calculateKpis(documents),
            documents
        };
    }
    static getVehicleDocumentsFromRows(vehicles) {
        return vehicles.flatMap((vehicle) => (vehicle.documentUrls || []).map((document) => {
            const documentType = normalizeVehicleType(document.type);
            return buildDocument({
                id: `vehicle-${vehicle._id}-${document.key}`,
                documentName: `${vehicle.vehicleNumber} ${documentType}`,
                documentType,
                category: "Vehicle",
                linkedModule: "Vehicle Module",
                linkedRecord: vehicle.vehicleNumber,
                linkedRecordId: String(vehicle._id),
                documentNumber: documentType === "RC" ? vehicle.rcNumber : "-",
                uploadDate: toDate(document.uploadedAt),
                expiryDate: vehicleExpiry(vehicle, documentType),
                ownerName: vehicle.vehicleNumber,
                vehicleNumber: vehicle.vehicleNumber,
                fileUrl: document.url,
                fileKey: document.key,
                fileName: filenameFromKey(document.key),
                notes: "Synced from Vehicle Module"
            });
        }));
    }
    static getDriverDocumentsFromRows(drivers) {
        return drivers.flatMap((driver) => (driver.documentUrls || []).map((document) => {
            const documentType = normalizeDriverType(document.type);
            return buildDocument({
                id: `driver-${driver._id}-${document.key}`,
                documentName: `${driver.name} ${documentType}`,
                documentType,
                category: "Driver",
                linkedModule: "Driver Module",
                linkedRecord: driver.name,
                linkedRecordId: String(driver._id),
                documentNumber: documentType === "License" ? driver.licenseNumber : documentType === "Aadhaar" ? driver.aadhaarNumber || "-" : "-",
                uploadDate: toDate(document.uploadedAt),
                expiryDate: documentType === "License" ? toDate(driver.licenseExpiry) : "",
                ownerName: driver.name,
                driverName: driver.name,
                fileUrl: document.url,
                fileKey: document.key,
                fileName: filenameFromKey(document.key),
                notes: "Synced from Driver Module"
            });
        }));
    }
    static getTripDocumentsFromRows(trips, bilties) {
        const biltyByTrip = new Map(bilties.map((bilty) => [String(bilty.tripId?._id || bilty.tripId), bilty]));
        return trips.flatMap((trip) => {
            const rows = [];
            for (const expense of trip.expenses || []) {
                if (!expense.receiptKey)
                    continue;
                rows.push(buildDocument({
                    id: `trip-expense-${trip._id}-${expense._id}`,
                    documentName: `${trip.tripId} ${expense.type} Receipt`,
                    documentType: `${expense.type} Receipt`,
                    category: "Trip",
                    linkedModule: "Trip Module",
                    linkedRecord: trip.tripId,
                    linkedRecordId: String(trip._id),
                    documentNumber: String(expense._id),
                    uploadDate: toDate(expense.createdAt),
                    ownerName: trip.tripId,
                    customerName: trip.companyId?.companyName || "",
                    vehicleNumber: trip.vehicleId?.vehicleNumber || "",
                    driverName: trip.driverId?.name || "",
                    tripNumber: trip.tripId,
                    fileUrl: expense.receiptUrl || "",
                    fileKey: expense.receiptKey || "",
                    fileName: filenameFromKey(expense.receiptKey),
                    notes: expense.remarks || "Synced from Trip expenses"
                }));
            }
            const bilty = biltyByTrip.get(String(trip._id));
            if (bilty?.files?.length) {
                rows.push(buildDocument({
                    id: `trip-bilty-${trip._id}`,
                    documentName: `${trip.tripId} Bilty`,
                    documentType: "Bilty",
                    category: "Trip",
                    linkedModule: "Trip Module",
                    linkedRecord: trip.tripId,
                    linkedRecordId: String(trip._id),
                    documentNumber: bilty.biltyNumber,
                    uploadDate: toDate(bilty.uploadDate),
                    ownerName: trip.tripId,
                    customerName: trip.companyId?.companyName || "",
                    vehicleNumber: trip.vehicleId?.vehicleNumber || "",
                    driverName: trip.driverId?.name || "",
                    tripNumber: trip.tripId,
                    biltyNumber: bilty.biltyNumber,
                    fileUrl: bilty.fileUrl || bilty.files[0]?.url || "",
                    fileKey: bilty.fileKey || bilty.files[0]?.key || "",
                    fileName: bilty.files[0]?.fileName || filenameFromKey(bilty.fileKey),
                    fileType: bilty.fileType || bilty.files[0]?.fileType || "",
                    fileSize: bilty.fileSize || bilty.files[0]?.fileSize || 0,
                    uploadedBy: bilty.uploadedBy || "System",
                    verificationStatus: bilty.verificationStatus,
                    notes: "Bilty attached to trip"
                }));
            }
            return rows;
        });
    }
    static getBiltyDocumentsFromRows(bilties) {
        return bilties.flatMap((bilty) => (bilty.files || []).map((file) => buildDocument({
            id: `bilty-${bilty._id}-${file._id || file.key}`,
            documentName: `${bilty.biltyNumber} Bilty`,
            documentType: "Bilty",
            category: "Bilty",
            linkedModule: "Bilty / LR Management",
            linkedRecord: bilty.biltyNumber,
            linkedRecordId: String(bilty._id),
            documentNumber: bilty.biltyNumber,
            uploadDate: toDate(file.uploadedAt || bilty.uploadDate),
            ownerName: bilty.biltyNumber,
            customerName: bilty.customerId?.companyName || "",
            vehicleNumber: bilty.vehicleId?.vehicleNumber || bilty.vehicleNumber || "",
            driverName: bilty.driverId?.name || "",
            tripNumber: bilty.tripId?.tripId || "",
            biltyNumber: bilty.biltyNumber,
            uploadedBy: bilty.uploadedBy || "System",
            fileUrl: file.url || "",
            fileKey: file.key || "",
            fileName: file.fileName || filenameFromKey(file.key),
            fileType: file.fileType || bilty.fileType || "",
            fileSize: file.fileSize || bilty.fileSize || 0,
            verificationStatus: bilty.verificationStatus,
            notes: bilty.remarks || "Synced from Bilty / LR Management"
        })));
    }
    static getInvoiceDocumentsFromRows(invoices) {
        return invoices.filter((invoice) => invoice.pdfKey || invoice.pdfUrl).map((invoice) => {
            const trip = invoice.tripId || {};
            return buildDocument({
                id: `invoice-${invoice._id}`,
                documentName: `${invoice.invoiceNumber} Invoice PDF`,
                documentType: "Invoice PDF",
                category: "Invoice",
                linkedModule: "Invoice Module",
                linkedRecord: invoice.invoiceNumber,
                linkedRecordId: String(invoice._id),
                documentNumber: invoice.invoiceNumber,
                uploadDate: toDate(invoice.updatedAt || invoice.createdAt),
                ownerName: invoice.invoiceNumber,
                customerName: trip.companyId?.companyName || "",
                vehicleNumber: trip.vehicleId?.vehicleNumber || "",
                driverName: trip.driverId?.name || "",
                tripNumber: trip.tripId || "",
                uploadedBy: invoice.activityLog?.[invoice.activityLog.length - 1]?.user || "System",
                fileUrl: invoice.pdfUrl || "",
                fileKey: invoice.pdfKey || "",
                fileName: `${invoice.invoiceNumber}.pdf`,
                fileType: "application/pdf",
                notes: invoice.remarks || invoice.notes || "Synced from Invoice Module"
            });
        });
    }
    static getMaintenanceDocumentsFromRows(records) {
        return records.flatMap((record) => (record.documents || []).map((document) => buildDocument({
            id: `maintenance-${record._id}-${document.key}`,
            documentName: `${record.jobCardNumber} ${document.type || "Bill"}`,
            documentType: document.type || "Maintenance Bill",
            category: "Maintenance",
            linkedModule: "Maintenance Module",
            linkedRecord: record.jobCardNumber,
            linkedRecordId: String(record._id),
            documentNumber: record.jobCardNumber,
            uploadDate: toDate(document.uploadedAt || record.updatedAt),
            ownerName: record.jobCardNumber,
            vehicleNumber: record.vehicleId?.vehicleNumber || "",
            fileUrl: document.url,
            fileKey: document.key,
            fileName: document.fileName || filenameFromKey(document.key),
            notes: `Synced from ${record.maintenanceType}`
        })));
    }
    static getMissingDocumentsFromRows(vehicles, drivers, trips, bilties) {
        const rows = [];
        const biltyTripIds = new Set(bilties.filter((bilty) => bilty.files?.length || bilty.fileKey).map((bilty) => String(bilty.tripId?._id || bilty.tripId)));
        for (const vehicle of vehicles) {
            const uploaded = new Set((vehicle.documentUrls || []).map((document) => normalizeVehicleType(document.type)));
            for (const type of vehicleRequiredDocuments) {
                if (uploaded.has(type))
                    continue;
                rows.push(buildMissing({
                    id: `missing-vehicle-${vehicle._id}-${type}`,
                    documentName: `${vehicle.vehicleNumber} ${type}`,
                    documentType: type,
                    category: "Vehicle",
                    linkedModule: "Vehicle Module",
                    linkedRecord: vehicle.vehicleNumber,
                    linkedRecordId: String(vehicle._id),
                    documentNumber: type === "RC" ? vehicle.rcNumber : "-",
                    expiryDate: vehicleExpiry(vehicle, type),
                    ownerName: vehicle.vehicleNumber,
                    vehicleNumber: vehicle.vehicleNumber,
                    notes: `Vehicle missing ${type}`
                }));
            }
        }
        for (const driver of drivers) {
            const uploaded = new Set((driver.documentUrls || []).map((document) => normalizeDriverType(document.type)));
            for (const type of driverRequiredDocuments) {
                if (uploaded.has(type))
                    continue;
                rows.push(buildMissing({
                    id: `missing-driver-${driver._id}-${type}`,
                    documentName: `${driver.name} ${type}`,
                    documentType: type,
                    category: "Driver",
                    linkedModule: "Driver Module",
                    linkedRecord: driver.name,
                    linkedRecordId: String(driver._id),
                    documentNumber: type === "License" ? driver.licenseNumber : type === "Aadhaar" ? driver.aadhaarNumber || "-" : "-",
                    expiryDate: type === "License" ? toDate(driver.licenseExpiry) : "",
                    ownerName: driver.name,
                    driverName: driver.name,
                    notes: `Driver missing ${type}`
                }));
            }
        }
        for (const trip of trips) {
            const completed = ["Delivered", "Completed"].includes(trip.status);
            if (!completed)
                continue;
            const present = new Set();
            if (biltyTripIds.has(String(trip._id)))
                present.add("Bilty");
            for (const type of tripRequiredDocuments) {
                if (present.has(type))
                    continue;
                rows.push(buildMissing({
                    id: `missing-trip-${trip._id}-${type}`,
                    documentName: `${trip.tripId} ${type}`,
                    documentType: type,
                    category: "Trip",
                    linkedModule: "Trip Module",
                    linkedRecord: trip.tripId,
                    linkedRecordId: String(trip._id),
                    ownerName: trip.tripId,
                    customerName: trip.companyId?.companyName || "",
                    vehicleNumber: trip.vehicleId?.vehicleNumber || "",
                    driverName: trip.driverId?.name || "",
                    tripNumber: trip.tripId,
                    notes: `Completed trip missing ${type}`
                }));
            }
        }
        return rows;
    }
    static calculateKpis(documents) {
        const active = documents.filter((document) => document.status === "Active").length;
        const expiringSoon = documents.filter((document) => document.status === "Expiring Soon").length;
        const expired = documents.filter((document) => document.status === "Expired").length;
        const missing = documents.filter((document) => document.status === "Missing").length;
        const compliance = this.calculateComplianceScore(documents);
        return {
            totalDocuments: documents.filter((document) => document.status !== "Missing").length,
            vehicleDocuments: documents.filter((document) => document.category === "Vehicle" && document.status !== "Missing").length,
            driverDocuments: documents.filter((document) => document.category === "Driver" && document.status !== "Missing").length,
            tripDocuments: documents.filter((document) => document.category === "Trip" && document.status !== "Missing").length,
            biltyDocuments: documents.filter((document) => document.category === "Bilty" && document.status !== "Missing").length,
            maintenanceDocuments: documents.filter((document) => document.category === "Maintenance" && document.status !== "Missing").length,
            activeDocuments: active,
            expiringSoon,
            expiredDocuments: expired,
            missingDocuments: missing,
            complianceScore: compliance.overall
        };
    }
}
function buildDocument(input) {
    const status = resolveStatus(input.expiryDate || "");
    return {
        id: input.id,
        documentName: input.documentName,
        documentType: input.documentType,
        category: input.category,
        linkedModule: input.linkedModule,
        linkedRecord: input.linkedRecord,
        linkedRecordId: input.linkedRecordId || "",
        documentNumber: input.documentNumber || "-",
        uploadDate: input.uploadDate || "",
        expiryDate: input.expiryDate || "",
        status,
        ownerName: input.ownerName || input.linkedRecord,
        customerName: input.customerName || "",
        vehicleNumber: input.vehicleNumber || "",
        driverName: input.driverName || "",
        tripNumber: input.tripNumber || "",
        biltyNumber: input.biltyNumber || "",
        uploadedBy: input.uploadedBy || "System",
        fileSize: input.fileSize || 0,
        fileType: input.fileType || inferFileType(input.fileName || input.fileKey || ""),
        fileName: input.fileName || "Document",
        fileUrl: input.fileUrl || "",
        fileKey: input.fileKey || "",
        notes: input.notes || "",
        countdown: countdown(input.expiryDate || ""),
        verificationStatus: input.verificationStatus
    };
}
function buildMissing(input) {
    return { ...buildDocument(input), status: "Missing", countdown: "Not uploaded", fileName: "", fileType: "", fileKey: "", fileUrl: "" };
}
function resolveStatus(value) {
    if (!value)
        return "Active";
    const days = daysUntil(value);
    if (days < 0)
        return "Expired";
    if (days <= 30)
        return "Expiring Soon";
    return "Active";
}
function hasComplianceExpiry(document) {
    return document.category === "Vehicle" || (document.category === "Driver" && ["License", "Medical"].includes(document.documentType)) || Boolean(document.expiryDate);
}
function daysUntil(value) {
    if (!value)
        return 9999;
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.ceil((+date - +now) / 86400000);
}
function countdown(value) {
    if (!value)
        return "No expiry";
    const days = daysUntil(value);
    if (days < 0)
        return `Expired ${Math.abs(days)} days ago`;
    if (days === 0)
        return "Expires today";
    return `Expires in ${days} days`;
}
function vehicleExpiry(vehicle, type) {
    if (type === "Insurance")
        return toDate(vehicle.insuranceExpiry);
    if (type === "Permit")
        return toDate(vehicle.permitExpiry);
    if (type === "Fitness" || type === "PUC")
        return toDate(vehicle.fitnessExpiry);
    return "";
}
function normalizeVehicleType(type) {
    if (/rc|registration/i.test(type))
        return "RC";
    if (/insurance/i.test(type))
        return "Insurance";
    if (/permit/i.test(type))
        return "Permit";
    if (/fitness/i.test(type))
        return "Fitness";
    if (/puc|pollution/i.test(type))
        return "PUC";
    return type || "Other";
}
function normalizeDriverType(type) {
    if (/license/i.test(type))
        return "License";
    if (/aadhaar|aadhar/i.test(type))
        return "Aadhaar";
    if (/pan/i.test(type))
        return "PAN";
    if (/medical/i.test(type))
        return "Medical";
    return type || "Other";
}
function filenameFromKey(key = "") {
    return key.split("/").pop() || "Document";
}
function inferFileType(name) {
    if (/\.pdf$/i.test(name))
        return "application/pdf";
    if (/\.(png|jpg|jpeg|webp)$/i.test(name))
        return "image";
    return "";
}
function toDate(value) {
    return value ? new Date(value).toISOString().slice(0, 10) : "";
}
