import { Invoice, type ChargeRow, type InvoiceData } from "./Invoice";

type InvoiceTemplateProps = {
  data?: Partial<InvoiceData>;
  charges?: ChargeRow[];
  editable?: boolean;
};

export function InvoiceTemplate({ data, charges, editable = true }: InvoiceTemplateProps) {
  return <Invoice data={data} charges={charges} editable={editable} showControls={editable} />;
}

export default InvoiceTemplate;
