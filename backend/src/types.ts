export type TripStatus = "Draft" | "Assigned" | "Loading" | "In Transit" | "Delivered" | "Completed";
export type VehicleStatus = "Available" | "Assigned" | "In Transit" | "Maintenance";
export type DriverStatus = "Available" | "Assigned" | "On Trip" | "Leave";
export type InvoiceStatus = "Pending" | "Partial" | "Paid" | "Overdue";

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
  status: VehicleStatus;
  insuranceExpiry: string;
  permitExpiry: string;
  fitnessExpiry: string;
  pucExpiry: string;
  serviceDue: string;
}

export interface Driver {
  id: string;
  name: string;
  mobile: string;
  licenseNumber: string;
  licenseExpiry: string;
  address: string;
  status: DriverStatus;
}

export interface Trip {
  id: string;
  tripNumber: string;
  tripDate: string;
  customerId: string;
  consignorName: string;
  consignorAddress: string;
  consignorGst: string;
  consigneeName: string;
  consigneeAddress: string;
  consigneeGst: string;
  vehicleId: string;
  driverId: string;
  loadingPoint: string;
  unloadingPoint: string;
  loadingLatLng: [number, number];
  unloadingLatLng: [number, number];
  distanceKm: number;
  freightAmount: number;
  advance: number;
  dieselExpense: number;
  tollExpense: number;
  loadingExpense: number;
  unloadingExpense: number;
  otherExpense: number;
  remarks: string;
  status: TripStatus;
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
  status: InvoiceStatus;
  pdfPath?: string;
  emailRecipient?: string;
  emailDate?: string;
  emailStatus?: string;
}

export interface Payment {
  id: string;
  invoiceId?: string;
  customerId: string;
  amount: number;
  paymentDate: string;
  referenceNumber: string;
  mode: "NEFT" | "RTGS" | "UPI" | "Cash" | "Cheque" | "Other" | "Bank Transfer";
  remarks: string;
  allocations?: PaymentAllocation[];
}

export interface PaymentAllocation {
  invoiceId: string;
  amount: number;
}

export interface Expense {
  id: string;
  tripId: string;
  type: "Diesel" | "Toll" | "Driver Advance" | "Repair" | "Loading" | "Unloading" | "Miscellaneous";
  amount: number;
  expenseDate: string;
  remarks: string;
}
