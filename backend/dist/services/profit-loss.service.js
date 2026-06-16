import { Types } from "mongoose";
import puppeteer from "puppeteer";
import { CompanyModel } from "../models/Company.js";
import { InvoiceModel } from "../models/Invoice.js";
import { ManualExpenseModel } from "../models/ManualExpense.js";
import { PaymentModel } from "../models/Payment.js";
import { TripModel } from "../models/Trip.js";
import { invoicePaidAmount } from "./invoice.service.js";
export function parseProfitLossFilters(query) {
    const now = new Date();
    const from = query.from ? startOfDay(String(query.from)) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = query.to ? endOfDay(String(query.to)) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
        from,
        to,
        vehicleId: stringFilter(query.vehicleId),
        driverId: stringFilter(query.driverId),
        customerId: stringFilter(query.customerId || query.companyId),
        companyId: stringFilter(query.companyId || query.customerId),
        route: stringFilter(query.route),
        tripId: stringFilter(query.tripId),
        branch: stringFilter(query.branch),
        paymentType: stringFilter(query.paymentType),
        expenseCategory: stringFilter(query.expenseCategory)
    };
}
export async function calculateKPIs(filters) {
    const snapshot = await buildSnapshot(filters);
    const previous = await buildSnapshot(previousPeriod(filters));
    const totalRevenue = sum(snapshot.trips, (trip) => trip.revenue);
    const totalExpenses = sum(snapshot.expenseRows, (row) => row.amount);
    const netProfit = totalRevenue - totalExpenses;
    const previousRevenue = sum(previous.trips, (trip) => trip.revenue);
    const previousExpenses = sum(previous.expenseRows, (row) => row.amount);
    const previousProfit = previousRevenue - previousExpenses;
    const outstandingReceivables = sum(snapshot.invoiceRows, (invoice) => invoice.outstanding);
    const outstandingPayables = sum(snapshot.expenseRows, (row) => row.remainingAmount);
    const totalCollections = sum(snapshot.payments.filter((payment) => payment.direction !== "Outgoing"), (payment) => payment.amount);
    const totalPaymentsMade = sum(snapshot.payments.filter((payment) => payment.direction === "Outgoing"), (payment) => payment.amount);
    const monthlyProfit = sum(snapshot.trends.filter((row) => row.month === monthLabel(new Date())), (row) => row.profit);
    const todayRevenue = sum(snapshot.trips.filter((trip) => trip.date === toDateString(new Date())), (trip) => trip.revenue);
    return {
        cards: [
            kpi("Total Revenue", totalRevenue, previousRevenue, "revenue"),
            kpi("Total Expenses", totalExpenses, previousExpenses, "expenses"),
            kpi("Net Profit", netProfit, previousProfit, "profit"),
            kpi("Profit Margin %", margin(totalRevenue, netProfit), margin(previousRevenue, previousProfit), "margin", "%"),
            kpi("Outstanding Receivables", outstandingReceivables, sum(previous.invoiceRows, (invoice) => invoice.outstanding), "receivables"),
            kpi("Outstanding Payables", outstandingPayables, sum(previous.expenseRows, (row) => row.remainingAmount), "payables"),
            kpi("Total Collections", totalCollections, sum(previous.payments.filter((payment) => payment.direction !== "Outgoing"), (payment) => payment.amount), "collections"),
            kpi("Total Payments Made", totalPaymentsMade, sum(previous.payments.filter((payment) => payment.direction === "Outgoing"), (payment) => payment.amount), "payments"),
            kpi("Monthly Profit", monthlyProfit, previousProfit, "monthlyProfit"),
            kpi("Today's Revenue", todayRevenue, 0, "todayRevenue")
        ],
        totals: {
            totalRevenue,
            totalExpenses,
            netProfit,
            profitMargin: margin(totalRevenue, netProfit),
            outstandingReceivables,
            outstandingPayables,
            totalCollections,
            totalPaymentsMade,
            monthlyProfit,
            todayRevenue
        },
        leaders: {
            mostProfitableVehicle: snapshot.vehicles[0],
            mostProfitableCustomer: snapshot.customers[0],
            mostProfitableTrip: snapshot.trips[0],
            highestExpenseCategory: snapshot.expenseByCategory[0]
        },
        period: { from: toDateString(filters.from), to: toDateString(filters.to) }
    };
}
export async function calculateTripProfit(filters) {
    return (await buildSnapshot(filters)).trips;
}
export async function calculateVehicleProfit(filters) {
    return (await buildSnapshot(filters)).vehicles;
}
export async function calculateCustomerProfit(filters) {
    return (await buildSnapshot(filters)).customers;
}
export async function calculateDriverAnalysis(filters) {
    return (await buildSnapshot(filters)).drivers;
}
export async function calculateRevenueAnalytics(filters) {
    const snapshot = await buildSnapshot(filters);
    return {
        trend: snapshot.trends.map((row) => ({ month: row.month, amount: row.revenue })),
        vehicleRevenue: snapshot.vehicleRevenue,
        customerRevenue: snapshot.customerRevenue,
        tripRevenue: snapshot.trips.map((trip) => ({ name: trip.tripNumber, amount: trip.revenue })).sort(descAmount),
        collectionTrend: groupPayments(snapshot.payments.filter((payment) => payment.direction !== "Outgoing")),
        growthAnalysis: snapshot.trends
    };
}
export async function calculateExpenseAnalytics(filters) {
    const snapshot = await buildSnapshot(filters);
    return {
        byCategory: snapshot.expenseByCategory,
        byVehicle: snapshot.expenseByVehicle,
        byDriver: snapshot.expenseByDriver,
        byCustomer: snapshot.expenseByCustomer,
        byRoute: snapshot.expenseByRoute,
        monthlyTrend: snapshot.trends.map((row) => ({ month: row.month, amount: row.expenses }))
    };
}
export async function calculateCashFlow(filters) {
    const snapshot = await buildSnapshot(filters);
    const recordedPayments = snapshot.payments.filter((payment) => payment.status !== "Cancelled");
    const moneyIn = recordedPayments.filter((payment) => payment.direction !== "Outgoing");
    const moneyOut = recordedPayments.filter((payment) => payment.direction === "Outgoing");
    const cashIn = sum(moneyIn, (payment) => payment.amount);
    const cashOut = sum(moneyOut, (payment) => payment.amount);
    return {
        cashIn,
        cashOut,
        netCashFlow: cashIn - cashOut,
        moneyIn: groupPaymentCategories(moneyIn),
        moneyOut: groupPaymentCategories(moneyOut)
    };
}
export async function calculateReceivables(filters) {
    const snapshot = await buildSnapshot(filters);
    const totalInvoiced = sum(snapshot.invoiceRows, (invoice) => invoice.amount);
    const collected = sum(snapshot.invoiceRows, (invoice) => invoice.received);
    const outstanding = sum(snapshot.invoiceRows, (invoice) => invoice.outstanding);
    const overdue = sum(snapshot.invoiceRows.filter((invoice) => invoice.status === "Overdue"), (invoice) => invoice.outstanding);
    return {
        totalInvoiced,
        collected,
        outstanding,
        overdue,
        collectionPercent: totalInvoiced ? Math.round((collected / totalInvoiced) * 100) : 0,
        aging: agingBuckets(snapshot.invoiceRows),
        invoices: snapshot.invoiceRows
    };
}
export async function generateProfitLossStatement(filters, reportType = "Profit & Loss Statement") {
    const snapshot = await buildSnapshot(filters);
    const kpis = await calculateKPIs(filters);
    const receivables = await calculateReceivables(filters);
    const company = await companyHeader();
    return {
        company,
        reportType,
        generatedAt: new Date().toISOString(),
        period: { from: toDateString(filters.from), to: toDateString(filters.to) },
        summary: kpis.totals,
        revenueDetails: revenueDetails(snapshot.trips),
        expenseDetails: expenseDetails(snapshot.expenseRows),
        vehicleWiseProfitability: snapshot.vehicles,
        companyWiseProfitability: snapshot.customers,
        monthlyTrendAnalysis: snapshot.trends,
        tripWiseProfitAnalysis: snapshot.trips,
        pendingPayments: receivables.invoices,
        profitCalculationSummary: kpis.totals
    };
}
export const generateVehicleStatement = (filters) => generateProfitLossStatement(filters, "Vehicle Profitability Statement");
export const generateCustomerStatement = (filters) => generateProfitLossStatement(filters, "Company Profitability Statement");
export const generateDriverStatement = (filters) => generateProfitLossStatement(filters, "Driver Cost Statement");
export const generateTripStatement = (filters) => generateProfitLossStatement(filters, "Trip Profitability Statement");
export async function generateStatementPdf(statement) {
    const html = statementHtml(statement);
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        return Buffer.from(await page.pdf({ format: "A4", printBackground: true, displayHeaderFooter: true, footerTemplate: pdfFooter(), headerTemplate: "<div></div>", margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" } }));
    }
    finally {
        await browser.close();
    }
}
export function generateStatementCsv(statement) {
    const lines = [
        ["Report Type", statement.reportType],
        ["Period", `${statement.period.from} to ${statement.period.to}`],
        [],
        ["Financial Summary"],
        ["Total Revenue", statement.summary.totalRevenue],
        ["Total Expenses", statement.summary.totalExpenses],
        ["Net Profit", statement.summary.netProfit],
        ["Profit Margin %", statement.summary.profitMargin],
        [],
        ["Trip", "Date", "Vehicle", "Route", "Customer", "Revenue", "Expense", "Profit"],
        ...statement.tripWiseProfitAnalysis.map((trip) => [trip.tripNumber, trip.date, trip.vehicleNumber, trip.route, trip.customer, trip.revenue, trip.expense, trip.profit])
    ];
    return lines.map((line) => line.map(csvCell).join(",")).join("\n");
}
async function buildSnapshot(filters) {
    const query = tripQuery(filters);
    const [tripsRaw, manualExpensesRaw, paymentsRaw, invoicesRaw] = await Promise.all([
        TripModel.find(query).populate("companyId vehicleId driverId").sort({ loadingDate: -1 }).limit(10000).lean(),
        ManualExpenseModel.find({ expenseDate: { $gte: filters.from, $lte: filters.to } }).populate("vehicleId").sort({ expenseDate: -1 }).lean(),
        PaymentModel.find(paymentQuery(filters)).populate("customerId driverId tripId vehicleId invoiceId allocations.invoiceId").sort({ paymentDate: -1 }).limit(50000).lean(),
        InvoiceModel.find({ createdAt: { $lte: filters.to } }).populate({ path: "tripId", populate: "companyId vehicleId driverId" }).sort({ createdAt: -1 }).lean()
    ]);
    const tripExpenseRows = tripsRaw.flatMap((trip) => tripExpenses(trip));
    const manualExpenseRows = manualExpensesRaw.map((expense) => manualExpense(expense));
    const expenseRows = [...tripExpenseRows, ...manualExpenseRows].filter((row) => rowMatches(row, filters));
    const payments = paymentsRaw.map(paymentDto).filter((payment) => (!filters.paymentType || payment.mode === filters.paymentType));
    const trips = tripsRaw.map((trip) => tripProfitDto(trip, expenseRows, payments)).filter((trip) => rowMatches(trip, filters)).sort((a, b) => b.profit - a.profit);
    const invoiceRows = await Promise.all(invoicesRaw.map((invoice) => invoiceDto(invoice)));
    const scopedInvoiceRows = invoiceRows.filter((invoice) => invoice.date <= toDateString(filters.to) && (!filters.customerId || invoice.customerId === filters.customerId));
    const trends = buildTrends(trips, expenseRows);
    return {
        trips,
        expenseRows,
        payments,
        invoiceRows: scopedInvoiceRows,
        vehicles: vehicleProfit(trips, expenseRows),
        customers: customerProfit(trips, expenseRows, scopedInvoiceRows),
        drivers: driverAnalysis(trips, expenseRows, payments),
        expenseByCategory: groupAmount(expenseRows, (row) => row.category),
        expenseByVehicle: groupAmount(expenseRows, (row) => row.vehicleNumber || "Unassigned"),
        expenseByDriver: groupAmount(expenseRows, (row) => row.driverName || "Unassigned"),
        expenseByCustomer: groupAmount(expenseRows, (row) => row.customer || "Unassigned"),
        expenseByRoute: groupAmount(expenseRows, (row) => row.route || "Unassigned"),
        vehicleRevenue: groupAmount(trips, (row) => row.vehicleNumber || "Unassigned", (row) => row.revenue),
        customerRevenue: groupAmount(trips, (row) => row.customer || "Unassigned", (row) => row.revenue),
        trends
    };
}
function tripProfitDto(trip, expenseRows, payments) {
    const id = String(trip._id);
    const tripExpenses = expenseRows.filter((row) => row.tripId === id);
    const expense = sum(tripExpenses, (row) => row.amount);
    const revenue = Number(trip.freightAmount || 0);
    const profit = revenue - expense;
    const paymentHistory = payments.filter((payment) => payment.tripId === id);
    return {
        id,
        tripNumber: trip.tripId,
        date: toDateString(trip.loadingDate),
        customerId: String(trip.companyId?._id || trip.companyId || ""),
        customer: trip.companyId?.companyName || "Unknown",
        vehicleId: String(trip.vehicleId?._id || trip.vehicleId || ""),
        vehicleNumber: trip.vehicleId?.vehicleNumber || "",
        driverId: String(trip.driverId?._id || trip.driverId || ""),
        driver: trip.driverId?.name || "",
        route: `${trip.source} to ${trip.destination}`,
        source: trip.source,
        destination: trip.destination,
        revenue,
        expense,
        profit,
        profitPercent: margin(revenue, profit),
        status: trip.status,
        revenueBreakdown: [{ name: "Freight Charges", amount: revenue }],
        expenseBreakdown: groupAmount(tripExpenses, (row) => row.category),
        paymentHistory,
        documents: [],
        auditLogs: [{ dateTime: trip.updatedAt || trip.createdAt || trip.loadingDate, action: "Calculated from source data", user: "System" }]
    };
}
function tripExpenses(trip) {
    return (trip.expenses || []).map((expense) => ({
        id: String(expense._id),
        source: "Trip",
        category: normalizeExpenseCategory(expense.type),
        name: expense.type,
        amount: Number(expense.amount || 0),
        paidAmount: Number(expense.amount || 0),
        remainingAmount: 0,
        date: toDateString(expense.createdAt || trip.loadingDate),
        tripId: String(trip._id),
        tripNumber: trip.tripId,
        vehicleId: String(trip.vehicleId?._id || trip.vehicleId || ""),
        vehicleNumber: trip.vehicleId?.vehicleNumber || "",
        driverId: String(trip.driverId?._id || trip.driverId || ""),
        driverName: trip.driverId?.name || "",
        customerId: String(trip.companyId?._id || trip.companyId || ""),
        customer: trip.companyId?.companyName || "",
        route: `${trip.source} to ${trip.destination}`
    }));
}
function manualExpense(expense) {
    const status = expense.status || "Unpaid";
    const paidAmount = status === "Paid" ? Number(expense.amount || 0) : status === "Partial" ? Number(expense.paidAmount || 0) : 0;
    return {
        id: String(expense._id),
        source: "Manual",
        category: normalizeExpenseCategory(expense.category),
        name: expense.expenseName,
        amount: Number(expense.amount || 0),
        paidAmount,
        remainingAmount: Math.max(Number(expense.amount || 0) - paidAmount, 0),
        date: toDateString(expense.expenseDate),
        tripId: "",
        tripNumber: "",
        vehicleId: expense.vehicleId?._id ? String(expense.vehicleId._id) : expense.vehicleId ? String(expense.vehicleId) : "",
        vehicleNumber: expense.vehicleId?.vehicleNumber || "",
        driverId: "",
        driverName: "",
        customerId: "",
        customer: "",
        route: "Manual"
    };
}
async function invoiceDto(invoice) {
    const trip = invoice.tripId || {};
    const amount = Number(invoice.invoiceAmount || 0);
    const received = await invoicePaidAmount(String(invoice._id));
    const outstanding = Math.max(amount - received, 0);
    const dueDate = addDays(invoice.createdAt || new Date(), 30);
    const status = outstanding <= 0 ? "Paid" : dueDate < new Date() ? "Overdue" : received > 0 ? "Partial" : "Pending";
    return {
        id: String(invoice._id),
        invoiceNumber: invoice.invoiceNumber,
        date: toDateString(invoice.createdAt),
        dueDate: toDateString(dueDate),
        customerId: String(trip.companyId?._id || trip.companyId || ""),
        company: trip.companyId?.companyName || "",
        amount,
        received,
        outstanding,
        status
    };
}
function paymentDto(payment) {
    return {
        id: String(payment._id),
        paymentId: payment.paymentId || `PAY-${String(payment._id).slice(-8).toUpperCase()}`,
        direction: payment.direction || "Incoming",
        category: payment.category || "Invoice Payment",
        partyName: payment.partyName || payment.customerId?.companyName || payment.driverId?.name || "",
        customerId: String(payment.customerId?._id || payment.customerId || ""),
        driverId: String(payment.driverId?._id || payment.driverId || ""),
        tripId: String(payment.tripId?._id || payment.tripId || ""),
        vehicleId: String(payment.vehicleId?._id || payment.vehicleId || ""),
        amount: Number(payment.amount ?? payment.amountReceived ?? 0),
        paymentDate: toDateString(payment.paymentDate),
        mode: payment.mode || "NEFT",
        status: payment.status || "Recorded",
        referenceNumber: payment.referenceNumber || ""
    };
}
function vehicleProfit(trips, expenses) {
    const ids = new Set([...trips.map((trip) => trip.vehicleId), ...expenses.map((row) => row.vehicleId)].filter(Boolean));
    return Array.from(ids).map((id) => {
        const vehicleTrips = trips.filter((trip) => trip.vehicleId === id);
        const vehicleExpenses = expenses.filter((row) => row.vehicleId === id);
        const revenue = sum(vehicleTrips, (trip) => trip.revenue);
        const expense = sum(vehicleExpenses, (row) => row.amount);
        return {
            vehicleId: id,
            vehicleNumber: vehicleTrips[0]?.vehicleNumber || vehicleExpenses[0]?.vehicleNumber || "Unassigned",
            trips: vehicleTrips.length,
            revenue,
            expenses: expense,
            profit: revenue - expense,
            profitPercent: margin(revenue, revenue - expense),
            dieselCost: sum(vehicleExpenses.filter((row) => row.category === "Diesel"), (row) => row.amount),
            maintenanceCost: sum(vehicleExpenses.filter((row) => row.category === "Maintenance"), (row) => row.amount),
            driverCost: sum(vehicleExpenses.filter((row) => row.category === "Driver"), (row) => row.amount),
            status: revenue - expense >= 0 ? "Profitable" : "Loss"
        };
    }).sort((a, b) => b.profit - a.profit);
}
function customerProfit(trips, expenses, invoices) {
    const ids = new Set([...trips.map((trip) => trip.customerId), ...expenses.map((row) => row.customerId), ...invoices.map((invoice) => invoice.customerId)].filter(Boolean));
    return Array.from(ids).map((id) => {
        const customerTrips = trips.filter((trip) => trip.customerId === id);
        const customerExpenses = expenses.filter((row) => row.customerId === id);
        const customerInvoices = invoices.filter((invoice) => invoice.customerId === id);
        const revenue = sum(customerTrips, (trip) => trip.revenue);
        const expense = sum(customerExpenses, (row) => row.amount);
        const invoiced = sum(customerInvoices, (invoice) => invoice.amount);
        const collected = sum(customerInvoices, (invoice) => invoice.received);
        return {
            customerId: id,
            customer: customerTrips[0]?.customer || customerExpenses[0]?.customer || customerInvoices[0]?.company || "Unassigned",
            trips: customerTrips.length,
            revenue,
            expenseAllocation: expense,
            profit: revenue - expense,
            outstanding: sum(customerInvoices, (invoice) => invoice.outstanding),
            collectionPercent: invoiced ? Math.round((collected / invoiced) * 100) : 0
        };
    }).sort((a, b) => b.profit - a.profit);
}
function driverAnalysis(trips, expenses, payments) {
    const ids = new Set([...trips.map((trip) => trip.driverId), ...expenses.map((row) => row.driverId), ...payments.map((payment) => payment.driverId)].filter(Boolean));
    return Array.from(ids).map((id) => {
        const driverTrips = trips.filter((trip) => trip.driverId === id);
        const driverExpenses = expenses.filter((row) => row.driverId === id || row.category === "Driver");
        const driverPayments = payments.filter((payment) => payment.driverId === id && payment.direction === "Outgoing");
        const advances = sum(driverPayments.filter((payment) => /advance/i.test(payment.category)), (payment) => payment.amount) + sum(driverExpenses.filter((row) => /advance/i.test(row.name)), (row) => row.amount);
        const paymentsMade = sum(driverPayments, (payment) => payment.amount);
        const revenueGenerated = sum(driverTrips, (trip) => trip.revenue);
        const costImpact = sum(driverExpenses, (row) => row.amount) + paymentsMade;
        return {
            driverId: id,
            driver: driverTrips[0]?.driver || driverExpenses[0]?.driverName || driverPayments[0]?.partyName || "Unassigned",
            trips: driverTrips.length,
            advances,
            payments: paymentsMade,
            revenueGenerated,
            costImpact,
            netContribution: revenueGenerated - costImpact,
            pendingSettlement: Math.max(advances - paymentsMade, 0)
        };
    }).sort((a, b) => b.netContribution - a.netContribution);
}
function buildTrends(trips, expenses) {
    const map = new Map();
    for (const trip of trips) {
        const month = monthLabel(trip.date);
        const row = map.get(month) || { month, revenue: 0, expenses: 0, profit: 0 };
        row.revenue += trip.revenue;
        map.set(month, row);
    }
    for (const expense of expenses) {
        const month = monthLabel(expense.date);
        const row = map.get(month) || { month, revenue: 0, expenses: 0, profit: 0 };
        row.expenses += expense.amount;
        map.set(month, row);
    }
    return Array.from(map.values()).map((row) => ({ ...row, profit: row.revenue - row.expenses })).sort((a, b) => a.month.localeCompare(b.month));
}
function tripQuery(filters) {
    const query = { loadingDate: { $gte: filters.from, $lte: filters.to } };
    if (filters.vehicleId)
        query.vehicleId = new Types.ObjectId(filters.vehicleId);
    if (filters.driverId)
        query.driverId = new Types.ObjectId(filters.driverId);
    if (filters.customerId)
        query.companyId = new Types.ObjectId(filters.customerId);
    if (filters.tripId)
        query._id = new Types.ObjectId(filters.tripId);
    if (filters.route)
        query.$or = [{ source: new RegExp(filters.route, "i") }, { destination: new RegExp(filters.route, "i") }];
    return query;
}
function paymentQuery(filters) {
    const query = { paymentDate: { $gte: filters.from, $lte: filters.to } };
    if (filters.vehicleId)
        query.vehicleId = new Types.ObjectId(filters.vehicleId);
    if (filters.driverId)
        query.driverId = new Types.ObjectId(filters.driverId);
    if (filters.customerId)
        query.customerId = new Types.ObjectId(filters.customerId);
    if (filters.tripId)
        query.tripId = new Types.ObjectId(filters.tripId);
    return query;
}
function rowMatches(row, filters) {
    return (!filters.vehicleId || row.vehicleId === filters.vehicleId)
        && (!filters.driverId || row.driverId === filters.driverId)
        && (!filters.customerId || row.customerId === filters.customerId)
        && (!filters.tripId || row.tripId === filters.tripId || row.id === filters.tripId)
        && (!filters.expenseCategory || row.category === filters.expenseCategory)
        && (!filters.route || String(row.route || "").toLowerCase().includes(filters.route.toLowerCase()));
}
function previousPeriod(filters) {
    const span = Math.max(+filters.to - +filters.from, 86400000);
    const to = new Date(+filters.from - 1);
    const from = new Date(+to - span);
    return { ...filters, from, to };
}
function kpi(label, amount, previousAmount, key, suffix = "") {
    const growth = previousAmount ? Math.round(((amount - previousAmount) / Math.abs(previousAmount)) * 100) : amount ? 100 : 0;
    return { key, label, amount, growth, trend: growth >= 0 ? "up" : "down", suffix };
}
function revenueDetails(trips) {
    const freight = sum(trips, (trip) => trip.revenue);
    return [
        { name: "Freight Charges", amount: freight },
        { name: "Loading Charges", amount: 0 },
        { name: "Unloading Charges", amount: 0 },
        { name: "Detention Charges", amount: 0 },
        { name: "Extra Charges", amount: 0 },
        { name: "Miscellaneous Income", amount: 0 },
        { name: "Total Revenue", amount: freight }
    ];
}
async function companyHeader() {
    const company = await CompanyModel.findOne().sort({ createdAt: 1 }).lean();
    return {
        name: process.env.COMPANY_NAME || "NPFC Logistics Pvt. Ltd.",
        address: process.env.COMPANY_ADDRESS || company?.address || "Registered Office",
        gstNumber: process.env.COMPANY_GST || company?.gstNumber || "NA",
        panNumber: process.env.COMPANY_PAN || "NA",
        phone: process.env.COMPANY_PHONE || company?.phone || "NA",
        email: process.env.COMPANY_EMAIL || company?.email || "NA",
        logoUrl: process.env.COMPANY_LOGO_URL || ""
    };
}
function expenseDetails(expenses) {
    const rows = ["Diesel", "Toll", "Driver", "Driver Advance", "Maintenance", "Insurance", "Permit", "Office Expense", "Miscellaneous"].map((name) => ({ name, amount: sum(expenses.filter((row) => row.category === name || row.name === name), (row) => row.amount) }));
    rows.push({ name: "Total Expenses", amount: sum(expenses, (row) => row.amount) });
    return rows;
}
function groupPaymentCategories(payments) {
    return groupAmount(payments, (payment) => payment.category);
}
function groupPayments(payments) {
    return groupAmount(payments, (payment) => monthLabel(payment.paymentDate));
}
function agingBuckets(invoices) {
    const buckets = { "0-30 Days": 0, "31-60 Days": 0, "61-90 Days": 0, "90+ Days": 0 };
    const now = new Date();
    for (const invoice of invoices.filter((row) => row.outstanding > 0)) {
        const days = Math.max(Math.floor((+now - +new Date(invoice.dueDate)) / 86400000), 0);
        if (days <= 30)
            buckets["0-30 Days"] += invoice.outstanding;
        else if (days <= 60)
            buckets["31-60 Days"] += invoice.outstanding;
        else if (days <= 90)
            buckets["61-90 Days"] += invoice.outstanding;
        else
            buckets["90+ Days"] += invoice.outstanding;
    }
    return Object.entries(buckets).map(([name, amount]) => ({ name, amount }));
}
function groupAmount(rows, keyFn, amountFn = (row) => Number(row.amount || 0)) {
    return Object.values(rows.reduce((acc, row) => {
        const name = keyFn(row) || "Unassigned";
        acc[name] ||= { name, amount: 0 };
        acc[name].amount += amountFn(row);
        return acc;
    }, {})).sort(descAmount);
}
function normalizeExpenseCategory(value) {
    if (/diesel|fuel/i.test(value))
        return "Diesel";
    if (/toll/i.test(value))
        return "Toll";
    if (/advance/i.test(value))
        return "Driver Advance";
    if (/driver|salary/i.test(value))
        return "Driver";
    if (/maintenance|repair|tyre|tire/i.test(value))
        return "Maintenance";
    if (/insurance/i.test(value))
        return "Insurance";
    if (/permit/i.test(value))
        return "Permit";
    if (/office/i.test(value))
        return "Office Expense";
    return /loading/i.test(value) ? "Loading/Unloading" : "Miscellaneous";
}
function statementHtml(statement) {
    const vehicleRows = withVehicleTotals(statement.vehicleWiseProfitability);
    const companyRows = withCompanyTotals(statement.companyWiseProfitability);
    const tripRows = statement.tripWiseProfitAnalysis.slice(0, 25).map((row) => [
        row.tripNumber,
        row.date,
        row.vehicleNumber,
        compactRoute(row),
        row.customer,
        currency(row.revenue),
        currency(row.expense),
        currency(row.profit)
    ]);
    return `<!doctype html><html><head><meta charset="utf-8" /><style>
    *{box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:0;background:#fff;font-size:9.5px}
    .sheet{border:1.4px solid #333;padding:10px 12px 12px;min-height:267mm}
    .masthead{display:grid;grid-template-columns:112px 1fr 118px;gap:12px;align-items:center;border-bottom:1.8px solid #111;padding-bottom:8px}
    .logo{height:86px;width:106px;display:flex;align-items:center;justify-content:center;color:#0B2B55;font-weight:800;text-align:center;font-size:13px;line-height:1.15}
    .logo img{max-width:106px;max-height:86px;object-fit:contain}
    .company{text-align:center;line-height:1.35}.company h1{font-family:Georgia,"Times New Roman",serif;font-size:23px;letter-spacing:.3px;margin:0 0 3px;color:#050505}.company div{font-size:11px}
    .meta{text-align:right;font-size:10.5px;line-height:1.6;align-self:end}
    .report-title{text-align:center;margin:8px 0 10px}.report-title h2{font-family:Georgia,"Times New Roman",serif;font-size:21px;margin:0;color:#050505}.report-title div{font-size:12px;font-weight:700;margin-top:4px}
    .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1.2px solid #111;margin:8px 0 12px}
    .summary-card{border-right:1.2px solid #111;text-align:center;min-height:52px}.summary-card:last-child{border-right:0}
    .summary-card .label{background:#0B2B55;color:#fff;text-transform:uppercase;font-weight:800;font-size:10px;padding:6px 4px;letter-spacing:.2px}
    .summary-card .value{font-size:14px;font-weight:800;padding:7px 4px}.profit{color:#087A24}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
    .section{margin-top:10px;break-inside:avoid}.section h3{font-family:Georgia,"Times New Roman",serif;font-size:13px;color:#0B2B55;margin:0 0 5px}
    table{width:100%;border-collapse:collapse;table-layout:fixed;border:1.2px solid #333}
    th,td{border:1px solid #7B7B7B;padding:4.5px 5px;vertical-align:top;word-break:normal;overflow-wrap:break-word}
    th{background:#EEEEEE;color:#050505;font-weight:800;text-align:left}.num{text-align:right;white-space:nowrap}.center{text-align:center}.total td{font-weight:800;background:#F8FAFC}
    .compact th,.compact td{padding:3.6px 4px;font-size:8.7px}.route{width:17%}.nowrap{white-space:nowrap}.status{display:inline-block;min-width:46px;border-radius:3px;padding:2px 5px;text-align:center;font-weight:800;font-size:8px;border:1px solid transparent}
    .paid{background:#DCFCE7;color:#166534;border-color:#86EFAC}.partial{background:#FFEDD5;color:#9A3412;border-color:#FDBA74}.pending{background:#FEF9C3;color:#854D0E;border-color:#FDE047}.overdue{background:#FEE2E2;color:#991B1B;border-color:#FCA5A5}
    .calc-box{border:1.2px solid #333;padding:8px}.calc-box .formula{font-weight:800;margin-bottom:7px}
    .sign{display:grid;grid-template-columns:repeat(3,1fr);gap:54px;margin-top:28px;padding:0 28px}.line{border-top:1px solid #111;padding-top:7px;text-align:center;line-height:1.45}
  </style></head><body>
    <div class="sheet">
      <div class="masthead"><div class="logo">${statement.company.logoUrl ? `<img src="${escapeHtml(statement.company.logoUrl)}" />` : "NPFC<br/>LOGISTICS"}</div><div class="company"><h1>${escapeHtml(statement.company.name)}</h1><div>${escapeHtml(statement.company.address)}</div><div>Phone: ${escapeHtml(statement.company.phone)} | Email: ${escapeHtml(statement.company.email)}</div><div>GSTIN: ${escapeHtml(statement.company.gstNumber)}</div></div><div class="meta"><div>Date: ${toDateString(statement.generatedAt)}</div><div>Page: 1</div></div></div>
      <div class="report-title"><h2>PROFIT &amp; LOSS REPORT</h2><div>Period: ${statement.period.from} to ${statement.period.to}</div></div>
      <div class="summary">${summaryBox("Total Revenue", statement.summary.totalRevenue)}${summaryBox("Total Expenses", statement.summary.totalExpenses)}${summaryBox("Net Profit", statement.summary.netProfit, true)}${summaryBox("Profit Margin", `${statement.summary.profitMargin}%`)}</div>
      <div class="two-col">
        ${section("2. Revenue Details", ["Particular", "Amount"], statement.revenueDetails.map((row) => [row.name, currency(row.amount)]))}
        ${section("3. Expense Details", ["Particular", "Amount"], statement.expenseDetails.map((row) => [row.name, currency(row.amount)]))}
      </div>
      ${section("4. Vehicle Wise Profitability", ["Vehicle", "Trips", "Revenue", "Expense", "Profit", "Profit %"], vehicleRows, { numericFrom: 1 })}
      ${section("5. Company Wise Profitability", ["Company", "Trips", "Revenue", "Expense", "Profit"], companyRows, { numericFrom: 1 })}
      ${trendSection(statement.monthlyTrendAnalysis)}
      ${section("7. Trip Wise Profit Analysis", ["Trip", "Date", "Vehicle", "Route", "Customer", "Revenue", "Expense", "Profit"], tripRows, { compact: true, numericFrom: 5, routeColumn: 3 })}
      ${pendingPaymentsSection(statement.pendingPayments)}
      <div class="section"><h3>9. Profit Calculation Summary</h3><div class="calc-box"><div class="formula">Net Profit = Total Revenue - Total Expenses</div><table><tbody><tr><td>Total Revenue</td><td class="num">${currency(statement.summary.totalRevenue)}</td></tr><tr><td>Total Expenses</td><td class="num">${currency(statement.summary.totalExpenses)}</td></tr><tr class="total"><td>Net Profit</td><td class="num profit">${currency(statement.summary.netProfit)}</td></tr><tr><td>Profit Margin (%)</td><td class="num">${statement.summary.profitMargin}%</td></tr></tbody></table></div></div>
      <div class="sign"><div class="line">Prepared By<br/>(Name & Sign)</div><div class="line">Verified By<br/>(Name & Sign)</div><div class="line">Approved By<br/>(Name & Sign)</div></div>
    </div>
  </body></html>`;
}
function section(title, headers, rows, options = {}) {
    const numericFrom = options.numericFrom ?? 1;
    return `<div class="section"><h3>${escapeHtml(title)}</h3><table class="${options.compact ? "compact" : ""}"><thead><tr>${headers.map((header, index) => `<th class="${index >= numericFrom ? "num" : ""} ${options.routeColumn === index ? "route" : ""}">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${(rows.length ? rows : [["No data"]]).map((row) => `<tr class="${String(row[0]).toLowerCase() === "total" ? "total" : ""}">${row.map((cell, index) => `<td class="${index >= numericFrom ? "num" : ""} ${options.routeColumn === index ? "route" : ""}">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function trendSection(rows) {
    const tableRows = rows.map((row) => [row.month, currency(row.revenue), currency(row.expenses), currency(row.profit)]);
    return section("6. Monthly Trend Analysis", ["Month", "Revenue", "Expense", "Profit"], tableRows, { numericFrom: 1 });
}
function pendingPaymentsSection(rows) {
    const tableRows = rows.map((row) => [
        row.company,
        currency(row.amount),
        currency(row.received),
        currency(row.outstanding),
        row.dueDate,
        statusBadge(row.status)
    ]);
    return `<div class="section"><h3>8. Pending Payments</h3><table><thead><tr><th>Company</th><th class="num">Invoice Amount</th><th class="num">Received</th><th class="num">Pending</th><th>Due Date</th><th class="center">Status</th></tr></thead><tbody>${(tableRows.length ? tableRows : [["No data"]]).map((row) => `<tr>${row.map((cell, index) => `<td class="${index > 0 && index < 4 ? "num" : index === 5 ? "center" : ""}">${index === 5 ? cell : escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function summaryBox(label, value, profit = false) {
    return `<div class="summary-card"><div class="label">${escapeHtml(label)}</div><div class="value ${profit ? "profit" : ""}">${typeof value === "number" ? currency(value) : escapeHtml(value)}</div></div>`;
}
function withVehicleTotals(rows) {
    const tableRows = rows.map((row) => [row.vehicleNumber, row.trips, currency(row.revenue), currency(row.expenses), currency(row.profit), `${row.profitPercent}%`]);
    if (!rows.length)
        return tableRows;
    const revenue = sum(rows, (row) => row.revenue);
    const expenses = sum(rows, (row) => row.expenses);
    const profit = sum(rows, (row) => row.profit);
    tableRows.push(["Total", sum(rows, (row) => row.trips), currency(revenue), currency(expenses), currency(profit), `${margin(revenue, profit)}%`]);
    return tableRows;
}
function withCompanyTotals(rows) {
    const tableRows = rows.map((row) => [row.customer, row.trips, currency(row.revenue), currency(row.expenseAllocation), currency(row.profit)]);
    if (!rows.length)
        return tableRows;
    tableRows.push([
        "Total",
        sum(rows, (row) => row.trips),
        currency(sum(rows, (row) => row.revenue)),
        currency(sum(rows, (row) => row.expenseAllocation)),
        currency(sum(rows, (row) => row.profit))
    ]);
    return tableRows;
}
function compactRoute(row) {
    const source = cityName(row.source || String(row.route || "").split(/\s+to\s+/i)[0] || "");
    const destination = cityName(row.destination || String(row.route || "").split(/\s+to\s+/i)[1] || "");
    return source && destination ? `${source} → ${destination}` : cityName(row.route || "");
}
function cityName(value) {
    const text = String(value || "").split(",")[0].trim();
    return text.length > 22 ? `${text.slice(0, 21)}.` : text;
}
function statusBadge(status) {
    const normalized = String(status || "Pending");
    const className = normalized === "Paid" ? "paid" : normalized === "Partial" ? "partial" : normalized === "Overdue" ? "overdue" : "pending";
    return `<span class="status ${className}">${escapeHtml(normalized)}</span>`;
}
function pdfFooter() {
    return `<div style="font-size:8px;color:#4B5563;width:100%;padding:0 15mm;display:flex;justify-content:space-between;"><span>Profit & Loss Report</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
}
function startOfDay(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
}
function endOfDay(value) {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
}
function addDays(value, days) {
    const date = new Date(value);
    date.setDate(date.getDate() + days);
    return date;
}
function stringFilter(value) {
    const text = String(value || "");
    return text && text !== "All" ? text : "";
}
function toDateString(value) {
    return new Date(value).toISOString().slice(0, 10);
}
function monthLabel(value) {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function margin(revenue, profit) {
    return revenue ? Math.round((profit / revenue) * 10000) / 100 : 0;
}
function sum(rows, fn) {
    return rows.reduce((total, row) => total + Number(fn(row) || 0), 0);
}
function descAmount(a, b) {
    return b.amount - a.amount;
}
function currency(amount) {
    return `INR ${Math.round(amount || 0).toLocaleString("en-IN")}`;
}
function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] || char));
}
