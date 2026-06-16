export interface Customer {
  id: string;
  name: string;
  gstNumber: string;
  contactPerson?: string;
  address: string;
  email: string;
  phone: string;
  locations?: CustomerLocation[];
}

export interface CustomerLocation {
  id: string;
  name: string;
  address: string;
  createdDate: string;
}

export interface Vehicle {
  id: string;
  number: string;
  type: string;
  ownerName: string;
  status: string;
  insuranceExpiry: string;
  permitExpiry: string;
  fitnessExpiry: string;
  pucExpiry: string;
  serviceDue: string;
  totalMaintenanceCost?: number;
  lastServiceDate?: string;
  nextServiceDate?: string;
  nextServiceKM?: number;
  dueServiceStatus?: string;
  healthScore?: number;
  healthLabel?: string;
  activeRepairs?: number;
  completedServices?: number;
}

export interface Driver {
  id: string;
  name: string;
  mobile: string;
  licenseNumber: string;
  licenseExpiry: string;
  address: string;
  status: string;
}

export interface Trip {
  id: string;
  tripNumber: string;
  tripDate: string;
  customerId: string;
  customer?: Customer;
  consignorName?: string;
  consignorAddress?: string;
  consignorGst?: string;
  consigneeName?: string;
  consigneeAddress?: string;
  consigneeGst?: string;
  vehicle?: Vehicle;
  driver?: Driver;
  vehicleId: string;
  driverId: string;
  loadingPoint: string;
  unloadingPoint: string;
  loadingLatLng?: [number, number];
  unloadingLatLng?: [number, number];
  distanceKm: number;
  freightAmount: number;
  advance: number;
  dieselExpense?: number;
  tollExpense?: number;
  loadingExpense?: number;
  unloadingExpense?: number;
  otherExpense?: number;
  remarks?: string;
  status: string;
  totalExpense: number;
  profit: number;
}

export interface BiltyFile {
  id: string;
  url: string;
  key: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
}

export interface Bilty {
  id: string;
  biltyNumber: string;
  tripId: string;
  tripNumber: string;
  customerId: string;
  customerName: string;
  vehicleId: string;
  vehicleNumber: string;
  driverId: string;
  driverName: string;
  uploadDate: string;
  uploadedBy: string;
  biltyDate?: string;
  status: "Uploaded" | "Missing" | "Pending";
  verificationStatus: "Pending Verification" | "Verified";
  remarks?: string;
  files: BiltyFile[];
  fileUrl?: string;
  fileKey?: string;
  fileType?: string;
  fileSize?: number;
  verifiedBy?: string;
  verifiedAt?: string;
  consignor?: string;
  consignee?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  tripId: string;
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  outstandingAmount: number;
  status: string;
  pdfPath?: string;
  pdfKey?: string;
  emailStatus?: string;
  notes?: string;
  remarks?: string;
  additionalCharges?: number;
  activityLog?: InvoiceActivity[];
}

export interface InvoiceActivity {
  dateTime: string;
  user: string;
  action: string;
  remarks: string;
}

export interface Payment {
  id: string;
  paymentId?: string;
  direction?: "Incoming" | "Outgoing";
  category?: string;
  partyType?: "Customer" | "Driver" | "Vendor" | "Employee" | "Other";
  partyName?: string;
  invoiceId?: string;
  customerId?: string;
  driverId?: string;
  tripId?: string;
  vehicleId?: string;
  expenseId?: string;
  amount: number;
  amountReceived?: number;
  paymentDate: string;
  referenceNumber: string;
  mode: "Cash" | "UPI" | "IMPS" | "NEFT" | "RTGS" | "Cheque" | "Bank Transfer" | "Other";
  status?: "Recorded" | "Pending" | "Cancelled" | "Reconciled";
  remarks: string;
  notes?: string;
  allocations?: PaymentAllocation[];
  linkedInvoice?: string;
  linkedTrip?: string;
  linkedVehicle?: string;
  linkedDriver?: string;
  proofUrl?: string;
  proofKey?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  auditLog?: PaymentAudit[];
}

export interface PaymentAllocation {
  invoiceId: string;
  invoiceNumber?: string;
  amount: number;
}

export interface PaymentAudit {
  dateTime: string;
  user: string;
  action: string;
  remarks: string;
}

export interface DashboardData {
  kpis: {
    totalTrips?: number;
    activeTrips: number;
    deliveredTrips?: number;
    trucksOnRoad: number;
    pendingPayments: number;
    todayRevenue: number;
    pendingInvoices: number;
    paidInvoices?: number;
    vehiclesExpiringSoon?: number;
    driverLicensesExpiringSoon?: number;
    vehiclesExpired?: number;
    driverLicensesExpired?: number;
    amountCollectedThisMonth?: number;
    revenue?: number;
    outstanding?: number;
    expenses?: number;
    totalVehicles?: number;
    totalDrivers?: number;
  };
  activeTrips: Trip[];
  pendingPayments: Invoice[];
  revenueAnalytics: Array<{ label: string; revenue: number; expenses: number; profit: number }>;
  finance: { revenue: number; expenses: number; profit: number };
}
