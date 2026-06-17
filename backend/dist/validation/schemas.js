import { z } from "zod";
import { roles } from "../models/User.js";
import { incomingPaymentCategories, outgoingPaymentCategories, partyTypes, paymentDirections, paymentModes, paymentStatuses } from "../models/Payment.js";
import { attendanceStatuses } from "../models/DriverAttendance.js";
export const authLoginSchema = z.object({
    body: z.object({
        email: z.string().email().optional(),
        username: z.string().optional(),
        password: z.string().min(1)
    })
});
const optionalTrimmedString = z.preprocess((value) => {
    if (typeof value !== "string")
        return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}, z.string().optional());
const optionalEmail = z.preprocess((value) => {
    if (typeof value !== "string")
        return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}, z.string().email().optional());
export const userCreateSchema = z.object({
    body: z.object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(8),
        role: z.enum(roles)
    })
});
export const companySchema = z.object({
    body: z.object({
        companyName: z.string().min(2),
        gstNumber: z.string().trim().min(2),
        address: z.string().trim().min(2),
        contactPerson: optionalTrimmedString,
        phone: z.string().min(6),
        email: optionalEmail,
        locations: z.array(z.object({
            id: z.string(),
            name: z.string(),
            address: z.string(),
            createdDate: z.string()
        })).optional()
    })
});
export const companyUpdateSchema = z.object({ body: companySchema.shape.body.partial().refine((body) => Object.keys(body).length > 0, "At least one field is required.") });
export const driverSchema = z.object({
    body: z.object({
        name: z.string().min(2),
        phone: z.string().min(6),
        licenseNumber: z.string().min(3),
        licenseExpiry: z.coerce.date(),
        aadhaarNumber: z.string().optional()
    })
});
export const driverUpdateSchema = z.object({ body: driverSchema.shape.body.partial().refine((body) => Object.keys(body).length > 0, "At least one field is required.") });
export const vehicleSchema = z.object({
    body: z.object({
        vehicleNumber: z.string().min(3),
        rcNumber: z.string().min(3),
        type: z.string().optional(),
        insuranceExpiry: z.coerce.date(),
        fitnessExpiry: z.coerce.date(),
        permitExpiry: z.coerce.date(),
        pucExpiry: z.coerce.date().optional(),
        ownerName: z.string().min(2)
    })
});
export const vehicleUpdateSchema = z.object({ body: vehicleSchema.shape.body.partial().refine((body) => Object.keys(body).length > 0, "At least one field is required.") });
export const tripSchema = z.object({
    body: z.object({
        tripId: z.string().min(3),
        companyId: z.string().min(1),
        vehicleId: z.string().min(1),
        driverId: z.string().min(1),
        source: z.string().min(2),
        destination: z.string().min(2),
        material: z.string().optional(),
        weightMt: z.number().min(0).optional(),
        ratePerMt: z.number().min(0).optional(),
        freightAmount: z.number().min(0),
        loadingDate: z.coerce.date(),
        deliveryDate: z.coerce.date().optional(),
        status: z.enum(["Draft", "Trip Created", "Assigned", "Vehicle Assigned", "Loading", "Loading Started", "Loaded", "In Transit", "Reached Destination", "Unloading Started", "Delivered", "Invoice Generated", "Payment Received", "Completed", "Cancelled"]).optional(),
        expenses: z.array(z.object({
            type: z.string(),
            amount: z.number().min(0),
            receiptUrl: z.string().optional(),
            receiptKey: z.string().optional(),
            remarks: z.string().optional()
        })).optional()
    })
});
export const tripUpdateSchema = z.object({ body: tripSchema.shape.body.partial().refine((body) => Object.keys(body).length > 0, "At least one field is required.") });
const paymentBodySchema = z.object({
    direction: z.enum(paymentDirections).default("Incoming"),
    category: z.union([z.enum(incomingPaymentCategories), z.enum(outgoingPaymentCategories), z.string().min(2)]).default("Invoice Payment"),
    amount: z.number().min(0.01).optional(),
    amountReceived: z.number().min(0.01).optional(),
    paymentDate: z.coerce.date(),
    partyType: z.enum(partyTypes).default("Customer"),
    partyName: z.string().optional(),
    customerId: z.string().optional(),
    driverId: z.string().optional(),
    vendorName: z.string().optional(),
    employeeName: z.string().optional(),
    invoiceId: z.string().optional(),
    allocations: z.array(z.object({ invoiceId: z.string().min(1), amount: z.number().min(0.01) })).optional(),
    tripId: z.string().optional(),
    vehicleId: z.string().optional(),
    expenseId: z.string().optional(),
    mode: z.enum(paymentModes).default("NEFT"),
    referenceNumber: z.string().optional(),
    status: z.enum(paymentStatuses).default("Recorded"),
    remarks: z.string().optional(),
    notes: z.string().optional(),
    proof: z.object({
        url: z.string().optional(),
        key: z.string().optional(),
        fileName: z.string().optional(),
        contentType: z.string().optional(),
        uploadedAt: z.coerce.date().optional()
    }).optional()
});
export const paymentSchema = z.object({
    body: paymentBodySchema.refine((body) => (body.amount ?? body.amountReceived ?? 0) > 0, "Payment amount is required.")
});
export const paymentUpdateSchema = z.object({ body: paymentBodySchema.partial().refine((body) => Object.keys(body).length > 0, "At least one field is required.") });
export const expenseSchema = z.object({
    body: z.object({
        expenseName: z.string().min(2),
        category: z.string().min(2),
        amount: z.number().min(0),
        expenseDate: z.coerce.date(),
        status: z.enum(["Paid", "Unpaid", "Partial"]).default("Unpaid"),
        paidAmount: z.number().min(0).optional(),
        notes: z.string().optional(),
        attachmentUrl: z.string().optional(),
        attachmentKey: z.string().optional(),
        recurring: z.boolean().optional(),
        recurrenceFrequency: z.enum(["Monthly", "Quarterly", "Yearly"]).optional(),
        recurringUntil: z.coerce.date().optional()
    })
});
export const expenseUpdateSchema = z.object({
    body: expenseSchema.shape.body.partial().refine((body) => Object.keys(body).length > 0, "At least one field is required.")
});
export const invoiceUpdateSchema = z.object({
    body: z.object({
        notes: z.string().optional(),
        remarks: z.string().optional(),
        additionalCharges: z.number().min(0).optional(),
        sentStatus: z.string().optional(),
        paymentStatus: z.enum(["Draft", "Generated", "Sent", "Partially Paid", "Paid", "Cancelled"]).optional()
    }).refine((body) => Object.keys(body).length > 0, "At least one field is required.")
});
export const invoiceGenerateSchema = z.object({
    body: z.object({
        tripId: z.string().min(1)
    })
});
export const attendanceSchema = z.object({
    body: z.object({
        driverId: z.string().min(1),
        date: z.coerce.date(),
        status: z.enum(attendanceStatuses),
        remarks: z.string().optional()
    })
});
export const attendanceUpdateSchema = z.object({
    body: z.object({
        date: z.coerce.date().optional(),
        status: z.enum(attendanceStatuses).optional(),
        remarks: z.string().optional()
    }).refine((body) => Object.keys(body).length > 0, "At least one field is required.")
});
export const statusUpdateSchema = z.object({
    body: z.object({
        status: z.string().min(2)
    })
});
