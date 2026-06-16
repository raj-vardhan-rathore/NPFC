import { Invoice, type ChargeRow, type InvoiceData } from "./Invoice";

type InvoicePDFProps = {
  data?: Partial<InvoiceData>;
  charges?: ChargeRow[];
};

export function InvoicePDF({ data, charges }: InvoicePDFProps) {
  return <Invoice data={data} charges={charges} editable={false} showControls={false} />;
}

export default InvoicePDF;
