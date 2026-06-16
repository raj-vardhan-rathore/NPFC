import { useMemo, useState } from "react";
import type React from "react";
import "./Invoice.css";

export type ChargeRow = {
  id: string;
  description: string;
  amount: string;
  remarks: string;
};

export type InvoiceData = {
  logoText: string;
  companyName: string;
  companySubtitle: string;
  companyDisplayName: string;
  companyAddressLine1: string;
  companyAddressLine2: string;
  companyAddressLine3: string;
  companyGST: string;
  companyState: string;
  companyEmail: string;
  companyPhone: string;
  invoiceNo: string;
  invoiceDate: string;
  tripId: string;
  deliveryNoteNo: string;
  referenceNoDate: string;
  dispatchedThrough: string;
  placeOfReceipt: string;
  placeOfDelivery: string;
  consignorCompany: string;
  consignorAddress: string;
  consignorGST: string;
  consignorState: string;
  consignorContactPerson: string;
  consignorContact: string;
  consigneeCompany: string;
  consigneeAddress: string;
  consigneeGST: string;
  consigneeState: string;
  consigneeContactPerson: string;
  consigneeContact: string;
  payeeCompany: string;
  payeeMobile: string;
  payeeContactPerson: string;
  payeeEmail: string;
  vehicleNumber: string;
  materialDescription: string;
  weight: string;
  ratePerMt: string;
  totalFreight: string;
  loadingPoint: string;
  unloadingPoint: string;
  distance: string;
  arrivalTime: string;
  departureTime: string;
  totalHaltTime: string;
  deliveryLocation: string;
  amountPaid: string;
  amountInWords: string;
  paymentTerms: string;
  paymentMode: string;
  podStatus: string;
  ewayBillNo: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
  remarks: string;
  signatoryCompany: string;
  footerNote: string;
};

export const defaultInvoiceData: InvoiceData = {
  logoText: "NPFC",
  companyName: "NPFC LOGISTICS",
  companySubtitle: "Freight & Transportation Services",
  companyDisplayName: "NPFC Logistics",
  companyAddressLine1: "Khasra No. 353,",
  companyAddressLine2: "Lajogi Nagar, Pahadia,",
  companyAddressLine3: "Indore (M.P.) - 452020",
  companyGST: "23AABCN2000P1Z4",
  companyState: "Madhya Pradesh, Code : 23",
  companyEmail: "operations@npfc.in",
  companyPhone: "0731-XXXXXXX",
  invoiceNo: "NPFC/INV/24-25/0158",
  invoiceDate: "11-May-2024",
  tripId: "TRP/24-25/1024",
  deliveryNoteNo: "DN/1024",
  referenceNoDate: "PO/4587 dt. 08-May-2024",
  dispatchedThrough: "NPFC Fleet",
  placeOfReceipt: "Indore (M.P.)",
  placeOfDelivery: "Bhopal (M.P.)",
  consignorCompany: "{{consignorCompany}}",
  consignorAddress: "{{consignorAddress}}",
  consignorGST: "{{consignorGST}}",
  consignorState: "Madhya Pradesh, Code : 23",
  consignorContactPerson: "Mr. Amit Verma",
  consignorContact: "{{consignorContact}}",
  consigneeCompany: "{{consigneeCompany}}",
  consigneeAddress: "{{consigneeAddress}}",
  consigneeGST: "{{consigneeGST}}",
  consigneeState: "Madhya Pradesh, Code : 23",
  consigneeContactPerson: "Mr. Suresh Patel",
  consigneeContact: "{{consigneeContact}}",
  payeeCompany: "M/s. Bhopal Engineering Works",
  payeeMobile: "98270-XXXXXX",
  payeeContactPerson: "Mr. Suresh Patel",
  payeeEmail: "suresh.patel@bew.in",
  vehicleNumber: "MP09HF9480",
  materialDescription: "Fly Ash (Bulk)",
  weight: "28.340 MT",
  ratePerMt: "1,253.35",
  totalFreight: "35,500.00",
  loadingPoint: "Indore (M.P.)",
  unloadingPoint: "Bhopal (M.P.)",
  distance: "195 KM",
  arrivalTime: "10-May-2024  08:15 AM",
  departureTime: "10-May-2024  02:45 PM",
  totalHaltTime: "06 Hrs. 30 Mins.",
  deliveryLocation: "Bhopal (M.P.)",
  amountPaid: "20,000.00",
  amountInWords: "INR Thirty Five Thousand Five Hundred Only",
  paymentTerms: "7 Days",
  paymentMode: "Bank Transfer / NEFT",
  podStatus: "Pending",
  ewayBillNo: "NA",
  bankName: "HDFC Bank Ltd.",
  accountNumber: "502000XXXXXXX",
  ifscCode: "HDFC0001234",
  branch: "Indore - Pithampur Road",
  remarks: "",
  signatoryCompany: "NPFC LOGISTICS",
  footerNote: "Thank you for giving us the opportunity to serve you!"
};

export const defaultChargeRows: ChargeRow[] = [
  { id: "freight", description: "Freight Charges", amount: "50,000.00", remarks: "" },
  { id: "loading", description: "Loading Charges", amount: "2,000.00", remarks: "" },
  { id: "unloading", description: "Unloading Charges", amount: "2,000.00", remarks: "" },
  { id: "toll", description: "Toll Charges", amount: "1,000.00", remarks: "" },
  { id: "other", description: "Other Charges", amount: "500.00", remarks: "" }
];

type InvoiceProps = {
  data?: Partial<InvoiceData>;
  charges?: ChargeRow[];
  editable?: boolean;
  showControls?: boolean;
};

export function Invoice({ data, charges, editable = true, showControls = true }: InvoiceProps) {
  const [invoiceData, setInvoiceData] = useState<InvoiceData>({ ...defaultInvoiceData, ...data });
  const [chargeRows, setChargeRows] = useState<ChargeRow[]>(compactChargeRows(charges?.length ? charges : defaultChargeRows));

  const totals = useMemo(() => {
    const total = chargeRows.reduce((sum, row) => sum + parseCurrency(row.amount), 0);
    const paid = parseCurrency(invoiceData.amountPaid);
    const remaining = Math.max(total - paid, 0);
    return {
      total,
      paid,
      remaining,
      remainingClass: remaining > 0 ? "invoice-red" : "invoice-green"
    };
  }, [chargeRows, invoiceData.amountPaid]);

  const updateField = (field: keyof InvoiceData, value: string) => {
    setInvoiceData((current) => ({ ...current, [field]: value }));
  };

  const updateCharge = (id: string, field: keyof ChargeRow, value: string) => {
    setChargeRows((rows) => rows.map((row) => row.id === id ? { ...row, [field]: value } : row));
  };

  const addChargeRow = () => {
    setChargeRows((rows) => compactChargeRows([...rows, { id: `charge-${Date.now()}`, description: "Additional Charges", amount: "0.00", remarks: "" }]));
  };

  return (
    <div className="invoice-page-wrap">
      <article className="invoice-a4" aria-label="Transport Invoice">
        <div className="invoice-frame">
          <header className="invoice-header">
            <div className="invoice-brand">
              <Editable as="div" className="invoice-logo" value={invoiceData.logoText} editable={editable} onChange={(value) => updateField("logoText", value)} />
              <Editable as="div" className="invoice-company-title" value={invoiceData.companyName} editable={editable} onChange={(value) => updateField("companyName", value)} />
              <Editable as="div" className="invoice-company-subtitle" value={invoiceData.companySubtitle} editable={editable} onChange={(value) => updateField("companySubtitle", value)} />
            </div>
            <div className="invoice-title-block">
              <h1>TRANSPORT INVOICE</h1>
              <div>(ORIGINAL FOR RECIPIENT)</div>
            </div>
            <div className="invoice-qr-block">
              <div className="invoice-qr-label">Invoice QR</div>
              <QrBlock />
            </div>
          </header>

          <section className="invoice-company-row">
            <div className="invoice-company-info">
              <Editable as="div" className="invoice-blue-title" value={invoiceData.companyDisplayName} editable={editable} onChange={(value) => updateField("companyDisplayName", value)} />
              <EditableLine field="companyAddressLine1" value={invoiceData.companyAddressLine1} editable={editable} onChange={updateField} />
              <EditableLine field="companyAddressLine2" value={invoiceData.companyAddressLine2} editable={editable} onChange={updateField} />
              <EditableLine field="companyAddressLine3" value={invoiceData.companyAddressLine3} editable={editable} onChange={updateField} />
              <LabeledEditable label="GSTIN/UIN" value={invoiceData.companyGST} editable={editable} onChange={(value) => updateField("companyGST", value)} />
              <LabeledEditable label="State Name" value={invoiceData.companyState} editable={editable} onChange={(value) => updateField("companyState", value)} />
              <LabeledEditable label="E-Mail" value={invoiceData.companyEmail} editable={editable} onChange={(value) => updateField("companyEmail", value)} />
              <LabeledEditable label="Phone" value={invoiceData.companyPhone} editable={editable} onChange={(value) => updateField("companyPhone", value)} />
            </div>
            <div className="invoice-meta-info">
              <LabeledEditable label="Invoice No." value={invoiceData.invoiceNo} editable={editable} onChange={(value) => updateField("invoiceNo", value)} />
              <LabeledEditable label="Invoice Date" value={invoiceData.invoiceDate} editable={editable} onChange={(value) => updateField("invoiceDate", value)} />
              <LabeledEditable label="Trip ID" value={invoiceData.tripId} editable={editable} onChange={(value) => updateField("tripId", value)} />
              <LabeledEditable label="Delivery Note No." value={invoiceData.deliveryNoteNo} editable={editable} onChange={(value) => updateField("deliveryNoteNo", value)} />
              <LabeledEditable label="Reference No. & Date" value={invoiceData.referenceNoDate} editable={editable} onChange={(value) => updateField("referenceNoDate", value)} />
              <LabeledEditable label="Dispatched Through" value={invoiceData.dispatchedThrough} editable={editable} onChange={(value) => updateField("dispatchedThrough", value)} />
              <LabeledEditable label="Place of Receipt" value={invoiceData.placeOfReceipt} editable={editable} onChange={(value) => updateField("placeOfReceipt", value)} />
              <LabeledEditable label="Place of Delivery" value={invoiceData.placeOfDelivery} editable={editable} onChange={(value) => updateField("placeOfDelivery", value)} />
            </div>
          </section>

          <section className="invoice-party-row">
            <PartyBox
              title="CONSIGNOR (From)"
              rows={[
                ["Company Name", "consignorCompany"],
                ["Address", "consignorAddress"],
                ["GSTIN/UIN", "consignorGST"],
                ["State Name", "consignorState"],
                ["Contact Person", "consignorContactPerson"],
                ["Contact No.", "consignorContact"]
              ]}
              data={invoiceData}
              editable={editable}
              onChange={updateField}
            />
            <PartyBox
              title="CONSIGNEE (To)"
              rows={[
                ["Company Name", "consigneeCompany"],
                ["Address", "consigneeAddress"],
                ["GSTIN/UIN", "consigneeGST"],
                ["State Name", "consigneeState"],
                ["Contact Person", "consigneeContactPerson"],
                ["Contact No.", "consigneeContact"]
              ]}
              data={invoiceData}
              editable={editable}
              onChange={updateField}
            />
          </section>

          <section className="invoice-payee-row">
            <div className="invoice-section-title">PAYEE / BILLING CONTACT PERSON DETAILS</div>
            <div className="invoice-payee-grid">
              <LabeledEditable label="Company Name" value={invoiceData.payeeCompany} editable={editable} onChange={(value) => updateField("payeeCompany", value)} />
              <LabeledEditable label="Mobile No." value={invoiceData.payeeMobile} editable={editable} onChange={(value) => updateField("payeeMobile", value)} />
              <LabeledEditable label="Contact Person" value={invoiceData.payeeContactPerson} editable={editable} onChange={(value) => updateField("payeeContactPerson", value)} />
              <LabeledEditable label="Email ID" value={invoiceData.payeeEmail} editable={editable} onChange={(value) => updateField("payeeEmail", value)} />
            </div>
          </section>

          <section className="invoice-trip-row">
            <div className="invoice-section-title">TRIP DETAILS</div>
            <div className="invoice-trip-grid invoice-grid-border">
              <CellHead>Vehicle Number</CellHead>
              <CellHead>Source</CellHead>
              <CellHead>Destination</CellHead>
              <CellHead>Material</CellHead>
              <CellHead>Weight (MT)</CellHead>
              <CellHead>Rate Per MT</CellHead>
              <CellHead>Total Freight</CellHead>
              <CellValue><Editable value={invoiceData.vehicleNumber} editable={editable} onChange={(value) => updateField("vehicleNumber", value)} /></CellValue>
              <CellValue><Editable value={invoiceData.loadingPoint} editable={editable} onChange={(value) => updateField("loadingPoint", value)} /></CellValue>
              <CellValue><Editable value={invoiceData.unloadingPoint} editable={editable} onChange={(value) => updateField("unloadingPoint", value)} /></CellValue>
              <CellValue><Editable value={invoiceData.materialDescription} editable={editable} onChange={(value) => updateField("materialDescription", value)} /></CellValue>
              <CellValue><Editable value={invoiceData.weight} editable={editable} onChange={(value) => updateField("weight", value)} /></CellValue>
              <CellValue><Editable value={invoiceData.ratePerMt} editable={editable} onChange={(value) => updateField("ratePerMt", value)} /></CellValue>
              <CellValue><Editable value={invoiceData.totalFreight} editable={editable} onChange={(value) => updateField("totalFreight", value)} /></CellValue>
            </div>
          </section>

          <section className="invoice-timing-row">
            <div className="invoice-section-title">TIMING DETAILS</div>
            <div className="invoice-timing-grid invoice-grid-border">
              <CellHead>Arrival Date & Time</CellHead>
              <CellHead>Departure Date & Time</CellHead>
              <CellHead>Total Time of Halt</CellHead>
              <CellHead>Delivery Time</CellHead>
              <CellValue><Editable value={invoiceData.arrivalTime} editable={editable} onChange={(value) => updateField("arrivalTime", value)} /></CellValue>
              <CellValue><Editable value={invoiceData.departureTime} editable={editable} onChange={(value) => updateField("departureTime", value)} /></CellValue>
              <CellValue><Editable value={invoiceData.totalHaltTime} editable={editable} onChange={(value) => updateField("totalHaltTime", value)} /></CellValue>
              <CellValue><Editable value={invoiceData.deliveryLocation} editable={editable} onChange={(value) => updateField("deliveryLocation", value)} /></CellValue>
            </div>
          </section>

          <section className="invoice-charges-row">
            <div className="invoice-section-title">CHARGES DETAILS</div>
            <div className="invoice-charges-table">
              <div className="invoice-charge-head">Description</div>
              <div className="invoice-charge-head invoice-center">Amount</div>
              <div className="invoice-charge-head">Remarks</div>
              {chargeRows.map((row) => (
                <ChargeLine key={row.id} row={row} editable={editable} onChange={updateCharge} />
              ))}
            </div>
            {showControls && editable ? <button className="invoice-add-row" type="button" onClick={addChargeRow}>Add Row</button> : null}
            <div className="invoice-summary-lines">
              <SummaryRow label="TOTAL AMOUNT PAYABLE" value={formatCurrency(totals.total)} />
              <SummaryRow label="TOTAL AMOUNT PAID" value={invoiceData.amountPaid} editable={editable} onChange={(value) => updateField("amountPaid", value)} />
              <SummaryRow label="REMAINING AMOUNT" value={formatCurrency(totals.remaining)} valueClass={totals.remainingClass} />
            </div>
            <div className="invoice-words-line">
              <span>Amount Chargeable (in words)</span>
              <b>:</b>
              <Editable as="strong" value={invoiceData.amountInWords} editable={editable} onChange={(value) => updateField("amountInWords", value)} />
            </div>
          </section>

          <section className="invoice-bottom-row">
            <div className="invoice-small-box">
              <div className="invoice-box-title">OTHER INFORMATION</div>
              <LabeledEditable label="Payment Terms" value={invoiceData.paymentTerms} editable={editable} onChange={(value) => updateField("paymentTerms", value)} />
              <LabeledEditable label="Payment Mode" value={invoiceData.paymentMode} editable={editable} onChange={(value) => updateField("paymentMode", value)} />
              <LabeledEditable label="POD Status" value={invoiceData.podStatus} editable={editable} onChange={(value) => updateField("podStatus", value)} />
              <LabeledEditable label="E-Way Bill No." value={invoiceData.ewayBillNo} editable={editable} onChange={(value) => updateField("ewayBillNo", value)} />
            </div>
            <div className="invoice-small-box">
              <div className="invoice-box-title">BANK DETAILS</div>
              <LabeledEditable label="Bank Name" value={invoiceData.bankName} editable={editable} onChange={(value) => updateField("bankName", value)} />
              <LabeledEditable label="A/c No." value={invoiceData.accountNumber} editable={editable} onChange={(value) => updateField("accountNumber", value)} />
              <LabeledEditable label="IFSC Code" value={invoiceData.ifscCode} editable={editable} onChange={(value) => updateField("ifscCode", value)} />
              <LabeledEditable label="Branch" value={invoiceData.branch} editable={editable} onChange={(value) => updateField("branch", value)} />
            </div>
          </section>

          <section className="invoice-remarks-sign-row">
            <div className="invoice-remarks-box">
              <div className="invoice-box-title">REMARKS</div>
              <Editable as="div" className="invoice-remarks-text" value={invoiceData.remarks} editable={editable} onChange={(value) => updateField("remarks", value)} />
            </div>
            <div className="invoice-sign-box">
              <div>For <Editable as="strong" value={invoiceData.signatoryCompany} editable={editable} onChange={(value) => updateField("signatoryCompany", value)} /></div>
              <div className="invoice-sign-line" />
              <strong>AUTHORISED SIGNATORY</strong>
              <span>(With Name & Seal)</span>
            </div>
          </section>

          <footer className="invoice-footer">
            <Editable as="strong" value={invoiceData.footerNote} editable={editable} onChange={(value) => updateField("footerNote", value)} />
          </footer>
        </div>
      </article>
    </div>
  );
}

function PartyBox({ title, rows, data, editable, onChange }: {
  title: string;
  rows: Array<[string, keyof InvoiceData]>;
  data: InvoiceData;
  editable: boolean;
  onChange: (field: keyof InvoiceData, value: string) => void;
}) {
  return (
    <div className="invoice-party-box">
      <div className="invoice-box-title">{title}</div>
      {rows.map(([label, field]) => (
        <LabeledEditable key={field} label={label} value={data[field]} editable={editable} onChange={(value) => onChange(field, value)} />
      ))}
    </div>
  );
}

function ChargeLine({ row, editable, onChange }: {
  row: ChargeRow;
  editable: boolean;
  onChange: (id: string, field: keyof ChargeRow, value: string) => void;
}) {
  return (
    <>
      <div className="invoice-charge-cell">
        <Editable value={row.description} editable={editable} onChange={(value) => onChange(row.id, "description", value)} />
      </div>
      <div className="invoice-charge-cell invoice-amount-cell">
        <span>₹</span>
        <Editable value={row.amount} editable={editable} onChange={(value) => onChange(row.id, "amount", value)} />
      </div>
      <div className="invoice-charge-cell">
        <Editable value={row.remarks} editable={editable} onChange={(value) => onChange(row.id, "remarks", value)} />
      </div>
    </>
  );
}

function SummaryRow({ label, value, valueClass = "", editable = false, onChange }: {
  label: string;
  value: string;
  valueClass?: string;
  editable?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="invoice-summary-row">
      <strong>{label}</strong>
      <b>:</b>
      <span className={`invoice-summary-value ${valueClass}`}>
        <span>₹</span>
        <Editable value={value} editable={editable} onChange={(next) => onChange?.(next)} />
      </span>
    </div>
  );
}

function LabeledEditable({ label, value, editable, onChange }: {
  label: string;
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="invoice-label-row">
      <span className="invoice-label">{label}</span>
      <b>:</b>
      <Editable value={value} editable={editable} onChange={onChange} />
    </div>
  );
}

function EditableLine({ field, value, editable, onChange }: {
  field: keyof InvoiceData;
  value: string;
  editable: boolean;
  onChange: (field: keyof InvoiceData, value: string) => void;
}) {
  return <Editable as="div" className="invoice-plain-line" value={value} editable={editable} onChange={(next) => onChange(field, next)} />;
}

function Editable({ value, editable, onChange, as = "span", className = "" }: {
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
  as?: "span" | "div" | "strong";
  className?: string;
}) {
  const Element = as;
  return (
    <Element
      className={`invoice-editable ${className}`}
      contentEditable={editable}
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={(event) => onChange(event.currentTarget.textContent || "")}
    >
      {value}
    </Element>
  );
}

function CellHead({ children }: { children: React.ReactNode }) {
  return <div className="invoice-cell-head">{children}</div>;
}

function CellValue({ children }: { children: React.ReactNode }) {
  return <div className="invoice-cell-value">{children}</div>;
}

function QrBlock() {
  const modules = Array.from({ length: 21 * 21 }, (_, index) => {
    const x = index % 21;
    const y = Math.floor(index / 21);
    const finder =
      (x < 7 && y < 7 && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4))) ||
      (x > 13 && y < 7 && (x === 14 || x === 20 || y === 0 || y === 6 || (x >= 16 && x <= 18 && y >= 2 && y <= 4))) ||
      (x < 7 && y > 13 && (x === 0 || x === 6 || y === 14 || y === 20 || (x >= 2 && x <= 4 && y >= 16 && y <= 18)));
    const noise = ((x * 7 + y * 11 + x * y) % 5 === 0) || ((x * 3 + y * 13) % 7 === 0);
    return <span key={index} className={finder || noise ? "on" : ""} />;
  });
  return <div className="invoice-qr-grid" aria-hidden="true">{modules}</div>;
}

function parseCurrency(value: string) {
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function compactChargeRows(rows: ChargeRow[]) {
  if (rows.length <= 5) return rows;
  const visible = rows.slice(0, 4);
  const extra = rows.slice(4);
  const amount = extra.reduce((sum, row) => sum + parseCurrency(row.amount), 0);
  const remarks = extra.map((row) => row.description).filter(Boolean).join(", ");
  return [
    ...visible,
    {
      id: "additional-combined",
      description: "Additional Charges",
      amount: formatCurrency(amount),
      remarks
    }
  ];
}

export default Invoice;
