import puppeteer from "puppeteer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { hasS3 } from "../config/env.js";
import { InvoiceModel } from "../models/Invoice.js";
import { PaymentModel } from "../models/Payment.js";
import { TripModel } from "../models/Trip.js";
import { deleteFromS3, uploadToS3 } from "./storage.service.js";
import { HttpError } from "../utils/httpError.js";
import { CompanySettingsService, SettingsService } from "./settings.service.js";
export async function nextInvoiceNumber(date = new Date()) {
    const year = date.getFullYear();
    const settings = await SettingsService.getSettings();
    const format = settings.invoiceSettings?.invoiceNumberFormat || "INV-{YYYY}-{####}";
    const prefix = format.replace("{YYYY}", String(year)).replace(/\{#+\}.*/, "");
    const latest = await InvoiceModel.findOne({ invoiceNumber: new RegExp(`^${escapeRegExp(prefix)}`) }).sort({ invoiceNumber: -1 }).lean();
    const last = latest?.invoiceNumber.match(/(\d+)$/)?.[1];
    return applyNumberFormat(format, year, (last ? Number(last) : 0) + 1);
}
export async function generateInvoicePdf(invoice) {
    const trip = await TripModel.findById(invoice.tripId).populate("companyId vehicleId driverId").lean();
    if (!trip)
        throw new HttpError(404, "Trip not found for invoice.");
    const paid = await invoicePaidAmount(String(invoice._id));
    const html = await renderInvoiceHtml(invoice, trip, paid);
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "load" });
        return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
    }
    finally {
        await browser.close();
    }
}
export async function uploadInvoicePdf(invoice) {
    const pdf = await generateInvoicePdf(invoice);
    if (!hasS3)
        return saveInvoicePdfLocally(invoice, pdf);
    const previousKey = invoice.pdfKey;
    const { url, key } = await uploadToS3({
        folder: "invoices",
        filename: `${invoice.invoiceNumber.replaceAll("/", "-")}.pdf`,
        contentType: "application/pdf",
        buffer: pdf,
        entity: "invoice",
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.createdAt || new Date()
    });
    if (previousKey && previousKey !== key) {
        await deleteFromS3(previousKey).catch((error) => console.warn("Previous invoice PDF cleanup failed:", error));
    }
    invoice.pdfUrl = url;
    invoice.pdfKey = key;
    invoice.activityLog.push({ dateTime: new Date(), user: "System", action: "PDF Regenerated", remarks: "Invoice PDF uploaded to S3." });
    await invoice.save();
    return invoice;
}
async function saveInvoicePdfLocally(invoice, pdf) {
    const date = invoice.createdAt ? new Date(invoice.createdAt) : new Date();
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const filename = `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9._-]+/g, "-")}.pdf`;
    const folder = path.resolve(process.cwd(), "..", "storage", "invoices", year, month);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, filename), pdf);
    invoice.pdfUrl = `/storage/invoices/${year}/${month}/${filename}`;
    invoice.pdfKey = `invoices/${year}/${month}/${filename}`;
    invoice.activityLog.push({ dateTime: new Date(), user: "System", action: "PDF Generated", remarks: "Invoice PDF saved locally." });
    await invoice.save();
    return invoice;
}
export async function createInvoiceForTrip(tripId, user = "System") {
    const trip = await TripModel.findById(tripId);
    if (!trip)
        throw new HttpError(404, "Trip not found.");
    const existing = await InvoiceModel.findOne({ tripId: trip._id });
    if (existing)
        return existing;
    const invoice = await InvoiceModel.create({
        invoiceNumber: await nextInvoiceNumber(new Date(trip.loadingDate)),
        tripId: trip._id,
        invoiceAmount: trip.freightAmount,
        paymentStatus: "Generated",
        activityLog: [{ dateTime: new Date(), user, action: "Invoice Generated", remarks: `Generated from trip ${trip.tripId}.` }]
    });
    trip.invoiceId = invoice._id;
    await trip.save();
    return uploadInvoicePdf(invoice);
}
export async function syncInvoiceForTrip(tripId, user = "System") {
    const trip = await TripModel.findById(tripId);
    if (!trip?.invoiceId)
        return;
    const invoice = await InvoiceModel.findById(trip.invoiceId);
    if (!invoice || invoice.paymentStatus === "Cancelled")
        return;
    const paid = await invoicePaidAmount(String(invoice._id));
    invoice.invoiceAmount = trip.freightAmount + (invoice.additionalCharges || 0);
    invoice.paymentStatus = paid <= 0 ? "Generated" : paid >= invoice.invoiceAmount ? "Paid" : "Partially Paid";
    invoice.activityLog.push({ dateTime: new Date(), user, action: "Invoice Synced", remarks: "Trip changes synchronized and PDF queued for regeneration." });
    await invoice.save();
    return uploadInvoicePdf(invoice);
}
export async function invoicePaidAmount(invoiceId) {
    const rows = await PaymentModel.find({
        direction: "Incoming",
        category: "Invoice Payment",
        status: { $ne: "Cancelled" },
        $or: [{ invoiceId }, { "allocations.invoiceId": invoiceId }]
    }).lean();
    return rows.reduce((sum, payment) => {
        const allocated = (payment.allocations || [])
            .filter((allocation) => String(allocation.invoiceId) === String(invoiceId))
            .reduce((allocationSum, allocation) => allocationSum + Number(allocation.amount || 0), 0);
        if (allocated > 0)
            return sum + allocated;
        return String(payment.invoiceId || "") === String(invoiceId) ? sum + Number(payment.amount ?? payment.amountReceived ?? 0) : sum;
    }, 0);
}
export async function renderInvoiceHtml(invoice, trip, paidAmount) {
    const customer = trip.companyId || {};
    const company = await CompanySettingsService.getCompanySettings();
    const invoiceSettings = (await SettingsService.getSettings()).invoiceSettings || {};
    const vehicle = trip.vehicleId || {};
    const material = trip.material || trip.items?.[0]?.item || "Material / Goods";
    const weightMt = Number(trip.weightMt || trip.totalWeight || trip.items?.[0]?.weight || 1);
    const ratePerMt = Number(trip.ratePerMt || (weightMt ? trip.freightAmount / weightMt : trip.freightAmount));
    const totalFreight = Number.isFinite(weightMt * ratePerMt) ? weightMt * ratePerMt : Number(trip.freightAmount || 0);
    const totalAmount = totalFreight + Number(invoice.additionalCharges || 0);
    const remainingAmount = Math.max(totalAmount - paidAmount, 0);
    const invoiceDate = invoice.createdAt ? new Date(invoice.createdAt) : new Date();
    const deliveryDate = trip.deliveryDate ? new Date(trip.deliveryDate) : undefined;
    return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4 portrait; margin: 8mm; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #ffffff; color: #000000; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; line-height: 1.15; }
        .invoice-page {
          width: 194mm;
          height: 281mm;
          max-height: 281mm;
          margin: 0 auto;
          border: 1px solid #000000;
          display: grid;
          grid-template-rows: 100px 135px 135px 60px 115px 75px 175px 95px 90px 60px 22px;
          overflow: hidden;
          page-break-after: avoid;
          page-break-inside: avoid;
        }
        .header { display: grid; grid-template-columns: 32% 48% 20%; border-bottom: 1px solid #000000; min-height: 0; overflow: hidden; }
        .brand { padding: 12px 8px 0 14px; min-width: 0; overflow: hidden; }
        .logo { color: #062b66; font-size: 18px; font-weight: 700; line-height: 1; }
        .brand-logo { max-width: 72px; max-height: 34px; object-fit: contain; display: block; margin-bottom: 4px; }
        .brand-name { margin-top: 4px; font-size: 18px; font-weight: 700; line-height: 1.05; }
        .tagline { margin-top: 3px; font-size: 9px; font-style: italic; }
        .title { display: grid; align-content: center; justify-items: center; text-align: center; min-width: 0; }
        .title h1 { margin: 0; font-size: 18px; font-weight: 700; line-height: 1.05; }
        .title div { margin-top: 5px; font-size: 10px; }
        .qr-area { padding: 8px 10px 0 0; text-align: right; min-width: 0; overflow: hidden; }
        .qr-label { padding-right: 10px; font-size: 9px; }
        .qr { width: 64px; height: 64px; margin: 3px 0 0 auto; border: 1px solid #000000; padding: 5px; display: grid; grid-template-columns: repeat(21, 1fr); grid-template-rows: repeat(21, 1fr); }
        .qr span { background: #ffffff; }
        .qr .on { background: #000000; }
        .company-meta { display: grid; grid-template-columns: 48% 52%; border-bottom: 1px solid #000000; min-height: 0; overflow: hidden; }
        .company-address, .invoice-meta { padding: 12px 14px 0 14px; min-width: 0; overflow: hidden; }
        .company-address { border-right: 1px solid #000000; }
        .blue-name { color: #062b66; font-size: 12px; font-weight: 700; margin-bottom: 5px; }
        .line { height: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .kv { height: 12px; display: grid; grid-template-columns: 82px 8px minmax(0, 1fr); align-items: start; min-width: 0; overflow: hidden; }
        .invoice-meta .kv { grid-template-columns: 92px 8px minmax(0, 1fr); }
        .v, .td, .remarks-text {
          min-width: 0;
          word-break: break-word;
          overflow-wrap: break-word;
          overflow: hidden;
        }
        .v {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
        }
        .address-row { height: 32px; }
        .address-row .v {
          -webkit-line-clamp: 3;
        }
        .section-title, .box-title {
          height: 16px;
          display: grid;
          align-items: center;
          border-bottom: 1px solid #000000;
          background: #eef3fb;
          color: #071b46;
          font-size: 11px;
          font-weight: 600;
        }
        .section-title { justify-items: center; color: #000000; }
        .box-title { padding-left: 8px; }
        .parties { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #000000; min-height: 0; }
        .party:first-child { border-right: 1px solid #000000; }
        .party { min-width: 0; overflow: hidden; }
        .party .kv { margin: 5px 12px 0 12px; grid-template-columns: 88px 8px minmax(0, 1fr); }
        .payee { border-bottom: 1px solid #000000; min-height: 0; }
        .payee-grid { padding: 7px 12px 0 12px; display: grid; grid-template-columns: 1fr 1fr; column-gap: 18px; }
        .payee-grid .kv { grid-template-columns: 84px 8px minmax(0, 1fr); }
        .trip { margin: 8px 8px 0 8px; border: 1px solid #000000; min-height: 0; overflow: hidden; }
        .trip-grid { display: grid; grid-template-columns: 14% 16% 16% 18% 12% 12% 12%; }
        .loc-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; border-top: 1px solid #000000; }
        .timing { margin: 8px 8px 0 8px; border: 1px solid #000000; min-height: 0; overflow: hidden; }
        .timing-grid { display: grid; grid-template-columns: repeat(4, 1fr); }
        .th, .td { height: 18px; display: block; line-height: 14px; text-align: center; padding: 2px 3px; border-right: 1px solid #000000; font-size: 9px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; word-break: normal; overflow-wrap: normal; }
        .th { background: #eef3fb; font-weight: 600; border-bottom: 1px solid #000000; }
        .th:last-child, .td:last-child { border-right: 0; }
        .trip .section-title, .timing .section-title { height: 16px; }
        .trip .th, .trip .td, .timing .th, .timing .td { height: 18px; padding: 2px 3px; }
        .charges { margin: 8px 8px 0 8px; border: 1px solid #000000; min-height: 0; overflow: hidden; }
        .charges-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .charges-table th, .charges-table td { border: 1px solid #000000; padding: 2px 6px; height: 22px; max-height: 22px; font-size: 9px; overflow: hidden; word-break: break-word; overflow-wrap: break-word; }
        .charges-table th { background: #eef3fb; font-weight: 600; text-align: center; font-size: 11px; }
        .charges-table th:first-child, .charges-table td:first-child { border-left: 0; }
        .charges-table th:last-child, .charges-table td:last-child { border-right: 0; }
        .charges-table tr:last-child td { border-bottom: 0; }
        .amount { text-align: right; white-space: nowrap; }
        .payment-summary { margin: 8px 8px 0 8px; border: 1px solid #000000; min-height: 0; overflow: hidden; }
        .summary-row { height: 17px; display: grid; grid-template-columns: 1fr 18px 120px; align-items: center; padding: 0 12px; border-bottom: 1px solid #000000; font-size: 9px; }
        .summary-row:last-child { border-bottom: 0; }
        .summary-value { text-align: right; font-weight: 800; }
        .red { color: #d40000; }
        .green { color: #008a2e; }
        .words { height: 16px; display: grid; grid-template-columns: auto 14px minmax(0, 1fr); align-items: center; padding: 0 12px; font-size: 9px; overflow: hidden; }
        .words strong { font-style: italic; }
        .bottom { margin: 8px 8px 0 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; min-height: 0; overflow: hidden; }
        .small-box { border: 1px solid #000000; min-height: 0; overflow: hidden; }
        .small-box .kv { margin: 3px 8px 0 8px; grid-template-columns: 84px 8px minmax(0, 1fr); height: 12px; }
        .remarks-sign { margin: 8px 8px 0 8px; display: grid; grid-template-columns: 1fr 210px; gap: 8px; min-height: 0; overflow: hidden; }
        .remarks { border: 1px solid #000000; min-height: 0; overflow: hidden; }
        .remarks-text { padding: 5px 8px; height: 31px; white-space: pre-wrap; font-size: 8px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
        .sign { text-align: center; padding-top: 5px; font-size: 9px; overflow: hidden; }
        .sign strong, .sign span { display: block; }
        .signature-img { display: block; max-width: 120px; max-height: 28px; object-fit: contain; margin: 3px auto; }
        .stamp-img { display: block; max-width: 68px; max-height: 32px; object-fit: contain; margin: 2px auto; }
        .footer { display: grid; align-items: center; justify-items: center; font-style: italic; font-weight: 700; font-size: 9px; overflow: hidden; }
      </style>
    </head>
    <body>
      <main class="invoice-page">
        <section class="header">
          <div class="brand">
            ${company.companyLogo ? `<img class="brand-logo" src="${escapeAttribute(company.companyLogo)}" alt="Company Logo" />` : `<div class="logo">${escapeHtml(company.companyName || "NPFC")}</div>`}
            <div class="brand-name">${escapeHtml(company.legalBusinessName || company.companyName || "NPFC Logistics")}</div>
            <div class="tagline">Freight &amp; Transportation Services</div>
          </div>
          <div class="title">
            <h1>TRANSPORT INVOICE</h1>
            <div>(ORIGINAL FOR RECIPIENT)</div>
          </div>
          <div class="qr-area">
            <div class="qr-label">Invoice QR</div>
            <div class="qr">${qrMarkup()}</div>
          </div>
        </section>

        <section class="company-meta">
          <div class="company-address">
            <div class="blue-name">${escapeHtml(company.companyName)}</div>
            <div class="line">${escapeHtml(company.addressLine1)}</div>
            <div class="line">${escapeHtml(company.addressLine2)}</div>
            <div class="line">${escapeHtml([company.city, company.state, company.pincode].filter(Boolean).join(" - "))}</div>
            ${kv("GSTIN/UIN", company.gstNumber)}
            ${kv("PAN", company.panNumber)}
            ${kv("E-Mail", company.emailAddress)}
            ${kv("Phone", company.phoneNumber)}
          </div>
          <div class="invoice-meta">
            ${kv("Invoice No.", invoice.invoiceNumber)}
            ${kv("Invoice Date", formatDate(invoiceDate))}
            ${kv("Trip Number", trip.tripId)}
            ${kv("Vehicle Number", vehicle.vehicleNumber || "")}
            ${kv("Delivery Note No.", `DN/${trip.tripId || "____"}`)}
            ${kv("Reference No. & Date", invoice.remarks || "PO/____ dt. ____")}
            ${kv("Dispatched Through", "NPFC Fleet")}
            ${kv("Place of Receipt", trip.source)}
            ${kv("Place of Delivery", trip.destination)}
          </div>
        </section>

        <section class="parties">
          <div class="party">
            <div class="box-title">CONSIGNOR (From)</div>
            ${kv("Company Name", "M/s. ____________________", "Company Name")}
            ${kv("Address", "____________________________", "Address", "address-row")}
            ${kv("GSTIN/UIN", "________________")}
            ${kv("Contact Person", "________________")}
            ${kv("Contact No.", "________________")}
          </div>
          <div class="party">
            <div class="box-title">CONSIGNEE (To)</div>
            ${kv("Company Name", customer.companyName, "Company Name")}
            ${kv("Address", customer.address, "Address", "address-row")}
            ${kv("GSTIN/UIN", customer.gstNumber)}
            ${kv("Contact Person", customer.contactPerson || "________________")}
            ${kv("Contact No.", customer.phone || "________________")}
          </div>
        </section>

        <section class="payee">
          <div class="section-title">PAYEE / BILLING CONTACT PERSON DETAILS</div>
          <div class="payee-grid">
            ${kv("Company Name", customer.companyName)}
            ${kv("Mobile No.", customer.phone || "________________")}
            ${kv("Contact Person", customer.contactPerson || "________________")}
            ${kv("Email ID", customer.email || "________________")}
          </div>
        </section>

        <section class="trip">
          <div class="section-title">TRIP DETAILS</div>
          <div class="trip-grid">
            ${th("Vehicle Number")}${th("Source")}${th("Destination")}${th("Material")}${th("Weight (MT)")}${th("Rate Per MT")}${th("Total Freight")}
            ${td(vehicle.vehicleNumber || "________________")}${td(trip.source || "________________")}${td(trip.destination || "________________")}${td(material)}${td(formatQuantity(weightMt))}${td(`₹ ${formatMoney(ratePerMt)}`)}${td(`₹ ${formatMoney(totalFreight)}`)}
          </div>
        </section>

        <section class="timing">
          <div class="section-title">TIMING DETAILS</div>
          <div class="timing-grid">
            ${th("Arrival Time")}${th("Departure Time")}${th("Total Halt Time")}${th("Delivery Time")}
            ${td(formatDate(trip.loadingDate))}${td("________________")}${td("________________")}${td(deliveryDate ? formatDate(deliveryDate) : "________________")}
          </div>
        </section>

        <section class="charges">
          <div class="section-title">CHARGES DETAILS</div>
          <table class="charges-table">
            <thead>
              <tr><th style="width:50%">Description</th><th style="width:20%">Amount</th><th style="width:30%">Remarks</th></tr>
            </thead>
            <tbody>
              <tr><td>${escapeHtml(`${formatQuantity(weightMt)} MT x ₹ ${formatMoney(ratePerMt)} / MT`)}</td><td class="amount">&#8377; ${formatMoney(totalFreight)}</td><td>${escapeHtml(material)}</td></tr>
              ${Number(invoice.additionalCharges || 0) > 0 ? `<tr><td>Additional Charges</td><td class="amount">&#8377; ${formatMoney(Number(invoice.additionalCharges || 0))}</td><td>${escapeHtml(invoice.remarks || "")}</td></tr>` : ""}
            </tbody>
          </table>
        </section>

        <section class="payment-summary">
          <div class="section-title">PAYMENT SUMMARY</div>
          <div class="summary-row"><strong>Total Amount Payable</strong><b>:</b><div class="summary-value">&#8377; ${formatMoney(totalAmount)}</div></div>
          <div class="summary-row"><strong>Amount Paid</strong><b>:</b><div class="summary-value">&#8377; ${formatMoney(paidAmount)}</div></div>
          <div class="summary-row"><strong>Remaining Amount</strong><b>:</b><div class="summary-value ${remainingAmount > 0 ? "red" : "green"}">&#8377; ${formatMoney(remainingAmount)}</div></div>
          <div class="words"><span>Amount Chargeable (in words)</span><b>:</b><strong>${escapeHtml(amountInWords(remainingAmount || totalAmount))}</strong></div>
        </section>

        <section class="bottom">
          <div class="small-box">
            <div class="box-title">OTHER INFORMATION</div>
            ${kv("Payment Terms", invoiceSettings.defaultPaymentTerms || "7 Days")}
            ${kv("Payment Mode", "Bank Transfer / NEFT")}
            ${kv("POD Status", "Pending")}
            ${kv("E-Way Bill No.", "NA")}
          </div>
          <div class="small-box">
            <div class="box-title">BANK DETAILS</div>
            ${kv("Bank Name", company.bankName)}
            ${kv("Account Holder", company.accountHolderName)}
            ${kv("Account Number", company.accountNumber)}
            ${kv("IFSC", company.ifscCode)}
          </div>
        </section>

        <section class="remarks-sign">
          <div class="remarks">
            <div class="box-title">REMARKS</div>
            <div class="remarks-text">${escapeHtml(invoice.notes || " ")}</div>
          </div>
          <div class="sign">
            <div>For <strong>${escapeHtml(company.companyName)}</strong></div>
            ${company.digitalSignature ? `<img class="signature-img" src="${escapeAttribute(company.digitalSignature)}" alt="Authorized Signature" />` : ""}
            <strong>${escapeHtml(company.authorizedSignatoryName || "AUTHORISED SIGNATORY")}</strong>
            ${company.companyStamp ? `<img class="stamp-img" src="${escapeAttribute(company.companyStamp)}" alt="Company Stamp" />` : ""}
            <span>Company Seal</span>
          </div>
        </section>

        <footer class="footer">${escapeHtml(invoiceSettings.invoiceFooter || "Thank you for giving us the opportunity to serve you!")}</footer>
      </main>
    </body>
  </html>`;
}
function applyNumberFormat(format, year, sequence) {
    const sequenceToken = format.match(/\{(#+)\}/)?.[1] || "####";
    return format.replace("{YYYY}", String(year)).replace(`{${sequenceToken}}`, String(sequence).padStart(sequenceToken.length, "0"));
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildChargeRows(freightAmount, expenses, additionalCharges) {
    const matchedExpenses = new Set();
    const amountFor = (patterns) => expenses
        .filter((expense) => patterns.some((pattern) => pattern.test(String(expense.type || ""))))
        .reduce((sum, expense) => {
        matchedExpenses.add(expense);
        return sum + Number(expense.amount || 0);
    }, 0);
    const loadingAmount = amountFor([/loading/i]);
    const unloadingAmount = amountFor([/unloading/i]);
    const tollAmount = amountFor([/toll/i]);
    const otherAmount = amountFor([/other|misc/i]);
    const ungroupedAmount = expenses
        .filter((expense) => !matchedExpenses.has(expense))
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const rows = [
        { description: "Freight Charges", amount: Number(freightAmount || 0), remarks: "" },
        { description: "Loading Charges", amount: loadingAmount, remarks: "" },
        { description: "Unloading Charges", amount: unloadingAmount, remarks: "" },
        { description: "Toll Charges", amount: tollAmount, remarks: "" },
        { description: "Additional Charges", amount: otherAmount + ungroupedAmount + Number(additionalCharges || 0), remarks: "Other trip charges" }
    ];
    return rows.map((row) => ({ ...row, amount: Number.isFinite(row.amount) ? row.amount : 0 }));
}
function kv(label, value, fallback = "________________", extraClass = "") {
    const text = String(value ?? "").trim() || fallback;
    return `<div class="kv ${extraClass}"><span>${escapeHtml(label)}</span><b>:</b><span class="v">${escapeHtml(text)}</span></div>`;
}
function th(value) {
    return `<div class="th">${escapeHtml(value)}</div>`;
}
function td(value) {
    const text = String(value ?? "").trim() || "________________";
    return `<div class="td">${escapeHtml(text)}</div>`;
}
function formatDate(value) {
    if (!value)
        return "________________";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return String(value);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatMoney(value) {
    return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatQuantity(value) {
    return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function amountInWords(value) {
    const rounded = Math.round(value || 0);
    if (rounded <= 0)
        return "Zero Rupees Only";
    return `${toIndianWords(rounded)} Rupees Only`;
}
function toIndianWords(value) {
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    const belowHundred = (num) => num < 20 ? ones[num] : `${tens[Math.floor(num / 10)]}${num % 10 ? ` ${ones[num % 10]}` : ""}`;
    const belowThousand = (num) => num >= 100 ? `${ones[Math.floor(num / 100)]} Hundred${num % 100 ? ` ${belowHundred(num % 100)}` : ""}` : belowHundred(num);
    const parts = [];
    const crore = Math.floor(value / 10000000);
    value %= 10000000;
    const lakh = Math.floor(value / 100000);
    value %= 100000;
    const thousand = Math.floor(value / 1000);
    value %= 1000;
    if (crore)
        parts.push(`${belowThousand(crore)} Crore`);
    if (lakh)
        parts.push(`${belowThousand(lakh)} Lakh`);
    if (thousand)
        parts.push(`${belowThousand(thousand)} Thousand`);
    if (value)
        parts.push(belowThousand(value));
    return parts.join(" ");
}
function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function escapeAttribute(value) {
    return String(value ?? "").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
function qrMarkup() {
    return Array.from({ length: 21 * 21 }, (_, index) => {
        const x = index % 21;
        const y = Math.floor(index / 21);
        const finder = (x < 7 && y < 7 && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4))) ||
            (x > 13 && y < 7 && (x === 14 || x === 20 || y === 0 || y === 6 || (x >= 16 && x <= 18 && y >= 2 && y <= 4))) ||
            (x < 7 && y > 13 && (x === 0 || x === 6 || y === 14 || y === 20 || (x >= 2 && x <= 4 && y >= 16 && y <= 18)));
        const noise = ((x * 7 + y * 11 + x * y) % 5 === 0) || ((x * 3 + y * 13) % 7 === 0);
        return `<span class="${finder || noise ? "on" : ""}"></span>`;
    }).join("");
}
