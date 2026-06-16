CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'Management',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  gst_number text,
  contact_person text,
  address text,
  email text,
  phone text,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE customer_locations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  location_name text NOT NULL,
  full_address text NOT NULL,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_customer_locations_customer_id ON customer_locations(customer_id) WHERE deleted_at IS NULL;

CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_number text UNIQUE NOT NULL,
  vehicle_type text NOT NULL,
  owner_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('Available','Assigned','In Transit','Maintenance')),
  insurance_expiry date,
  permit_expiry date,
  fitness_expiry date,
  puc_expiry date,
  service_due date,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE drivers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  mobile text NOT NULL,
  license_number text NOT NULL,
  license_expiry date,
  address text,
  status text NOT NULL CHECK (status IN ('Available','Assigned','On Trip','Leave')),
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE trips (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_number text UNIQUE NOT NULL,
  trip_date date NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  customer_location_id uuid REFERENCES customer_locations(id),
  temporary_location_name text,
  temporary_location_address text,
  consignor_name text,
  consignor_address text,
  consignor_gst text,
  consignee_name text,
  consignee_address text,
  consignee_gst text,
  vehicle_id uuid REFERENCES vehicles(id),
  driver_id uuid REFERENCES drivers(id),
  loading_point text NOT NULL,
  unloading_point text NOT NULL,
  loading_lat numeric(10, 6),
  loading_lng numeric(10, 6),
  unloading_lat numeric(10, 6),
  unloading_lng numeric(10, 6),
  distance_km numeric(12, 2) DEFAULT 0,
  freight_amount numeric(14, 2) NOT NULL DEFAULT 0,
  advance numeric(14, 2) NOT NULL DEFAULT 0,
  diesel_expense numeric(14, 2) NOT NULL DEFAULT 0,
  toll_expense numeric(14, 2) NOT NULL DEFAULT 0,
  loading_expense numeric(14, 2) NOT NULL DEFAULT 0,
  unloading_expense numeric(14, 2) NOT NULL DEFAULT 0,
  other_expense numeric(14, 2) NOT NULL DEFAULT 0,
  revenue numeric(14, 2) GENERATED ALWAYS AS (freight_amount) STORED,
  expense numeric(14, 2) GENERATED ALWAYS AS (diesel_expense + toll_expense + loading_expense + unloading_expense + other_expense) STORED,
  profit numeric(14, 2) GENERATED ALWAYS AS (freight_amount - diesel_expense - toll_expense - loading_expense - unloading_expense - other_expense) STORED,
  remarks text,
  status text NOT NULL CHECK (status IN ('Draft','Assigned','Loading','In Transit','Delivered','Completed')),
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number text UNIQUE NOT NULL,
  trip_id uuid NOT NULL REFERENCES trips(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  invoice_date date NOT NULL,
  due_date date NOT NULL,
  amount numeric(14, 2) NOT NULL,
  outstanding_amount numeric(14, 2) NOT NULL,
  status text NOT NULL CHECK (status IN ('Pending','Partial','Paid','Overdue')),
  pdf_path text,
  email_recipient text,
  email_date timestamptz,
  email_status text,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id uuid REFERENCES invoices(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  amount numeric(14, 2) NOT NULL,
  payment_date date NOT NULL,
  reference_number text,
  mode text NOT NULL CHECK (mode IN ('NEFT','RTGS','UPI','Cash','Cheque','Other','Bank Transfer')),
  remarks text,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE payment_allocations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  allocated_amount numeric(14, 2) NOT NULL CHECK (allocated_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_search ON customers (lower(name), gst_number, phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_trips_customer_date ON trips (customer_id, trip_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_customer_status ON invoices (customer_id, status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_payments_customer_date ON payments (customer_id, payment_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_payment_allocations_payment_id ON payment_allocations(payment_id);

CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id uuid NOT NULL REFERENCES trips(id),
  type text NOT NULL CHECK (type IN ('Diesel','Toll','Driver Advance','Repair','Loading','Unloading','Miscellaneous')),
  amount numeric(14, 2) NOT NULL,
  expense_date date NOT NULL,
  remarks text,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE maintenance (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  trip_id uuid REFERENCES trips(id),
  service_date date NOT NULL,
  service_type text NOT NULL,
  odometer_km numeric(12, 2),
  cost numeric(14, 2) NOT NULL DEFAULT 0,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  record_type text NOT NULL,
  record_id uuid NOT NULL,
  document_type text NOT NULL,
  file_path text NOT NULL,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE bilties (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  bilty_number text UNIQUE NOT NULL,
  trip_id uuid UNIQUE NOT NULL REFERENCES trips(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  driver_id uuid NOT NULL REFERENCES drivers(id),
  upload_date timestamptz NOT NULL DEFAULT now(),
  bilty_date date,
  file_url text,
  file_type text,
  file_size numeric(14, 2) DEFAULT 0,
  remarks text,
  status text NOT NULL CHECK (status IN ('Uploaded','Missing','Pending')),
  verification_status text NOT NULL CHECK (verification_status IN ('Pending Verification','Verified')),
  uploaded_by uuid REFERENCES users(id),
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  ocr_bilty_number text,
  ocr_bilty_date date,
  consignor text,
  consignee text,
  vehicle_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_bilties_trip_id ON bilties(trip_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bilties_customer_id ON bilties(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bilties_vehicle_id ON bilties(vehicle_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bilties_driver_id ON bilties(driver_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bilties_status ON bilties(status, verification_status) WHERE deleted_at IS NULL;

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid REFERENCES users(id),
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
