import { isDatabaseConnected } from "../config/database.js";
import { BiltyModel } from "../models/Bilty.js";
import { TripModel } from "../models/Trip.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { HttpError } from "../utils/httpError.js";
import { deleteFromS3, getDownloadUrl, uploadToS3 } from "../services/storage.service.js";

const completedStatuses: Array<"Delivered" | "Completed"> = ["Delivered", "Completed"];

export const listBilties = asyncHandler(async (req, res) => {
  assertDatabase();
  const [records, missing] = await Promise.all([
    BiltyModel.find(buildFilters(req.query)).populate("tripId customerId vehicleId driverId").sort({ uploadDate: -1 }).lean(),
    buildMissingBilties()
  ]);
  res.json([...records.map(toLegacyBilty), ...missing]);
});

export const createBilty = asyncHandler(async (req, res) => {
  assertDatabase();
  const trip = await TripModel.findById(req.body.tripId).populate("companyId vehicleId driverId").lean();
  if (!trip) throw new HttpError(404, "Trip not found.");

  const files = await uploadBiltyFiles(req.files as Express.Multer.File[] | undefined, String(req.body.biltyNumber || trip.tripId), String(trip._id));
  const first = files[0];
  const payload: any = {
    biltyNumber: String(req.body.biltyNumber || "").trim(),
    tripId: trip._id,
    customerId: trip.companyId,
    vehicleId: trip.vehicleId,
    driverId: trip.driverId,
    biltyDate: req.body.biltyDate || undefined,
    uploadDate: new Date(),
    remarks: req.body.remarks || "",
    status: files.length ? "Uploaded" : "Pending",
    verificationStatus: req.body.verificationStatus || "Pending Verification",
    uploadedBy: req.user?.name || "System",
    files,
    fileUrl: first?.url || "",
    fileKey: first?.key || "",
    fileType: first?.fileType || "",
    fileSize: first?.fileSize || 0,
    consignor: req.body.consignor || "",
    consignee: req.body.consignee || "",
    vehicleNumber: (trip.vehicleId as any)?.vehicleNumber || ""
  };
  if (!payload.biltyNumber) throw new HttpError(400, "Bilty number is required.");

  const existing = await BiltyModel.findOne({ tripId: trip._id });
  const record = existing
    ? await BiltyModel.findByIdAndUpdate(existing._id, { ...payload, files: [...(existing.files || []), ...files] }, { new: true, runValidators: true }).populate("tripId customerId vehicleId driverId")
    : await BiltyModel.create(payload);
  const populated = await BiltyModel.findById(record?._id || record).populate("tripId customerId vehicleId driverId").lean();
  res.status(existing ? 200 : 201).json(toLegacyBilty(populated));
});

export const updateBilty = asyncHandler(async (req, res) => {
  assertDatabase();
  const existing = await BiltyModel.findById(req.params.id);
  if (!existing) throw new HttpError(404, "Bilty not found.");
  const files = await uploadBiltyFiles(req.files as Express.Multer.File[] | undefined, String(req.body.biltyNumber || existing.biltyNumber), String(existing.tripId));
  const first = files[0];
  const patch: any = {
    biltyNumber: req.body.biltyNumber || existing.biltyNumber,
    biltyDate: req.body.biltyDate || existing.biltyDate,
    remarks: req.body.remarks ?? existing.remarks,
    status: files.length ? "Uploaded" : req.body.status || existing.status,
    verificationStatus: req.body.verificationStatus || existing.verificationStatus,
    files: files.length ? [...(existing.files || []), ...files] : existing.files
  };
  if (first) {
    patch.uploadDate = new Date();
    patch.fileUrl = first.url;
    patch.fileKey = first.key;
    patch.fileType = first.fileType;
    patch.fileSize = first.fileSize;
  }
  const record = await BiltyModel.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true }).populate("tripId customerId vehicleId driverId").lean();
  res.json(toLegacyBilty(record));
});

export const verifyBilty = asyncHandler(async (req, res) => {
  assertDatabase();
  const record = await BiltyModel.findByIdAndUpdate(req.params.id, {
    verificationStatus: "Verified",
    status: "Uploaded",
    verifiedBy: req.user?.name || "System",
    verifiedAt: new Date()
  }, { new: true }).populate("tripId customerId vehicleId driverId").lean();
  if (!record) throw new HttpError(404, "Bilty not found.");
  res.json(toLegacyBilty(record));
});

export const deleteBilty = asyncHandler(async (req, res) => {
  assertDatabase();
  const record = await BiltyModel.findById(req.params.id).lean();
  if (!record) throw new HttpError(404, "Bilty not found.");
  await Promise.all((record.files || []).map((file) => deleteFromS3(file.key).catch(() => undefined)));
  await BiltyModel.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

export const downloadBiltyFile = asyncHandler(async (req, res) => {
  const key = String(req.query.key || "");
  const filename = req.query.filename ? String(req.query.filename) : undefined;
  if (!key) throw new HttpError(400, "S3 key is required.");
  res.json({ url: await getDownloadUrl(key, filename) });
});

function buildFilters(query: any) {
  const filter: any = {};
  if (query.status && query.status !== "All" && query.status !== "Missing") filter.status = query.status;
  if (query.verificationStatus && query.verificationStatus !== "All") filter.verificationStatus = query.verificationStatus;
  if (query.from || query.to) {
    filter.uploadDate = {};
    if (query.from) filter.uploadDate.$gte = new Date(String(query.from));
    if (query.to) filter.uploadDate.$lte = new Date(String(query.to));
  }
  return filter;
}

async function buildMissingBilties() {
  const biltyTripIds = new Set((await BiltyModel.find().select("tripId").lean()).map((row) => String(row.tripId)));
  const trips = await TripModel.find({ status: { $in: completedStatuses } }).populate("companyId vehicleId driverId").lean();
  return trips.filter((trip) => !biltyTripIds.has(String(trip._id))).map((trip: any) => ({
    id: `missing-${trip._id}`,
    biltyNumber: "Not uploaded",
    tripId: String(trip._id),
    tripNumber: trip.tripId,
    customerId: String(trip.companyId?._id || trip.companyId || ""),
    customerName: trip.companyId?.companyName || "-",
    vehicleId: String(trip.vehicleId?._id || trip.vehicleId || ""),
    vehicleNumber: trip.vehicleId?.vehicleNumber || "-",
    driverId: String(trip.driverId?._id || trip.driverId || ""),
    driverName: trip.driverId?.name || "-",
    uploadDate: "",
    biltyDate: "",
    uploadedBy: "-",
    status: "Missing",
    verificationStatus: "Pending Verification",
    remarks: "Completed trip without Bilty upload",
    files: [],
    fileUrl: "",
    fileKey: "",
    fileType: "",
    fileSize: 0,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt
  }));
}

async function uploadBiltyFiles(files: Express.Multer.File[] | undefined, biltyNumber: string, tripId: string) {
  const allowed = new Set(["application/pdf", "image/jpeg", "image/png"]);
  const uploads = files || [];
  return Promise.all(uploads.map(async (file) => {
    if (!allowed.has(file.mimetype)) throw new HttpError(400, "Only PDF, JPG, PNG, and JPEG Bilty documents are allowed.");
    const uploaded = await uploadToS3({
      folder: "bilties",
      filename: file.originalname,
      contentType: file.mimetype,
      buffer: file.buffer,
      entity: "bilty",
      entityName: biltyNumber,
      entityId: tripId,
      documentType: "Bilty"
    });
    return { ...uploaded, fileName: file.originalname, fileType: file.mimetype, fileSize: file.size, uploadedAt: new Date() };
  }));
}

function toLegacyBilty(row: any) {
  if (!row) return row;
  const trip = row.tripId;
  const customer = row.customerId;
  const vehicle = row.vehicleId;
  const driver = row.driverId;
  return {
    id: String(row._id),
    biltyNumber: row.biltyNumber,
    tripId: String(trip?._id || row.tripId || ""),
    tripNumber: trip?.tripId || "",
    customerId: String(customer?._id || row.customerId || ""),
    customerName: customer?.companyName || "",
    vehicleId: String(vehicle?._id || row.vehicleId || ""),
    vehicleNumber: vehicle?.vehicleNumber || row.vehicleNumber || "",
    driverId: String(driver?._id || row.driverId || ""),
    driverName: driver?.name || "",
    uploadDate: toDate(row.uploadDate),
    biltyDate: toDate(row.biltyDate),
    uploadedBy: row.uploadedBy || "-",
    status: row.status,
    verificationStatus: row.verificationStatus,
    remarks: row.remarks || "",
    files: (row.files || []).map((file: any) => ({ id: String(file._id || file.key), url: file.url || "", key: file.key, fileName: file.fileName, fileType: file.fileType, fileSize: file.fileSize, uploadedAt: toDate(file.uploadedAt) })),
    fileUrl: row.fileUrl || "",
    fileKey: row.fileKey || "",
    fileType: row.fileType || "",
    fileSize: row.fileSize || 0,
    verifiedBy: row.verifiedBy,
    verifiedAt: toDate(row.verifiedAt),
    consignor: row.consignor || "",
    consignee: row.consignee || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toDate(value: any) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function assertDatabase() {
  if (!isDatabaseConnected()) throw new HttpError(503, "MongoDB connection is required.");
}
