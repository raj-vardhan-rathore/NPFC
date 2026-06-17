import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import { Controller, useForm } from "react-hook-form";
import { MapContainer, Polyline, Popup, TileLayer } from "react-leaflet";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, cn, money } from "./lib";
import { getApiBaseUrl } from "./api/client";
import { useSession } from "./store";
import { login as loginApi } from "./api/auth";
import type { Bilty, Customer, CustomerLocation, DashboardData, Driver, Invoice, Payment, Trip, Vehicle } from "./types";
import { createCompany, deleteCompany, updateCompany } from "./api/companies";
import { createDriver, deleteDriver, updateDriver } from "./api/drivers";
import { createVehicle, deleteVehicle, updateVehicle, type VehiclePayload } from "./api/vehicles";
import { createTrip, updateTrip as updateTripApi, deleteTrip as deleteTripApi } from "./api/trips";
import { generateInvoice as generateInvoiceApi, updateInvoice as updateInvoiceApi, regenerateInvoice as regenerateInvoiceApi, deleteInvoice as deleteInvoiceApi } from "./api/invoices";
import { createPayment, deletePayment, exportPaymentsUrl, updatePayment } from "./api/payments";
import { deleteUpload, previewUpload, uploadFile } from "./api/uploads";
import { createBilty, deleteBilty, downloadBilty, getBilties, updateBilty, verifyBilty } from "./api/bilties";
import { getDocumentRepository, type DocumentRepositoryPayload, type RepositoryDocument, type RepositoryDocumentCategory, type RepositoryDocumentStatus } from "./api/documents";
import { createExpense as createManualExpense, deleteExpense, getExpenseDashboard, updateExpense, type ExpenseDashboard, type ExpensePayload, type ExpenseRow, type ExpenseSummaryRow } from "./api/expenses";
import { createAccident, createMaintenance, createTyre, deleteMaintenance, getMaintenanceDashboard, getMaintenanceRecord, maintenanceExportUrl, updateMaintenance, type AccidentRecord, type MaintenanceDashboard, type MaintenancePayload, type MaintenanceRecord, type MaintenanceStatus, type TyreRecord } from "./api/maintenance";
import { generateProfitLossStatement, getProfitLossCashflow, getProfitLossCustomers, getProfitLossDrivers, getProfitLossExpenses, getProfitLossKpis, getProfitLossReceivables, getProfitLossRevenue, getProfitLossTrips, getProfitLossVehicles, profitLossExportUrl, type ProfitLossFilters, type ProfitLossKpiCard, type ProfitLossKpis, type ProfitTripRow } from "./api/profit-loss";
import { exportReport, getReportCategory, getReportsDashboard, scheduleReport, type ReportCategory, type ReportDefinition, type ReportFilters, type ReportPayload, type ReportsDashboard } from "./api/reports";
import { getSettings, runSettingsBackup, updateSettings, type SettingsPayload } from "./api/settings";
import { deleteAttendance, listAttendance, saveAttendance, updateAttendance, type AttendanceEntry, type AttendanceStatus } from "./api/attendance";
import { sendStatusUpdate } from "./api/status";

const colors = ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#14B8A6", "#A855F7"];

type IconProps = { size?: number; className?: string };
const makeIcon = (label: string) => ({ size = 18, className = "" }: IconProps) => (
  <span
    className={cn("inline-grid place-items-center rounded border border-current/30 text-[10px] font-semibold leading-none", className)}
    style={{ width: size, height: size, minWidth: size }}
    aria-hidden="true"
  >
    {label}
  </span>
);

const AlertTriangle = makeIcon("!");
const Banknote = makeIcon("₹");
const BarChart3 = makeIcon("B");
const Bell = makeIcon("N");
const ClipboardList = makeIcon("L");
const CreditCard = makeIcon("C");
const FileArchive = makeIcon("A");
const FileText = makeIcon("F");
const Fuel = makeIcon("D");
const Gauge = makeIcon("G");
const LayoutDashboard = makeIcon("D");
const LogOut = makeIcon("O");
const Menu = makeIcon("M");
const ReceiptText = makeIcon("I");
const Route = makeIcon("R");
const Search = makeIcon("S");
const Settings = makeIcon("S");
const ShieldCheck = makeIcon("E");
const Truck = makeIcon("T");
const UserRound = makeIcon("U");
const UsersRound = makeIcon("CU");
const Wrench = makeIcon("W");

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Trips", icon: Route, group: "OPERATIONS" },
  { label: "Vehicles", icon: Truck, group: "OPERATIONS" },
  { label: "Drivers", icon: UserRound, group: "OPERATIONS" },
  { label: "Customers", icon: UsersRound, group: "OPERATIONS" },
  { label: "Invoices", icon: ReceiptText, group: "FINANCE" },
  { label: "Payments", icon: CreditCard, group: "FINANCE" },
  { label: "Expenses", icon: Fuel, group: "FINANCE" },
  { label: "Profit & Loss", icon: BarChart3, group: "FINANCE" },
  { label: "Bilty / LR Management", icon: ShieldCheck, group: "COMPLIANCE" },
  { label: "Documents", icon: FileArchive, group: "COMPLIANCE" },
  { label: "Maintenance", icon: Wrench, group: "FLEET" },
  { label: "Service Records", icon: ClipboardList, group: "FLEET" },
  { label: "Reports", icon: FileText },
  { label: "Settings", icon: Settings }
];

type Data = {
  dashboard?: DashboardData;
  trips: Trip[];
  routes: RouteOverlay[];
  vehicles: Vehicle[];
  drivers: Driver[];
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  bilties: Bilty[];
  driverTransactions: DriverTransaction[];
  attendance: AttendanceEntry[];
};

const dataCacheKey = "npfc.erp.data.v2";
const dataCacheTtlMs = 60_000;

function readDataCache(): Data | undefined {
  try {
    const cached = JSON.parse(sessionStorage.getItem(dataCacheKey) || "null");
    if (!cached || Date.now() - cached.savedAt > dataCacheTtlMs) return undefined;
    return cached.data;
  } catch {
    return undefined;
  }
}

function writeDataCache(data: Data) {
  try {
    sessionStorage.setItem(dataCacheKey, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Session storage can fail in private contexts; the app should still run normally.
  }
}

type RouteOverlay = {
  id: string;
  tripNumber: string;
  vehicle: Vehicle;
  customer: Customer;
  from: string;
  to: string;
  coordinates: [number, number][];
  revenue: number;
  distanceKm: number;
  tripsCompleted: number;
  tripDate: string;
};

export function App() {
  const { token } = useSession();
  return token ? <Shell /> : <Login />;
}

function Login() {
  const { setSession } = useSession();
  const { register, handleSubmit, formState } = useForm({ defaultValues: { email: "", password: "" } });
  const [error, setError] = useState("");

  const onSubmit = handleSubmit(async (values) => {
    setError("");
    try {
      const result = await loginApi(values.email, values.password);
      setSession(result.token, result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    }
  });

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.18),transparent_34%),#0B1220] px-6">
      <form onSubmit={onSubmit} autoComplete="off" className="w-full max-w-md rounded-lg border border-tower-border bg-tower-card p-8 shadow-tower">
        <div className="mb-8 flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">NPFC Logistics ERP</h1>
            <p className="text-sm text-tower-muted">Internal control tower access</p>
          </div>
        </div>
        <label className="mb-4 block text-sm text-tower-muted">
          Email
          <input {...register("email")} autoComplete="off" className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-3 text-white outline-none ring-tower-primary focus:ring-2" />
        </label>
        <label className="mb-5 block text-sm text-tower-muted">
          Password
          <input type="password" {...register("password")} autoComplete="new-password" className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-3 text-white outline-none ring-tower-primary focus:ring-2" />
        </label>
        {error && <p className="mb-4 rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{error}</p>}
        <button disabled={formState.isSubmitting} className="w-full rounded-md bg-tower-primary px-4 py-3 font-medium text-white shadow-lg shadow-blue-950/30">
          Sign In
        </button>
      </form>
    </main>
  );
}

function Shell() {
  const { token, user, logout } = useSession();
  const [active, setActive] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const cachedData = useMemo(() => readDataCache(), []);
  const [data, setData] = useState<Data>(cachedData || { trips: [], routes: [], vehicles: [], drivers: [], customers: [], invoices: [], payments: [], bilties: [], driverTransactions: [], attendance: [] });
  const [loading, setLoading] = useState(!cachedData);

  const refreshData = useCallback(async () => {
    const [dashboard, trips, routes, vehicles, drivers, customers, invoices, payments, bilties, attendance] = await Promise.all([
      api<DashboardData>("/api/dashboard", token),
      api<Trip[]>("/api/trips", token),
      api<RouteOverlay[]>("/api/routes", token),
      api<Vehicle[]>("/api/vehicles", token),
      api<Driver[]>("/api/drivers", token),
      api<Customer[]>("/api/customers", token),
      api<Invoice[]>("/api/invoices", token),
      api<Payment[]>("/api/payments", token),
      getBilties(token).catch(() => []),
      listAttendance(token).catch(() => [])
    ]);
    const nextData = { dashboard, trips, routes, vehicles, drivers, customers, invoices, payments, bilties, attendance, driverTransactions: seedDriverTransactions(trips) };
    setData(nextData);
    writeDataCache(nextData);
  }, [token]);

  useEffect(() => {
    refreshData()
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [refreshData, logout]);

  return (
    <div className="min-h-screen bg-tower-bg text-white">
      <aside className={cn("fixed inset-y-0 left-0 z-40 w-72 border-r border-tower-border bg-tower-sidebar transition-transform lg:translate-x-0", sidebarOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-20 items-center gap-3 border-b border-tower-border px-6">
          <Logo />
          <div>
            <div className="text-lg font-semibold">NPFC</div>
            <div className="text-xs uppercase tracking-[0.22em] text-tower-muted">Logistics ERP</div>
          </div>
        </div>
        <nav className="h-[calc(100vh-5rem)] overflow-y-auto px-4 py-5">
          {renderNav(active, setActive, setSidebarOpen)}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-tower-border bg-tower-bg/90 px-5 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-md border border-tower-border p-2 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <div>
              <h2 className="text-xl font-semibold">{active}</h2>
              <p className="text-sm text-tower-muted">Trip-centered operations, finance, fleet, and compliance</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-md border border-tower-border bg-tower-card px-3 py-2 text-sm text-tower-muted md:flex">
              <Search size={16} />
              Search trips, vehicles, invoices
            </div>
            <button className="rounded-md border border-tower-border bg-tower-card p-2" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-xs text-tower-muted">{user?.role}</div>
            </div>
            <button onClick={logout} className="rounded-md border border-tower-border bg-tower-card p-2" aria-label="Logout">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="px-5 py-6 lg:px-8">
          {loading ? <Skeleton /> : active === "Dashboard" ? <Dashboard data={data} /> : <ModulePage name={active} data={data} setData={setData} token={token} refreshData={refreshData} setActive={setActive} />}
        </main>
      </div>
    </div>
  );
}

function renderNav(active: string, setActive: (value: string) => void, setSidebarOpen: (value: boolean) => void) {
  let lastGroup = "";
  return navigation.map((item) => {
    const Icon = item.icon;
    const group = item.group && item.group !== lastGroup ? item.group : "";
    lastGroup = item.group || lastGroup;
    return (
      <div key={item.label}>
        {group && <div className="mb-2 mt-5 px-3 text-xs font-semibold tracking-[0.18em] text-tower-muted">{group}</div>}
        <button
          onClick={() => {
            setActive(item.label);
            setSidebarOpen(false);
          }}
          className={cn("mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-tower-muted transition hover:bg-white/5 hover:text-white", active === item.label && "bg-tower-primary/15 text-white ring-1 ring-tower-primary/35")}
        >
          <Icon size={18} />
          {item.label}
        </button>
      </div>
    );
  });
}

function Dashboard({ data }: { data: Data }) {
  const dashboard = data.dashboard!;
  const totalRevenue = dashboard.finance?.revenue ?? dashboard.kpis.revenue ?? data.trips.reduce((sum, trip) => sum + trip.freightAmount, 0);
  const totalExpenses = dashboard.finance?.expenses ?? dashboard.kpis.expenses ?? data.trips.reduce((sum, trip) => sum + trip.totalExpense, 0);
  const outstandingPayments = data.invoices.reduce((sum, invoice) => sum + Math.max(invoice.outstandingAmount || 0, 0), 0);
  const activeVehicles = new Set(data.trips.filter((trip) => !["Delivered", "Completed", "Cancelled", "Payment Received"].includes(trip.status)).map((trip) => trip.vehicleId)).size;
  const activeDrivers = new Set(data.trips.filter((trip) => !["Delivered", "Completed", "Cancelled", "Payment Received"].includes(trip.status)).map((trip) => trip.driverId)).size;
  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-6 md:grid-cols-2">
        <Kpi title="Total Revenue" value={money(totalRevenue)} icon={Banknote} tone="success" />
        <Kpi title="Total Trips" value={dashboard.kpis.totalTrips ?? data.trips.length} icon={Route} tone="primary" />
        <Kpi title="Active Vehicles" value={activeVehicles || dashboard.kpis.trucksOnRoad || 0} icon={Truck} tone="primary" />
        <Kpi title="Active Drivers" value={activeDrivers} icon={UserRound} tone="primary" />
        <Kpi title="Outstanding Payments" value={money(outstandingPayments)} icon={ReceiptText} tone={outstandingPayments ? "warning" : "success"} />
        <Kpi title="Profit / Loss" value={money(totalRevenue - totalExpenses)} icon={Gauge} tone={totalRevenue >= totalExpenses ? "success" : "danger"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        <Kpi title="Vehicles Expiring Soon" value={dashboard.kpis.vehiclesExpiringSoon ?? countExpiringVehicleDocs(data.vehicles)} icon={AlertTriangle} tone="warning" />
        <Kpi title="Driver Licenses Expiring Soon" value={dashboard.kpis.driverLicensesExpiringSoon ?? data.drivers.filter((driver) => {
          const days = daysUntil(driver.licenseExpiry);
          return days >= 0 && days <= 30;
        }).length} icon={UserRound} tone="warning" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <RouteMap routes={data.routes} vehicles={data.vehicles} customers={data.customers} />
        <div className="space-y-6">
          <FleetAlerts vehicles={data.vehicles} />
          <DriverLicenseAlerts drivers={data.drivers} />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Active Trips" action="View all">
          <DataTable
            columns={["Trip ID", "Vehicle", "Customer", "Source", "Destination", "Status"]}
            rows={data.trips.filter((trip) => trip.status !== "Completed").map((trip) => [trip.tripNumber, trip.vehicle?.number, trip.customer?.name, trip.loadingPoint, trip.unloadingPoint, <Status key={trip.id} value={trip.status} />])}
          />
        </Panel>
        <Panel title="Outstanding Payments" action="Recover">
          <DataTable
            columns={["Customer", "Invoice", "Amount", "Due Date"]}
            rows={data.invoices.filter((invoice) => invoice.outstandingAmount > 0).map((invoice) => [data.customers.find((customer) => customer.id === invoice.customerId)?.name, invoice.invoiceNumber, money(invoice.outstandingAmount), invoice.dueDate])}
          />
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.62fr_0.38fr]">
        <RevenueAnalytics rows={dashboard.revenueAnalytics?.length ? dashboard.revenueAnalytics : [{ label: "Current", revenue: totalRevenue, expenses: totalExpenses, profit: totalRevenue - totalExpenses }]} />
        <PnlCard finance={dashboard.finance} />
      </section>
    </div>
  );
}

function Kpi({ title, value, icon: Icon, tone }: { title: string; value: string | number; icon: typeof Route; tone: "primary" | "success" | "warning" | "danger" }) {
  const toneClass = { primary: "text-tower-primary bg-tower-primary/10", success: "text-tower-success bg-tower-success/10", warning: "text-tower-warning bg-tower-warning/10", danger: "text-tower-danger bg-tower-danger/10" }[tone];
  return (
    <button className="rounded-lg border border-tower-border bg-tower-card p-5 text-left shadow-tower transition hover:-translate-y-0.5 hover:border-tower-primary/50">
      <div className="mb-5 flex items-center justify-between">
        <span className="text-sm text-tower-muted">{title}</span>
        <span className={cn("rounded-md p-2", toneClass)}>
          <Icon size={20} />
        </span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </button>
  );
}

function RouteMap({ routes, vehicles, customers }: { routes: RouteOverlay[]; vehicles: Vehicle[]; customers: Customer[] }) {
  const [vehicle, setVehicle] = useState("All");
  const [customer, setCustomer] = useState("All");
  const [dateRange, setDateRange] = useState("Week");
  const filtered = routes.filter((route) => (vehicle === "All" || route.vehicle.id === vehicle) && (customer === "All" || route.customer.id === customer));

  return (
    <Panel title="Route Activity Map" action={`${filtered.length} overlays`}>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Segment value={dateRange} onChange={setDateRange} values={["Today", "Week", "Month", "Custom"]} />
        <Select value={vehicle} onChange={setVehicle} options={[{ label: "All Vehicles", value: "All" }, ...vehicles.map((item) => ({ label: item.number, value: item.id }))]} />
        <Select value={customer} onChange={setCustomer} options={[{ label: "All Customers", value: "All" }, ...customers.map((item) => ({ label: item.name, value: item.id }))]} />
      </div>
      <div className="h-[430px] overflow-hidden rounded-lg border border-tower-border">
        <MapContainer center={[22.9734, 78.6569]} zoom={5} scrollWheelZoom>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {filtered.map((route, index) => (
            <Polyline key={route.id} positions={route.coordinates} pathOptions={{ color: colors[index % colors.length], weight: 4, opacity: 0.9 }}>
              <Popup>
                <div className="space-y-1 text-sm">
                  <strong>{route.vehicle.number}</strong>
                  <div>{route.from} to {route.to}</div>
                  <div>Trips completed: {route.tripsCompleted}</div>
                  <div>Revenue: {money(route.revenue)}</div>
                  <div>Distance: {route.distanceKm} km</div>
                </div>
              </Popup>
            </Polyline>
          ))}
        </MapContainer>
      </div>
    </Panel>
  );
}

function FleetAlerts({ vehicles }: { vehicles: Vehicle[] }) {
  const alerts = vehicles.flatMap((vehicle) => [
    { vehicle: vehicle.number, type: "Insurance Expiry", date: vehicle.insuranceExpiry },
    { vehicle: vehicle.number, type: "Permit Expiry", date: vehicle.permitExpiry },
    { vehicle: vehicle.number, type: "Fitness Expiry", date: vehicle.fitnessExpiry },
    { vehicle: vehicle.number, type: "PUC Expiry", date: vehicle.pucExpiry },
    { vehicle: vehicle.number, type: "Service Due", date: vehicle.serviceDue }
  ]).sort((a, b) => +new Date(a.date) - +new Date(b.date)).slice(0, 8);

  return (
    <Panel title="Fleet Alerts" action="30/15/7 day watch">
      <div className="space-y-3">
        {alerts.map((alert) => {
          const days = daysUntil(alert.date);
          return (
            <div key={`${alert.vehicle}-${alert.type}`} className="flex items-center justify-between rounded-md border border-tower-border bg-[#0B1220] p-3">
              <div className="flex items-center gap-3">
                <span className={cn("rounded-md p-2", days <= 7 ? "bg-tower-danger/10 text-tower-danger" : days <= 15 ? "bg-tower-warning/10 text-tower-warning" : "bg-tower-primary/10 text-tower-primary")}>
                  <AlertTriangle size={18} />
                </span>
                <div>
                  <div className="text-sm font-medium">{alert.type}</div>
                  <div className="text-xs text-tower-muted">{alert.vehicle}</div>
                </div>
              </div>
              <div className="text-right text-sm">
                <div>{alert.date}</div>
                <div className="text-xs text-tower-muted">{days < 0 ? "Expired" : `${days} days`}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function DriverLicenseAlerts({ drivers }: { drivers: Driver[] }) {
  const alerts = drivers
    .map((driver) => ({ driver, days: daysUntil(driver.licenseExpiry) }))
    .filter((alert) => alert.days < 30)
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);

  return (
    <Panel title="Driver License Alerts" action="Notification Center">
      <div className="space-y-3">
        {alerts.length ? alerts.map(({ driver, days }) => (
          <div key={driver.id} className="flex items-center justify-between rounded-md border border-tower-border bg-[#0B1220] p-3">
            <div>
              <div className="text-sm font-medium">{driver.name}</div>
              <div className="text-xs text-tower-muted">{days < 0 ? "License expired" : `License expires in ${days} days`}</div>
            </div>
            <ExpiryDate value={driver.licenseExpiry} />
          </div>
        )) : <div className="rounded-md border border-tower-border bg-[#0B1220] p-3 text-sm text-tower-muted">No driver license alerts.</div>}
      </div>
    </Panel>
  );
}

function RevenueAnalytics({ rows }: { rows: DashboardData["revenueAnalytics"] }) {
  const [mode, setMode] = useState("Daily");
  const chartRows = useMemo(() => (mode === "Daily" ? rows : rows.map((row, index) => ({ ...row, label: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"][index] }))), [mode, rows]);
  const max = Math.max(...chartRows.flatMap((row) => [row.revenue, row.expenses, row.profit]));
  return (
    <Panel title="Revenue Analytics" action={<Segment value={mode} onChange={setMode} values={["Daily", "Monthly"]} />}>
      <div className="h-80 rounded-lg border border-tower-border bg-[#0B1220] p-4">
        <div className="flex h-full items-end gap-4">
          {chartRows.map((row) => (
            <div key={row.label} className="flex min-w-0 flex-1 flex-col items-center gap-3">
              <div className="flex h-56 w-full items-end justify-center gap-1.5">
                <ChartBar value={row.revenue} max={max} className="bg-tower-primary" title={`Revenue ${money(row.revenue)}`} />
                <ChartBar value={row.expenses} max={max} className="bg-tower-danger" title={`Expenses ${money(row.expenses)}`} />
                <ChartBar value={row.profit} max={max} className="bg-tower-success" title={`Profit ${money(row.profit)}`} />
              </div>
              <span className="text-xs text-tower-muted">{row.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function PnlCard({ finance }: { finance: DashboardData["finance"] }) {
  const rows = [
    { label: "Revenue", value: finance.revenue, fill: "#3B82F6" },
    { label: "Expenses", value: finance.expenses, fill: "#EF4444" },
    { label: "Profit", value: finance.profit, fill: "#22C55E" }
  ];
  const max = Math.max(...rows.map((row) => row.value));
  return (
    <Panel title="Profit & Loss" action="Auto-calculated">
      <div className="space-y-5 rounded-lg border border-tower-border bg-[#0B1220] p-5">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-tower-muted">{row.label}</span>
              <span className="font-medium">{money(row.value)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-tower-border">
              <div className="h-full rounded-full" style={{ width: `${Math.max((row.value / max) * 100, 8)}%`, background: row.fill }} />
            </div>
          </div>
        ))}
        <div className="rounded-md border border-tower-border p-4">
          <div className="text-sm text-tower-muted">Net Margin</div>
          <div className="mt-1 text-3xl font-semibold">{Math.round((finance.profit / finance.revenue) * 100)}%</div>
        </div>
      </div>
    </Panel>
  );
}

function ChartBar({ value, max, className, title }: { value: number; max: number; className: string; title: string }) {
  return <div title={title} className={cn("w-4 rounded-t", className)} style={{ height: `${Math.max((value / max) * 100, 5)}%` }} />;
}

function ModulePage({ name, data, setData, token, refreshData, setActive }: { name: string; data: Data; setData: React.Dispatch<React.SetStateAction<Data>>; token?: string; refreshData: () => Promise<void>; setActive: (value: string) => void }) {
  if (name === "Trips") return <TripsModule trips={data.trips} customers={data.customers} vehicles={data.vehicles} drivers={data.drivers} invoices={data.invoices} bilties={data.bilties} driverTransactions={data.driverTransactions} setData={setData} token={token} refreshData={refreshData} onDriverExpenseSave={(transaction) => setData((current) => ({ ...current, driverTransactions: [transaction, ...current.driverTransactions] }))} />;
  if (name === "Vehicles") return <VehicleModule vehicles={data.vehicles} trips={data.trips} drivers={data.drivers} invoices={data.invoices} token={token} refreshData={refreshData} />;
  if (name === "Drivers") return <DriverModule drivers={data.drivers} trips={data.trips} vehicles={data.vehicles} customers={data.customers} invoices={data.invoices} attendance={data.attendance} driverTransactions={data.driverTransactions} token={token} refreshData={refreshData} onDriverExpenseSave={(transaction) => setData((current) => ({ ...current, driverTransactions: [transaction, ...current.driverTransactions] }))} />;
  if (name === "Customers") return <CustomerModule customers={data.customers} trips={data.trips} invoices={data.invoices} payments={data.payments} setData={setData} token={token} refreshData={refreshData} />;
  if (name === "Invoices") return <InvoiceModule invoices={data.invoices} trips={data.trips} customers={data.customers} payments={data.payments} setData={setData} token={token} refreshData={refreshData} />;
  if (name === "Payments") return <PaymentsModule payments={data.payments} invoices={data.invoices} trips={data.trips} vehicles={data.vehicles} drivers={data.drivers} customers={data.customers} token={token} refreshData={refreshData} />;
  if (name === "Expenses") return <ExpensesModule vehicles={data.vehicles} drivers={data.drivers} customers={data.customers} token={token} />;
  if (name === "Profit & Loss") return <ProfitLossModule vehicles={data.vehicles} drivers={data.drivers} customers={data.customers} trips={data.trips} token={token} />;
  if (name === "Bilty / LR Management") return <BiltyModule bilties={data.bilties} trips={data.trips} token={token} refreshData={refreshData} />;
  if (name === "Documents") return <DocumentsModule data={data} token={token} onOpenModule={setActive} />;
  if (name === "Maintenance" || name === "Service Records") return <MaintenanceModule vehicles={data.vehicles} drivers={data.drivers} token={token} refreshData={refreshData} onOpenModule={setActive} />;
  if (name === "Reports") return <ReportsModule vehicles={data.vehicles} drivers={data.drivers} customers={data.customers} trips={data.trips} token={token} />;
  if (name === "Settings") return <SettingsModule token={token} data={data} />;
  return <PlaceholderModule name={name} />;
}

const settingsSections = [
  "Company Settings",
  "User Management",
  "Roles & Permissions",
  "Invoice Settings",
  "Trip Settings",
  "Vehicle Settings",
  "Driver Settings",
  "Bilty Settings",
  "Maintenance Settings",
  "Expense Settings",
  "Notification Settings",
  "Document Settings",
  "Financial Settings",
  "Backup & Security",
  "System Preferences"
];

const settingsModules = ["Dashboard", "Trips", "Vehicles", "Drivers", "Customers", "Invoices", "Payments", "Expenses", "Profit & Loss", "Maintenance", "Bilty", "Documents", "Reports", "Settings"];
const settingsPermissionActions = ["View", "Create", "Edit", "Delete", "Export", "Print", "Approve", "Manage"];

function SettingsModule({ token, data }: { token?: string; data: Data }) {
  const [settings, setSettings] = useState<SettingsPayload>();
  const [active, setActive] = useState("Company Settings");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setSettings(await getSettings(token));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settings could not be loaded.");
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const patch = async (payload: Record<string, unknown>, success = "Settings saved.") => {
    setSaving(true);
    setMessage("");
    try {
      const result = await updateSettings(token, payload);
      setSettings(result);
      setMessage(success);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const setLocal = (section: string, value: any) => setSettings((current) => current ? { ...current, [section]: value } : current);
  const company = settings?.companySettings || {};

  if (!settings) return <Skeleton />;

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <aside className="rounded-lg border border-tower-border bg-tower-card p-3 shadow-tower">
        <div className="px-2 pb-3 text-sm font-semibold">Settings Center</div>
        <div className="space-y-1">
          {settingsSections.map((section) => (
            <button key={section} onClick={() => setActive(section)} className={cn("w-full rounded-md px-3 py-2 text-left text-sm text-tower-muted hover:bg-white/5 hover:text-white", active === section && "bg-tower-primary/15 text-white ring-1 ring-tower-primary/35")}>{section}</button>
          ))}
        </div>
      </aside>

      <div className="space-y-6">
        {error && <div className="rounded-md border border-tower-danger/40 bg-tower-danger/10 px-4 py-3 text-sm text-red-200">{error}</div>}
        {message && <div className="rounded-md border border-tower-success/40 bg-tower-success/10 px-4 py-3 text-sm text-green-200">{message}</div>}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(settings.dashboard || {}).map(([key, value]) => <Kpi key={key} title={niceColumn(key)} value={value} icon={Settings} tone={String(value).includes("Needs") ? "warning" : "primary"} />)}
        </section>

        {active === "Company Settings" && <CompanySettingsPanel company={company} onChange={(next) => setLocal("companySettings", next)} onSave={() => patch({ companySettings: company }, "Company settings saved and will flow into exports.")} saving={saving} />}
        {active === "User Management" && <UserManagementPanel token={token} />}
        {active === "Roles & Permissions" && <PermissionsPanel permissions={settings.rolePermissions || {}} onChange={(next) => setLocal("rolePermissions", next)} onSave={() => patch({ rolePermissions: settings.rolePermissions }, "Role permissions saved.")} saving={saving} />}
        {active === "Invoice Settings" && <GenericSettingsPanel title="Invoice Settings" section="invoiceSettings" settings={settings} setLocal={setLocal} onSave={patch} fields={["invoiceNumberFormat", "gstEnabled", "taxPercentage", "invoiceFooter", "termsAndConditions", "authorizedSignature", "defaultPaymentTerms"]} />}
        {active === "Trip Settings" && <ListSettingsPanel title="Trip Settings" section="tripSettings" settings={settings} setLocal={setLocal} onSave={patch} fields={["tripNumberFormat", "tripStatuses", "defaultTripTypes", "tripApprovalWorkflow"]} />}
        {active === "Vehicle Settings" && <ListSettingsPanel title="Vehicle Settings" section="vehicleSettings" settings={settings} setLocal={setLocal} onSave={patch} fields={["vehicleCategories", "fuelTypes", "vehicleStatuses"]} />}
        {active === "Driver Settings" && <ListSettingsPanel title="Driver Settings" section="driverSettings" settings={settings} setLocal={setLocal} onSave={patch} fields={["requiredDocuments", "licenseExpiryReminderDays", "documentExpiryReminderDays"]} />}
        {active === "Bilty Settings" && <GenericSettingsPanel title="Bilty Settings" section="biltySettings" settings={settings} setLocal={setLocal} onSave={patch} fields={["biltyNumberFormat", "verificationWorkflow", "mandatoryBiltyUpload", "missingBiltyAlerts"]} defaults={{ biltyNumberFormat: "BLTY-{YYYY}-{####}", verificationWorkflow: true, mandatoryBiltyUpload: true, missingBiltyAlerts: true }} />}
        {active === "Maintenance Settings" && <ListSettingsPanel title="Maintenance Settings" section="maintenanceSettings" settings={settings} setLocal={setLocal} onSave={patch} fields={["defaultServiceIntervals", "reminderRules"]} />}
        {active === "Expense Settings" && <ListSettingsPanel title="Expense Settings" section="expenseSettings" settings={settings} setLocal={setLocal} onSave={patch} fields={["categories", "allowCustomCategories"]} />}
        {active === "Notification Settings" && <ListSettingsPanel title="Notification Settings" section="notificationSettings" settings={settings} setLocal={setLocal} onSave={patch} fields={["dashboardNotifications", "emailNotifications", "systemAlerts", "alertTypes"]} />}
        {active === "Document Settings" && <ListSettingsPanel title="Document Settings" section="documentSettings" settings={settings} setLocal={setLocal} onSave={patch} fields={["requiredVehicleDocuments", "requiredDriverDocuments", "expiryAlertDays"]} />}
        {active === "Financial Settings" && <ListSettingsPanel title="Financial Settings" section="financialSettings" settings={settings} setLocal={setLocal} onSave={patch} fields={["currency", "defaultTaxSettings", "profitCalculationRules", "expenseCategories", "revenueCategories", "paymentTerms"]} />}
        {active === "Backup & Security" && <BackupSecurityPanel settings={settings} token={token} onBackup={(next) => setSettings(next)} data={data} />}
        {active === "System Preferences" && <SystemPreferencesPanel settings={settings} setLocal={setLocal} onSave={patch} />}

        <LiveDocumentPreview company={company} invoiceSettings={settings.invoiceSettings || {}} />
      </div>
    </div>
  );
}

function CompanySettingsPanel({ company, onChange, onSave, saving }: { company: Record<string, any>; onChange: (value: Record<string, any>) => void; onSave: () => void; saving: boolean }) {
  const fields = ["companyName", "legalBusinessName", "addressLine1", "addressLine2", "city", "state", "country", "pincode", "gstNumber", "panNumber", "phoneNumber", "alternatePhone", "emailAddress", "website", "bankName", "accountHolderName", "accountNumber", "ifscCode", "upiId", "authorizedSignatoryName", "designation"];
  return (
    <Panel title="Company Branding" action="Single source for invoices, reports, PDF, Excel, and print layouts">
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <BrandingUpload label="Company Logo Upload" accept="image/png,image/jpeg" value={company.companyLogo} onChange={(value) => onChange({ ...company, companyLogo: value })} />
        <BrandingUpload label="Company Stamp Upload" accept="image/png" value={company.companyStamp} onChange={(value) => onChange({ ...company, companyStamp: value })} />
        <BrandingUpload label="Authorized Signature Upload" accept="image/png,image/jpeg" value={company.digitalSignature} onChange={(value) => onChange({ ...company, digitalSignature: value })} />
      </div>
      <div className="mb-4 text-sm font-medium text-white">Company Profile</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => <TextField key={field} label={niceColumn(field)} value={String(company[field] ?? "")} onChange={(value) => onChange({ ...company, [field]: value })} />)}
      </div>
      <SaveRow saving={saving} onSave={onSave} />
    </Panel>
  );
}

function BrandingUpload({ label, accept, value, onChange }: { label: string; accept: string; value?: string; onChange: (value: string) => void }) {
  const [error, setError] = useState("");
  const readFile = (file?: File) => {
    setError("");
    if (!file) return;
    if (!accept.split(",").some((type) => file.type === type)) {
      setError("Use PNG or JPG as requested.");
      return;
    }
    if (file.size > 750_000) {
      setError("Image should be under 750 KB for fast PDFs.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result || ""));
    reader.readAsDataURL(file);
  };
  return (
    <div className="rounded-lg border border-tower-border bg-[#0B1220] p-4">
      <div className="mb-3 text-sm font-medium text-white">{label}</div>
      <div className="mb-3 grid h-28 place-items-center rounded-md border border-dashed border-tower-border bg-tower-card">
        {value ? <img src={value} alt={label} className="max-h-24 max-w-full object-contain" /> : <span className="text-xs text-tower-muted">Preview</span>}
      </div>
      <input type="file" accept={accept} onChange={(event) => readFile(event.target.files?.[0])} className="block w-full text-xs text-tower-muted file:mr-3 file:rounded-md file:border-0 file:bg-tower-primary file:px-3 file:py-2 file:text-xs file:font-medium file:text-white" />
      {value && <button onClick={() => onChange("")} className="mt-3 rounded-md border border-tower-border px-3 py-1.5 text-xs text-tower-muted hover:text-white">Remove</button>}
      {error && <div className="mt-2 text-xs text-tower-danger">{error}</div>}
    </div>
  );
}

function UserManagementPanel({ token }: { token?: string }) {
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "Viewer", status: "Active", password: "ChangeMe@123" });
  const [message, setMessage] = useState("");
  const load = useCallback(async () => setUsers(await api<any[]>("/api/users", token)), [token]);
  useEffect(() => { void load().catch(() => undefined); }, [load]);
  return (
    <Panel title="User Management" action={`${users.length} users`}>
      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <TextField label="Full Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <TextField label="Email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
        <TextField label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
        <FieldSelect label="Role" value={form.role} onChange={(role) => setForm({ ...form, role })} options={["Super Admin", "Admin", "Accountant", "Operations Manager", "Fleet Manager", "Driver Manager", "Viewer"].map((role) => ({ label: role, value: role }))} />
        <FieldSelect label="Status" value={form.status} onChange={(status) => setForm({ ...form, status })} options={["Active", "Inactive"].map((status) => ({ label: status, value: status }))} />
      </div>
      <button onClick={async () => { await api("/api/users", token, { method: "POST", body: JSON.stringify({ name: form.name, email: form.email, password: form.password, role: form.role }) }); setMessage("User created."); await load(); }} className="mb-5 rounded-md bg-tower-primary px-4 py-2 text-sm font-medium text-white">Create User</button>
      {message && <span className="ml-3 text-sm text-tower-success">{message}</span>}
      <DataTable columns={["Full Name", "Email", "Phone", "Role", "Status", "Last Login", "Actions"]} rows={users.map((user) => [user.name, user.email, user.phone || "-", user.role, "Active", user.lastLogin || "-", <div key={user.id || user._id} className="flex flex-wrap gap-2"><button className="rounded border border-tower-border px-2 py-1 text-xs">Edit</button><button className="rounded border border-tower-border px-2 py-1 text-xs">Deactivate</button><button className="rounded border border-tower-border px-2 py-1 text-xs">Reset Password</button><button className="rounded border border-tower-danger/50 px-2 py-1 text-xs text-tower-danger">Delete</button></div>])} />
    </Panel>
  );
}

function PermissionsPanel({ permissions, onChange, onSave, saving }: { permissions: Record<string, Record<string, Record<string, boolean>>>; onChange: (value: any) => void; onSave: () => void; saving: boolean }) {
  const roles = Object.keys(permissions);
  const toggle = (role: string, module: string, action: string) => onChange({ ...permissions, [role]: { ...permissions[role], [module]: { ...(permissions[role]?.[module] || {}), [action]: !permissions[role]?.[module]?.[action] } } });
  return (
    <Panel title="Roles & Permissions" action={`${roles.length} active roles`}>
      <div className="space-y-5">
        {roles.map((role) => (
          <section key={role} className="rounded-lg border border-tower-border bg-[#0B1220] p-4">
            <h4 className="mb-3 font-medium">{role}</h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-[0.12em] text-tower-muted"><th className="pb-2">Module</th>{settingsPermissionActions.map((action) => <th key={action} className="pb-2">{action}</th>)}</tr></thead>
                <tbody>{settingsModules.map((module) => <tr key={module} className="border-t border-tower-border/70"><td className="py-2 pr-3 text-white">{module}</td>{settingsPermissionActions.map((action) => <td key={action}><input type="checkbox" checked={Boolean(permissions[role]?.[module]?.[action])} onChange={() => toggle(role, module, action)} /></td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <SaveRow saving={saving} onSave={onSave} />
    </Panel>
  );
}

function GenericSettingsPanel({ title, section, settings, setLocal, onSave, fields, defaults = {} }: { title: string; section: string; settings: SettingsPayload; setLocal: (section: string, value: any) => void; onSave: (payload: Record<string, unknown>, message?: string) => Promise<void>; fields: string[]; defaults?: Record<string, any> }) {
  const values = { ...defaults, ...(settings[section] || {}) };
  return (
    <Panel title={title} action="Central configuration">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => <SettingEditor key={field} label={niceColumn(field)} value={values[field]} onChange={(value) => setLocal(section, { ...values, [field]: value })} />)}
      </div>
      <SaveRow onSave={() => onSave({ [section]: values }, `${title} saved.`)} />
    </Panel>
  );
}

function ListSettingsPanel(props: Parameters<typeof GenericSettingsPanel>[0]) {
  return <GenericSettingsPanel {...props} />;
}

function SettingEditor({ label, value, onChange }: { label: string; value: any; onChange: (value: any) => void }) {
  if (typeof value === "boolean") return <label className="flex items-center gap-3 rounded-md border border-tower-border bg-[#0B1220] px-3 py-3 text-sm text-white"><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
  if (typeof value === "number") return <NumberField label={label} value={value} onChange={onChange} />;
  if (Array.isArray(value)) return <TextField label={label} value={value.join(", ")} onChange={(text) => onChange(text.split(",").map((item) => item.trim()).filter(Boolean))} />;
  return <TextField label={label} value={String(value ?? "")} onChange={onChange} />;
}

function BackupSecurityPanel({ settings, token, onBackup, data }: { settings: SettingsPayload; token?: string; onBackup: (settings: SettingsPayload) => void; data: Data }) {
  const logs = settings.auditLogs || [];
  const backups = settings.backupHistory || [];
  return (
    <div className="space-y-6">
      <Panel title="Backup & Security" action="Manual, scheduled, restore-ready">
        <div className="grid gap-4 md:grid-cols-4">
          <Info label="Database Export" value="Mongo dump / CSV export" />
          <Info label="Scheduled Backup" value={settings.dashboard?.backupStatus || "Ready"} />
          <Info label="Security Status" value={settings.dashboard?.securityStatus || "Protected"} />
          <Info label="Records Protected" value={data.trips.length + data.vehicles.length + data.drivers.length + data.invoices.length} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={async () => onBackup(await runSettingsBackup(token))} className="rounded-md bg-tower-primary px-4 py-2 text-sm font-medium text-white">Manual Backup</button>
          <button className="rounded-md border border-tower-border px-4 py-2 text-sm text-white">Restore Backup</button>
          <button className="rounded-md border border-tower-border px-4 py-2 text-sm text-white">Database Export</button>
        </div>
      </Panel>
      <Panel title="Backup History" action={`${backups.length} entries`}><DataTable columns={["Date", "Status", "Strategy", "Details"]} rows={backups.map((row: any) => [row.date, row.status, row.strategy, JSON.stringify(row.details || {})])} /></Panel>
      <Panel title="Audit Logs" action={`${logs.length} events`}><DataTable columns={["User", "Action", "Module", "Date", "IP Address"]} rows={logs.map((log: any) => [log.user, log.action, log.module, log.date, log.ipAddress || "-"])} /></Panel>
    </div>
  );
}

function SystemPreferencesPanel({ settings, setLocal, onSave }: { settings: SettingsPayload; setLocal: (section: string, value: any) => void; onSave: (payload: Record<string, unknown>, message?: string) => Promise<void> }) {
  return (
    <div className="space-y-6">
      <GenericSettingsPanel title="System Preferences" section="systemSettings" settings={settings} setLocal={setLocal} onSave={onSave} fields={["theme", "dateFormat", "currencyFormat", "timeZone", "language", "erpBranding", "erpVersion"]} />
      <GenericSettingsPanel title="File Storage Settings" section="storageSettings" settings={settings} setLocal={setLocal} onSave={onSave} fields={["awsS3Configuration", "bucketName", "storageUsage", "documentRetentionRules", "supportedFormats"]} />
      <GenericSettingsPanel title="API Configuration" section="apiConfiguration" settings={settings} setLocal={setLocal} onSave={onSave} fields={["awsConfiguration", "emailServiceConfiguration", "futureWhatsAppApiSettings", "futureSmsSettings"]} />
    </div>
  );
}

function LiveDocumentPreview({ company, invoiceSettings }: { company: Record<string, any>; invoiceSettings: Record<string, any> }) {
  const address = [company.addressLine1, company.addressLine2, company.city, company.state, company.pincode].filter(Boolean).join(", ");
  const previews = ["Invoice Preview", "Profit & Loss Preview", "Report Preview", "Expense Statement Preview"];
  return (
    <section className="grid gap-4 xl:grid-cols-4">
      {previews.map((title) => (
        <div key={title} className="min-h-[260px] rounded-lg border border-tower-border bg-white p-4 text-slate-950 shadow-tower">
          <div className="border-b border-slate-300 pb-3">
            <div className="text-lg font-bold">{company.companyName || "Company Name"}</div>
            <div className="text-xs text-slate-600">{address || "Company address"}</div>
            <div className="text-xs text-slate-600">GST: {company.gstNumber || "-"} | PAN: {company.panNumber || "-"}</div>
          </div>
          <div className="py-4">
            <div className="text-sm font-semibold">{title}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <span>Document No.</span><strong>{invoiceSettings.invoiceNumberFormat || "INV-{YYYY}-{####}"}</strong>
              <span>Bank</span><strong>{company.bankName || "-"}</strong>
              <span>IFSC</span><strong>{company.ifscCode || "-"}</strong>
              <span>Terms</span><strong>{invoiceSettings.defaultPaymentTerms || "7 Days"}</strong>
            </div>
          </div>
          <div className="mt-auto border-t border-slate-300 pt-3 text-xs">{invoiceSettings.invoiceFooter || "Footer appears here."}</div>
        </div>
      ))}
    </section>
  );
}

function SaveRow({ saving, onSave }: { saving?: boolean; onSave: () => void }) {
  return <div className="mt-5 flex justify-end"><button disabled={saving} aria-busy={saving || undefined} onClick={onSave} className="rounded-md bg-tower-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving" : "Save Changes"}</button></div>;
}

const reportCategories: Array<{ key: ReportCategory; label: string }> = [
  { key: "financial", label: "Financial Reports" },
  { key: "trips", label: "Trip Reports" },
  { key: "vehicles", label: "Vehicle Reports" },
  { key: "drivers", label: "Driver Reports" },
  { key: "maintenance", label: "Maintenance Reports" },
  { key: "bilty", label: "Bilty Reports" },
  { key: "compliance", label: "Compliance Reports" }
];

function ReportsModule({ vehicles, drivers, customers, trips, token }: { vehicles: Vehicle[]; drivers: Driver[]; customers: Customer[]; trips: Trip[]; token?: string }) {
  const [filters, setFilters] = useState<ReportFilters>(() => ({ preset: "This Month", from: monthBounds().from, to: monthBounds().to, vehicleId: "All", driverId: "All", customerId: "All", route: "All", companyId: "All", tripId: "All", branch: "All" }));
  const [category, setCategory] = useState<ReportCategory>("financial");
  const [dashboard, setDashboard] = useState<ReportsDashboard>();
  const [payload, setPayload] = useState<ReportPayload>();
  const [activeReport, setActiveReport] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const routes = Array.from(new Set(trips.map((trip) => `${trip.loadingPoint} to ${trip.unloadingPoint}`))).filter(Boolean);

  const setFilter = (key: string, value: string) => {
    if (key === "preset") {
      const range = profitLossDateRange(value);
      setFilters((current) => ({ ...current, preset: value, from: range.from, to: range.to }));
    } else {
      setFilters((current) => ({ ...current, [key]: value }));
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardResult, categoryResult] = await Promise.all([
        getReportsDashboard(token, filters),
        getReportCategory(token, category, filters)
      ]);
      setDashboard(dashboardResult);
      setPayload(categoryResult);
      setActiveReport((current) => current || categoryResult.reports[0]?.name || "");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reports could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [token, filters, category]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setActiveReport(""); }, [category]);

  const selectedReport = payload?.reports.find((item) => item.name === activeReport) || payload?.reports[0];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold">Reports Control Center</h3>
            <p className="text-sm text-tower-muted">Live analytics generated from operational, finance, fleet, bilty, and compliance modules.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => selectedReport && void exportReport(token, category, { ...filters, reportType: selectedReport.name }, "pdf")} className="rounded-md border border-tower-border px-3 py-2 text-xs text-white">Export PDF</button>
            <button onClick={() => selectedReport && void exportReport(token, category, { ...filters, reportType: selectedReport.name }, "excel")} className="rounded-md border border-tower-border px-3 py-2 text-xs text-white">Export Excel</button>
            <button onClick={() => window.print()} className="rounded-md border border-tower-border px-3 py-2 text-xs text-white">Print</button>
            <a href={`mailto:?subject=NPFC ${selectedReport?.name || "Report"}&body=Please find the scheduled ERP report from NPFC.`} className="rounded-md bg-tower-primary px-3 py-2 text-xs font-medium text-white">Email</a>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FieldSelect label="Date Range" value={String(filters.preset || "This Month")} onChange={(value) => setFilter("preset", value)} options={["Today", "This Week", "This Month", "Last Month", "Quarter", "Year", "Custom Range"].map((item) => ({ label: item, value: item }))} />
          <DateInput label="From" value={String(filters.from || "")} onChange={(value) => setFilter("from", value)} />
          <DateInput label="To" value={String(filters.to || "")} onChange={(value) => setFilter("to", value)} />
          <FieldSelect label="Vehicle" value={String(filters.vehicleId || "All")} onChange={(value) => setFilter("vehicleId", value)} options={[{ label: "All Vehicles", value: "All" }, ...vehicles.map((vehicle) => ({ label: vehicle.number, value: vehicle.id }))]} />
          <FieldSelect label="Driver" value={String(filters.driverId || "All")} onChange={(value) => setFilter("driverId", value)} options={[{ label: "All Drivers", value: "All" }, ...drivers.map((driver) => ({ label: driver.name, value: driver.id }))]} />
          <FieldSelect label="Customer" value={String(filters.customerId || "All")} onChange={(value) => setFilter("customerId", value)} options={[{ label: "All Customers", value: "All" }, ...customers.map((customer) => ({ label: customer.name, value: customer.id }))]} />
          <FieldSelect label="Route" value={String(filters.route || "All")} onChange={(value) => setFilter("route", value)} options={[{ label: "All Routes", value: "All" }, ...routes.map((route) => ({ label: route, value: route }))]} />
          <FieldSelect label="Trip" value={String(filters.tripId || "All")} onChange={(value) => setFilter("tripId", value)} options={[{ label: "All Trips", value: "All" }, ...trips.map((trip) => ({ label: trip.tripNumber, value: trip.id }))]} />
        </div>
      </section>

      {error && <div className="rounded-md border border-tower-danger/40 bg-tower-danger/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Kpi title="Total Revenue" value={money(dashboard?.kpis.totalRevenue || 0)} icon={Banknote} tone="success" />
        <Kpi title="Total Expenses" value={money(dashboard?.kpis.totalExpenses || 0)} icon={Fuel} tone="danger" />
        <Kpi title="Net Profit" value={money(dashboard?.kpis.netProfit || 0)} icon={BarChart3} tone="primary" />
        <Kpi title="Total Trips" value={dashboard?.kpis.totalTrips || 0} icon={Route} tone="primary" />
        <Kpi title="Active Vehicles" value={dashboard?.kpis.activeVehicles || 0} icon={Truck} tone="success" />
        <Kpi title="Active Drivers" value={dashboard?.kpis.activeDrivers || 0} icon={UserRound} tone="success" />
        <Kpi title="Outstanding Payments" value={money(dashboard?.kpis.outstandingPayments || 0)} icon={CreditCard} tone="warning" />
        <Kpi title="Pending Collections" value={dashboard?.kpis.pendingCollections || 0} icon={ReceiptText} tone="warning" />
        <Kpi title="Missing Bilties" value={dashboard?.kpis.missingBilties || 0} icon={ShieldCheck} tone="danger" />
        <Kpi title="Expiring Documents" value={dashboard?.kpis.expiringDocuments || 0} icon={AlertTriangle} tone="warning" />
      </section>

      <div className="flex gap-2 overflow-x-auto rounded-lg border border-tower-border bg-tower-card p-2 shadow-tower">
        {reportCategories.map((item) => (
          <button key={item.key} onClick={() => setCategory(item.key)} className={cn("whitespace-nowrap rounded-md px-3 py-2 text-sm text-tower-muted", category === item.key && "bg-tower-primary text-white")}>{item.label}</button>
        ))}
      </div>

      <section className="grid gap-6 xl:grid-cols-[0.62fr_0.38fr]">
        <ReportsChartPanel dashboard={dashboard} payload={payload} />
        <ReportScheduler category={category} selectedReport={selectedReport?.name || ""} filters={filters} token={token} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[260px_1fr]">
        <Panel title="Report Library" action={`${payload?.reports.length || 0} reports`}>
          <div className="space-y-2">
            {(payload?.reports || []).map((item) => (
              <button key={item.name} onClick={() => setActiveReport(item.name)} className={cn("w-full rounded-md border border-tower-border px-3 py-2 text-left text-sm text-tower-muted hover:text-white", (selectedReport?.name === item.name) && "border-tower-primary/60 bg-tower-primary/10 text-white")}>
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-tower-muted">{item.totalRows} live rows</div>
              </button>
            ))}
          </div>
        </Panel>
        <ReportViewer report={selectedReport} loading={loading} category={category} dashboard={dashboard} />
      </section>
    </div>
  );
}

function ReportsChartPanel({ dashboard, payload }: { dashboard?: ReportsDashboard; payload?: ReportPayload }) {
  const trend = dashboard?.charts.revenueTrends || [];
  const statusRows = payload?.charts.statusRows || payload?.charts.vehiclePerformance || [];
  return (
    <Panel title="Charts & Analytics" action="Revenue, expense, profit, vehicle, driver, and collections">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid stroke="#1F2937" />
              <XAxis dataKey="name" stroke="#94A3B8" />
              <YAxis stroke="#94A3B8" />
              <Tooltip />
              <Line type="monotone" dataKey="amount" stroke="#22C55E" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusRows.slice(0, 8)}>
              <CartesianGrid stroke="#1F2937" />
              <XAxis dataKey="name" stroke="#94A3B8" />
              <YAxis stroke="#94A3B8" />
              <Tooltip />
              <Bar dataKey="amount" fill="#3B82F6" />
              <Bar dataKey="count" fill="#F59E0B" />
              <Bar dataKey="profit" fill="#22C55E" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Panel>
  );
}

function ReportScheduler({ category, selectedReport, filters, token }: { category: ReportCategory; selectedReport: string; filters: ReportFilters; token?: string }) {
  const [frequency, setFrequency] = useState("Weekly");
  const [formats, setFormats] = useState(["PDF"]);
  const [recipients, setRecipients] = useState("");
  const [message, setMessage] = useState("");
  const toggleFormat = (format: string) => setFormats((current) => current.includes(format) ? current.filter((item) => item !== format) : [...current, format]);
  return (
    <Panel title="Report Scheduler" action="Email delivery">
      <div className="grid gap-3">
        <FieldSelect label="Frequency" value={frequency} onChange={setFrequency} options={["Daily", "Weekly", "Monthly", "Custom"].map((item) => ({ label: item, value: item }))} />
        <TextField label="Recipients" value={recipients} onChange={setRecipients} />
        <div className="flex gap-2">
          {["PDF", "Excel"].map((format) => <button key={format} onClick={() => toggleFormat(format)} className={cn("rounded-md border border-tower-border px-3 py-2 text-sm text-tower-muted", formats.includes(format) && "bg-tower-primary text-white")}>{format}</button>)}
        </div>
        <button
          onClick={async () => {
            const result = await scheduleReport(token, { reportCategory: category, reportName: selectedReport, frequency, recipients, formats, filters });
            setMessage(result.message || "Schedule saved.");
          }}
          className="rounded-md bg-tower-primary px-4 py-2 text-sm font-medium text-white"
        >
          Save Schedule
        </button>
        {message && <div className="rounded-md border border-tower-success/40 bg-tower-success/10 px-3 py-2 text-sm text-green-200">{message}</div>}
      </div>
    </Panel>
  );
}

function ReportViewer({ report, loading, category, dashboard }: { report?: ReportDefinition; loading: boolean; category: ReportCategory; dashboard?: ReportsDashboard }) {
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [selectedRow, setSelectedRow] = useState<Record<string, any>>();
  const columns = report?.columns || [];

  useEffect(() => {
    setVisibleColumns(report?.columns || []);
    setPage(1);
    setSearch("");
    setSortColumn("");
  }, [report?.name]);

  const rows = useMemo(() => {
    const source = report?.rows || [];
    const searched = search ? source.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())) : source;
    const sorted = sortColumn ? [...searched].sort((a, b) => {
      const left = a[sortColumn];
      const right = b[sortColumn];
      const result = typeof left === "number" && typeof right === "number" ? left - right : String(left ?? "").localeCompare(String(right ?? ""));
      return sortDirection === "asc" ? result : -result;
    }) : searched;
    return sorted;
  }, [report, search, sortColumn, sortDirection]);

  const pageSize = 12;
  const pages = Math.max(Math.ceil(rows.length / pageSize), 1);
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const toggleColumn = (column: string) => setVisibleColumns((current) => current.includes(column) ? current.filter((item) => item !== column) : [...current, column]);
  const sortBy = (column: string) => {
    setSortColumn(column);
    setSortDirection((current) => sortColumn === column && current === "asc" ? "desc" : "asc");
  };

  return (
    <>
      <Panel title={report?.name || "Report View"} action={`${rows.length} rows`}>
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search report" className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-sm text-white outline-none" />
          <div className="flex flex-wrap gap-2">
            {columns.map((column) => <button key={column} onClick={() => toggleColumn(column)} className={cn("rounded-md border border-tower-border px-2.5 py-2 text-xs text-tower-muted", visibleColumns.includes(column) && "text-white")}>{niceColumn(column)}</button>)}
          </div>
        </div>
        {loading ? <Skeleton /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-tower-border text-left text-xs uppercase tracking-[0.12em] text-tower-muted">
                  {columns.filter((column) => visibleColumns.includes(column)).map((column) => (
                    <th key={column} className="pb-3 pr-4 font-medium"><button onClick={() => sortBy(column)}>{niceColumn(column)}</button></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, index) => (
                  <tr key={row.id || index} onClick={() => setSelectedRow(row)} className="cursor-pointer border-b border-tower-border/70 hover:bg-white/5">
                    {columns.filter((column) => visibleColumns.includes(column)).map((column) => <td key={column} className="py-3 pr-4 align-middle text-slate-100">{formatReportValue(row[column], column)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-sm text-tower-muted">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))} className="rounded-md border border-tower-border px-3 py-1.5 disabled:opacity-40">Previous</button>
            <button disabled={page >= pages} onClick={() => setPage((current) => Math.min(current + 1, pages))} className="rounded-md border border-tower-border px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </div>
      </Panel>
      {selectedRow && <ReportDetailDrawer row={selectedRow} reportName={report?.name || ""} category={category} dashboard={dashboard} onClose={() => setSelectedRow(undefined)} />}
    </>
  );
}

function ReportDetailDrawer({ row, reportName, category, dashboard, onClose }: { row: Record<string, any>; reportName: string; category: ReportCategory; dashboard?: ReportsDashboard; onClose: () => void }) {
  const related = [
    ["Related Trip", row.tripNumber || row.trip || row.linkedRecord || "-"],
    ["Related Vehicle", row.vehicleNumber || row.vehicle || "-"],
    ["Related Driver", row.driver || row.driverName || "-"],
    ["Invoices", row.invoiceNumber || row.outstanding ? `${row.invoiceNumber || "Ledger"} ${formatReportValue(row.outstanding, "amount")}` : "-"],
    ["Payments", row.payments || row.received || "-"],
    ["Expenses", row.expense || row.expenses || row.cost || "-"],
    ["Documents", row.document || row.biltyNumber || "-"],
    ["History", `Generated ${dashboard?.period.from || ""} to ${dashboard?.period.to || ""}`]
  ];
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l border-tower-border bg-tower-sidebar p-6 shadow-2xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.18em] text-tower-muted">{category}</div>
          <h3 className="mt-1 text-xl font-semibold">{reportName}</h3>
        </div>
        <button onClick={onClose} className="rounded-md border border-tower-border px-3 py-2 text-sm text-tower-muted hover:text-white">Close</button>
      </div>
      <DataTable columns={["Field", "Value"]} rows={Object.entries(row).map(([key, value]) => [niceColumn(key), formatReportValue(value, key)])} />
      <div className="mt-6">
        <Panel title="Drill-down Links" action="Single source references">
          <DataTable columns={["Area", "Reference"]} rows={related} />
        </Panel>
      </div>
    </div>
  );
}

function niceColumn(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function formatReportValue(value: unknown, key = "") {
  if (typeof value === "number" && /(amount|revenue|expense|profit|cost|payments|advances|settlement|outstanding|received)/i.test(key)) return money(value);
  if (typeof value === "number" && /percent/i.test(key)) return `${value}%`;
  if (typeof value === "object" && value) return JSON.stringify(value);
  return String(value ?? "-");
}

const maintenanceStatuses = ["Scheduled", "In Progress", "Completed", "Cancelled"] as const;
const serviceCategories = ["Preventive", "Breakdown", "Accident", "Inspection", "Tyre", "Warranty"];
const tyrePositions = ["Front Left", "Front Right", "Rear Left", "Rear Right", "Additional Axle 1", "Additional Axle 2", "Spare"];
const claimStatuses = ["Pending", "Approved", "Rejected", "Settled"] as const;

function MaintenanceModule({ vehicles, drivers, token, refreshData, onOpenModule }: { vehicles: Vehicle[]; drivers: Driver[]; token?: string; refreshData: () => Promise<void>; onOpenModule: (module: string) => void }) {
  const [filters, setFilters] = useState({ vehicleId: "All", maintenanceType: "All", garageName: "", status: "All", from: monthBounds(-6).from, to: monthBounds(1).to, minCost: "", maxCost: "" });
  const [dashboard, setDashboard] = useState<MaintenanceDashboard>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [modal, setModal] = useState<"maintenance" | "tyre" | "accident" | "">("");
  const [editRecord, setEditRecord] = useState<MaintenanceRecord>();
  const [selected, setSelected] = useState<MaintenanceRecord>();
  const [details, setDetails] = useState<(MaintenanceRecord & { serviceHistory: MaintenanceRecord[]; accidentLinks: AccidentRecord[]; profitImpact: { expense: number; netProfitReduction: number } })>();
  const records = dashboard?.records || [];
  const visibleRecords = records.filter((record) => {
    if (activeFilter === "vehiclesUnderMaintenance") return ["Scheduled", "In Progress"].includes(record.status);
    if (activeFilter === "dueServices") return record.dueStatus === "Due Soon";
    if (activeFilter === "overdueServices") return record.dueStatus === "Overdue";
    if (activeFilter === "completedServices") return record.status === "Completed";
    if (activeFilter === "activeRepairs") return record.status === "In Progress";
    return true;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDashboard(await getMaintenanceDashboard(token, filters));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Maintenance data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [token, filters]);

  useEffect(() => { void load(); }, [load]);

  const openDetails = async (record: MaintenanceRecord) => {
    setSelected(record);
    try {
      setDetails(await getMaintenanceRecord(token, record.id));
    } catch {
      setDetails(undefined);
    }
  };

  const saveMaintenance = async (body: MaintenancePayload, file?: File) => {
    const record = editRecord ? await updateMaintenance(token, editRecord.id, body) : await createMaintenance(token, body);
    if (file) await uploadFile(token, "maintenance", record.id, file, "Service Bill", false);
    setModal("");
    setEditRecord(undefined);
    await Promise.all([load(), refreshData()]);
  };

  if (selected) {
    const record = details || selected;
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower md:flex-row md:items-center md:justify-between">
          <div>
            <button onClick={() => { setSelected(undefined); setDetails(undefined); }} className="mb-3 rounded-md border border-tower-border px-3 py-1.5 text-sm text-tower-muted hover:text-white">Back to Maintenance</button>
            <h3 className="text-2xl font-semibold">{record.jobCardNumber}</h3>
            <p className="text-sm text-tower-muted">{record.vehicleNumber} / {record.maintenanceType}</p>
          </div>
          <div className="flex gap-2"><Status value={record.status} /><Status value={record.dueStatus} /></div>
        </div>
        <section className="grid gap-6 xl:grid-cols-[0.58fr_0.42fr]">
          <Panel title="Maintenance Information" action="Single source record">
            <div className="grid gap-4 md:grid-cols-2">
              <Info label="Vehicle" value={record.vehicleNumber} />
              <Info label="Garage" value={record.garageName} />
              <Info label="Date" value={record.maintenanceDate} />
              <Info label="Odometer" value={`${record.odometerReading.toLocaleString("en-IN")} KM`} />
              <Info label="Next Service Date" value={record.nextServiceDate || "-"} />
              <Info label="Next Service KM" value={record.nextServiceKM ? `${record.nextServiceKM.toLocaleString("en-IN")} KM` : "-"} />
              <Info label="Description" value={record.description || "-"} />
              <Info label="Remarks" value={record.remarks || "-"} />
            </div>
          </Panel>
          <Panel title="Cost Breakdown" action="Auto calculated">
            <DataTable columns={["Particular", "Amount"]} rows={[["Labour", money(record.labourCost)], ["Parts", money(record.partsCost)], ["Other Charges", money(record.otherCharges)], ["Total", money(record.totalCost)], ["Profit Impact", money((details?.profitImpact.netProfitReduction || record.totalCost) * -1)]]} />
          </Panel>
        </section>
        <section className="grid gap-6 xl:grid-cols-2">
          <Panel title="Documents" action={`${record.documents.length} files`}>
            <DataTable columns={["Document", "Uploaded", "Action"]} rows={record.documents.length ? record.documents.map((document) => [document.fileName || document.type, document.uploadedAt ? String(document.uploadedAt).slice(0, 10) : "-", <button key={document.key} onClick={() => { void openSignedUpload(token, document.key, true, document.fileName || document.type); }} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-white">Download</button>]) : [["Service Bills", "-", "No documents uploaded"]]} />
          </Panel>
          <Panel title="Expense & Profit Sync" action="Automatic">
            <DataTable columns={["Module", "Impact"]} rows={[["Expense Module", record.status === "Completed" ? `Maintenance expense ${money(record.totalCost)}` : "Creates expense when completed"], ["Profit & Loss", `Total expenses and net profit reduced by ${money(record.totalCost)}`], ["Vehicle Module", "Cost, health, due status, and service history updated"], ["Documents Module", "Bills linked from this record"]]} />
          </Panel>
        </section>
        <Panel title="Vehicle Service History" action={(details?.serviceHistory.length || 0) + " records"}>
          <DataTable columns={["Date", "Maintenance Type", "Garage", "Cost", "Odometer", "Status"]} rows={(details?.serviceHistory || [record]).map((row) => [row.maintenanceDate, row.maintenanceType, row.garageName, money(row.totalCost), row.odometerReading, <Status key={row.id} value={row.status} />])} />
        </Panel>
        {!!details?.accidentLinks.length && <Panel title="Accident Links"><DataTable columns={["Date", "Location", "Repair Cost", "Claim Status"]} rows={details.accidentLinks.map((row) => [row.accidentDate, row.location, money(row.repairCost), <Status key={row.id} value={row.claimStatus} />])} /></Panel>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <button onClick={() => setActiveFilter("")}><Kpi title="Total Maintenance Cost" value={money(dashboard?.kpis.totalMaintenanceCost || 0)} icon={Banknote} tone="danger" /></button>
        <button onClick={() => setActiveFilter("")}><Kpi title="This Month Cost" value={money(dashboard?.kpis.thisMonthCost || 0)} icon={ReceiptText} tone="warning" /></button>
        <button onClick={() => setActiveFilter("vehiclesUnderMaintenance")}><Kpi title="Vehicles Under Maintenance" value={dashboard?.kpis.vehiclesUnderMaintenance || 0} icon={Truck} tone="warning" /></button>
        <button onClick={() => setActiveFilter("dueServices")}><Kpi title="Due Services" value={dashboard?.kpis.dueServices || 0} icon={AlertTriangle} tone="warning" /></button>
        <button onClick={() => setActiveFilter("overdueServices")}><Kpi title="Overdue Services" value={dashboard?.kpis.overdueServices || 0} icon={AlertTriangle} tone="danger" /></button>
        <button onClick={() => setActiveFilter("completedServices")}><Kpi title="Completed Services" value={dashboard?.kpis.completedServices || 0} icon={ShieldCheck} tone="success" /></button>
        <button onClick={() => setActiveFilter("activeRepairs")}><Kpi title="Active Repairs" value={dashboard?.kpis.activeRepairs || 0} icon={Wrench} tone="danger" /></button>
        <button onClick={() => setActiveFilter("")}><Kpi title="Total Garage Expenses" value={money(dashboard?.kpis.totalGarageExpenses || 0)} icon={FileText} tone="primary" /></button>
      </section>

      <Panel title="Maintenance Register" action={<div className="flex flex-wrap gap-2"><button onClick={() => setModal("maintenance")} className="rounded-md bg-tower-primary px-3 py-2 text-xs font-medium text-white">+ Job Card</button><button onClick={() => setModal("tyre")} className="rounded-md border border-tower-border px-3 py-2 text-xs text-white">+ Tyre</button><button onClick={() => setModal("accident")} className="rounded-md border border-tower-border px-3 py-2 text-xs text-white">+ Accident</button></div>}>
        <div className="mb-4 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
          <FieldSelect label="Vehicle" value={filters.vehicleId} onChange={(value) => setFilters((current) => ({ ...current, vehicleId: value }))} options={[{ label: "All Vehicles", value: "All" }, ...vehicles.map((vehicle) => ({ label: vehicle.number, value: vehicle.id }))]} />
          <FieldSelect label="Type" value={filters.maintenanceType} onChange={(value) => setFilters((current) => ({ ...current, maintenanceType: value }))} options={[{ label: "All Types", value: "All" }, ...(dashboard?.types || []).map((item) => ({ label: item, value: item }))]} />
          <TextField label="Garage" value={filters.garageName} onChange={(value) => setFilters((current) => ({ ...current, garageName: value }))} />
          <FieldSelect label="Status" value={filters.status} onChange={(value) => setFilters((current) => ({ ...current, status: value }))} options={[{ label: "All Statuses", value: "All" }, ...maintenanceStatuses.map((item) => ({ label: item, value: item }))]} />
          <DateInput label="From" value={filters.from} onChange={(value) => setFilters((current) => ({ ...current, from: value }))} />
          <DateInput label="To" value={filters.to} onChange={(value) => setFilters((current) => ({ ...current, to: value }))} />
          <div className="flex items-end gap-2"><button onClick={() => { void downloadApiFile(token, maintenanceExportUrl("excel", filters), "maintenance-report.xls"); }} className="rounded-md border border-tower-border px-3 py-2 text-xs text-white">Excel</button><button onClick={() => { void downloadApiFile(token, maintenanceExportUrl("pdf", filters), "maintenance-report.pdf"); }} className="rounded-md border border-tower-border px-3 py-2 text-xs text-white">PDF</button></div>
        </div>
        {loading ? <Skeleton /> : <DataTable columns={["Job Card Number", "Vehicle Number", "Vehicle Type", "Maintenance Type", "Service Category", "Garage Name", "Date", "Odometer Reading", "Cost", "Status", "Next Service Due", "Actions"]} rows={visibleRecords.map((record) => [record.jobCardNumber, record.vehicleNumber, record.vehicleType, record.maintenanceType, record.serviceCategory, record.garageName, record.maintenanceDate, record.odometerReading, money(record.totalCost), <Status key={`${record.id}-status`} value={record.status} />, <Status key={`${record.id}-due`} value={record.dueStatus} />, <div key={`${record.id}-actions`} className="flex min-w-[270px] flex-wrap gap-2"><button onClick={() => { void openDetails(record); }} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-white">View</button><button onClick={() => { setEditRecord(record); setModal("maintenance"); }} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-white">Edit</button><button onClick={async () => { if (window.confirm(`Delete ${record.jobCardNumber}?`)) { await deleteMaintenance(token, record.id); await Promise.all([load(), refreshData()]); } }} className="rounded-md border border-tower-danger/50 bg-tower-danger/10 px-3 py-1.5 text-xs text-red-200">Delete</button><button disabled={!record.documents.length} onClick={() => { const doc = record.documents[0]; if (doc) void openSignedUpload(token, doc.key, true, doc.fileName || "bill"); }} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-white disabled:opacity-40">Download Bill</button></div>])} />}
      </Panel>

      <section className="grid gap-6 xl:grid-cols-3">
        <Panel title="Service Reminders" action="Due and overdue">
          <DataTable columns={["Alert", "Vehicle", "Message", "Date"]} rows={(dashboard?.reminders || []).map((item) => [item.type, item.vehicleNumber, item.message, item.date || "-"])} />
        </Panel>
        <Panel title="Tyre Management" action={`${dashboard?.tyres.length || 0} tyres`}>
          <DataTable columns={["Vehicle", "Tyre", "Position", "KM", "Status"]} rows={(dashboard?.tyres || []).map((tyre) => [tyre.vehicleNumber, tyre.tyreNumber, tyre.tyrePosition, tyre.currentKM, <Status key={tyre.id} value={tyre.status} />])} />
        </Panel>
        <Panel title="Accident Tracking" action={`${dashboard?.accidents.length || 0} cases`}>
          <DataTable columns={["Date", "Vehicle", "Location", "Claim", "Repair"]} rows={(dashboard?.accidents || []).map((accident) => [accident.accidentDate, accident.vehicleNumber, accident.location, <Status key={accident.id} value={accident.claimStatus} />, money(accident.repairCost)])} />
        </Panel>
      </section>

      {modal === "maintenance" && <MaintenanceRecordModal vehicles={vehicles} record={editRecord} types={dashboard?.types || []} onClose={() => { setModal(""); setEditRecord(undefined); }} onSave={saveMaintenance} />}
      {modal === "tyre" && <TyreModal vehicles={vehicles} onClose={() => setModal("")} onSave={async (body) => { await createTyre(token, body); setModal(""); await load(); }} />}
      {modal === "accident" && <AccidentModal vehicles={vehicles} drivers={drivers} onClose={() => setModal("")} onSave={async (body) => { await createAccident(token, body); setModal(""); await load(); }} />}
    </div>
  );
}

function MaintenanceRecordModal({ vehicles, record, types, onClose, onSave }: { vehicles: Vehicle[]; record?: MaintenanceRecord; types: string[]; onClose: () => void; onSave: (body: MaintenancePayload, file?: File) => void | Promise<void> }) {
  const [vehicleId, setVehicleId] = useState(record?.vehicleId || vehicles[0]?.id || "");
  const [maintenanceType, setMaintenanceType] = useState(record?.maintenanceType || types[0] || "General Service");
  const [customType, setCustomType] = useState("");
  const [serviceCategory, setServiceCategory] = useState(record?.serviceCategory || "Preventive");
  const [maintenanceDate, setMaintenanceDate] = useState(record?.maintenanceDate || today());
  const [garageName, setGarageName] = useState(record?.garageName || "");
  const [mechanicName, setMechanicName] = useState(record?.mechanicName || "");
  const [contactNumber, setContactNumber] = useState(record?.contactNumber || "");
  const [odometerReading, setOdometerReading] = useState(record?.odometerReading || 0);
  const [labourCost, setLabourCost] = useState(record?.labourCost || 0);
  const [partsCost, setPartsCost] = useState(record?.partsCost || 0);
  const [otherCharges, setOtherCharges] = useState(record?.otherCharges || 0);
  const [status, setStatus] = useState<MaintenanceStatus>(record?.status || "Scheduled");
  const [nextServiceDate, setNextServiceDate] = useState(record?.nextServiceDate || today(90));
  const [nextServiceKM, setNextServiceKM] = useState(record?.nextServiceKM || 0);
  const [scheduleEveryMonths, setScheduleEveryMonths] = useState(record?.scheduleEveryMonths || 3);
  const [scheduleEveryKM, setScheduleEveryKM] = useState(record?.scheduleEveryKM || 10000);
  const [description, setDescription] = useState(record?.description || "");
  const [remarks, setRemarks] = useState(record?.remarks || "");
  const [file, setFile] = useState<File>();
  const resolvedType = maintenanceType === "Custom" ? customType.trim() : maintenanceType;
  const totalCost = labourCost + partsCost + otherCharges;

  return (
    <ModalShell title={record ? "Edit Maintenance Record" : "Create Maintenance Record"} subtitle="Total cost is calculated from labour, parts, and other charges." onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FieldSelect label="Vehicle" value={vehicleId} onChange={setVehicleId} options={vehicles.map((vehicle) => ({ label: vehicle.number, value: vehicle.id }))} />
        <FieldSelect label="Maintenance Type" value={maintenanceType} onChange={setMaintenanceType} options={[...types, "Custom"].map((item) => ({ label: item, value: item }))} />
        {maintenanceType === "Custom" && <TextField label="Custom Maintenance Type" value={customType} onChange={setCustomType} />}
        <FieldSelect label="Service Category" value={serviceCategory} onChange={setServiceCategory} options={serviceCategories.map((item) => ({ label: item, value: item }))} />
        <DateInput label="Maintenance Date" value={maintenanceDate} onChange={setMaintenanceDate} />
        <TextField label="Garage Name" value={garageName} onChange={setGarageName} />
        <TextField label="Mechanic Name" value={mechanicName} onChange={setMechanicName} />
        <TextField label="Contact Number" value={contactNumber} onChange={setContactNumber} />
        <NumberField label="Odometer Reading" value={odometerReading} onChange={setOdometerReading} />
        <NumberField label="Labour Cost" value={labourCost} onChange={setLabourCost} />
        <NumberField label="Parts Cost" value={partsCost} onChange={setPartsCost} />
        <NumberField label="Other Charges" value={otherCharges} onChange={setOtherCharges} />
        <Info label="Total Cost" value={money(totalCost)} />
        <FieldSelect label="Status" value={status} onChange={(value) => setStatus(value as MaintenanceStatus)} options={maintenanceStatuses.map((item) => ({ label: item, value: item }))} />
        <DateInput label="Next Service Date" value={nextServiceDate} onChange={setNextServiceDate} />
        <NumberField label="Next Service KM" value={nextServiceKM} onChange={setNextServiceKM} />
        <NumberField label="Every Months" value={scheduleEveryMonths} onChange={setScheduleEveryMonths} />
        <NumberField label="Every KM" value={scheduleEveryKM} onChange={setScheduleEveryKM} />
        <label className="block text-sm text-tower-muted xl:col-span-3">Service Bill<input type="file" accept="application/pdf,image/*" onChange={(event) => setFile(event.target.files?.[0])} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white" /></label>
        <label className="block text-sm text-tower-muted xl:col-span-3">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white" /></label>
        <label className="block text-sm text-tower-muted xl:col-span-3">Remarks<textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white" /></label>
      </div>
      <ModalActions onClose={onClose} onSave={() => onSave({ vehicleId, maintenanceType: resolvedType, serviceCategory, maintenanceDate, garageName, mechanicName, contactNumber, odometerReading, labourCost, partsCost, otherCharges, description, remarks, status, nextServiceDate, nextServiceKM, scheduleEveryMonths, scheduleEveryKM }, file)} disabled={!vehicleId || !resolvedType || !garageName.trim()} label="Save Maintenance" />
    </ModalShell>
  );
}

function TyreModal({ vehicles, onClose, onSave }: { vehicles: Vehicle[]; onClose: () => void; onSave: (body: Omit<TyreRecord, "id" | "vehicleNumber">) => void | Promise<void> }) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || "");
  const [tyreNumber, setTyreNumber] = useState("");
  const [tyreBrand, setTyreBrand] = useState("");
  const [tyrePosition, setTyrePosition] = useState(tyrePositions[0]);
  const [installDate, setInstallDate] = useState(today());
  const [cost, setCost] = useState(0);
  const [currentKM, setCurrentKM] = useState(0);
  const [replacementDate, setReplacementDate] = useState(today(365));
  const [status, setStatus] = useState("Active");
  return <ModalShell title="Add Tyre" subtitle="Track tyre position, cost, KM, and replacement status." onClose={onClose}><div className="grid gap-4 md:grid-cols-2"><FieldSelect label="Vehicle" value={vehicleId} onChange={setVehicleId} options={vehicles.map((vehicle) => ({ label: vehicle.number, value: vehicle.id }))} /><TextField label="Tyre Number" value={tyreNumber} onChange={setTyreNumber} /><TextField label="Tyre Brand" value={tyreBrand} onChange={setTyreBrand} /><FieldSelect label="Position" value={tyrePosition} onChange={setTyrePosition} options={tyrePositions.map((item) => ({ label: item, value: item }))} /><DateInput label="Install Date" value={installDate} onChange={setInstallDate} /><NumberField label="Cost" value={cost} onChange={setCost} /><NumberField label="Current KM" value={currentKM} onChange={setCurrentKM} /><DateInput label="Replacement Date" value={replacementDate} onChange={setReplacementDate} /><FieldSelect label="Status" value={status} onChange={setStatus} options={["Active", "Due Soon", "Replaced", "Damaged"].map((item) => ({ label: item, value: item }))} /></div><ModalActions onClose={onClose} onSave={() => onSave({ vehicleId, tyreNumber, tyreBrand, tyrePosition, installDate, cost, currentKM, replacementDate, status })} disabled={!vehicleId || !tyreNumber.trim()} label="Save Tyre" /></ModalShell>;
}

function AccidentModal({ vehicles, drivers, onClose, onSave }: { vehicles: Vehicle[]; drivers: Driver[]; onClose: () => void; onSave: (body: Omit<AccidentRecord, "id" | "vehicleNumber" | "driverName">) => void | Promise<void> }) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || "");
  const [driverId, setDriverId] = useState(drivers[0]?.id || "");
  const [accidentDate, setAccidentDate] = useState(today());
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [damageCost, setDamageCost] = useState(0);
  const [insuranceClaimAmount, setInsuranceClaimAmount] = useState(0);
  const [repairCost, setRepairCost] = useState(0);
  const [claimStatus, setClaimStatus] = useState<AccidentRecord["claimStatus"]>("Pending");
  return <ModalShell title="Add Accident" subtitle="Track damage, insurance claim, repair cost, and claim status." onClose={onClose}><div className="grid gap-4 md:grid-cols-2"><FieldSelect label="Vehicle" value={vehicleId} onChange={setVehicleId} options={vehicles.map((vehicle) => ({ label: vehicle.number, value: vehicle.id }))} /><FieldSelect label="Driver" value={driverId} onChange={setDriverId} options={drivers.map((driver) => ({ label: driver.name, value: driver.id }))} /><DateInput label="Accident Date" value={accidentDate} onChange={setAccidentDate} /><TextField label="Location" value={location} onChange={setLocation} /><NumberField label="Damage Cost" value={damageCost} onChange={setDamageCost} /><NumberField label="Insurance Claim Amount" value={insuranceClaimAmount} onChange={setInsuranceClaimAmount} /><NumberField label="Repair Cost" value={repairCost} onChange={setRepairCost} /><FieldSelect label="Claim Status" value={claimStatus} onChange={(value) => setClaimStatus(value as AccidentRecord["claimStatus"])} options={claimStatuses.map((item) => ({ label: item, value: item }))} /><label className="block text-sm text-tower-muted md:col-span-2">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white" /></label></div><ModalActions onClose={onClose} onSave={() => onSave({ accidentDate, vehicleId, driverId, location, description, damageCost, insuranceClaimAmount, repairCost, claimStatus })} disabled={!vehicleId || !location.trim() || !description.trim()} label="Save Accident" /></ModalShell>;
}

const documentTabs = ["All Documents", "Vehicle Documents", "Driver Documents", "Trip Documents", "Bilty Documents", "Expiring Documents", "Expired Documents", "Missing Documents"];
const documentCategories = ["All", "Vehicle", "Driver", "Trip", "Bilty", "Invoice"];
const documentStatuses = ["All", "Active", "Expiring Soon", "Expired", "Missing"];
const documentReportTypes = ["All Documents Report", "Vehicle Compliance Report", "Driver Compliance Report", "Missing Documents Report", "Expiring Documents Report", "Expired Documents Report", "Bilty Register Report"];

function DocumentsModule({ data, token, onOpenModule }: { data: Data; token?: string; onOpenModule: (module: string) => void }) {
  const [repository, setRepository] = useState<DocumentRepositoryPayload>(() => buildLocalDocumentRepository(data));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("All Documents");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");
  const [datePreset, setDatePreset] = useState("This Month");
  const [customFrom, setCustomFrom] = useState(monthBounds().from);
  const [customTo, setCustomTo] = useState(monthBounds().to);
  const [selected, setSelected] = useState<RepositoryDocument>();

  useEffect(() => {
    setRepository(buildLocalDocumentRepository(data));
  }, [data]);

  useEffect(() => {
    setLoading(true);
    getDocumentRepository(token)
      .then((payload) => {
        setRepository(payload);
        setError("");
      })
      .catch((err) => {
        setRepository(buildLocalDocumentRepository(data));
        setError(err instanceof Error ? `${err.message}. Showing documents from loaded ERP data.` : "Showing documents from loaded ERP data.");
      })
      .finally(() => setLoading(false));
  }, [data, token]);

  const range = getDateRange(datePreset, customFrom, customTo);
  const filtered = repository.documents.filter((document) => {
    const text = [document.vehicleNumber, document.driverName, document.tripNumber, document.biltyNumber, document.documentNumber, document.customerName, document.documentName, document.linkedRecord].join(" ").toLowerCase();
    const dateValue = document.uploadDate || document.expiryDate;
    return text.includes(query.toLowerCase())
      && (category === "All" || document.category === category)
      && (status === "All" || document.status === status)
      && (!dateValue || (+new Date(dateValue) >= +range.from && +new Date(dateValue) <= +range.to))
      && matchesDocumentTab(document, tab);
  });

  const kpis = [
    { title: "Total Documents", value: repository.kpis.totalDocuments, tab: "All Documents", nextStatus: "All", nextCategory: "All", tone: "primary" as const },
    { title: "Vehicle Documents", value: repository.kpis.vehicleDocuments, tab: "Vehicle Documents", nextStatus: "All", nextCategory: "Vehicle", tone: "primary" as const },
    { title: "Driver Documents", value: repository.kpis.driverDocuments, tab: "Driver Documents", nextStatus: "All", nextCategory: "Driver", tone: "primary" as const },
    { title: "Trip Documents", value: repository.kpis.tripDocuments, tab: "Trip Documents", nextStatus: "All", nextCategory: "Trip", tone: "success" as const },
    { title: "Bilty Documents", value: repository.kpis.biltyDocuments, tab: "Bilty Documents", nextStatus: "All", nextCategory: "Bilty", tone: "success" as const },
    { title: "Active Documents", value: repository.kpis.activeDocuments, tab: "All Documents", nextStatus: "Active", nextCategory: "All", tone: "success" as const },
    { title: "Expiring Soon", value: repository.kpis.expiringSoon, tab: "Expiring Documents", nextStatus: "Expiring Soon", nextCategory: "All", tone: "warning" as const },
    { title: "Expired Documents", value: repository.kpis.expiredDocuments, tab: "Expired Documents", nextStatus: "Expired", nextCategory: "All", tone: "danger" as const },
    { title: "Missing Documents", value: repository.kpis.missingDocuments, tab: "Missing Documents", nextStatus: "Missing", nextCategory: "All", tone: "danger" as const },
    { title: "Compliance Score %", value: `${repository.kpis.complianceScore}%`, tab: "All Documents", nextStatus: "All", nextCategory: "All", tone: repository.kpis.complianceScore >= 90 ? "success" as const : "warning" as const }
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {kpis.map((card) => (
          <DocumentKpiCard
            key={card.title}
            {...card}
            onClick={() => {
              setTab(card.tab);
              setStatus(card.nextStatus);
              setCategory(card.nextCategory);
            }}
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        <ComplianceWidget title="Vehicle Compliance" value={repository.compliance.vehicle} />
        <ComplianceWidget title="Driver Compliance" value={repository.compliance.driver} />
        <ComplianceWidget title="Trip Documentation" value={repository.compliance.trip} />
        <ComplianceWidget title="Company Compliance" value={repository.compliance.overall} />
      </section>

      <Panel title="Document Control Filters" action={loading ? "Syncing" : error ? "Fallback mode" : "Live sync"}>
        {error && <div className="mb-4 rounded-md border border-tower-warning/40 bg-tower-warning/10 px-3 py-2 text-sm text-amber-100">{error}</div>}
        <div className="grid gap-3 xl:grid-cols-[1.5fr_0.8fr_0.8fr_1fr_auto] md:grid-cols-2">
          <TextField label="Search" value={query} onChange={setQuery} />
          <FieldSelect label="Document Category" value={category} onChange={setCategory} options={documentCategories.map((value) => ({ label: value, value }))} />
          <FieldSelect label="Document Status" value={status} onChange={setStatus} options={documentStatuses.map((value) => ({ label: value, value }))} />
          <FieldSelect label="Date Filter" value={datePreset} onChange={setDatePreset} options={["Today", "This Week", "This Month", "Custom Range"].map((value) => ({ label: value, value }))} />
          <button onClick={() => { setQuery(""); setCategory("All"); setStatus("All"); setDatePreset("This Month"); }} className="self-end rounded-md border border-tower-border px-3 py-2 text-sm text-tower-muted hover:text-white">Clear</button>
        </div>
        {datePreset === "Custom Range" && (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DateInput label="From Date" value={customFrom} onChange={setCustomFrom} />
            <DateInput label="To Date" value={customTo} onChange={setCustomTo} />
          </div>
        )}
      </Panel>

      <Segment value={tab} onChange={(value) => { setTab(value); setStatus(tabDefaultStatus(value)); setCategory(tabDefaultCategory(value)); }} values={documentTabs} />

      <section className="grid gap-6 xl:grid-cols-[1fr_0.36fr]">
        <Panel title={tab} action={`${filtered.length} records`}>
          <DataTable
            columns={documentColumns(tab)}
            rows={filtered.map((document) => documentRow(document, tab, token, setSelected, onOpenModule))}
          />
        </Panel>
        <div className="space-y-6">
          <ExpiryWatch documents={repository.documents} />
          <ReportsSection documents={repository.documents} filtered={filtered} />
        </div>
      </section>

      {selected && <DocumentPreviewDrawer document={selected} token={token} onClose={() => setSelected(undefined)} onOpenModule={onOpenModule} />}
    </div>
  );
}

function DocumentKpiCard({ title, value, tone, onClick }: { title: string; value: string | number; tone: "primary" | "success" | "warning" | "danger"; onClick: () => void }) {
  const toneClass = { primary: "text-tower-primary bg-tower-primary/10", success: "text-tower-success bg-tower-success/10", warning: "text-tower-warning bg-tower-warning/10", danger: "text-tower-danger bg-tower-danger/10" }[tone];
  return (
    <button onClick={onClick} className="rounded-lg border border-tower-border bg-tower-card p-5 text-left shadow-tower transition hover:-translate-y-0.5 hover:border-tower-primary/50">
      <div className="mb-5 flex items-center justify-between">
        <span className="text-sm text-tower-muted">{title}</span>
        <span className={cn("rounded-md p-2", toneClass)}><FileArchive size={20} /></span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </button>
  );
}

function ComplianceWidget({ title, value }: { title: string; value: number }) {
  const tone = value >= 90 ? "bg-tower-success" : value >= 75 ? "bg-tower-warning" : "bg-tower-danger";
  return (
    <div className="rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-tower-muted">{title}</span>
        <span className="text-xl font-semibold">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#0B1220]">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
      </div>
    </div>
  );
}

function ExpiryWatch({ documents }: { documents: RepositoryDocument[] }) {
  const rows = documents
    .filter((document) => document.expiryDate && document.status !== "Missing")
    .sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate))
    .slice(0, 8);
  return (
    <Panel title="Expiry Management" action="7 / 15 / 30 / 60 days">
      <div className="space-y-3">
        {rows.map((document) => {
          const days = daysUntil(document.expiryDate);
          const tone = days < 0 ? "border-tower-danger/40 bg-tower-danger/10 text-tower-danger" : days <= 7 ? "border-tower-danger/40 bg-tower-danger/10 text-tower-danger" : days <= 15 ? "border-orange-400/40 bg-orange-400/10 text-orange-200" : days <= 30 ? "border-tower-warning/40 bg-tower-warning/10 text-tower-warning" : "border-tower-primary/40 bg-tower-primary/10 text-tower-primary";
          return (
            <div key={document.id} className={cn("rounded-md border p-3", tone)}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{document.documentType}</div>
                  <div className="text-xs opacity-80">{document.ownerName}</div>
                </div>
                <div className="text-right text-xs">{document.countdown}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function ReportsSection({ documents, filtered }: { documents: RepositoryDocument[]; filtered: RepositoryDocument[] }) {
  const [report, setReport] = useState(documentReportTypes[0]);
  const rows = documentsForReport(report, documents, filtered);
  return (
    <Panel title="Reports" action={`${rows.length} rows`}>
      <div className="space-y-3">
        <FieldSelect label="Report Type" value={report} onChange={setReport} options={documentReportTypes.map((value) => ({ label: value, value }))} />
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => exportDocumentsReport(rows, report, "excel")} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-sm text-white hover:border-tower-primary/60">Excel</button>
          <button onClick={() => exportDocumentsReport(rows, report, "pdf")} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-sm text-white hover:border-tower-primary/60">PDF</button>
        </div>
      </div>
    </Panel>
  );
}

function DocumentPreviewDrawer({ document, token, onClose, onOpenModule }: { document: RepositoryDocument; token?: string; onClose: () => void; onOpenModule: (module: string) => void }) {
  const [previewUrl, setPreviewUrl] = useState(document.fileUrl || "");
  useEffect(() => {
    if (!document.fileKey) {
      setPreviewUrl(document.fileUrl || "");
      return;
    }
    previewUpload(token, document.fileKey).then((result) => setPreviewUrl(result.url)).catch(() => setPreviewUrl(document.fileUrl || ""));
  }, [document, token]);

  const isImage = document.fileType.startsWith("image") || /\.(png|jpg|jpeg|webp)$/i.test(document.fileName);
  const isPdf = document.fileType === "application/pdf" || /\.pdf$/i.test(document.fileName);

  return (
    <Drawer title="Document Preview" subtitle={document.documentName} onClose={onClose}>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Preview" action={document.fileName || document.status}>
          <div className="grid min-h-[560px] place-items-center overflow-hidden rounded-lg border border-tower-border bg-[#0B1220]">
            {document.status === "Missing" ? (
              <span className="px-4 text-center text-sm text-tower-muted">This required document has not been uploaded in its owning module.</span>
            ) : isImage && previewUrl ? (
              <img src={previewUrl} alt={document.fileName} className="max-h-[560px] w-full object-contain" />
            ) : isPdf && previewUrl ? (
              <iframe title={document.fileName} src={previewUrl} className="h-[560px] w-full" />
            ) : (
              <button onClick={() => openSignedUpload(token, document.fileKey, false, document.fileName)} className="rounded-md border border-tower-border px-3 py-2 text-sm text-white">Open Document</button>
            )}
          </div>
        </Panel>
        <Panel title="Document Information" action={<DocumentStatusBadge value={document.status} />}>
          <div className="grid gap-3">
            <Info label="Document Number" value={document.documentNumber} />
            <Info label="Document Type" value={document.documentType} />
            <Info label="Linked Vehicle" value={document.vehicleNumber || "-"} />
            <Info label="Linked Driver" value={document.driverName || "-"} />
            <Info label="Linked Trip" value={document.tripNumber || "-"} />
            <Info label="Linked Bilty" value={document.biltyNumber || "-"} />
            <Info label="Upload Date" value={document.uploadDate || "-"} />
            <Info label="Expiry Date" value={document.expiryDate || "-"} />
            <Info label="Uploaded By" value={document.uploadedBy || "-"} />
            <Info label="File Size" value={formatFileSize(document.fileSize)} />
            <Info label="File Type" value={document.fileType || "-"} />
            <Info label="Notes" value={document.notes || "-"} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button disabled={!document.fileKey} onClick={() => openSignedUpload(token, document.fileKey, false, document.fileName)} className="rounded-md border border-tower-border px-3 py-2 text-sm text-white disabled:opacity-40">View</button>
            <button disabled={!document.fileKey} onClick={() => openSignedUpload(token, document.fileKey, true, document.fileName)} className="rounded-md border border-tower-border px-3 py-2 text-sm text-white disabled:opacity-40">Download</button>
            <button onClick={() => onOpenModule(moduleForDocument(document))} className="col-span-2 rounded-md bg-tower-primary px-3 py-2 text-sm font-medium text-white">Open Linked Record</button>
          </div>
        </Panel>
      </div>
    </Drawer>
  );
}

function documentColumns(tab: string) {
  if (tab === "Vehicle Documents") return ["Vehicle Number", "Document Type", "Document Number", "Upload Date", "Expiry Date", "Status", "Actions"];
  if (tab === "Driver Documents") return ["Driver Name", "Document Type", "Document Number", "Expiry Date", "Status", "Actions"];
  if (tab === "Trip Documents") return ["Trip Number", "Document Type", "Customer", "Upload Date", "Status", "Actions"];
  if (tab === "Bilty Documents") return ["Bilty Number", "Trip Number", "Customer", "Vehicle", "Driver", "Upload Date", "Verification Status", "File Type", "Actions"];
  if (tab === "Expired Documents") return ["Days Expired", "Document Owner", "Document Type", "Status", "Actions"];
  if (tab === "Missing Documents") return ["Document Owner", "Document Type", "Linked Module", "Issue", "Status", "Actions"];
  return ["Document Name", "Document Type", "Category", "Linked Module", "Linked Record", "Document Number", "Upload Date", "Expiry Date", "Status", "Actions"];
}

function documentRow(document: RepositoryDocument, tab: string, token: string | undefined, setSelected: (document: RepositoryDocument) => void, onOpenModule: (module: string) => void) {
  const actions = <DocumentActions key={`${document.id}-actions`} document={document} token={token} setSelected={setSelected} onOpenModule={onOpenModule} />;
  const statusBadge = <DocumentStatusBadge key={`${document.id}-status`} value={document.status} />;
  if (tab === "Vehicle Documents") return [document.vehicleNumber || document.ownerName, document.documentType, document.documentNumber, document.uploadDate || "-", document.expiryDate || "-", statusBadge, actions];
  if (tab === "Driver Documents") return [document.driverName || document.ownerName, document.documentType, document.documentNumber, document.expiryDate || "-", statusBadge, actions];
  if (tab === "Trip Documents") return [document.tripNumber || document.linkedRecord, document.documentType, document.customerName || "-", document.uploadDate || "-", statusBadge, actions];
  if (tab === "Bilty Documents") return [document.biltyNumber || document.documentNumber, document.tripNumber || "-", document.customerName || "-", document.vehicleNumber || "-", document.driverName || "-", document.uploadDate || "-", <Status key={`${document.id}-verify`} value={document.verificationStatus || "Pending Verification"} />, document.fileType || "-", actions];
  if (tab === "Expired Documents") return [`${Math.abs(daysUntil(document.expiryDate))} days`, document.ownerName, document.documentType, statusBadge, actions];
  if (tab === "Missing Documents") return [document.ownerName, document.documentType, document.linkedModule, document.notes, statusBadge, actions];
  return [document.documentName, document.documentType, document.category, document.linkedModule, document.linkedRecord, document.documentNumber, document.uploadDate || "-", document.expiryDate || "-", statusBadge, actions];
}

function DocumentActions({ document, token, setSelected, onOpenModule }: { document: RepositoryDocument; token: string | undefined; setSelected: (document: RepositoryDocument) => void; onOpenModule: (module: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => setSelected(document)} className="rounded-md border border-tower-border px-2.5 py-1.5 text-xs text-white hover:border-tower-primary/60">View</button>
      <button disabled={!document.fileKey} onClick={() => openSignedUpload(token, document.fileKey, true, document.fileName)} className="rounded-md border border-tower-border px-2.5 py-1.5 text-xs text-white disabled:opacity-40">Download</button>
      <button onClick={() => onOpenModule(moduleForDocument(document))} className="rounded-md border border-tower-border px-2.5 py-1.5 text-xs text-white hover:border-tower-primary/60">Open</button>
    </div>
  );
}

function DocumentStatusBadge({ value }: { value: RepositoryDocumentStatus }) {
  const tone = value === "Active" ? "bg-tower-success/10 text-tower-success" : value === "Expiring Soon" ? "bg-tower-warning/10 text-tower-warning" : "bg-tower-danger/10 text-tower-danger";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tone)}>{value}</span>;
}

function matchesDocumentTab(document: RepositoryDocument, tab: string) {
  if (tab === "Vehicle Documents") return document.category === "Vehicle";
  if (tab === "Driver Documents") return document.category === "Driver";
  if (tab === "Trip Documents") return document.category === "Trip";
  if (tab === "Bilty Documents") return document.category === "Bilty";
  if (tab === "Expiring Documents") return document.status === "Expiring Soon";
  if (tab === "Expired Documents") return document.status === "Expired";
  if (tab === "Missing Documents") return document.status === "Missing";
  return true;
}

function tabDefaultStatus(tab: string) {
  if (tab === "Expiring Documents") return "Expiring Soon";
  if (tab === "Expired Documents") return "Expired";
  if (tab === "Missing Documents") return "Missing";
  return "All";
}

function tabDefaultCategory(tab: string) {
  if (tab === "Vehicle Documents") return "Vehicle";
  if (tab === "Driver Documents") return "Driver";
  if (tab === "Trip Documents") return "Trip";
  if (tab === "Bilty Documents") return "Bilty";
  return "All";
}

function moduleForDocument(document: RepositoryDocument) {
  if (document.category === "Vehicle") return "Vehicles";
  if (document.category === "Driver") return "Drivers";
  if (document.category === "Trip") return "Trips";
  if (document.category === "Bilty") return "Bilty / LR Management";
  if (document.category === "Invoice") return "Invoices";
  return "Documents";
}

function documentsForReport(report: string, documents: RepositoryDocument[], filtered: RepositoryDocument[]) {
  if (report === "Vehicle Compliance Report") return documents.filter((document) => document.category === "Vehicle");
  if (report === "Driver Compliance Report") return documents.filter((document) => document.category === "Driver");
  if (report === "Missing Documents Report") return documents.filter((document) => document.status === "Missing");
  if (report === "Expiring Documents Report") return documents.filter((document) => document.status === "Expiring Soon");
  if (report === "Expired Documents Report") return documents.filter((document) => document.status === "Expired");
  if (report === "Bilty Register Report") return documents.filter((document) => document.category === "Bilty");
  return filtered;
}

function exportDocumentsReport(rows: RepositoryDocument[], report: string, format: "excel" | "pdf") {
  const columns = ["Document Name", "Type", "Category", "Linked Module", "Linked Record", "Document Number", "Upload Date", "Expiry Date", "Status", "Owner", "Customer", "Vehicle", "Driver", "Trip", "Bilty"];
  const tableRows = rows.map((document) => [document.documentName, document.documentType, document.category, document.linkedModule, document.linkedRecord, document.documentNumber, document.uploadDate, document.expiryDate, document.status, document.ownerName, document.customerName, document.vehicleNumber, document.driverName, document.tripNumber, document.biltyNumber]);
  const name = report.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (format === "excel") {
    const csv = [columns, ...tableRows].map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadBlob(csv, `${name}.csv`, "text/csv;charset=utf-8");
    return;
  }
  const html = `<!doctype html><html><head><title>${report}</title><style>body{font-family:Arial,sans-serif;padding:24px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f1f5f9}</style></head><body><h1>${report}</h1><table><thead><tr>${columns.map((column) => `<th>${column}</th>`).join("")}</tr></thead><tbody>${tableRows.map((row) => `<tr>${row.map((cell) => `<td>${String(cell || "")}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.print()</script></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  window.open(url, "_blank", "noopener,noreferrer");
}

function downloadBlob(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatFileSize(size: number) {
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function buildLocalDocumentRepository(data: Data): DocumentRepositoryPayload {
  const documents = buildLocalDocuments(data);
  const compliance = calculateLocalCompliance(documents);
  return {
    documents,
    kpis: {
      totalDocuments: documents.filter((document) => document.status !== "Missing").length,
      vehicleDocuments: documents.filter((document) => document.category === "Vehicle" && document.status !== "Missing").length,
      driverDocuments: documents.filter((document) => document.category === "Driver" && document.status !== "Missing").length,
      tripDocuments: documents.filter((document) => document.category === "Trip" && document.status !== "Missing").length,
      biltyDocuments: documents.filter((document) => document.category === "Bilty" && document.status !== "Missing").length,
      activeDocuments: documents.filter((document) => document.status === "Active").length,
      expiringSoon: documents.filter((document) => document.status === "Expiring Soon").length,
      expiredDocuments: documents.filter((document) => document.status === "Expired").length,
      missingDocuments: documents.filter((document) => document.status === "Missing").length,
      complianceScore: compliance.overall
    },
    compliance
  };
}

function buildLocalDocuments(data: Data): RepositoryDocument[] {
  const rows: RepositoryDocument[] = [];
  for (const vehicle of data.vehicles) {
    for (const document of (((vehicle as any).documentUrls || []) as Array<{ type: string; url: string; key: string; uploadedAt?: string }>)) {
      const type = vehicleUploadType(document.type);
      rows.push(localDocument({ id: `vehicle-${vehicle.id}-${document.key}`, documentName: `${vehicle.number} ${type}`, documentType: type, category: "Vehicle", linkedModule: "Vehicle Module", linkedRecord: vehicle.number, linkedRecordId: vehicle.id, documentNumber: type === "RC" ? (vehicle as any).rcNumber || "-" : "-", uploadDate: toDateInput(new Date(document.uploadedAt || Date.now())), expiryDate: vehicleDocumentExpiry(vehicle, type), ownerName: vehicle.number, vehicleNumber: vehicle.number, fileUrl: document.url, fileKey: document.key, fileName: document.key.split("/").pop() || type, notes: "Synced from Vehicle Module" }));
    }
    for (const type of ["RC", "Insurance", "Permit", "Fitness", "PUC"]) {
      if ((((vehicle as any).documentUrls || []) as Array<{ type: string }>).some((document) => vehicleUploadType(document.type) === type)) continue;
      rows.push(localDocument({ id: `missing-vehicle-${vehicle.id}-${type}`, documentName: `${vehicle.number} ${type}`, documentType: type, category: "Vehicle", linkedModule: "Vehicle Module", linkedRecord: vehicle.number, linkedRecordId: vehicle.id, documentNumber: type === "RC" ? (vehicle as any).rcNumber || "-" : "-", expiryDate: vehicleDocumentExpiry(vehicle, type), status: "Missing", ownerName: vehicle.number, vehicleNumber: vehicle.number, notes: `Vehicle missing ${type}` }));
    }
  }
  for (const driver of data.drivers) {
    for (const document of (((driver as any).documentUrls || []) as Array<{ type: string; url: string; key: string; uploadedAt?: string }>)) {
      const type = driverUploadType(document.type);
      rows.push(localDocument({ id: `driver-${driver.id}-${document.key}`, documentName: `${driver.name} ${type}`, documentType: type, category: "Driver", linkedModule: "Driver Module", linkedRecord: driver.name, linkedRecordId: driver.id, documentNumber: type === "License" ? driver.licenseNumber : "-", uploadDate: toDateInput(new Date(document.uploadedAt || Date.now())), expiryDate: type === "License" ? driver.licenseExpiry : "", ownerName: driver.name, driverName: driver.name, fileUrl: document.url, fileKey: document.key, fileName: document.key.split("/").pop() || type, notes: "Synced from Driver Module" }));
    }
    for (const type of ["License", "Aadhaar", "PAN", "Medical"]) {
      if ((((driver as any).documentUrls || []) as Array<{ type: string }>).some((document) => driverUploadType(document.type) === type)) continue;
      rows.push(localDocument({ id: `missing-driver-${driver.id}-${type}`, documentName: `${driver.name} ${type}`, documentType: type, category: "Driver", linkedModule: "Driver Module", linkedRecord: driver.name, linkedRecordId: driver.id, documentNumber: type === "License" ? driver.licenseNumber : "-", expiryDate: type === "License" ? driver.licenseExpiry : "", status: "Missing", ownerName: driver.name, driverName: driver.name, notes: `Driver missing ${type}` }));
    }
  }
  for (const bilty of data.bilties) {
    for (const file of bilty.files || []) {
      rows.push(localDocument({ id: `bilty-${bilty.id}-${file.id}`, documentName: `${bilty.biltyNumber} Bilty`, documentType: "Bilty", category: "Bilty", linkedModule: "Bilty / LR Management", linkedRecord: bilty.biltyNumber, linkedRecordId: bilty.id, documentNumber: bilty.biltyNumber, uploadDate: file.uploadedAt || bilty.uploadDate, ownerName: bilty.biltyNumber, customerName: bilty.customerName, vehicleNumber: bilty.vehicleNumber, driverName: bilty.driverName, tripNumber: bilty.tripNumber, biltyNumber: bilty.biltyNumber, uploadedBy: bilty.uploadedBy, fileUrl: file.url, fileKey: file.key, fileName: file.fileName, fileType: file.fileType, fileSize: file.fileSize, verificationStatus: bilty.verificationStatus, notes: bilty.remarks || "Synced from Bilty / LR Management" }));
    }
  }
  for (const invoice of data.invoices) {
    if (!invoice.pdfKey && !invoice.pdfPath) continue;
    const trip = data.trips.find((item) => item.id === invoice.tripId);
    rows.push(localDocument({ id: `invoice-${invoice.id}`, documentName: `${invoice.invoiceNumber} Invoice PDF`, documentType: "Invoice PDF", category: "Invoice", linkedModule: "Invoice Module", linkedRecord: invoice.invoiceNumber, linkedRecordId: invoice.id, documentNumber: invoice.invoiceNumber, uploadDate: String(invoice.invoiceDate || "").slice(0, 10), ownerName: invoice.invoiceNumber, customerName: data.customers.find((customer) => customer.id === invoice.customerId)?.name || trip?.customer?.name || "", vehicleNumber: trip?.vehicle?.number || "", driverName: trip?.driver?.name || "", tripNumber: trip?.tripNumber || "", fileUrl: invoice.pdfPath || "", fileKey: invoice.pdfKey || "", fileName: `${invoice.invoiceNumber}.pdf`, fileType: "application/pdf", notes: invoice.remarks || invoice.notes || "Synced from Invoice Module" }));
  }
  const biltyTripIds = new Set(data.bilties.filter((bilty) => bilty.status !== "Missing" && (bilty.files?.length || bilty.fileKey)).map((bilty) => bilty.tripId));
  for (const trip of data.trips.filter((item) => ["Delivered", "Completed"].includes(item.status))) {
    for (const type of ["Bilty", "POD", "Customer Attachments"]) {
      if (type === "Bilty" && biltyTripIds.has(trip.id)) continue;
      rows.push(localDocument({ id: `missing-trip-${trip.id}-${type}`, documentName: `${trip.tripNumber} ${type}`, documentType: type, category: "Trip", linkedModule: "Trip Module", linkedRecord: trip.tripNumber, linkedRecordId: trip.id, status: "Missing", ownerName: trip.tripNumber, customerName: trip.customer?.name || data.customers.find((customer) => customer.id === trip.customerId)?.name || "", vehicleNumber: trip.vehicle?.number || data.vehicles.find((vehicle) => vehicle.id === trip.vehicleId)?.number || "", driverName: trip.driver?.name || data.drivers.find((driver) => driver.id === trip.driverId)?.name || "", tripNumber: trip.tripNumber, notes: `Completed trip missing ${type}` }));
    }
  }
  return rows;
}

function localDocument(input: Partial<RepositoryDocument> & Pick<RepositoryDocument, "id" | "documentName" | "documentType" | "category" | "linkedModule" | "linkedRecord">): RepositoryDocument {
  const resolvedStatus = input.status || documentStatusForExpiry(input.expiryDate || "");
  return {
    id: input.id,
    documentName: input.documentName,
    documentType: input.documentType,
    category: input.category,
    linkedModule: input.linkedModule,
    linkedRecord: input.linkedRecord,
    linkedRecordId: input.linkedRecordId || "",
    documentNumber: input.documentNumber || "-",
    uploadDate: input.uploadDate || "",
    expiryDate: input.expiryDate || "",
    status: resolvedStatus,
    ownerName: input.ownerName || input.linkedRecord,
    customerName: input.customerName || "",
    vehicleNumber: input.vehicleNumber || "",
    driverName: input.driverName || "",
    tripNumber: input.tripNumber || "",
    biltyNumber: input.biltyNumber || "",
    uploadedBy: input.uploadedBy || "System",
    fileSize: input.fileSize || 0,
    fileType: input.fileType || "",
    fileName: input.fileName || "",
    fileUrl: input.fileUrl || "",
    fileKey: input.fileKey || "",
    notes: input.notes || "",
    countdown: input.status === "Missing" ? "Not uploaded" : documentCountdown(input.expiryDate || ""),
    verificationStatus: input.verificationStatus
  };
}

function documentStatusForExpiry(value: string): RepositoryDocumentStatus {
  if (!value) return "Active";
  const days = daysUntil(value);
  if (days < 0) return "Expired";
  if (days <= 30) return "Expiring Soon";
  return "Active";
}

function documentCountdown(value: string) {
  if (!value) return "No expiry";
  const days = daysUntil(value);
  if (days < 0) return `Expired ${Math.abs(days)} days ago`;
  if (days === 0) return "Expires today";
  return `Expires in ${days} days`;
}

function calculateLocalCompliance(documents: RepositoryDocument[]) {
  const required = documents.filter((document) => document.status === "Missing" || document.category === "Vehicle" || (document.category === "Driver" && ["License", "Medical"].includes(document.documentType)));
  const score = (category?: RepositoryDocumentCategory) => {
    const rows = category ? required.filter((document) => document.category === category) : required;
    return rows.length ? Math.round((rows.filter((document) => document.status === "Active").length / rows.length) * 100) : 100;
  };
  return { vehicle: score("Vehicle"), driver: score("Driver"), trip: score("Trip"), overall: score() };
}

const incomingCategories = ["Invoice Payment", "Advance Received", "Security Deposit", "Adjustment", "Other"];
const outgoingCategories = ["Driver Advance", "Driver Payment", "Fuel Payment", "Maintenance Payment", "Toll Payment", "Vendor Payment", "Salary Payment", "Insurance Payment", "Miscellaneous", "Other"];
const paymentModes = ["Cash", "UPI", "IMPS", "NEFT", "RTGS", "Cheque", "Bank Transfer", "Other"];
const pnlTabs = ["Trip Profitability", "Vehicle Profitability", "Customer Profitability", "Driver Cost Analysis", "Expense Analytics", "Revenue Analytics", "Receivables & Collections", "Cash Flow Analysis"];
const pnlReportTypes = ["Profit & Loss Statement", "Vehicle Profitability Statement", "Company Profitability Statement", "Driver Cost Statement", "Trip Profitability Statement"];
const pnlDateRanges = ["Daily", "Weekly", "Monthly", "Quarterly", "Yearly", "Custom Range"];

type ProfitLossDashboard = {
  kpis?: ProfitLossKpis;
  trips: ProfitTripRow[];
  vehicles: any[];
  customers: any[];
  drivers: any[];
  expenses?: any;
  revenue?: any;
  cashflow?: any;
  receivables?: any;
};

function ProfitLossModule({ vehicles, drivers, customers, trips, token }: { vehicles: Vehicle[]; drivers: Driver[]; customers: Customer[]; trips: Trip[]; token?: string }) {
  const [filters, setFilters] = useState<ProfitLossFilters>(() => ({ from: monthBounds().from, to: monthBounds().to, vehicleId: "All", driverId: "All", customerId: "All", route: "All", tripId: "All", branch: "All", paymentType: "All", expenseCategory: "All" }));
  const [tab, setTab] = useState(pnlTabs[0]);
  const [dashboard, setDashboard] = useState<ProfitLossDashboard>({ trips: [], vehicles: [], customers: [], drivers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTrip, setSelectedTrip] = useState<ProfitTripRow | undefined>();
  const [statementOpen, setStatementOpen] = useState(false);

  const setFilter = (key: keyof ProfitLossFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const applyPreset = (preset: string) => {
    const range = profitLossDateRange(preset);
    setFilters((current) => ({ ...current, from: range.from, to: range.to }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [kpis, tripRows, vehicleRows, customerRows, driverRows, expenses, revenue, cashflow, receivables] = await Promise.all([
        getProfitLossKpis(token, filters),
        getProfitLossTrips(token, filters),
        getProfitLossVehicles(token, filters),
        getProfitLossCustomers(token, filters),
        getProfitLossDrivers(token, filters),
        getProfitLossExpenses(token, filters),
        getProfitLossRevenue(token, filters),
        getProfitLossCashflow(token, filters),
        getProfitLossReceivables(token, filters)
      ]);
      setDashboard({ kpis, trips: tripRows, vehicles: vehicleRows, customers: customerRows, drivers: driverRows, expenses, revenue, cashflow, receivables });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profit & Loss data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [filters, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const routes = Array.from(new Set(trips.map((trip) => `${trip.loadingPoint} to ${trip.unloadingPoint}`))).filter(Boolean);
  const expenseCategories = ["All", "Diesel", "Toll", "Driver Advance", "Driver", "Loading/Unloading", "Maintenance", "Insurance", "Permit", "Office Expense", "Miscellaneous"];

  if (loading && !dashboard.kpis) return <Skeleton />;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Profit & Loss Control Center</h3>
            <p className="text-sm text-tower-muted">Live financial analytics calculated from trips, expenses, invoices, and payments.</p>
          </div>
          <button onClick={() => setStatementOpen(true)} className="rounded-md bg-tower-primary px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-950/30">Generate Statement</button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {["Today", "This Week", "This Month", "Last Month", "Quarter", "Year"].map((preset) => (
            <button key={preset} onClick={() => applyPreset(preset)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-xs text-tower-muted hover:text-white">
              {preset}
            </button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DateInput label="From" value={String(filters.from || "")} onChange={(value) => setFilter("from", value)} />
          <DateInput label="To" value={String(filters.to || "")} onChange={(value) => setFilter("to", value)} />
          <FieldSelect label="Vehicle" value={String(filters.vehicleId || "All")} onChange={(value) => setFilter("vehicleId", value)} options={[{ label: "All Vehicles", value: "All" }, ...vehicles.map((vehicle) => ({ label: vehicle.number, value: vehicle.id }))]} />
          <FieldSelect label="Driver" value={String(filters.driverId || "All")} onChange={(value) => setFilter("driverId", value)} options={[{ label: "All Drivers", value: "All" }, ...drivers.map((driver) => ({ label: driver.name, value: driver.id }))]} />
          <FieldSelect label="Customer" value={String(filters.customerId || "All")} onChange={(value) => setFilter("customerId", value)} options={[{ label: "All Customers", value: "All" }, ...customers.map((customer) => ({ label: customer.name, value: customer.id }))]} />
          <FieldSelect label="Route" value={String(filters.route || "All")} onChange={(value) => setFilter("route", value)} options={[{ label: "All Routes", value: "All" }, ...routes.map((route) => ({ label: route, value: route }))]} />
          <FieldSelect label="Trip" value={String(filters.tripId || "All")} onChange={(value) => setFilter("tripId", value)} options={[{ label: "All Trips", value: "All" }, ...trips.map((trip) => ({ label: trip.tripNumber, value: trip.id }))]} />
          <FieldSelect label="Branch" value={String(filters.branch || "All")} onChange={(value) => setFilter("branch", value)} options={["All", "Head Office"].map((value) => ({ label: value, value }))} />
          <FieldSelect label="Payment Type" value={String(filters.paymentType || "All")} onChange={(value) => setFilter("paymentType", value)} options={["All", ...paymentModes].map((value) => ({ label: value, value }))} />
          <FieldSelect label="Expense Category" value={String(filters.expenseCategory || "All")} onChange={(value) => setFilter("expenseCategory", value)} options={expenseCategories.map((value) => ({ label: value, value }))} />
        </div>
      </section>

      {error && <div className="rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      {dashboard.kpis && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {dashboard.kpis.cards.map((card) => (
            <ProfitKpiCard key={card.key} card={card} />
          ))}
        </section>
      )}

      {dashboard.kpis && <BusinessHealthStrip kpis={dashboard.kpis} />}

      <Segment value={tab} onChange={setTab} values={pnlTabs} />

      {tab === "Trip Profitability" && (
        <Panel title="Trip Profitability" action={`${dashboard.trips.length} trips`}>
          <DataTable
            columns={["Trip Number", "Date", "Customer", "Vehicle", "Driver", "Revenue", "Expense", "Profit", "Profit %", "Status"]}
            rows={dashboard.trips.map((trip) => [
              <button key={trip.id} onClick={() => setSelectedTrip(trip)} className="text-left font-medium text-tower-primary hover:underline">{trip.tripNumber}</button>,
              trip.date,
              trip.customer,
              trip.vehicleNumber,
              trip.driver,
              money(trip.revenue),
              money(trip.expense),
              <span key={`${trip.id}-profit`} className={cn(trip.profit >= 0 ? "text-tower-success" : "text-tower-danger")}>{money(trip.profit)}</span>,
              `${trip.profitPercent}%`,
              <Status key={`${trip.id}-status`} value={trip.status} />
            ])}
          />
        </Panel>
      )}

      {tab === "Vehicle Profitability" && <VehicleProfitabilityTab rows={dashboard.vehicles} />}
      {tab === "Customer Profitability" && <CustomerProfitabilityTab rows={dashboard.customers} />}
      {tab === "Driver Cost Analysis" && <DriverCostTab rows={dashboard.drivers} />}
      {tab === "Expense Analytics" && <ExpenseAnalyticsTab analytics={dashboard.expenses} />}
      {tab === "Revenue Analytics" && <RevenueAnalyticsTab analytics={dashboard.revenue} />}
      {tab === "Receivables & Collections" && <ReceivablesTab data={dashboard.receivables} />}
      {tab === "Cash Flow Analysis" && <CashFlowTab data={dashboard.cashflow} />}

      {selectedTrip && <TripProfitDrawer trip={selectedTrip} onClose={() => setSelectedTrip(undefined)} />}
      {statementOpen && <StatementModal filters={filters} token={token} vehicles={vehicles} drivers={drivers} customers={customers} onClose={() => setStatementOpen(false)} />}
    </div>
  );
}

function ProfitKpiCard({ card }: { card: ProfitLossKpiCard }) {
  const isPercent = card.suffix === "%";
  const value = isPercent ? `${card.amount}%` : money(card.amount);
  return (
    <div className="rounded-lg border border-tower-border bg-tower-card p-4 shadow-tower">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-tower-muted">{card.label}</div>
        <span className={cn("rounded-md px-2 py-1 text-xs font-medium", card.trend === "up" ? "bg-tower-success/10 text-tower-success" : "bg-tower-danger/10 text-tower-danger")}>{card.trend === "up" ? "Up" : "Down"}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
      <div className={cn("mt-2 text-xs", card.growth >= 0 ? "text-tower-success" : "text-tower-danger")}>{card.growth >= 0 ? "+" : ""}{card.growth}% vs previous period</div>
    </div>
  );
}

function BusinessHealthStrip({ kpis }: { kpis: ProfitLossKpis }) {
  const leaders = kpis.leaders || {};
  const netProfit = kpis.totals.netProfit || 0;
  const receivables = kpis.totals.outstandingReceivables || 0;
  const revenue = kpis.totals.totalRevenue || 0;
  const health = netProfit >= 0 && receivables <= revenue * 0.35 ? "Healthy" : "Watch";
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Info label="Business Health" value={<Status value={health} />} />
      <Info label="Most Profitable Vehicle" value={leaders.mostProfitableVehicle?.vehicleNumber || "-"} />
      <Info label="Most Profitable Customer" value={leaders.mostProfitableCustomer?.customer || "-"} />
      <Info label="Highest Expense Category" value={leaders.highestExpenseCategory ? `${leaders.highestExpenseCategory.name} · ${money(leaders.highestExpenseCategory.amount)}` : "-"} />
    </section>
  );
}

function VehicleProfitabilityTab({ rows }: { rows: any[] }) {
  return (
    <div className="space-y-6">
      <Panel title="Vehicle Profitability" action="Lifetime and filtered period">
        <DataTable columns={["Vehicle Number", "Trips", "Revenue", "Expenses", "Profit", "Profit %", "Diesel Cost", "Maintenance Cost", "Driver Cost", "Status"]} rows={rows.map((row) => [row.vehicleNumber, row.trips, money(row.revenue), money(row.expenses), money(row.profit), `${row.profitPercent}%`, money(row.dieselCost), money(row.maintenanceCost), money(row.driverCost), <Status key={row.vehicleId} value={row.status} />])} />
      </Panel>
      <Panel title="Monthly Profitability" action="Top vehicles">
        <ChartFrame><ResponsiveContainer><BarChart data={rows.slice(0, 8)}><CartesianGrid stroke="#1F2A44" /><XAxis dataKey="vehicleNumber" stroke="#94A3B8" /><YAxis stroke="#94A3B8" tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`} /><Tooltip formatter={(value) => money(Number(value))} contentStyle={chartTooltipStyle} /><Bar dataKey="profit" fill="#22C55E" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></ChartFrame>
      </Panel>
    </div>
  );
}

function CustomerProfitabilityTab({ rows }: { rows: any[] }) {
  const [selected, setSelected] = useState<any>();
  return (
    <>
      <Panel title="Customer Profitability" action="Invoices, collections, and outstanding">
        <DataTable columns={["Customer", "Trips", "Revenue", "Expense Allocation", "Profit", "Outstanding", "Collection %"]} rows={rows.map((row) => [<button key={row.customerId} onClick={() => setSelected(row)} className="text-left font-medium text-tower-primary hover:underline">{row.customer}</button>, row.trips, money(row.revenue), money(row.expenseAllocation), money(row.profit), money(row.outstanding), `${row.collectionPercent}%`])} />
      </Panel>
      {selected && <CustomerProfitDrawer row={selected} onClose={() => setSelected(undefined)} />}
    </>
  );
}

function DriverCostTab({ rows }: { rows: any[] }) {
  return (
    <Panel title="Driver Cost Analysis" action="Advances, payments, and contribution">
      <DataTable columns={["Driver", "Trips", "Advances", "Payments", "Revenue Generated", "Cost Impact", "Net Contribution", "Pending Settlement"]} rows={rows.map((row) => [row.driver, row.trips, money(row.advances), money(row.payments), money(row.revenueGenerated), money(row.costImpact), money(row.netContribution), money(row.pendingSettlement)])} />
    </Panel>
  );
}

function CustomerProfitDrawer({ row, onClose }: { row: any; onClose: () => void }) {
  return (
    <Drawer title="Customer Profitability" subtitle={row.customer} onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Info label="Revenue" value={money(row.revenue)} />
          <Info label="Expense Allocation" value={money(row.expenseAllocation)} />
          <Info label="Profit" value={money(row.profit)} />
          <Info label="Outstanding" value={money(row.outstanding)} />
        </div>
        <Panel title="Profitability Trend" action="Filtered period">
          <ChartFrame><ResponsiveContainer><BarChart data={[row]}><CartesianGrid stroke="#1F2A44" /><XAxis dataKey="customer" stroke="#94A3B8" /><YAxis stroke="#94A3B8" tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`} /><Tooltip formatter={(value) => money(Number(value))} contentStyle={chartTooltipStyle} /><Bar dataKey="revenue" fill="#22C55E" /><Bar dataKey="expenseAllocation" fill="#EF4444" /><Bar dataKey="profit" fill="#3B82F6" /></BarChart></ResponsiveContainer></ChartFrame>
        </Panel>
        <Panel title="Invoices, Payments, Trips"><DataTable columns={["Metric", "Value"]} rows={[["Trips", row.trips], ["Collection %", `${row.collectionPercent}%`], ["Outstanding", money(row.outstanding)]]} /></Panel>
      </div>
    </Drawer>
  );
}

function ExpenseAnalyticsTab({ analytics }: { analytics?: any }) {
  const byCategory = analytics?.byCategory || [];
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Expense By Category" action="Source synced">
        <ChartFrame><ResponsiveContainer><PieChart><Pie data={byCategory} dataKey="amount" nameKey="name" innerRadius={58} outerRadius={96}>{byCategory.map((_: any, index: number) => <Cell key={index} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(value) => money(Number(value))} contentStyle={chartTooltipStyle} /></PieChart></ResponsiveContainer></ChartFrame>
      </Panel>
      <Panel title="Monthly Expense Trend" action="Filtered period">
        <ChartFrame><ResponsiveContainer><LineChart data={analytics?.monthlyTrend || []}><CartesianGrid stroke="#1F2A44" /><XAxis dataKey="month" stroke="#94A3B8" /><YAxis stroke="#94A3B8" tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`} /><Tooltip formatter={(value) => money(Number(value))} contentStyle={chartTooltipStyle} /><Line dataKey="amount" stroke="#EF4444" strokeWidth={3} /></LineChart></ResponsiveContainer></ChartFrame>
      </Panel>
      <Panel title="Expense By Vehicle" action="Cost centers"><DataTable columns={["Vehicle", "Amount"]} rows={(analytics?.byVehicle || []).map((row: any) => [row.name, money(row.amount)])} /></Panel>
      <Panel title="Expense By Driver" action="Driver cost impact"><DataTable columns={["Driver", "Amount"]} rows={(analytics?.byDriver || []).map((row: any) => [row.name, money(row.amount)])} /></Panel>
      <Panel title="Expense By Customer" action="Customer allocation"><DataTable columns={["Customer", "Amount"]} rows={(analytics?.byCustomer || []).map((row: any) => [row.name, money(row.amount)])} /></Panel>
      <Panel title="Expense By Route" action="Route allocation"><DataTable columns={["Route", "Amount"]} rows={(analytics?.byRoute || []).map((row: any) => [row.name, money(row.amount)])} /></Panel>
    </div>
  );
}

function RevenueAnalyticsTab({ analytics }: { analytics?: any }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Revenue Trend" action="Month-wise">
        <ChartFrame><ResponsiveContainer><LineChart data={analytics?.trend || []}><CartesianGrid stroke="#1F2A44" /><XAxis dataKey="month" stroke="#94A3B8" /><YAxis stroke="#94A3B8" tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`} /><Tooltip formatter={(value) => money(Number(value))} contentStyle={chartTooltipStyle} /><Line dataKey="amount" stroke="#22C55E" strokeWidth={3} /></LineChart></ResponsiveContainer></ChartFrame>
      </Panel>
      <Panel title="Growth Analysis" action="Revenue, expense, profit">
        <ChartFrame><ResponsiveContainer><BarChart data={analytics?.growthAnalysis || []}><CartesianGrid stroke="#1F2A44" /><XAxis dataKey="month" stroke="#94A3B8" /><YAxis stroke="#94A3B8" tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`} /><Tooltip formatter={(value) => money(Number(value))} contentStyle={chartTooltipStyle} /><Bar dataKey="revenue" fill="#22C55E" /><Bar dataKey="profit" fill="#3B82F6" /></BarChart></ResponsiveContainer></ChartFrame>
      </Panel>
      <Panel title="Customer Revenue" action="Top accounts"><DataTable columns={["Customer", "Revenue"]} rows={(analytics?.customerRevenue || []).map((row: any) => [row.name, money(row.amount)])} /></Panel>
      <Panel title="Vehicle Revenue" action="Fleet income"><DataTable columns={["Vehicle", "Revenue"]} rows={(analytics?.vehicleRevenue || []).map((row: any) => [row.name, money(row.amount)])} /></Panel>
      <Panel title="Trip Revenue" action="Highest earning trips"><DataTable columns={["Trip", "Revenue"]} rows={(analytics?.tripRevenue || []).slice(0, 12).map((row: any) => [row.name, money(row.amount)])} /></Panel>
      <Panel title="Collection Trend" action="Cash received"><DataTable columns={["Month", "Collected"]} rows={(analytics?.collectionTrend || []).map((row: any) => [row.name, money(row.amount)])} /></Panel>
    </div>
  );
}

function ReceivablesTab({ data }: { data?: any }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Kpi title="Total Invoiced" value={money(data?.totalInvoiced || 0)} icon={ReceiptText} tone="primary" />
        <Kpi title="Collected" value={money(data?.collected || 0)} icon={CreditCard} tone="success" />
        <Kpi title="Outstanding" value={money(data?.outstanding || 0)} icon={Banknote} tone="warning" />
        <Kpi title="Overdue" value={money(data?.overdue || 0)} icon={AlertTriangle} tone="danger" />
        <Kpi title="Collection %" value={`${data?.collectionPercent || 0}%`} icon={Gauge} tone="success" />
      </section>
      <Panel title="Aging Analysis" action="Outstanding buckets"><DataTable columns={["Age", "Amount"]} rows={(data?.aging || []).map((row: any) => [row.name, money(row.amount)])} /></Panel>
      <Panel title="Invoice Outstanding Register" action="Live from invoices and payments"><DataTable columns={["Company", "Invoice", "Due Date", "Outstanding", "Status"]} rows={(data?.invoices || []).map((row: any) => [row.company, row.invoiceNumber, row.dueDate, money(row.outstanding), <Status key={row.id} value={row.status} />])} /></Panel>
    </div>
  );
}

function CashFlowTab({ data }: { data?: any }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <Kpi title="Cash In" value={money(data?.cashIn || 0)} icon={CreditCard} tone="success" />
        <Kpi title="Cash Out" value={money(data?.cashOut || 0)} icon={Banknote} tone="danger" />
        <Kpi title="Net Cash Flow" value={money(data?.netCashFlow || 0)} icon={Gauge} tone={(data?.netCashFlow || 0) >= 0 ? "success" : "danger"} />
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Money In" action="Collections and deposits"><DataTable columns={["Source", "Amount"]} rows={(data?.moneyIn || []).map((row: any) => [row.name, money(row.amount)])} /></Panel>
        <Panel title="Money Out" action="Payments and costs"><DataTable columns={["Use", "Amount"]} rows={(data?.moneyOut || []).map((row: any) => [row.name, money(row.amount)])} /></Panel>
      </section>
    </div>
  );
}

function TripProfitDrawer({ trip, onClose }: { trip: ProfitTripRow; onClose: () => void }) {
  return (
    <Drawer title="Trip Profit Analysis" subtitle={trip.tripNumber} onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Revenue" value={money(trip.revenue)} />
          <Info label="Expense" value={money(trip.expense)} />
          <Info label="Profit" value={money(trip.profit)} />
        </div>
        <FormSection title="Trip Details">
          <ReadOnlyField label="Customer" value={trip.customer} />
          <ReadOnlyField label="Vehicle" value={trip.vehicleNumber} />
          <ReadOnlyField label="Driver" value={trip.driver} />
          <ReadOnlyField label="Route" value={trip.route} />
        </FormSection>
        <Panel title="Revenue Breakdown"><DataTable columns={["Particular", "Amount"]} rows={trip.revenueBreakdown.map((row) => [row.name, money(row.amount)])} /></Panel>
        <Panel title="Expense Breakdown"><DataTable columns={["Category", "Amount"]} rows={trip.expenseBreakdown.map((row) => [row.name, money(row.amount)])} /></Panel>
        <Panel title="Payment History"><DataTable columns={["Payment", "Date", "Category", "Mode", "Amount"]} rows={(trip.paymentHistory || []).map((row: any) => [row.paymentId || row.id, row.paymentDate, row.category, row.mode, money(row.amount)])} /></Panel>
        <Panel title="Documents"><DataTable columns={["Document", "Status"]} rows={(trip.documents || []).length ? (trip.documents || []).map((row: any) => [row.name || row.type || "Document", row.status || "Attached"]) : [["Trip documents", "No documents attached"]]} /></Panel>
        <Panel title="Profit Calculation"><DataTable columns={["Metric", "Value"]} rows={[["Revenue", money(trip.revenue)], ["Expense", money(trip.expense)], ["Net Profit", money(trip.profit)], ["Profit Margin", `${trip.profitPercent}%`]]} /></Panel>
        <Panel title="Audit Logs"><DataTable columns={["Date", "User", "Action"]} rows={(trip.auditLogs || []).map((row: any) => [String(row.dateTime || "").slice(0, 10), row.user || "System", row.action])} /></Panel>
      </div>
    </Drawer>
  );
}

function StatementModal({ filters, token, vehicles, drivers, customers, onClose }: { filters: ProfitLossFilters; token?: string; vehicles: Vehicle[]; drivers: Driver[]; customers: Customer[]; onClose: () => void }) {
  const [reportType, setReportType] = useState(pnlReportTypes[0]);
  const [dateRange, setDateRange] = useState("Monthly");
  const [localFilters, setLocalFilters] = useState<ProfitLossFilters>(filters);
  const [preview, setPreview] = useState<any>();
  const [loading, setLoading] = useState(false);
  const setLocal = (key: keyof ProfitLossFilters, value: string) => setLocalFilters((current) => ({ ...current, [key]: value }));
  const statementFilters = { ...localFilters, reportType };

  useEffect(() => {
    if (dateRange === "Custom Range") return;
    const range = statementDateRange(dateRange);
    setLocalFilters((current) => ({ ...current, from: range.from, to: range.to }));
  }, [dateRange]);

  const previewStatement = async () => {
    setLoading(true);
    try {
      setPreview(await generateProfitLossStatement(token, statementFilters));
    } finally {
      setLoading(false);
    }
  };
  const download = async (format: "pdf" | "excel") => {
    const response = await fetch(profitLossExportUrl(statementFilters, format), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error("Statement export failed.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = format === "pdf" ? "profit-loss-statement.pdf" : "profit-loss-statement.xls";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ModalShell title="Generate Statement" subtitle="Audited-style statement from live ERP source data." onClose={onClose}>
      <div className="space-y-5">
        <FormSection title="Statement Options">
          <FieldSelect label="Report Type" value={reportType} onChange={setReportType} options={pnlReportTypes.map((value) => ({ label: value, value }))} />
          <FieldSelect label="Date Range" value={dateRange} onChange={setDateRange} options={pnlDateRanges.map((value) => ({ label: value, value }))} />
          <DateInput label="From" value={String(localFilters.from || "")} onChange={(value) => setLocal("from", value)} />
          <DateInput label="To" value={String(localFilters.to || "")} onChange={(value) => setLocal("to", value)} />
          <FieldSelect label="Vehicle" value={String(localFilters.vehicleId || "All")} onChange={(value) => setLocal("vehicleId", value)} options={[{ label: "All Vehicles", value: "All" }, ...vehicles.map((vehicle) => ({ label: vehicle.number, value: vehicle.id }))]} />
          <FieldSelect label="Company" value={String(localFilters.customerId || "All")} onChange={(value) => setLocal("customerId", value)} options={[{ label: "All Companies", value: "All" }, ...customers.map((customer) => ({ label: customer.name, value: customer.id }))]} />
          <FieldSelect label="Driver" value={String(localFilters.driverId || "All")} onChange={(value) => setLocal("driverId", value)} options={[{ label: "All Drivers", value: "All" }, ...drivers.map((driver) => ({ label: driver.name, value: driver.id }))]} />
          <FieldSelect label="Branch" value={String(localFilters.branch || "All")} onChange={(value) => setLocal("branch", value)} options={["All", "Head Office"].map((value) => ({ label: value, value }))} />
        </FormSection>
        {preview && (
          <Panel title="Statement Preview" action={`${preview.period.from} to ${preview.period.to}`}>
            <DataTable columns={["Metric", "Value"]} rows={[["Total Revenue", money(preview.summary.totalRevenue)], ["Total Expenses", money(preview.summary.totalExpenses)], ["Net Profit", money(preview.summary.netProfit)], ["Profit Margin", `${preview.summary.profitMargin}%`]]} />
          </Panel>
        )}
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-tower-border pt-4">
        <button onClick={previewStatement} disabled={loading} className="rounded-md border border-tower-border px-4 py-2 text-sm text-white disabled:opacity-50">{loading ? "Preparing" : "Preview Statement"}</button>
        <button onClick={() => void download("excel")} className="rounded-md border border-tower-border px-4 py-2 text-sm text-white">Download Excel</button>
        <button onClick={() => void download("pdf")} className="rounded-md bg-tower-primary px-4 py-2 text-sm font-medium text-white">Download PDF</button>
      </div>
    </ModalShell>
  );
}

function PaymentsModule({ payments, invoices, trips, vehicles, drivers, customers, token, refreshData }: { payments: Payment[]; invoices: Invoice[]; trips: Trip[]; vehicles: Vehicle[]; drivers: Driver[]; customers: Customer[]; token?: string; refreshData: () => Promise<void> }) {
  const { user } = useSession();
  const [filters, setFilters] = useState(() => ({ from: monthBounds().from, to: monthBounds().to, customerId: "All", driverId: "All", vehicleId: "All", tripId: "All", invoiceId: "All", category: "All", mode: "All", direction: "All", status: "All", minAmount: "", maxAmount: "", search: "" }));
  const [editing, setEditing] = useState<Payment | undefined>();
  const [details, setDetails] = useState<Payment | undefined>();
  const rows = payments.filter((payment) => paymentMatchesFilters(payment, filters));
  const nowMonth = today().slice(0, 7);
  const todayDate = today();
  const receivedThisMonth = payments.filter((payment) => payment.direction !== "Outgoing" && payment.paymentDate.slice(0, 7) === nowMonth).reduce((sum, payment) => sum + payment.amount, 0);
  const paidThisMonth = payments.filter((payment) => payment.direction === "Outgoing" && payment.paymentDate.slice(0, 7) === nowMonth).reduce((sum, payment) => sum + payment.amount, 0);
  const pendingCustomerCollections = invoices.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0);
  const pendingVendorPayments = payments.filter((payment) => payment.direction === "Outgoing" && payment.status === "Pending").reduce((sum, payment) => sum + payment.amount, 0);
  const advancesGiven = payments.filter((payment) => payment.direction === "Outgoing" && /advance/i.test(payment.category || "")).reduce((sum, payment) => sum + payment.amount, 0);
  const advancesReceived = payments.filter((payment) => payment.direction !== "Outgoing" && /advance/i.test(payment.category || "")).reduce((sum, payment) => sum + payment.amount, 0);

  const setFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const exportReport = async (format: "csv" | "excel" | "pdf") => {
    const response = await fetch(exportPaymentsUrl(filters, format), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error("Payment export failed.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = format === "pdf" ? "payments-report.pdf" : format === "excel" ? "payments-report.xls" : "payments-report.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const removePayment = async (payment: Payment) => {
    if (user?.role !== "Admin" || !confirm(`Delete ${payment.paymentId || payment.id}? This modifies financial history.`)) return;
    await deletePayment(token, payment.id);
    await refreshData();
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Total Received This Month" value={money(receivedThisMonth)} icon={CreditCard} tone="success" />
        <Kpi title="Total Paid This Month" value={money(paidThisMonth)} icon={Banknote} tone="danger" />
        <Kpi title="Pending Customer Collections" value={money(pendingCustomerCollections)} icon={ReceiptText} tone="warning" />
        <Kpi title="Pending Vendor Payments" value={money(pendingVendorPayments)} icon={FileText} tone="warning" />
        <Kpi title="Net Cash Flow" value={money(receivedThisMonth - paidThisMonth)} icon={Gauge} tone={receivedThisMonth >= paidThisMonth ? "success" : "danger"} />
        <Kpi title="Today's Transactions" value={payments.filter((payment) => payment.paymentDate === todayDate).length} icon={ClipboardList} tone="primary" />
        <Kpi title="Total Advances Given" value={money(advancesGiven)} icon={UserRound} tone="danger" />
        <Kpi title="Total Advances Received" value={money(advancesReceived)} icon={ShieldCheck} tone="success" />
      </section>

      <section className="rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Payment Records</h3>
            <p className="text-sm text-tower-muted">Centralized finance tracking for collections, trip costs, advances, vendors, salary, and deposits.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEditing(emptyPayment())} className="rounded-md bg-tower-primary px-4 py-2.5 text-sm font-medium text-white">Create Payment</button>
            <button onClick={() => void exportReport("excel")} className="rounded-md border border-tower-border px-4 py-2.5 text-sm text-white">Excel Export</button>
            <button onClick={() => void exportReport("pdf")} className="rounded-md border border-tower-border px-4 py-2.5 text-sm text-white">PDF Export</button>
            <button onClick={() => void exportReport("csv")} className="rounded-md border border-tower-border px-4 py-2.5 text-sm text-white">CSV Export</button>
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-4">
          <TextField label="Global Search" value={filters.search} onChange={(value) => setFilter("search", value)} />
          <DateInput label="From" value={filters.from} onChange={(value) => setFilter("from", value)} />
          <DateInput label="To" value={filters.to} onChange={(value) => setFilter("to", value)} />
          <FieldSelect label="Direction" value={filters.direction} onChange={(value) => setFilter("direction", value)} options={["All", "Incoming", "Outgoing"].map((item) => ({ label: item, value: item }))} />
          <FieldSelect label="Category" value={filters.category} onChange={(value) => setFilter("category", value)} options={["All", ...incomingCategories, ...outgoingCategories].filter((item, index, arr) => arr.indexOf(item) === index).map((item) => ({ label: item, value: item }))} />
          <FieldSelect label="Payment Mode" value={filters.mode} onChange={(value) => setFilter("mode", value)} options={["All", ...paymentModes].map((item) => ({ label: item, value: item }))} />
          <FieldSelect label="Customer" value={filters.customerId} onChange={(value) => setFilter("customerId", value)} options={[{ label: "All Customers", value: "All" }, ...customers.map((customer) => ({ label: customer.name, value: customer.id }))]} />
          <FieldSelect label="Driver" value={filters.driverId} onChange={(value) => setFilter("driverId", value)} options={[{ label: "All Drivers", value: "All" }, ...drivers.map((driver) => ({ label: driver.name, value: driver.id }))]} />
          <FieldSelect label="Vehicle" value={filters.vehicleId} onChange={(value) => setFilter("vehicleId", value)} options={[{ label: "All Vehicles", value: "All" }, ...vehicles.map((vehicle) => ({ label: vehicle.number, value: vehicle.id }))]} />
          <FieldSelect label="Trip" value={filters.tripId} onChange={(value) => setFilter("tripId", value)} options={[{ label: "All Trips", value: "All" }, ...trips.map((trip) => ({ label: trip.tripNumber, value: trip.id }))]} />
          <FieldSelect label="Invoice" value={filters.invoiceId} onChange={(value) => setFilter("invoiceId", value)} options={[{ label: "All Invoices", value: "All" }, ...invoices.map((invoice) => ({ label: invoice.invoiceNumber, value: invoice.id }))]} />
          <FieldSelect label="Status" value={filters.status} onChange={(value) => setFilter("status", value)} options={["All", "Recorded", "Pending", "Reconciled", "Cancelled"].map((item) => ({ label: item, value: item }))} />
          <TextField label="Min Amount" value={filters.minAmount} onChange={(value) => setFilter("minAmount", value)} />
          <TextField label="Max Amount" value={filters.maxAmount} onChange={(value) => setFilter("maxAmount", value)} />
        </div>
      </section>

      <Panel title="Payment Record Table" action={`${rows.length} records`}>
        <DataTable
          columns={["Payment ID", "Date", "Direction", "Category", "Party Name", "Amount", "Payment Mode", "Linked Invoice", "Linked Trip", "Linked Vehicle", "Status", "Created By", "Actions"]}
          rows={rows.map((payment) => [
            payment.paymentId || payment.id,
            payment.paymentDate,
            payment.direction || "Incoming",
            payment.category || "Invoice Payment",
            payment.partyName || resolvePaymentParty(payment, customers, drivers),
            money(payment.amount),
            payment.mode,
            linkedInvoiceLabel(payment, invoices),
            linkedTripLabel(payment, trips),
            linkedVehicleLabel(payment, vehicles),
            <Status key={`${payment.id}-status`} value={payment.status || "Recorded"} />,
            payment.createdBy || "System",
            <div key={`${payment.id}-actions`} className="flex flex-wrap gap-2">
              <button onClick={() => setDetails(payment)} className="rounded-md border border-tower-border px-2 py-1 text-xs">View</button>
              <button onClick={() => setEditing(payment)} className="rounded-md border border-tower-border px-2 py-1 text-xs">Edit</button>
              <button onClick={() => void removePayment(payment)} disabled={user?.role !== "Admin"} className="rounded-md border border-tower-border px-2 py-1 text-xs text-tower-danger disabled:opacity-40">Delete</button>
              <button onClick={() => payment.proofKey && void openSignedUpload(token, payment.proofKey, true, `${payment.paymentId || payment.id}-proof`)} disabled={!payment.proofKey} className="rounded-md border border-tower-border px-2 py-1 text-xs disabled:opacity-40">Download Proof</button>
            </div>
          ])}
        />
      </Panel>

      {editing && <PaymentEditorModal payment={editing.id ? editing : undefined} invoices={invoices} trips={trips} vehicles={vehicles} drivers={drivers} customers={customers} token={token} onClose={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await refreshData(); }} />}
      {details && <PaymentDetailsDrawer payment={details} invoices={invoices} trips={trips} vehicles={vehicles} drivers={drivers} customers={customers} token={token} onClose={() => setDetails(undefined)} />}
    </div>
  );
}

function PaymentEditorModal({ payment, invoices, trips, vehicles, drivers, customers, token, onClose, onSaved }: { payment?: Payment; invoices: Invoice[]; trips: Trip[]; vehicles: Vehicle[]; drivers: Driver[]; customers: Customer[]; token?: string; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [direction, setDirection] = useState<"Incoming" | "Outgoing">(payment?.direction || "Incoming");
  const [category, setCategory] = useState(payment?.category || "Invoice Payment");
  const [amount, setAmount] = useState(payment?.amount || 0);
  const [paymentDate, setPaymentDate] = useState(payment?.paymentDate || today());
  const [partyType, setPartyType] = useState<Payment["partyType"]>(payment?.partyType || "Customer");
  const [partyName, setPartyName] = useState(payment?.partyName || "");
  const [customerId, setCustomerId] = useState(payment?.customerId || "All");
  const [driverId, setDriverId] = useState(payment?.driverId || "All");
  const [tripId, setTripId] = useState(payment?.tripId || "All");
  const [vehicleId, setVehicleId] = useState(payment?.vehicleId || "All");
  const [expenseId, setExpenseId] = useState(payment?.expenseId || "");
  const [mode, setMode] = useState<Payment["mode"]>(payment?.mode || "NEFT");
  const [referenceNumber, setReferenceNumber] = useState(payment?.referenceNumber || "");
  const [status, setStatus] = useState<Payment["status"]>(payment?.status || "Recorded");
  const [remarks, setRemarks] = useState(payment?.remarks || "");
  const [notes, setNotes] = useState(payment?.notes || "");
  const [proofFile, setProofFile] = useState<File | undefined>();
  const [allocations, setAllocations] = useState<Record<string, number>>(() => Object.fromEntries((payment?.allocations || []).map((allocation) => [allocation.invoiceId, allocation.amount])));
  const categories = direction === "Incoming" ? incomingCategories : outgoingCategories;
  const allocated = Object.values(allocations).reduce((sum, value) => sum + Number(value || 0), 0);
  const invoiceOptions = invoices.filter((invoice) => !customerId || customerId === "All" || invoice.customerId === customerId);
  const invalid = amount <= 0 || allocated > amount || (category === "Invoice Payment" && allocated <= 0);

  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0]);
  }, [categories, category]);

  const setInvoiceAllocation = (invoice: Invoice, value: number) => {
    const max = Math.max(invoice.outstandingAmount + (payment?.allocations?.find((allocation) => allocation.invoiceId === invoice.id)?.amount || 0), 0);
    const safeValue = Math.min(Math.max(Number(value || 0), 0), max || Number(value || 0));
    setAllocations((current) => ({ ...current, [invoice.id]: safeValue }));
  };
  const save = async () => {
    if (invalid) return;
    const body = {
      direction,
      category,
      amount,
      amountReceived: amount,
      paymentDate,
      partyType,
      partyName,
      customerId: customerId === "All" ? undefined : customerId,
      driverId: driverId === "All" ? undefined : driverId,
      tripId: tripId === "All" ? undefined : tripId,
      vehicleId: vehicleId === "All" ? undefined : vehicleId,
      expenseId,
      mode,
      referenceNumber,
      status,
      remarks,
      notes,
      allocations: Object.entries(allocations).map(([invoiceId, allocationAmount]) => ({ invoiceId, amount: Number(allocationAmount || 0) })).filter((allocation) => allocation.amount > 0),
      invoiceId: Object.entries(allocations).find(([, allocationAmount]) => Number(allocationAmount || 0) > 0)?.[0]
    };
    const saved = payment?.id ? await updatePayment(token, payment.id, body) as Payment : await createPayment(token, body) as Payment;
    if (proofFile) await uploadFile(token, "payment", saved.id || (saved as any)._id, proofFile, proofFile.name, true);
    await onSaved();
  };

  return (
    <ModalShell title={payment ? "Edit Payment" : "Create Payment"} subtitle="Record already-completed payments and link them to ERP entities." onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <FieldSelect label="Payment Direction" value={direction} onChange={(value) => setDirection(value as "Incoming" | "Outgoing")} options={["Incoming", "Outgoing"].map((item) => ({ label: item, value: item }))} />
        <FieldSelect label="Payment Category" value={category} onChange={setCategory} options={categories.map((item) => ({ label: item, value: item }))} />
        <NumberField label="Amount" value={amount} onChange={setAmount} />
        <DateInput label="Payment Date" value={paymentDate} onChange={setPaymentDate} />
        <FieldSelect label="Party Type" value={partyType || "Customer"} onChange={(value) => setPartyType(value as Payment["partyType"])} options={["Customer", "Driver", "Vendor", "Employee", "Other"].map((item) => ({ label: item, value: item }))} />
        {partyType === "Customer" ? <FieldSelect label="Party Name" value={customerId} onChange={(value) => { setCustomerId(value); setPartyName(customers.find((customer) => customer.id === value)?.name || ""); }} options={[{ label: "Select Customer", value: "All" }, ...customers.map((customer) => ({ label: customer.name, value: customer.id }))]} /> : partyType === "Driver" ? <FieldSelect label="Party Name" value={driverId} onChange={(value) => { setDriverId(value); setPartyName(drivers.find((driver) => driver.id === value)?.name || ""); }} options={[{ label: "Select Driver", value: "All" }, ...drivers.map((driver) => ({ label: driver.name, value: driver.id }))]} /> : <TextField label="Party Name" value={partyName} onChange={setPartyName} />}
        <FieldSelect label="Payment Mode" value={mode} onChange={(value) => setMode(value as Payment["mode"])} options={paymentModes.map((item) => ({ label: item, value: item }))} />
        <TextField label="Reference Number" value={referenceNumber} onChange={setReferenceNumber} />
        <FieldSelect label="Linked Trip (Optional)" value={tripId} onChange={setTripId} options={[{ label: "No linked trip", value: "All" }, ...trips.map((trip) => ({ label: trip.tripNumber, value: trip.id }))]} />
        <FieldSelect label="Linked Vehicle (Optional)" value={vehicleId} onChange={setVehicleId} options={[{ label: "No linked vehicle", value: "All" }, ...vehicles.map((vehicle) => ({ label: vehicle.number, value: vehicle.id }))]} />
        <FieldSelect label="Linked Driver (Optional)" value={driverId} onChange={setDriverId} options={[{ label: "No linked driver", value: "All" }, ...drivers.map((driver) => ({ label: driver.name, value: driver.id }))]} />
        <TextField label="Linked Expense (Optional)" value={expenseId} onChange={setExpenseId} />
        <FieldSelect label="Status" value={status || "Recorded"} onChange={(value) => setStatus(value as Payment["status"])} options={["Recorded", "Pending", "Reconciled", "Cancelled"].map((item) => ({ label: item, value: item }))} />
        <label className="block text-sm text-tower-muted">
          Upload Proof
          <input type="file" accept="image/*,application/pdf" onChange={(event) => setProofFile(event.target.files?.[0])} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white outline-none" />
        </label>
        <TextField label="Notes" value={notes} onChange={setNotes} />
        <TextField label="Remarks" value={remarks} onChange={setRemarks} />
      </div>

      {category === "Invoice Payment" && (
        <div className="mt-5">
          <div className="mb-3 grid gap-3 md:grid-cols-3">
            <Info label="Payment Amount" value={money(amount)} />
            <Info label="Allocated to Invoices" value={money(allocated)} />
            <Info label="Advance Balance" value={money(Math.max(amount - allocated, 0))} />
          </div>
          <DataTable columns={["Invoice", "Customer", "Trip", "Outstanding", "Allocation"]} rows={invoiceOptions.map((invoice) => [
            invoice.invoiceNumber,
            customers.find((customer) => customer.id === invoice.customerId)?.name || "-",
            trips.find((trip) => trip.id === invoice.tripId)?.tripNumber || invoice.tripId,
            money(invoice.outstandingAmount),
            <input key={invoice.id} type="number" min="0" value={allocations[invoice.id] || 0} onChange={(event) => setInvoiceAllocation(invoice, Number(event.target.value))} className="w-32 rounded-md border border-tower-border bg-tower-card px-2 py-1 text-white" />
          ])} />
        </div>
      )}
      {invalid && <p className="mt-3 rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">Check amount and invoice allocations before saving.</p>}
      <ModalActions onClose={onClose} onSave={() => void save()} disabled={invalid} label={payment ? "Save Changes" : "Save Payment"} />
    </ModalShell>
  );
}

function PaymentDetailsDrawer({ payment, invoices, trips, vehicles, drivers, customers, token, onClose }: { payment: Payment; invoices: Invoice[]; trips: Trip[]; vehicles: Vehicle[]; drivers: Driver[]; customers: Customer[]; token?: string; onClose: () => void }) {
  const proofKey = payment.proofKey;
  const invoiceRows = payment.allocations?.map((allocation) => {
    const invoice = invoices.find((item) => item.id === allocation.invoiceId);
    return [invoice?.invoiceNumber || allocation.invoiceNumber || allocation.invoiceId, invoice ? money(invoice.amount) : "-", money(allocation.amount)];
  }) || [];
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l border-tower-border bg-tower-card p-6 shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold">{payment.paymentId || payment.id}</h3>
          <p className="text-sm text-tower-muted">{payment.category} - {payment.partyName || resolvePaymentParty(payment, customers, drivers)}</p>
        </div>
        <button onClick={onClose} className="rounded-md border border-tower-border px-3 py-2 text-sm text-tower-muted hover:text-white">Close</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Info label="Direction" value={payment.direction || "Incoming"} />
        <Info label="Amount" value={money(payment.amount)} />
        <Info label="Date" value={payment.paymentDate} />
        <Info label="Payment Mode" value={payment.mode} />
        <Info label="Reference" value={payment.referenceNumber || "-"} />
        <Info label="Status" value={<Status value={payment.status || "Recorded"} />} />
        <Info label="Linked Invoice" value={linkedInvoiceLabel(payment, invoices)} />
        <Info label="Linked Trip" value={linkedTripLabel(payment, trips)} />
        <Info label="Linked Vehicle" value={linkedVehicleLabel(payment, vehicles)} />
        <Info label="Linked Driver" value={linkedDriverLabel(payment, drivers)} />
        <Info label="Created By" value={payment.createdBy || "System"} />
        <Info label="Updated By" value={payment.updatedBy || "System"} />
        <Info label="Created Date" value={payment.createdAt ? new Date(payment.createdAt).toLocaleString("en-IN") : "-"} />
        <Info label="Updated Date" value={payment.updatedAt ? new Date(payment.updatedAt).toLocaleString("en-IN") : "-"} />
      </div>
      <div className="mt-5 grid gap-3">
        <Info label="Notes" value={payment.notes || payment.remarks || "-"} />
        <Info label="Payment Proof" value={proofKey ? <button onClick={() => void openSignedUpload(token, proofKey, false)} className="rounded-md border border-tower-border px-3 py-1.5 text-xs">View Proof</button> : "-"} />
      </div>
      <div className="mt-5">
        <Panel title="Invoice Allocation" action={`${invoiceRows.length} linked`}>
          <DataTable columns={["Invoice", "Invoice Amount", "Allocated"]} rows={invoiceRows} />
        </Panel>
      </div>
      <div className="mt-5">
        <Panel title="Audit History" action="Created and modified trail">
          <DataTable columns={["Date & Time", "User", "Action", "Remarks"]} rows={(payment.auditLog || []).map((entry) => [entry.dateTime ? new Date(entry.dateTime).toLocaleString("en-IN") : "-", entry.user, entry.action, entry.remarks])} />
        </Panel>
      </div>
    </div>
  );
}

function emptyPayment(): Payment {
  return { id: "", direction: "Incoming", category: "Invoice Payment", partyType: "Customer", customerId: "", amount: 0, paymentDate: today(), mode: "NEFT", referenceNumber: "", remarks: "", status: "Recorded", allocations: [] };
}

function paymentMatchesFilters(payment: Payment, filters: Record<string, string>) {
  const amount = Number(payment.amount || 0);
  const haystack = [payment.paymentId, payment.partyName, payment.category, payment.mode, payment.referenceNumber, payment.linkedInvoice, payment.linkedTrip, payment.linkedVehicle, payment.linkedDriver].join(" ").toLowerCase();
  return (!filters.from || payment.paymentDate >= filters.from)
    && (!filters.to || payment.paymentDate <= filters.to)
    && (filters.customerId === "All" || payment.customerId === filters.customerId)
    && (filters.driverId === "All" || payment.driverId === filters.driverId)
    && (filters.vehicleId === "All" || payment.vehicleId === filters.vehicleId)
    && (filters.tripId === "All" || payment.tripId === filters.tripId)
    && (filters.invoiceId === "All" || payment.invoiceId === filters.invoiceId || payment.allocations?.some((allocation) => allocation.invoiceId === filters.invoiceId))
    && (filters.category === "All" || payment.category === filters.category)
    && (filters.mode === "All" || payment.mode === filters.mode)
    && (filters.direction === "All" || payment.direction === filters.direction)
    && (filters.status === "All" || payment.status === filters.status)
    && (!filters.minAmount || amount >= Number(filters.minAmount))
    && (!filters.maxAmount || amount <= Number(filters.maxAmount))
    && (!filters.search || haystack.includes(filters.search.toLowerCase()));
}

function resolvePaymentParty(payment: Payment, customers: Customer[], drivers: Driver[]) {
  if (payment.partyName) return payment.partyName;
  if (payment.customerId) return customers.find((customer) => customer.id === payment.customerId)?.name || "";
  if (payment.driverId) return drivers.find((driver) => driver.id === payment.driverId)?.name || "";
  return "Other";
}

function linkedInvoiceLabel(payment: Payment, invoices: Invoice[]) {
  if (payment.linkedInvoice) return payment.linkedInvoice;
  const ids = payment.allocations?.map((allocation) => allocation.invoiceId) || (payment.invoiceId ? [payment.invoiceId] : []);
  return ids.map((id) => invoices.find((invoice) => invoice.id === id)?.invoiceNumber || id).join(", ") || "-";
}

function linkedTripLabel(payment: Payment, trips: Trip[]) {
  if (payment.linkedTrip) return payment.linkedTrip;
  return trips.find((trip) => trip.id === payment.tripId)?.tripNumber || "-";
}

function linkedVehicleLabel(payment: Payment, vehicles: Vehicle[]) {
  if (payment.linkedVehicle) return payment.linkedVehicle;
  return vehicles.find((vehicle) => vehicle.id === payment.vehicleId)?.number || "-";
}

function linkedDriverLabel(payment: Payment, drivers: Driver[]) {
  if (payment.linkedDriver) return payment.linkedDriver;
  return drivers.find((driver) => driver.id === payment.driverId)?.name || "-";
}

function ExpensesModule({ vehicles, drivers, customers, token }: { vehicles: Vehicle[]; drivers: Driver[]; customers: Customer[]; token?: string }) {
  const [filters, setFilters] = useState(() => ({ from: monthBounds().from, to: monthBounds().to, vehicleId: "All", driverId: "All", companyId: "All", category: "All", status: "All" }));
  const [dashboard, setDashboard] = useState<ExpenseDashboard>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [viewMore, setViewMore] = useState<ExpenseSummaryRow>();

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDashboard(await getExpenseDashboard(token, filters));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Expense dashboard could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [filters, token]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const setFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const categoryOptions = ["All", "Fuel", "Driver", "Vehicle", "Trip Operations", "Other", ...(dashboard?.summary.map((row) => row.category).filter((item) => !["Fuel", "Driver", "Vehicle", "Trip Operations", "Other"].includes(item)) || [])];
  const uniqueCategoryOptions = Array.from(new Set(categoryOptions));

  const exportReport = async (format: "pdf" | "excel") => {
    const params = new URLSearchParams(Object.entries({ ...filters, format }).filter(([, value]) => value && value !== "All"));
    const response = await fetch(`${getApiBaseUrl()}/api/expenses/export?${params.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error("Export failed.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = format === "pdf" ? "expenses-report.pdf" : "expenses-report.xls";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !dashboard) return <Skeleton />;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Financial Expense Control</h3>
            <p className="text-sm text-tower-muted">Source expenses are aggregated from trips, vehicles, and drivers. Manual entries are only for costs not tracked elsewhere.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { void exportReport("pdf"); }} className="rounded-md border border-tower-border bg-[#0B1220] px-4 py-2.5 text-sm text-white hover:border-tower-primary/60">PDF Export</button>
            <button onClick={() => { void exportReport("excel"); }} className="rounded-md border border-tower-border bg-[#0B1220] px-4 py-2.5 text-sm text-white hover:border-tower-primary/60">Excel Export</button>
            <button onClick={() => setAddOpen(true)} className="rounded-md bg-tower-primary px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-950/30">Add Expense</button>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-6 md:grid-cols-2">
          <DateInput label="From" value={filters.from} onChange={(value) => setFilter("from", value)} />
          <DateInput label="To" value={filters.to} onChange={(value) => setFilter("to", value)} />
          <FieldSelect label="Vehicle" value={filters.vehicleId} onChange={(value) => setFilter("vehicleId", value)} options={[{ label: "All Vehicles", value: "All" }, ...vehicles.map((vehicle) => ({ label: vehicle.number, value: vehicle.id }))]} />
          <FieldSelect label="Driver" value={filters.driverId} onChange={(value) => setFilter("driverId", value)} options={[{ label: "All Drivers", value: "All" }, ...drivers.map((driver) => ({ label: driver.name, value: driver.id }))]} />
          <FieldSelect label="Company" value={filters.companyId} onChange={(value) => setFilter("companyId", value)} options={[{ label: "All Companies", value: "All" }, ...customers.map((customer) => ({ label: customer.name, value: customer.id }))]} />
          <FieldSelect label="Status" value={filters.status} onChange={(value) => setFilter("status", value)} options={["All", "Paid", "Unpaid", "Partial"].map((value) => ({ label: value, value }))} />
        </div>
        <div className="mt-3 max-w-sm">
          <FieldSelect label="Expense Category" value={filters.category} onChange={(value) => setFilter("category", value)} options={uniqueCategoryOptions.map((value) => ({ label: value, value }))} />
        </div>
      </section>

      {error && <div className="rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      {dashboard && (
        <>
          <section className="grid gap-4 xl:grid-cols-6 md:grid-cols-2">
            <Kpi title="Total Expenses" value={money(dashboard.kpis.totalExpenses)} icon={ReceiptText} tone="danger" />
            <Kpi title="Fuel Expense" value={money(dashboard.kpis.fuelExpense)} icon={Fuel} tone="warning" />
            <Kpi title="Driver Expense" value={money(dashboard.kpis.driverExpense)} icon={UserRound} tone="primary" />
            <Kpi title="Vehicle Expense" value={money(dashboard.kpis.vehicleExpense)} icon={Truck} tone="primary" />
            <Kpi title="Other Expenses" value={money(dashboard.kpis.otherExpense)} icon={FileText} tone="warning" />
            <Kpi title="Net Profit" value={money(dashboard.kpis.netProfit)} icon={Banknote} tone={dashboard.kpis.netProfit >= 0 ? "success" : "danger"} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.58fr_0.42fr]">
            <Panel title="Expense Summary" action={`${dashboard.summary.length} categories`}>
              {dashboard.summary.length ? (
                <DataTable
                  columns={["Category", "Amount", "Status", "Source", "Action"]}
                  rows={dashboard.summary.map((row) => [
                    row.category,
                    money(row.amount),
                    <Status key={`${row.category}-${row.source}-status`} value={row.status} />,
                    row.source,
                    <button key={`${row.category}-${row.source}-view`} onClick={() => setViewMore(row)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-1.5 text-xs text-white hover:border-tower-primary/60">View More</button>
                  ])}
                />
              ) : <EmptyState title="No expenses found" detail="Try widening the date range or clearing filters." />}
            </Panel>
            <Panel title="Expense by Category" action="Filtered">
              <ChartFrame>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={dashboard.analytics.category} dataKey="amount" nameKey="name" innerRadius={58} outerRadius={94} paddingAngle={3}>
                      {dashboard.analytics.category.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => money(Number(value))} contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartFrame>
            </Panel>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <Panel title="Monthly Expense Trend" action="Month-wise">
              <ChartFrame>
                <ResponsiveContainer>
                  <LineChart data={dashboard.analytics.monthlyExpenseTrend}>
                    <CartesianGrid stroke="#1F2A44" />
                    <XAxis dataKey="name" stroke="#94A3B8" />
                    <YAxis stroke="#94A3B8" tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`} />
                    <Tooltip formatter={(value) => money(Number(value))} contentStyle={chartTooltipStyle} />
                    <Line type="monotone" dataKey="amount" stroke="#EF4444" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>
            </Panel>
            <Panel title="Revenue vs Expense" action="Profit included">
              <ChartFrame>
                <ResponsiveContainer>
                  <BarChart data={dashboard.analytics.revenueVsExpense}>
                    <CartesianGrid stroke="#1F2A44" />
                    <XAxis dataKey="month" stroke="#94A3B8" />
                    <YAxis stroke="#94A3B8" tickFormatter={(value) => `₹${Math.round(Number(value) / 1000)}k`} />
                    <Tooltip formatter={(value) => money(Number(value))} contentStyle={chartTooltipStyle} />
                    <Bar dataKey="revenue" fill="#22C55E" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </Panel>
          </section>

          <Panel title="Vehicle Performance" action="Revenue - expense">
            <DataTable
              columns={["Vehicle", "Revenue", "Expense", "Profit"]}
              rows={dashboard.vehiclePerformance.map((row) => [
                row.vehicleNumber,
                money(row.revenue),
                money(row.expense),
                <span key={row.vehicleId} className={cn(row.profit >= 0 ? "text-tower-success" : "text-tower-danger")}>{money(row.profit)}</span>
              ])}
            />
          </Panel>

          {viewMore && <ExpenseDrilldownModal row={viewMore} dashboard={dashboard} token={token} onRefresh={loadDashboard} onClose={() => setViewMore(undefined)} />}
        </>
      )}

      {addOpen && (
        <AddManualExpenseModal
          onClose={() => setAddOpen(false)}
          onSave={async (payload) => {
            await createManualExpense(token, payload);
            setAddOpen(false);
            await loadDashboard();
          }}
        />
      )}
    </div>
  );
}

const chartTooltipStyle = { background: "#0F172A", border: "1px solid #263247", borderRadius: 8, color: "#fff" };

function ChartFrame({ children }: { children: React.ReactNode }) {
  return <div className="h-72 min-h-72 w-full">{children}</div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-md border border-dashed border-tower-border bg-[#0B1220] p-6 text-center">
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-sm text-tower-muted">{detail}</div>
    </div>
  );
}

function ExpenseDrilldownModal({ row, dashboard, token, onRefresh, onClose }: { row: ExpenseSummaryRow; dashboard: ExpenseDashboard; token?: string; onRefresh: () => Promise<void>; onClose: () => void }) {
  const [editingExpense, setEditingExpense] = useState<ExpenseRow>();
  const [deletingId, setDeletingId] = useState<string>();
  const matchingRows = dashboard.rows.filter((item) => item.category === row.category && item.source === row.source);
  const manualRows = matchingRows.filter((item) => item.source === "Manual");
  const actionCol = manualRows.length ? "Actions" : "";
  const cols = (cols: string[]) => actionCol ? [...cols, actionCol] : cols;

  const renderRow = (cells: React.ReactNode[], row?: ExpenseRow) => {
    if (!row || row.source !== "Manual") return cells;
    return [...cells, <div key={`${row.id}-actions`} className="flex gap-2">
      <button onClick={() => setEditingExpense(row)} className="rounded-md border border-tower-border px-2 py-1 text-xs text-white hover:border-tower-primary/60">Edit</button>
      <button disabled={deletingId === row.id} onClick={async () => {
        if (!window.confirm("Are you sure you want to delete this expense?")) return;
        setDeletingId(row.id);
        try {
          await deleteExpense(token, row.id);
          await onRefresh();
        } catch {
          // error swallowed; refresh will show stale data
        } finally {
          setDeletingId(undefined);
        }
      }} className="rounded-md border border-tower-danger/50 px-2 py-1 text-xs text-red-200 disabled:opacity-40">{deletingId === row.id ? "Deleting" : "Delete"}</button>
    </div>];
  };

  return (
    <ModalShell title={`${row.category} Expense`} subtitle={`${row.source} source breakdown`} onClose={onClose}>
      {editingExpense && <EditManualExpenseModal expense={editingExpense} onClose={() => setEditingExpense(undefined)} onSave={async (payload) => { await updateExpense(token, editingExpense.id, payload); await onRefresh(); setEditingExpense(undefined); }} />}
      {row.category === "Fuel" ? (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <Info label="Total Fuel Cost" value={money(dashboard.drilldowns.fuel.totalFuelCost)} />
            <Info label="Vehicles" value={dashboard.drilldowns.fuel.vehicleWise.length} />
            <Info label="Trips" value={dashboard.drilldowns.fuel.tripWise.length} />
          </div>
          <DataTable columns={["Vehicle Number", "Amount"]} rows={dashboard.drilldowns.fuel.vehicleWise.map((item) => [item.name, money(item.amount)])} />
          <DataTable columns={["Trip Number", "Amount"]} rows={dashboard.drilldowns.fuel.tripWise.map((item) => [item.name, money(item.amount)])} />
          <DataTable columns={["Month", "Amount"]} rows={dashboard.drilldowns.fuel.monthlyTrend.map((item) => [item.name, money(item.amount)])} />
        </div>
      ) : row.category === "Vehicle" ? (
        <DataTable columns={cols(["Vehicle", "Date", "Amount", "Maintenance Description", "Linked Bill"])} rows={dashboard.drilldowns.maintenance.length ? dashboard.drilldowns.maintenance.map((item) => renderRow([item.vehicle, item.date, money(item.amount), item.description, item.linkedBill || "-"])) : matchingRows.map((item) => renderRow([item.vehicleNumber || "-", item.date, money(item.amount), item.notes || item.expenseName, item.attachmentUrl || "-"], item))} />
      ) : row.category === "Driver" ? (
        <DataTable columns={cols(["Driver Name", "Salary", "Advance", "Total"])} rows={dashboard.drilldowns.driver.length ? dashboard.drilldowns.driver.map((item) => renderRow([item.driverName, money(item.salary), money(item.advance), money(item.total)])) : matchingRows.map((item) => renderRow([item.driverName || "-", /salary/i.test(item.expenseName) ? money(item.amount) : money(0), /advance/i.test(item.expenseName) ? money(item.amount) : money(0), money(item.amount)], item))} />
      ) : (
        <DataTable columns={cols(["Expense", "Date", "Amount", "Paid", "Remaining", "Status", "Notes"])} rows={matchingRows.map((item) => renderRow([item.expenseName, item.date, money(item.amount), money(item.paidAmount), money(item.remainingAmount), <Status key={item.id} value={item.status} />, item.notes || "-"], item))} />
      )}
    </ModalShell>
  );
}

function AddManualExpenseModal({ onClose, onSave }: { onClose: () => void; onSave: (payload: ExpensePayload) => Promise<void> }) {
  const [payload, setPayload] = useState<ExpensePayload>({ expenseName: "", category: "Office Rent", amount: 0, expenseDate: today(), status: "Unpaid", paidAmount: 0, notes: "", recurring: false, recurrenceFrequency: "Monthly" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = <K extends keyof ExpensePayload>(key: K, value: ExpensePayload[K]) => setPayload((current) => ({ ...current, [key]: value }));
  const remaining = Math.max((payload.amount || 0) - (payload.status === "Paid" ? payload.amount : payload.status === "Partial" ? payload.paidAmount || 0 : 0), 0);

  const save = async () => {
    setError("");
    if (!payload.expenseName.trim()) return setError("Expense name is required.");
    if (!payload.category.trim()) return setError("Category is required.");
    setSaving(true);
    try {
      await onSave({ ...payload, paidAmount: payload.status === "Paid" ? payload.amount : payload.status === "Unpaid" ? 0 : payload.paidAmount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Expense could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Add Expense" subtitle="Use manual entries only for expenses not already tracked in trips, vehicles, or drivers." onClose={onClose}>
      <div className="space-y-5">
        {error && <div className="rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{error}</div>}
        <FormSection title="Expense Details">
          <TextField label="Expense Name" value={payload.expenseName} onChange={(value) => update("expenseName", value)} />
          <TextField label="Category" value={payload.category} onChange={(value) => update("category", value)} />
          <NumberField label="Amount" value={payload.amount} onChange={(value) => update("amount", value)} />
          <DateInput label="Date" value={payload.expenseDate} onChange={(value) => update("expenseDate", value)} />
          <FieldSelect label="Status" value={payload.status} onChange={(value) => update("status", value as ExpensePayload["status"])} options={["Paid", "Unpaid", "Partial"].map((value) => ({ label: value, value }))} />
          {payload.status === "Partial" ? <NumberField label="Paid Amount" value={payload.paidAmount || 0} onChange={(value) => update("paidAmount", value)} /> : <ReadOnlyField label="Paid Amount" value={money(payload.status === "Paid" ? payload.amount : 0)} />}
          <ReadOnlyField label="Remaining Amount" value={money(remaining)} />
          <TextField label="Notes" value={payload.notes || ""} onChange={(value) => update("notes", value)} />
          <TextField label="Attachment URL" value={payload.attachmentUrl || ""} onChange={(value) => update("attachmentUrl", value)} />
        </FormSection>
        <FormSection title="Recurring">
          <label className="flex items-center gap-3 rounded-md border border-tower-border bg-tower-card px-3 py-2 text-sm text-white">
            <input type="checkbox" checked={Boolean(payload.recurring)} onChange={(event) => update("recurring", event.target.checked)} />
            Recurring
          </label>
          <FieldSelect label="Frequency" value={payload.recurrenceFrequency || "Monthly"} onChange={(value) => update("recurrenceFrequency", value as ExpensePayload["recurrenceFrequency"])} options={["Monthly", "Quarterly", "Yearly"].map((value) => ({ label: value, value }))} />
          <DateInput label="Recurring Until" value={payload.recurringUntil || ""} onChange={(value) => update("recurringUntil", value)} />
        </FormSection>
      </div>
      <ModalActions onClose={onClose} onSave={() => { void save(); }} disabled={saving} label={saving ? "Saving" : "Save Expense"} />
    </ModalShell>
  );
}

function EditManualExpenseModal({ expense, onClose, onSave }: { expense: ExpenseRow; onClose: () => void; onSave: (payload: Partial<ExpensePayload>) => Promise<void> }) {
  const [payload, setPayload] = useState<ExpensePayload>({
    expenseName: expense.expenseName,
    category: expense.category,
    amount: expense.amount,
    expenseDate: expense.date,
    status: expense.status,
    paidAmount: expense.paidAmount,
    notes: expense.notes || "",
    attachmentUrl: expense.attachmentUrl || "",
    recurring: expense.recurring || false,
    recurrenceFrequency: (expense.recurrenceFrequency as ExpensePayload["recurrenceFrequency"]) || "Monthly"
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = <K extends keyof ExpensePayload>(key: K, value: ExpensePayload[K]) => setPayload((current) => ({ ...current, [key]: value }));
  const remaining = Math.max((payload.amount || 0) - (payload.status === "Paid" ? payload.amount : payload.status === "Partial" ? payload.paidAmount || 0 : 0), 0);

  const save = async () => {
    setError("");
    if (!payload.expenseName.trim()) return setError("Expense name is required.");
    setSaving(true);
    try {
      await onSave({ ...payload, paidAmount: payload.status === "Paid" ? payload.amount : payload.status === "Unpaid" ? 0 : payload.paidAmount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Expense could not be updated.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Edit Expense" subtitle="Update expense details." onClose={onClose}>
      <div className="space-y-5">
        {error && <div className="rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{error}</div>}
        <FormSection title="Expense Details">
          <TextField label="Expense Name" value={payload.expenseName} onChange={(value) => update("expenseName", value)} />
          <TextField label="Category" value={payload.category} onChange={(value) => update("category", value)} />
          <NumberField label="Amount" value={payload.amount} onChange={(value) => update("amount", value)} />
          <DateInput label="Date" value={payload.expenseDate} onChange={(value) => update("expenseDate", value)} />
          <FieldSelect label="Status" value={payload.status} onChange={(value) => update("status", value as ExpensePayload["status"])} options={["Paid", "Unpaid", "Partial"].map((value) => ({ label: value, value }))} />
          {payload.status === "Partial" ? <NumberField label="Paid Amount" value={payload.paidAmount || 0} onChange={(value) => update("paidAmount", value)} /> : <ReadOnlyField label="Paid Amount" value={money(payload.status === "Paid" ? payload.amount : 0)} />}
          <ReadOnlyField label="Remaining Amount" value={money(remaining)} />
          <TextField label="Notes" value={payload.notes || ""} onChange={(value) => update("notes", value)} />
          <TextField label="Attachment URL" value={payload.attachmentUrl || ""} onChange={(value) => update("attachmentUrl", value)} />
        </FormSection>
        <FormSection title="Recurring">
          <label className="flex items-center gap-3 rounded-md border border-tower-border bg-tower-card px-3 py-2 text-sm text-white">
            <input type="checkbox" checked={Boolean(payload.recurring)} onChange={(event) => update("recurring", event.target.checked)} />
            Recurring
          </label>
          <FieldSelect label="Frequency" value={payload.recurrenceFrequency || "Monthly"} onChange={(value) => update("recurrenceFrequency", value as ExpensePayload["recurrenceFrequency"])} options={["Monthly", "Quarterly", "Yearly"].map((value) => ({ label: value, value }))} />
          <DateInput label="Recurring Until" value={payload.recurringUntil || ""} onChange={(value) => update("recurringUntil", value)} />
        </FormSection>
      </div>
      <ModalActions onClose={onClose} onSave={() => { void save(); }} disabled={saving} label={saving ? "Saving" : "Save Expense"} />
    </ModalShell>
  );
}

type TripItem = { id: string; item: string; weight: number; rate: number };
type LocalTrip = Trip & { items?: TripItem[]; payer?: "Consigner" | "Consignee"; invoiceStatus?: "Not Generated" | "Generated" | "Sent"; paymentStatus?: "Pending" | "Partial" | "Paid" };
type DriverProfile = Driver & {
  alternateMobile?: string;
  dateOfBirth?: string;
  joiningDate?: string;
  emergencyContactName?: string;
  emergencyContactNumber?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  monthlySalary?: number;
  photoName?: string;
  licenseDocName?: string;
  aadhaarName?: string;
  panName?: string;
  otherDocName?: string;
};
type DriverDocument = {
  id: string;
  driverId: string;
  type: string;
  uploadedDate: string;
  fileName: string;
  fileUrl?: string;
  history: Array<{ fileName: string; uploadedDate: string }>;
};
type DriverTransaction = {
  id: string;
  driverId: string;
  tripId: string;
  tripNumber: string;
  vehicleId: string;
  date: string;
  route: string;
  purpose: string;
  amount: number;
  remarks?: string;
};

const workflow = ["Trip Created", "Vehicle Assigned", "Loading Started", "Loaded", "In Transit", "Reached Destination", "Unloading Started", "Delivered", "Invoice Generated", "Payment Received"];
const itemOptions = ["Steel", "Cement", "Rice", "FMCG", "Machinery", "Textiles", "Auto Parts"];
const driverStatuses = ["Available", "Assigned", "On Trip", "Leave", "Inactive"];
const driverDocumentTypes = ["Driving License", "Aadhaar Card", "PAN Card", "Driver Photo", "Other"];
const driverExpenseTypes = ["Food", "Driver Advance", "Emergency Cash", "Night Halt", "Other"];

async function openSignedUpload(token: string | undefined, key: string, download = false, filename?: string) {
  if (!key) return;
  const { url } = await previewUpload(token, key, download, filename);
  window.open(url, "_blank", "noopener,noreferrer");
}

async function downloadApiFile(token: string | undefined, path: string, filename: string) {
  const response = await fetch(path, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!response.ok) throw new Error(response.statusText);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function BiltyModule({ bilties, trips, token, refreshData }: { bilties: Bilty[]; trips: Trip[]; token?: string; refreshData: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [datePreset, setDatePreset] = useState("Monthly");
  const [customFrom, setCustomFrom] = useState(monthBounds().from);
  const [customTo, setCustomTo] = useState(monthBounds().to);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<Bilty>();
  const [selected, setSelected] = useState<Bilty>();
  const [error, setError] = useState("");
  const range = biltyDateRange(datePreset, customFrom, customTo);
  const total = bilties.length;
  const uploaded = bilties.filter((item) => item.status === "Uploaded").length;
  const verified = bilties.filter((item) => item.verificationStatus === "Verified").length;
  const pendingVerification = bilties.filter((item) => item.verificationStatus === "Pending Verification").length;
  const missing = bilties.filter((item) => item.status === "Missing").length;
  const tripIdsWithBilty = new Set(bilties.filter((item) => item.status !== "Missing").map((item) => item.tripId));
  const tripsWithoutBilty = trips.filter((trip) => ["Delivered", "Completed"].includes(trip.status) && !tripIdsWithBilty.has(trip.id)).length || missing;
  const thisMonth = bilties.filter((item) => item.uploadDate && isWithinRange(item.uploadDate, monthBounds().from, monthBounds().to)).length;
  const filtered = bilties.filter((item) => {
    const text = [item.biltyNumber, item.tripNumber, item.customerName, item.vehicleNumber, item.driverName].join(" ").toLowerCase();
    const statusMatch = status === "All" || item.status === status || item.verificationStatus === status;
    const dateMatch = item.status === "Missing" || !item.uploadDate || (item.uploadDate >= range.from && item.uploadDate <= range.to);
    return text.includes(query.toLowerCase()) && statusMatch && dateMatch;
  });

  const onVerify = async (bilty: Bilty) => {
    if (bilty.status === "Missing") return;
    await verifyBilty(token, bilty.id);
    await refreshData();
  };

  const onDelete = async (bilty: Bilty) => {
    if (bilty.status === "Missing" || !window.confirm(`Delete Bilty ${bilty.biltyNumber}?`)) return;
    await deleteBilty(token, bilty.id);
    await refreshData();
  };

  const onDownload = async (bilty: Bilty) => {
    const file = bilty.files?.[0];
    if (!file) return;
    const { url } = await downloadBilty(token, file.key, file.fileName);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const exportCsv = (report: string) => {
    const reportRows = report === "Missing Bilty Report" ? bilties.filter((item) => item.status === "Missing") : report === "Verified Bilty Report" ? bilties.filter((item) => item.verificationStatus === "Verified") : filtered;
    const header = ["Bilty Number", "Trip Number", "Customer", "Vehicle", "Driver", "Upload Date", "Status", "Verification Status"];
    const csv = [header, ...reportRows.map((item) => [item.biltyNumber, item.tripNumber, item.customerName, item.vehicleNumber, item.driverName, item.uploadDate, item.status, item.verificationStatus])].map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${report.toLowerCase().replace(/\s+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const printReport = () => {
    const html = `<html><head><title>Bilty Register Report</title></head><body><h1>Bilty Register Report</h1><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Bilty Number</th><th>Trip Number</th><th>Customer</th><th>Vehicle</th><th>Driver</th><th>Status</th><th>Verification</th></tr></thead><tbody>${filtered.map((item) => `<tr><td>${item.biltyNumber}</td><td>${item.tripNumber}</td><td>${item.customerName}</td><td>${item.vehicleNumber}</td><td>${item.driverName}</td><td>${item.status}</td><td>${item.verificationStatus}</td></tr>`).join("")}</tbody></table></body></html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        <Kpi title="Total Bilties" value={total} icon={FileText} tone="primary" />
        <Kpi title="Uploaded Bilties" value={uploaded} icon={FileArchive} tone="success" />
        <Kpi title="Verified Bilties" value={verified} icon={ShieldCheck} tone="success" />
        <Kpi title="Pending Verification" value={pendingVerification} icon={AlertTriangle} tone="warning" />
        <Kpi title="Missing Bilties" value={missing} icon={AlertTriangle} tone={missing ? "danger" : "success"} />
        <Kpi title="Trips Without Bilty" value={tripsWithoutBilty} icon={Route} tone={tripsWithoutBilty ? "warning" : "success"} />
        <Kpi title="This Month Bilties" value={thisMonth} icon={ClipboardList} tone="primary" />
      </section>

      <Panel title="Bilty Register" action={<button onClick={() => setUploadOpen(true)} className="rounded-md bg-tower-primary px-3 py-2 text-xs font-medium text-white">Upload Bilty</button>}>
        {missing > 0 && <div className="mb-4 rounded-md border border-tower-warning/40 bg-tower-warning/10 px-3 py-2 text-sm text-amber-100">{missing} completed trips are missing Bilty uploads.</div>}
        {error && <div className="mb-4 rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{error}</div>}
        <div className="mb-5 grid gap-3 xl:grid-cols-[1.4fr_0.75fr_1fr]">
          <TextField label="Search" value={query} onChange={setQuery} />
          <FieldSelect label="Filter" value={status} onChange={setStatus} options={["All", "Uploaded", "Missing", "Pending", "Pending Verification", "Verified"].map((item) => ({ label: item, value: item }))} />
          <div className="space-y-3">
            <Segment value={datePreset} onChange={setDatePreset} values={["Today", "Weekly", "Monthly", "Custom Range"]} />
            {datePreset === "Custom Range" && <div className="grid gap-3 md:grid-cols-2"><DateInput label="From" value={customFrom} onChange={setCustomFrom} /><DateInput label="To" value={customTo} onChange={setCustomTo} /></div>}
          </div>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {["Bilty Register Report", "Missing Bilty Report", "Verified Bilty Report", "Vehicle Wise Bilty Report", "Customer Wise Bilty Report"].map((report) => <button key={report} onClick={() => exportCsv(report)} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-tower-muted hover:text-white">{report}</button>)}
          <button onClick={printReport} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-tower-muted hover:text-white">Export PDF</button>
        </div>
        <DataTable
          columns={["Bilty Number", "Trip Number", "Customer", "Vehicle", "Driver", "Upload Date", "Uploaded By", "Status", "Verification Status", "Actions"]}
          rows={filtered.map((bilty) => [
            bilty.biltyNumber,
            bilty.tripNumber,
            bilty.customerName,
            bilty.vehicleNumber,
            bilty.driverName,
            bilty.uploadDate || "-",
            bilty.uploadedBy,
            <Status key={`${bilty.id}-status`} value={bilty.status} />,
            <Status key={`${bilty.id}-verification`} value={bilty.verificationStatus} />,
            <div key={`${bilty.id}-actions`} className="flex min-w-[300px] flex-wrap items-center gap-2">
              <button onClick={() => setSelected(bilty)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-1.5 text-xs text-white hover:border-tower-primary/60">View</button>
              <button disabled={bilty.status === "Missing"} onClick={() => setEditing(bilty)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-1.5 text-xs text-white hover:border-tower-primary/60 disabled:opacity-40">Edit</button>
              <button disabled={!bilty.files?.length} onClick={() => { void onDownload(bilty); }} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-1.5 text-xs text-white hover:border-tower-primary/60 disabled:opacity-40">Download</button>
              <button disabled={bilty.status === "Missing" || bilty.verificationStatus === "Verified"} onClick={() => { void onVerify(bilty).catch((err) => setError(err instanceof Error ? err.message : "Verification failed.")); }} className="rounded-md bg-tower-success/90 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Verify</button>
              <button disabled={bilty.status === "Missing"} onClick={() => { void onDelete(bilty).catch((err) => setError(err instanceof Error ? err.message : "Delete failed.")); }} className="rounded-md border border-tower-danger/50 bg-tower-danger/10 px-3 py-1.5 text-xs text-red-200 disabled:opacity-40">Delete</button>
            </div>
          ])}
        />
      </Panel>

      {uploadOpen && <BiltyUploadModal trips={trips} token={token} onClose={() => setUploadOpen(false)} onSaved={async () => { await refreshData(); setUploadOpen(false); }} />}
      {editing && <BiltyUploadModal bilty={editing} trips={trips} token={token} onClose={() => setEditing(undefined)} onSaved={async () => { await refreshData(); setEditing(undefined); }} />}
      {selected && <BiltyPreviewDrawer bilty={selected} token={token} onClose={() => setSelected(undefined)} />}
    </div>
  );
}

function BiltyUploadModal({ bilty, trips, token, onClose, onSaved }: { bilty?: Bilty; trips: Trip[]; token?: string; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const existingTrip = trips.find((trip) => trip.id === bilty?.tripId);
  const [tripId, setTripId] = useState(bilty?.tripId || trips[0]?.id || "");
  const [biltyNumber, setBiltyNumber] = useState(bilty?.biltyNumber === "Not uploaded" ? "" : bilty?.biltyNumber || "");
  const [biltyDate, setBiltyDate] = useState(bilty?.biltyDate || today());
  const [remarks, setRemarks] = useState(bilty?.remarks || "");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const trip = trips.find((item) => item.id === tripId) || existingTrip;
  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = { biltyNumber, tripId, biltyDate, remarks, files };
      if (bilty && bilty.status !== "Missing") await updateBilty(token, bilty.id, payload);
      else await createBilty(token, payload);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilty could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={bilty ? "Edit Bilty" : "Upload Bilty"} subtitle="Stores the physical LR/Bilty document against one trip." onClose={onClose}>
      <div className="space-y-4">
        {error && <div className="rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{error}</div>}
        <FormSection title="Bilty Details">
          <TextField label="Bilty Number" value={biltyNumber} onChange={setBiltyNumber} />
          <FieldSelect label="Trip Number" value={tripId} onChange={setTripId} options={trips.map((item) => ({ label: item.tripNumber, value: item.id }))} />
          <ReadOnlyField label="Customer" value={trip?.customer?.name || "-"} />
          <ReadOnlyField label="Vehicle" value={trip?.vehicle?.number || "-"} />
          <ReadOnlyField label="Driver" value={trip?.driver?.name || "-"} />
          <DateInput label="Bilty Date" value={biltyDate} onChange={setBiltyDate} />
          <div className="md:col-span-2 xl:col-span-3"><TextField label="Remarks" value={remarks} onChange={setRemarks} /></div>
        </FormSection>
        <label className="block rounded-lg border border-dashed border-tower-border bg-[#0B1220] p-4 text-sm text-tower-muted">
          Upload PDF, JPG, PNG, or JPEG
          <input multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" type="file" onChange={(event) => setFiles(Array.from(event.target.files || []))} className="mt-3 block w-full text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-tower-primary file:px-3 file:py-2 file:text-white" />
          {files.length > 0 && <div className="mt-2 text-xs text-white">{files.map((file) => file.name).join(", ")}</div>}
        </label>
        <ModalActions onClose={onClose} onSave={save} disabled={saving || !biltyNumber.trim() || !tripId || (!bilty && files.length === 0)} label={saving ? "Saving" : "Save Bilty"} />
      </div>
    </ModalShell>
  );
}

function BiltyPreviewDrawer({ bilty, token, onClose }: { bilty: Bilty; token?: string; onClose: () => void }) {
  const file = bilty.files?.[0];
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(() => {
    if (!file?.key) return;
    previewUpload(token, file.key).then((result) => setPreviewUrl(result.url)).catch(() => setPreviewUrl(""));
  }, [file?.key, token]);
  const isImage = file?.fileType?.startsWith("image/");
  const isPdf = file?.fileType === "application/pdf";
  return (
    <Drawer title="Bilty Detail" subtitle={bilty.biltyNumber} onClose={onClose}>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Document Preview" action={file?.fileName || "No file"}>
          <div className="grid min-h-[520px] place-items-center overflow-hidden rounded-lg border border-tower-border bg-[#0B1220]">
            {!file ? <span className="text-sm text-tower-muted">No Bilty uploaded.</span> : isImage && previewUrl ? <img src={previewUrl} alt={file.fileName} className="max-h-[520px] w-full object-contain" /> : isPdf && previewUrl ? <iframe title={file.fileName} src={previewUrl} className="h-[520px] w-full" /> : <button onClick={() => openSignedUpload(token, file.key)} className="rounded-md border border-tower-border px-3 py-2 text-sm text-white">Open Document</button>}
          </div>
        </Panel>
        <Panel title="Bilty Information" action={<Status value={bilty.verificationStatus} />}>
          <div className="grid gap-3">
            <Info label="Bilty Number" value={bilty.biltyNumber} />
            <Info label="Trip Number" value={bilty.tripNumber} />
            <Info label="Customer" value={bilty.customerName} />
            <Info label="Vehicle" value={bilty.vehicleNumber} />
            <Info label="Driver" value={bilty.driverName} />
            <Info label="Date" value={bilty.biltyDate || "-"} />
            <Info label="Remarks" value={bilty.remarks || "-"} />
            <Info label="Uploaded By" value={bilty.uploadedBy} />
            <Info label="Upload Date" value={bilty.uploadDate || "-"} />
            <Info label="File Type" value={file?.fileType || "-"} />
            <Info label="File Size" value={file ? `${Math.round(file.fileSize / 1024)} KB` : "-"} />
          </div>
        </Panel>
      </div>
    </Drawer>
  );
}

function biltyDateRange(preset: string, customFrom: string, customTo: string) {
  const now = new Date();
  if (preset === "Today") return { from: toDateInput(now), to: toDateInput(now) };
  if (preset === "Weekly") {
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    return { from: toDateInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset)), to: toDateInput(now) };
  }
  if (preset === "Custom Range") return { from: customFrom, to: customTo };
  return monthBounds();
}

function TripsModule({ trips, customers, vehicles, drivers, invoices, bilties, driverTransactions, setData, token, refreshData, onDriverExpenseSave }: { trips: Trip[]; customers: Customer[]; vehicles: Vehicle[]; drivers: Driver[]; invoices: Invoice[]; bilties: Bilty[]; driverTransactions: DriverTransaction[]; setData: React.Dispatch<React.SetStateAction<Data>>; token?: string; refreshData: () => Promise<void>; onDriverExpenseSave: (transaction: DriverTransaction) => void }) {
  const [localTrips, setLocalTrips] = useState<LocalTrip[]>(() => trips.map((trip, index) => enrichTrip(trip, invoices, index)));
  const [localInvoices, setLocalInvoices] = useState(invoices);
  const [datePreset, setDatePreset] = useState("This Month");
  const [truckId, setTruckId] = useState("All");
  const [companyId, setCompanyId] = useState("All");
  const [customFrom, setCustomFrom] = useState(monthBounds().from);
  const [customTo, setCustomTo] = useState(monthBounds().to);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTrip, setEditTrip] = useState<LocalTrip>();
  const [selectedTripId, setSelectedTripId] = useState<string>();
  const [invoiceTripId, setInvoiceTripId] = useState<string>();
  const [deletingTripId, setDeletingTripId] = useState<string>();
  const [deleteError, setDeleteError] = useState("");

  const range = getDateRange(datePreset, customFrom, customTo);
  const filteredTrips = localTrips.filter((trip) => {
    const date = new Date(trip.tripDate);
    return date >= range.from && date <= range.to && (truckId === "All" || trip.vehicleId === truckId) && (companyId === "All" || trip.customerId === companyId);
  });
  const perPage = 8;
  const pages = Math.max(Math.ceil(filteredTrips.length / perPage), 1);
  const pageRows = filteredTrips.slice((page - 1) * perPage, page * perPage);
  const selectedTrip = localTrips.find((trip) => trip.id === selectedTripId);
  const invoiceTrip = localTrips.find((trip) => trip.id === invoiceTripId);

  useEffect(() => {
    setLocalTrips(trips.map((trip, index) => enrichTrip(trip, invoices, index)));
    setLocalInvoices(invoices);
  }, [trips, invoices]);

  const updateTrip = (tripId: string, patch: Partial<LocalTrip>) => {
    setLocalTrips((rows) => rows.map((trip) => trip.id === tripId ? { ...trip, ...patch } : trip));
  };

  const advanceWorkflow = async (trip: LocalTrip, targetStatus?: string) => {
    const next = targetStatus || nextWorkflowStatus(trip.status);
    if (!next) return;
    updateTrip(trip.id, { status: next, paymentStatus: next === "Payment Received" ? "Paid" : trip.paymentStatus });
    openWhatsAppStatusDraft(trip, next);
    if (!trip.id.startsWith("local-")) {
      await updateTripApi(token, trip.id, { status: backendTripStatus(next) });
      await refreshData();
      return;
    }
  };

  const deleteTrip = async (trip: LocalTrip) => {
    if (!window.confirm(`Delete trip ${trip.tripNumber}? This removes it from the database.`)) return;
    setDeleteError("");
    setDeletingTripId(trip.id);
    try {
      if (!trip.id.startsWith("local-")) {
        try {
          await deleteTripApi(token, trip.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (!message.includes("invoice") || !window.confirm("Trip has an invoice. Are you sure you want to delete this Trip?")) throw error;
          await deleteTripApi(token, trip.id, true);
        }
      }
      setLocalTrips((rows) => rows.filter((row) => row.id !== trip.id));
      setLocalInvoices((rows) => rows.filter((invoice) => invoice.tripId !== trip.id));
      setData((current) => ({
        ...current,
        trips: current.trips.filter((row) => row.id !== trip.id),
        invoices: current.invoices.filter((invoice) => invoice.tripId !== trip.id),
        payments: current.payments.filter((payment) => payment.tripId !== trip.id),
        bilties: current.bilties.filter((bilty) => bilty.tripId !== trip.id),
        driverTransactions: current.driverTransactions.filter((transaction) => transaction.tripId !== trip.id)
      }));
      await refreshData();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Trip could not be deleted.");
    } finally {
      setDeletingTripId(undefined);
    }
  };

  if (selectedTrip) {
    return (
      <TripDetailsPage
        trip={selectedTrip}
        invoice={localInvoices.find((invoice) => invoice.tripId === selectedTrip.id)}
        bilty={bilties.find((bilty) => bilty.tripId === selectedTrip.id)}
        token={token}
        onBack={() => setSelectedTripId(undefined)}
        onWorkflow={(status) => { void advanceWorkflow(selectedTrip, status); }}
        onGenerateInvoice={() => setInvoiceTripId(selectedTrip.id)}
        onPaymentStatus={async (status, amountReceived) => {
          if (!selectedTrip.id.startsWith("local-")) {
            const linkedInvoice = localInvoices.find((invoice) => invoice.tripId === selectedTrip.id);
            if (status === "Partial" && linkedInvoice && amountReceived > 0) {
              await createPayment(token, {
                invoiceId: linkedInvoice.id,
                amountReceived,
                paymentDate: today(),
                mode: "NEFT",
                referenceNumber: `TRIP-${selectedTrip.tripNumber}-PARTIAL-${Date.now()}`,
                remarks: "Partial payment recorded from Trip module."
              });
            }
            const targetStatus = status === "Paid" ? "Payment Received" : linkedInvoice ? "Invoice Generated" : "Delivered";
            await updateTripApi(token, selectedTrip.id, { status: backendTripStatus(targetStatus) });
            await refreshData();
          } else {
            updateTrip(selectedTrip.id, { paymentStatus: status, status: status === "Paid" ? "Payment Received" : selectedTrip.status });
          }
        }}
        driverTransactions={driverTransactions.filter((transaction) => transaction.tripId === selectedTrip.id)}
        onDriverExpenseSave={onDriverExpenseSave}
        onBiltySaved={refreshData}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Trips Control Center</h3>
            <p className="text-sm text-tower-muted">Current month loads by default with table-first dispatch workflow.</p>
          </div>
          <button onClick={() => setModalOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-md bg-tower-primary px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-950/30">
            <span className="text-lg leading-none">+</span>
            Add Trip
          </button>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <div className="space-y-3">
            <Segment value={datePreset} onChange={(value) => { setDatePreset(value); setPage(1); }} values={["Today", "This Week", "This Month", "Last Month", "Custom Range"]} />
            {datePreset === "Custom Range" && (
              <div className="grid gap-3 md:grid-cols-2">
                <DateInput label="From" value={customFrom} onChange={setCustomFrom} />
                <DateInput label="To" value={customTo} onChange={setCustomTo} />
              </div>
            )}
          </div>
          <Select value={truckId} onChange={(value) => { setTruckId(value); setPage(1); }} options={[{ label: "All Trucks", value: "All" }, ...vehicles.map((item) => ({ label: item.number, value: item.id }))]} />
          <Select value={companyId} onChange={(value) => { setCompanyId(value); setPage(1); }} options={[{ label: "All Companies", value: "All" }, ...customers.map((item) => ({ label: item.name, value: item.id }))]} />
        </div>
      </section>

      <Panel title="Trips Table" action={`${filteredTrips.length} trips`}>
        {deleteError && <div className="mb-4 rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{deleteError}</div>}
        <DataTable
          columns={["Trip No", "Date", "Vehicle", "Consigner", "Consignee", "Item", "Weight (MT)", "Rate / MT", "Freight Amount", "Invoice Status", "Payment Status", "Trip Status", "Actions"]}
          rows={pageRows.map((trip) => {
            const first = trip.items?.[0];
            const totalWeight = (trip.items || []).reduce((sum, item) => sum + item.weight, 0);
            const averageRate = totalWeight ? trip.freightAmount / totalWeight : 0;
            return [
              trip.tripNumber,
              trip.tripDate,
              trip.vehicle?.number,
              trip.consignorName || trip.customer?.name,
              trip.consigneeName || trip.customer?.name,
              (trip.items || []).length > 1 ? `${first?.item} +${(trip.items || []).length - 1}` : first?.item,
              totalWeight.toFixed(1),
              money(averageRate),
              money(trip.freightAmount),
              <Status key={`${trip.id}-invoice`} value={trip.invoiceStatus || "Not Generated"} />,
              <Status key={`${trip.id}-payment`} value={trip.paymentStatus || "Pending"} />,
              <Status key={`${trip.id}-status`} value={trip.status} />,
              <div key={`${trip.id}-actions`} className="flex min-w-[260px] flex-wrap items-center gap-2">
                <button onClick={() => setSelectedTripId(trip.id)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-1.5 text-xs text-white hover:border-tower-primary/60">View</button>
                <button onClick={() => setEditTrip(trip)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-1.5 text-xs text-white hover:border-tower-primary/60">Edit</button>
                {nextWorkflowStatus(trip.status) && <button onClick={() => { void advanceWorkflow(trip); }} className="rounded-md bg-tower-primary/90 px-3 py-1.5 text-xs font-medium text-white">{workflowButton(trip.status)}</button>}
                <button disabled={deletingTripId === trip.id} onClick={() => deleteTrip(trip)} className="rounded-md border border-tower-danger/50 bg-tower-danger/10 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-tower-danger/20 disabled:opacity-40">
                  {deletingTripId === trip.id ? "Deleting" : "Delete"}
                </button>
              </div>
            ];
          })}
        />
      </Panel>

      <div className="flex items-center justify-between rounded-lg border border-tower-border bg-tower-card px-4 py-3 text-sm text-tower-muted">
        <span>Page {page} of {pages}</span>
        <div className="flex gap-2">
          <button disabled={page === 1} onClick={() => setPage((value) => Math.max(value - 1, 1))} className="rounded-md border border-tower-border px-3 py-1.5 disabled:opacity-40">Previous</button>
          <button disabled={page === pages} onClick={() => setPage((value) => Math.min(value + 1, pages))} className="rounded-md border border-tower-border px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>
      </div>

      {modalOpen && (
        <AddTripModal
          customers={customers}
          vehicles={vehicles}
          drivers={drivers}
          nextTripNumber={nextTripNumber(localTrips)}
          onClose={() => setModalOpen(false)}
          onSave={async (trip) => {
            if (localTrips.some((row) => row.tripNumber.trim().toLowerCase() === trip.tripNumber.trim().toLowerCase())) {
              window.alert("Trip number already exists. Please enter a unique trip number.");
              return;
            }
            await createTrip(token, tripToPayload(trip));
            await refreshData();
            setModalOpen(false);
          }}
        />
      )}
      {editTrip && (
        <AddTripModal
          trip={editTrip}
          customers={customers}
          vehicles={vehicles}
          drivers={drivers}
          nextTripNumber={editTrip.tripNumber}
          onClose={() => setEditTrip(undefined)}
          onSave={async (trip) => {
            if (localTrips.some((row) => row.id !== editTrip.id && row.tripNumber.trim().toLowerCase() === trip.tripNumber.trim().toLowerCase())) {
              window.alert("Trip number already exists. Please enter a unique trip number.");
              return;
            }
            await updateTripApi(token, editTrip.id, tripToPayload(trip));
            await refreshData();
            setEditTrip(undefined);
          }}
        />
      )}

      {invoiceTrip && (
        <InvoicePreviewModal
          trip={invoiceTrip}
          token={token}
          existingNumber={localInvoices.find((invoice) => invoice.tripId === invoiceTrip.id)?.invoiceNumber}
          onClose={() => setInvoiceTripId(undefined)}
          onGenerated={async () => {
            await refreshData();
            setInvoiceTripId(undefined);
          }}
        />
      )}
    </div>
  );
}

function AddTripModal({ trip, customers, vehicles, drivers, nextTripNumber, onClose, onSave }: { trip?: LocalTrip; customers: Customer[]; vehicles: Vehicle[]; drivers: Driver[]; nextTripNumber: string; onClose: () => void; onSave: (trip: LocalTrip) => void | Promise<void> }) {
  const [tripNumber, setTripNumber] = useState(trip?.tripNumber || nextTripNumber);
  const [tripDate, setTripDate] = useState(trip?.tripDate || today());
  const [vehicleId, setVehicleId] = useState(trip?.vehicleId || vehicles[0]?.id || "");
  const [driverId, setDriverId] = useState(trip?.driverId || drivers[0]?.id || "");
  const [consignerId, setConsignerId] = useState(customers.find((customer) => customer.name === trip?.consignorName)?.id || trip?.customerId || customers[0]?.id || "");
  const [consigneeId, setConsigneeId] = useState(customers.find((customer) => customer.name === trip?.consigneeName)?.id || customers[1]?.id || customers[0]?.id || "");
  const [payer, setPayer] = useState<"Consigner" | "Consignee">(trip?.payer || "Consigner");
  const [consignerLocationId, setConsignerLocationId] = useState("temporary");
  const [consigneeLocationId, setConsigneeLocationId] = useState("temporary");
  const [temporaryLoading, setTemporaryLoading] = useState(trip?.loadingPoint || "");
  const [temporaryUnloading, setTemporaryUnloading] = useState(trip?.unloadingPoint || "");
  const [items, setItems] = useState<TripItem[]>(trip?.items?.length ? trip.items : [{ id: "item-1", item: itemOptions[0], weight: 0, rate: 0 }]);
  const [remarks, setRemarks] = useState(trip?.remarks || "");

  const consigner = customers.find((customer) => customer.id === consignerId) || customers[0];
  const consignee = customers.find((customer) => customer.id === consigneeId) || customers[0];
  const consignerLocation = consigner?.locations?.find((location) => location.id === consignerLocationId);
  const consigneeLocation = consignee?.locations?.find((location) => location.id === consigneeLocationId);
  const vehicle = vehicles.find((item) => item.id === vehicleId);
  const driver = drivers.find((item) => item.id === driverId);
  const totalWeight = items.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const totalFreight = items.reduce((sum, item) => sum + Number(item.weight || 0) * Number(item.rate || 0), 0);

  const updateItem = (id: string, patch: Partial<TripItem>) => {
    setItems((rows) => rows.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const saveTrip = () => {
    if (!consigner || !consignee || !vehicle || !driver || !items.length) return;
    onSave({
      id: trip?.id || `local-${Date.now()}`,
      tripNumber: tripNumber.trim(),
      tripDate,
      customerId: payer === "Consigner" ? consigner.id : consignee.id,
      customer: payer === "Consigner" ? consigner : consignee,
      consignorName: consigner.name,
      consignorAddress: consigner.address,
      consignorGst: consigner.gstNumber,
      consigneeName: consignee.name,
      consigneeAddress: consignee.address,
      consigneeGst: consignee.gstNumber,
      vehicleId,
      driverId,
      vehicle,
      driver,
      loadingPoint: consignerLocation?.address || temporaryLoading || consigner.address,
      unloadingPoint: consigneeLocation?.address || temporaryUnloading || consignee.address,
      distanceKm: 0,
      freightAmount: totalFreight,
      advance: 0,
      dieselExpense: 0,
      tollExpense: 0,
      loadingExpense: 0,
      unloadingExpense: 0,
      otherExpense: 0,
      totalExpense: 0,
      profit: totalFreight,
      remarks,
      status: trip?.status || "Trip Created",
      items,
      payer,
      invoiceStatus: "Not Generated",
      paymentStatus: "Pending"
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-lg border border-tower-border bg-tower-card shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-tower-border bg-tower-card px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold">{trip ? "Edit Trip" : "Add Trip"}</h3>
            <p className="text-sm text-tower-muted">Fast dispatch entry with editable trip number and calculated freight.</p>
          </div>
          <button onClick={onClose} className="rounded-md border border-tower-border px-3 py-2 text-sm text-tower-muted hover:text-white">Close</button>
        </div>

        <div className="grid gap-5 p-6">
          <FormSection title="Basic Information">
            <TextField label="Trip Number" value={tripNumber} onChange={setTripNumber} />
            <DateInput label="Date" value={tripDate} onChange={setTripDate} />
          </FormSection>

          <FormSection title="Transport Information">
            <FieldSelect label="Vehicle" value={vehicleId} onChange={setVehicleId} options={vehicles.map((item) => ({ label: `${item.number} - ${item.type}`, value: item.id }))} />
            <FieldSelect label="Driver" value={driverId} onChange={setDriverId} options={drivers.map((item) => ({ label: `${item.name} - ${item.mobile}`, value: item.id }))} />
          </FormSection>

          <FormSection title="Parties">
            <FieldSelect label="Consigner" value={consignerId} onChange={(value) => {
              setConsignerId(value);
              setConsignerLocationId(customers.find((item) => item.id === value)?.locations?.[0]?.id || "temporary");
            }} options={customers.map((item) => ({ label: item.name, value: item.id }))} />
            <FieldSelect label="Consignee" value={consigneeId} onChange={(value) => {
              setConsigneeId(value);
              setConsigneeLocationId(customers.find((item) => item.id === value)?.locations?.[0]?.id || "temporary");
            }} options={customers.map((item) => ({ label: item.name, value: item.id }))} />
            <div className="rounded-md border border-tower-border bg-[#0B1220] p-3">
              <div className="mb-3 text-sm text-tower-muted">Payer</div>
              <div className="flex gap-4 text-sm">
                {(["Consigner", "Consignee"] as const).map((option) => (
                  <label key={option} className="flex items-center gap-2">
                    <input type="radio" checked={payer === option} onChange={() => setPayer(option)} />
                    {option}
                  </label>
                ))}
              </div>
            </div>
          </FormSection>

          <FormSection title="Customer Billing">
            <ReadOnlyField label="Payee Customer" value={(payer === "Consigner" ? consigner : consignee)?.name} />
            <ReadOnlyField label="GST Number" value={(payer === "Consigner" ? consigner : consignee)?.gstNumber} />
            <ReadOnlyField label="Billing Address" value={(payer === "Consigner" ? consigner : consignee)?.address} />
          </FormSection>

          <FormSection title="Route">
            <FieldSelect label="Loading Location" value={consignerLocationId} onChange={setConsignerLocationId} options={[...(consigner?.locations || []).map((item) => ({ label: item.name, value: item.id })), { label: "Temporary One-Time Location", value: "temporary" }]} />
            <FieldSelect label="Unloading Location" value={consigneeLocationId} onChange={setConsigneeLocationId} options={[...(consignee?.locations || []).map((item) => ({ label: item.name, value: item.id })), { label: "Temporary One-Time Location", value: "temporary" }]} />
            {consignerLocationId === "temporary" ? <TextField label="Temporary Loading Address" value={temporaryLoading} onChange={setTemporaryLoading} /> : <ReadOnlyField label="Loading Address" value={consignerLocation?.address || ""} />}
            {consigneeLocationId === "temporary" ? <TextField label="Temporary Unloading Address" value={temporaryUnloading} onChange={setTemporaryUnloading} /> : <ReadOnlyField label="Unloading Address" value={consigneeLocation?.address || ""} />}
          </FormSection>

          <section className="rounded-lg border border-tower-border bg-[#0B1220] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="font-medium">Freight Details</h4>
              <button onClick={() => setItems((rows) => [...rows, { id: `item-${Date.now()}`, item: itemOptions[0], weight: 0, rate: 0 }])} className="rounded-md border border-tower-border px-3 py-2 text-sm hover:border-tower-primary/60">Add Item</button>
            </div>
            <div className="space-y-3">
              {items.map((row, index) => (
                <div key={row.id} className="grid gap-3 rounded-md border border-tower-border bg-tower-card p-3 lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_auto]">
                  <FieldSelect label={`Item ${index + 1}`} value={row.item} onChange={(value) => updateItem(row.id, { item: value })} options={itemOptions.map((item) => ({ label: item, value: item }))} />
                  <NumberField label="Weight (MT)" value={row.weight} onChange={(value) => updateItem(row.id, { weight: value })} />
                  <NumberField label="Rate Per MT" value={row.rate} onChange={(value) => updateItem(row.id, { rate: value })} />
                  <ReadOnlyField label="Freight Amount" value={money(row.weight * row.rate)} />
                  <button disabled={items.length === 1} onClick={() => setItems((rows) => rows.filter((item) => item.id !== row.id))} className="self-end rounded-md border border-tower-border px-3 py-2 text-sm disabled:opacity-40">Remove</button>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ReadOnlyField label="Total Weight" value={`${totalWeight.toFixed(2)} MT`} />
              <ReadOnlyField label="Total Freight" value={money(totalFreight)} />
            </div>
          </section>

          <label className="block text-sm text-tower-muted">
            Remarks
            <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={3} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white outline-none" />
          </label>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-tower-border bg-tower-card px-6 py-4">
          <button onClick={onClose} className="rounded-md border border-tower-border px-4 py-2 text-sm text-tower-muted hover:text-white">Cancel</button>
          <button disabled={!totalFreight || !tripNumber.trim()} onClick={saveTrip} className="rounded-md bg-tower-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{trip ? "Save Trip" : "Create Trip"}</button>
        </div>
      </div>
    </div>
  );
}

function TripDetailsPage({ trip, invoice, bilty, token, onBack, onWorkflow, onGenerateInvoice, onPaymentStatus, driverTransactions = [], onDriverExpenseSave, onBiltySaved = () => undefined }: { trip: LocalTrip; invoice?: Invoice; bilty?: Bilty; token?: string; onBack: () => void; onWorkflow: (status?: string) => void; onGenerateInvoice: () => void; onPaymentStatus: (status: "Pending" | "Partial" | "Paid", amountReceived: number) => void; driverTransactions?: DriverTransaction[]; onDriverExpenseSave?: (transaction: DriverTransaction) => void; onBiltySaved?: () => void | Promise<void> }) {
  const [expenses, setExpenses] = useState([
    { type: "Diesel", amount: trip.dieselExpense || 0 },
    { type: "Toll", amount: trip.tollExpense || 0 },
    { type: "Loading", amount: trip.loadingExpense || 0 },
    { type: "Unloading", amount: trip.unloadingExpense || 0 },
    { type: "Repair", amount: 0 },
    { type: "Miscellaneous", amount: trip.otherExpense || 0 }
  ]);
  const [driverExpenseType, setDriverExpenseType] = useState(driverExpenseTypes[0]);
  const [driverExpenseAmount, setDriverExpenseAmount] = useState(0);
  const [driverExpenseRemarks, setDriverExpenseRemarks] = useState("");
  const [received, setReceived] = useState(Math.max((invoice?.amount || trip.freightAmount) - (invoice?.outstandingAmount ?? trip.freightAmount), 0));
  const [statusMessage, setStatusMessage] = useState("");
  const [statusError, setStatusError] = useState("");
  const [sendingStatus, setSendingStatus] = useState("");
  const invoiceAmount = invoice?.amount || trip.freightAmount;
  const outstanding = Math.max(invoiceAmount - received, 0);
  const totalExpense = expenses.reduce((sum, item) => sum + item.amount, 0);
  const saveDriverExpense = () => {
    if (!driverExpenseAmount || !onDriverExpenseSave) return;
    onDriverExpenseSave({
      id: `driver-expense-${Date.now()}`,
      driverId: trip.driverId,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      vehicleId: trip.vehicleId,
      date: today(),
      route: `${trip.loadingPoint} to ${trip.unloadingPoint}`,
      purpose: driverExpenseType,
      amount: driverExpenseAmount,
      remarks: driverExpenseRemarks
    });
    setDriverExpenseAmount(0);
    setDriverExpenseRemarks("");
  };
  const sendTimelineMessage = async (status: string) => {
    setSendingStatus(status);
    setStatusMessage("");
    setStatusError("");
    try {
      if (!trip.id.startsWith("local-")) await sendStatusUpdate(token, trip.id, status);
      setStatusMessage(`Status update for ${status} queued successfully.`);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Status update could not be sent.");
    } finally {
      setSendingStatus("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower lg:flex-row lg:items-center lg:justify-between">
        <div>
          <button onClick={onBack} className="mb-3 rounded-md border border-tower-border px-3 py-1.5 text-sm text-tower-muted hover:text-white">Back to Trips</button>
          <h3 className="text-2xl font-semibold">{trip.tripNumber}</h3>
          <p className="text-sm text-tower-muted">{trip.consignorName} to {trip.consigneeName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Status value={trip.status} />
          {nextWorkflowStatus(trip.status) && <button onClick={() => onWorkflow()} className="rounded-md bg-tower-primary px-4 py-2 text-sm font-medium text-white">{workflowButton(trip.status)}</button>}
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Overview" action="Trip information">
          <div className="grid gap-4 md:grid-cols-2">
            <Info label="Date" value={trip.tripDate} />
            <Info label="Vehicle" value={trip.vehicle?.number || ""} />
            <Info label="Driver" value={trip.driver?.name || ""} />
            <Info label="Consigner" value={trip.consignorName || ""} />
            <Info label="Consignee" value={trip.consigneeName || ""} />
            <Info label="Loading Point" value={trip.loadingPoint} />
            <Info label="Unloading Point" value={trip.unloadingPoint} />
            <Info label="Freight Amount" value={money(trip.freightAmount)} />
          </div>
          <div className="mt-5 border-t border-tower-border pt-5">
            <h4 className="mb-3 text-sm font-medium">Freight Details</h4>
            <DataTable columns={["Item", "Weight (MT)", "Rate / MT", "Amount"]} rows={(trip.items || []).map((item) => [item.item, item.weight, money(item.rate), money(item.weight * item.rate)])} />
          </div>
        </Panel>

        <Panel title="Status Timeline" action="Workflow">
          {statusMessage && <div className="mb-3 rounded-md border border-tower-success/40 bg-tower-success/10 px-3 py-2 text-sm text-green-200">{statusMessage}</div>}
          {statusError && <div className="mb-3 rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{statusError}</div>}
          <div className="space-y-3">
            {workflow.map((step) => {
              const currentIndex = workflow.indexOf(trip.status);
              const stepIndex = workflow.indexOf(step);
              const active = stepIndex <= currentIndex;
              const canUpdate = stepIndex > currentIndex;
              return (
                <div key={step} className="grid gap-3 rounded-md border border-tower-border bg-[#0B1220] p-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center">
                  <span className={cn("h-3 w-3 rounded-full", active ? "bg-tower-success" : "bg-tower-border")} />
                  <span className={cn("text-sm", active ? "text-white" : "text-tower-muted")}>{step}</span>
                  <button disabled={sendingStatus === step} onClick={() => { void sendTimelineMessage(step); }} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-white disabled:opacity-40">{sendingStatus === step ? "Sending" : "Send Message"}</button>
                  <button disabled={!canUpdate} onClick={() => onWorkflow(step)} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-white disabled:opacity-40">Update & Notify</button>
                </div>
              );
            })}
          </div>
        </Panel>
      </section>

      <Panel title="Expenses" action={`Total ${money(totalExpense)}`}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {expenses.map((expense) => (
            <NumberField key={expense.type} label={expense.type} value={expense.amount} onChange={(value) => setExpenses((rows) => rows.map((item) => item.type === expense.type ? { ...item, amount: value } : item))} />
          ))}
        </div>
        <div className="mt-5 border-t border-tower-border pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-medium">Driver Expense</h4>
            <span className="text-xs text-tower-muted">Syncs to Driver Profile and Expenses</span>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]">
            <FieldSelect label="Expense Type" value={driverExpenseType} onChange={setDriverExpenseType} options={driverExpenseTypes.map((item) => ({ label: item, value: item }))} />
            <NumberField label="Amount" value={driverExpenseAmount} onChange={setDriverExpenseAmount} />
            <TextField label="Remarks" value={driverExpenseRemarks} onChange={setDriverExpenseRemarks} />
            <button disabled={!driverExpenseAmount || !onDriverExpenseSave} onClick={saveDriverExpense} className="self-end rounded-md bg-tower-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-40">Save</button>
          </div>
          {driverTransactions.length > 0 && (
            <div className="mt-4">
              <DataTable columns={["Date", "Purpose", "Amount", "Remarks"]} rows={driverTransactions.map((transaction) => [transaction.date, transaction.purpose, money(transaction.amount), transaction.remarks || "-"])} />
            </div>
          )}
        </div>
      </Panel>

      <TripBiltyPanel trip={trip} bilty={bilty} token={token} onSaved={onBiltySaved} />

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Invoice" action={<Status value={trip.invoiceStatus || (invoice ? "Generated" : "Not Generated")} />}>
          <div className="grid gap-4 md:grid-cols-2">
            <Info label="Invoice Number" value={invoice?.invoiceNumber || "Not generated"} />
            <Info label="Invoice Date" value={invoice?.invoiceDate || "-"} />
            <Info label="Generated PDF" value={invoice?.pdfPath || "-"} />
            <Info label="Email Status" value={invoice?.emailStatus || "Not sent"} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={onGenerateInvoice} className="rounded-md bg-tower-primary px-3 py-2 text-sm font-medium text-white">Generate Invoice</button>
            <button onClick={() => { if (invoice?.pdfKey) void openSignedUpload(token, invoice.pdfKey, false, `${invoice.invoiceNumber}.pdf`); else onGenerateInvoice(); }} className="rounded-md border border-tower-border px-3 py-2 text-sm">Preview Invoice</button>
            <button disabled={!invoice?.pdfKey} onClick={() => { if (invoice?.pdfKey) void openSignedUpload(token, invoice.pdfKey, true, `${invoice.invoiceNumber}.pdf`); }} className="rounded-md border border-tower-border px-3 py-2 text-sm disabled:opacity-40">Download Invoice</button>
            <button onClick={onGenerateInvoice} className="rounded-md border border-tower-border px-3 py-2 text-sm">Send Invoice</button>
          </div>
        </Panel>

        <Panel title="Payment" action={<Status value={trip.paymentStatus || invoice?.status || "Pending"} />}>
          <div className="grid gap-4 md:grid-cols-3">
            <Info label="Invoice Amount" value={money(invoiceAmount)} />
            <NumberField label="Amount Received" value={received} onChange={setReceived} />
            <Info label="Outstanding Amount" value={money(outstanding)} />
          </div>
          <div className="mt-5 rounded-md border border-tower-border bg-[#0B1220] p-3 text-sm text-tower-muted">
            Payment History: {received > 0 ? `${money(received)} recorded against this invoice.` : "No payments recorded yet."}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => onPaymentStatus(received <= 0 ? "Pending" : received >= invoiceAmount ? "Paid" : "Partial", received)} className="rounded-md border border-tower-border px-3 py-2 text-sm">Record Payment</button>
            <button onClick={() => { setReceived(invoiceAmount); onPaymentStatus("Paid", invoiceAmount); }} className="rounded-md bg-tower-success/90 px-3 py-2 text-sm font-medium text-white">Mark Paid</button>
            <button onClick={() => { setReceived(0); onPaymentStatus("Pending", 0); }} className="rounded-md border border-tower-border px-3 py-2 text-sm">Mark Unpaid</button>
          </div>
        </Panel>
      </section>
    </div>
  );
}

function TripBiltyPanel({ trip, bilty, token, onSaved }: { trip: LocalTrip; bilty?: Bilty; token?: string; onSaved: () => void | Promise<void> }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState("");
  const hasBilty = !!bilty && bilty.status !== "Missing";
  const download = async () => {
    const file = bilty?.files?.[0];
    if (!file) return;
    const { url } = await downloadBilty(token, file.key, file.fileName);
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const tripForModal: Trip = {
    ...trip,
    customer: trip.customer,
    vehicle: trip.vehicle,
    driver: trip.driver
  };

  return (
    <Panel title="Bilty Information" action={<Status value={hasBilty ? "Bilty Uploaded" : "Bilty Missing"} />}>
      {error && <div className="mb-4 rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Info label="Bilty Number" value={hasBilty ? bilty?.biltyNumber : "Not uploaded"} />
        <Info label="Upload Date" value={hasBilty ? bilty?.uploadDate : "-"} />
        <Info label="Verification Status" value={hasBilty ? bilty?.verificationStatus : "Pending Verification"} />
        <Info label="Remarks" value={hasBilty ? bilty?.remarks || "-" : "Completed trips appear in Missing Bilty tracking until uploaded."} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={() => setUploadOpen(true)} className="rounded-md bg-tower-primary px-3 py-2 text-sm font-medium text-white">{hasBilty ? "Edit Bilty" : "Upload Bilty"}</button>
        <button disabled={!hasBilty} onClick={() => setPreviewOpen(true)} className="rounded-md border border-tower-border px-3 py-2 text-sm disabled:opacity-40">View Bilty</button>
        <button disabled={!hasBilty || !bilty?.files?.length} onClick={() => { void download().catch((err) => setError(err instanceof Error ? err.message : "Download failed.")); }} className="rounded-md border border-tower-border px-3 py-2 text-sm disabled:opacity-40">Download Bilty</button>
      </div>
      {uploadOpen && <BiltyUploadModal bilty={hasBilty ? bilty : undefined} trips={[tripForModal]} token={token} onClose={() => setUploadOpen(false)} onSaved={async () => { await onSaved(); setUploadOpen(false); }} />}
      {previewOpen && bilty && <BiltyPreviewDrawer bilty={bilty} token={token} onClose={() => setPreviewOpen(false)} />}
    </Panel>
  );
}

function InvoicePreviewModal({ trip, token, existingNumber, onClose, onGenerated }: { trip: LocalTrip; token?: string; existingNumber?: string; onClose: () => void; onGenerated: (invoiceNumber: string, sent: boolean) => void | Promise<void> }) {
  const [recipient, setRecipient] = useState<"Consigner" | "Consignee">(trip.payer || "Consigner");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const recipientName = recipient === "Consigner" ? trip.consignorName : trip.consigneeName;
  const freight = tripFreightBreakdown(trip);

  const generate = async (send: boolean) => {
    setLoading(true);
    setError("");
    try {
      const result = await generateInvoiceApi(token, trip.id);
      await onGenerated(result.invoiceNumber, send);
    } catch (err) {
      if (trip.id.startsWith("local-")) {
        await onGenerated(existingNumber || `NPFC/${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`, send);
      } else {
        setError(err instanceof Error ? err.message : "Invoice generation failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-lg border border-tower-border bg-tower-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-tower-border px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold">Invoice Preview</h3>
            <p className="text-sm text-tower-muted">Invoice engine integration preview. Template design will be supplied separately.</p>
          </div>
          <button onClick={onClose} className="rounded-md border border-tower-border px-3 py-2 text-sm text-tower-muted hover:text-white">Close</button>
        </div>
        <div className="space-y-5 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Info label="Invoice Number" value={existingNumber || "Auto generated on PDF creation"} />
            <Info label="Trip Number" value={trip.tripNumber} />
            <Info label="Weight (MT)" value={freight.weightMt.toFixed(2)} />
            <Info label="Rate Per MT" value={money(freight.ratePerMt)} />
            <Info label="Total Freight" value={money(freight.totalFreight)} />
            <Info label="Recipient" value={recipientName || ""} />
          </div>
          <div className="rounded-md border border-tower-border bg-[#0B1220] p-4">
            <div className="mb-3 text-sm text-tower-muted">Recipient Selection</div>
            <div className="flex gap-4 text-sm">
              {(["Consigner", "Consignee"] as const).map((option) => (
                <label key={option} className="flex items-center gap-2">
                  <input type="radio" checked={recipient === option} onChange={() => setRecipient(option)} />
                  {option}
                </label>
              ))}
            </div>
          </div>
          {error && <div className="rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{error}</div>}
        </div>
        <div className="flex justify-end gap-3 border-t border-tower-border px-6 py-4">
          <button disabled={loading} onClick={() => generate(false)} className="rounded-md border border-tower-border px-4 py-2 text-sm disabled:opacity-40">Generate PDF</button>
          <button disabled={loading} onClick={() => generate(true)} className="rounded-md bg-tower-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Generate & Send</button>
        </div>
      </div>
    </div>
  );
}

function DriverModule({ drivers, trips, vehicles, customers, invoices, attendance, driverTransactions, token, refreshData, onDriverExpenseSave }: { drivers: Driver[]; trips: Trip[]; vehicles: Vehicle[]; customers: Customer[]; invoices: Invoice[]; attendance: AttendanceEntry[]; driverTransactions: DriverTransaction[]; token?: string; refreshData: () => Promise<void>; onDriverExpenseSave: (transaction: DriverTransaction) => void }) {
  const [localDrivers, setLocalDrivers] = useState<DriverProfile[]>(() => drivers.map(enrichDriverProfile));
  const [documents, setDocuments] = useState<DriverDocument[]>(() => drivers.flatMap(driverDocumentsFromApi));
  const [selectedDriverId, setSelectedDriverId] = useState<string>();
  const [selectedTrip, setSelectedTrip] = useState<LocalTrip>();
  const [addOpen, setAddOpen] = useState(false);
  const [editDriver, setEditDriver] = useState<DriverProfile>();
  const [deletingDriverId, setDeletingDriverId] = useState<string>();
  const [deleteError, setDeleteError] = useState("");
  const [attendancePreset, setAttendancePreset] = useState("Current Month");
  const [attendanceMonth, setAttendanceMonth] = useState(today().slice(0, 7));
  const selectedDriver = localDrivers.find((driver) => driver.id === selectedDriverId);
  const attendanceRange = getDriverMonthRange(attendancePreset, attendanceMonth);

  useEffect(() => {
    setLocalDrivers(drivers.map(enrichDriverProfile));
    setDocuments(drivers.flatMap(driverDocumentsFromApi));
  }, [drivers]);

  const resolvedDrivers = localDrivers.map((driver) => {
    const status = resolveDriverStatus(driver, trips);
    const currentTrip = getCurrentDriverTrip(driver.id, trips);
    const driverTrips = trips.filter((trip) => trip.driverId === driver.id);
    const attendanceSummary = calculateAttendance(driver, driverTrips, attendanceRange.from, attendanceRange.to, attendance.filter((entry) => entry.driverId === driver.id));
    return { ...driver, status, currentVehicle: vehicles.find((vehicle) => vehicle.id === currentTrip?.vehicleId)?.number || "-", attendance: attendanceSummary };
  });

  if (selectedTrip) {
    return (
      <TripDetailsPage
        trip={selectedTrip}
        invoice={invoices.find((invoice) => invoice.tripId === selectedTrip.id)}
        onBack={() => setSelectedTrip(undefined)}
        onWorkflow={() => undefined}
        onGenerateInvoice={() => undefined}
        onPaymentStatus={() => undefined}
        driverTransactions={driverTransactions.filter((transaction) => transaction.tripId === selectedTrip.id)}
        onDriverExpenseSave={onDriverExpenseSave}
      />
    );
  }

  if (selectedDriver) {
    return (
      <DriverDetailsPage
        driver={{ ...selectedDriver, status: resolveDriverStatus(selectedDriver, trips) }}
        trips={trips.filter((trip) => trip.driverId === selectedDriver.id)}
        vehicles={vehicles}
        customers={customers}
        documents={documents.filter((document) => document.driverId === selectedDriver.id)}
        transactions={driverTransactions.filter((transaction) => transaction.driverId === selectedDriver.id)}
        onBack={() => setSelectedDriverId(undefined)}
        onDocumentSave={async (document, file) => {
          if (file) await uploadFile(token, "driver", selectedDriver.id, file, driverUploadType(document.type), false);
          await refreshData();
        }}
        onDocumentReplace={async (_documentId, patch, file) => {
          if (file) await uploadFile(token, "driver", selectedDriver.id, file, driverUploadType(patch.type || "Document"), true);
          await refreshData();
        }}
        onDocumentDelete={async (document) => {
          if (!window.confirm(`Delete ${document.type}? This removes the file from S3.`)) return;
          await deleteUpload(token, document.id, "driver", selectedDriver.id);
          await refreshData();
        }}
        onOpenTrip={(trip) => setSelectedTrip(enrichTrip(trip, invoices, 0))}
        token={token}
      />
    );
  }

  const expiringSoon = localDrivers.filter((driver) => daysUntil(driver.licenseExpiry) < 30).length;
  const activeAttendanceRows = resolvedDrivers.filter((driver) => !["Inactive", "Leave"].includes(driver.status));
  const averageAttendance = averageAttendancePercent(activeAttendanceRows.map((driver) => driver.attendance));
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Kpi title="Total Drivers" value={localDrivers.length} icon={UserRound} tone="primary" />
        <Kpi title="Available Drivers" value={resolvedDrivers.filter((driver) => driver.status === "Available").length} icon={ShieldCheck} tone="success" />
        <Kpi title="On Trip Drivers" value={resolvedDrivers.filter((driver) => driver.status === "On Trip").length} icon={Route} tone="warning" />
        <Kpi title="License Expiring Soon" value={expiringSoon} icon={AlertTriangle} tone={expiringSoon ? "danger" : "success"} />
        <Kpi title="Average Driver Attendance" value={`${averageAttendance}%`} icon={Gauge} tone="success" />
      </section>

      <Panel
        title="Driver Management"
        action={<div className="flex items-center gap-3"><span>{resolvedDrivers.length} records</span><button onClick={() => setAddOpen(true)} className="rounded-md bg-tower-primary px-3 py-2 text-xs font-medium text-white">+ Add Driver</button></div>}
      >
        {deleteError && <div className="mb-4 rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{deleteError}</div>}
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <Segment value={attendancePreset} onChange={setAttendancePreset} values={["Current Month", "Previous Month", "Custom Month"]} />
            {attendancePreset === "Custom Month" && <div className="max-w-xs"><MonthInput label="Month" value={attendanceMonth} onChange={setAttendanceMonth} /></div>}
          </div>
          <div className="self-end text-sm text-tower-muted">License alerts: {expiringSoon}</div>
        </div>
        <DataTable
          columns={["Driver Name", "Mobile Number", "Current Vehicle", "Attendance This Month", "License Expiry", "Status", "Actions"]}
          rows={resolvedDrivers.map((driver) => [
            driver.name,
            driver.mobile,
            driver.currentVehicle,
            <span key={`${driver.id}-attendance`} title="Workdays / Days Passed This Month">{formatAttendance(driver.attendance)}</span>,
            <ExpiryDate key={`${driver.id}-license`} value={driver.licenseExpiry} />,
            <Status key={`${driver.id}-status`} value={driver.status} />,
            <div key={`${driver.id}-actions`} className="flex flex-wrap gap-2">
              <button onClick={() => setSelectedDriverId(driver.id)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-1.5 text-xs text-white hover:border-tower-primary/60">View More</button>
              <button onClick={() => setEditDriver(driver)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-1.5 text-xs text-white hover:border-tower-primary/60">Edit</button>
              <button
                disabled={deletingDriverId === driver.id}
                onClick={async () => {
                  if (!window.confirm("Are you sure you want to delete this Driver?")) return;
                  setDeleteError("");
                  setDeletingDriverId(driver.id);
                  try {
                    await deleteDriver(token, driver.id);
                    await refreshData();
                  } catch (error) {
                    setDeleteError(error instanceof Error ? error.message : "Driver could not be deleted.");
                  } finally {
                    setDeletingDriverId(undefined);
                  }
                }}
                className="rounded-md border border-tower-danger/50 bg-tower-danger/10 px-3 py-1.5 text-xs text-red-200 disabled:opacity-40"
              >
                {deletingDriverId === driver.id ? "Deleting" : "Delete"}
              </button>
            </div>
          ])}
        />
      </Panel>

      <AttendanceManagementPanel
        drivers={localDrivers}
        entries={attendance}
        token={token}
        refreshData={refreshData}
        defaultDate={attendanceRange.to}
      />

      {addOpen && (
        <AddDriverModal
          onClose={() => setAddOpen(false)}
          onSave={async (driver, docs, files) => {
            const created = await createDriver(token, {
              name: driver.name,
              phone: driver.mobile,
              licenseNumber: driver.licenseNumber,
              licenseExpiry: driver.licenseExpiry
            }) as any;
            const driverId = String(created?._id || created?.id || "");
            if (driverId) {
              await Promise.all(docs.map((document) => {
                const file = files[document.type];
                return file ? uploadFile(token, "driver", driverId, file, driverUploadType(document.type), true) : Promise.resolve();
              }));
            }
            await refreshData();
            setAddOpen(false);
          }}
        />
      )}
      {editDriver && (
        <AddDriverModal
          driver={editDriver}
          onClose={() => setEditDriver(undefined)}
          onSave={async (driver) => {
            await updateDriver(token, editDriver.id, {
              name: driver.name,
              phone: driver.mobile,
              licenseNumber: driver.licenseNumber,
              licenseExpiry: driver.licenseExpiry
            });
            await refreshData();
            setEditDriver(undefined);
          }}
        />
      )}
    </div>
  );
}

function AttendanceManagementPanel({ drivers, entries, token, refreshData, defaultDate }: { drivers: DriverProfile[]; entries: AttendanceEntry[]; token?: string; refreshData: () => Promise<void>; defaultDate: string }) {
  const [driverId, setDriverId] = useState(drivers[0]?.id || "");
  const [date, setDate] = useState(defaultDate || today());
  const [status, setStatus] = useState<AttendanceStatus>("Present");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<AttendanceEntry>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const recentEntries = entries.slice(0, 12);

  useEffect(() => {
    if (!driverId && drivers[0]?.id) setDriverId(drivers[0].id);
  }, [driverId, drivers]);

  const reset = () => {
    setEditing(undefined);
    setStatus("Present");
    setRemarks("");
  };

  const persist = async (bulk = false) => {
    if (!driverId && !bulk) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const targets = bulk ? drivers.map((driver) => driver.id) : [driverId];
      await Promise.all(targets.map((id) => saveAttendance(token, { driverId: id, date, status, remarks })));
      await refreshData();
      setMessage(bulk ? "Bulk attendance updated." : "Attendance entry saved.");
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Attendance could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (entry: AttendanceEntry) => {
    setEditing(entry);
    setDriverId(entry.driverId);
    setDate(entry.date);
    setStatus(entry.status);
    setRemarks(entry.remarks || "");
  };

  const updateExisting = async () => {
    if (!editing) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await updateAttendance(token, editing.id, { date, status, remarks });
      await refreshData();
      setMessage("Attendance entry updated.");
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Attendance could not be updated.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entry: AttendanceEntry) => {
    if (!window.confirm(`Remove attendance entry for ${entry.driverName || "driver"} on ${entry.date}?`)) return;
    setError("");
    try {
      await deleteAttendance(token, entry.id);
      await refreshData();
      setMessage("Attendance entry removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Attendance could not be removed.");
    }
  };

  return (
    <Panel title="Attendance Management" action="Manual control">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.5fr_auto]">
        <FieldSelect label="Driver" value={driverId} onChange={setDriverId} options={drivers.map((driver) => ({ label: driver.name, value: driver.id }))} />
        <DateInput label="Date" value={date} onChange={setDate} />
        <FieldSelect label="Status" value={status} onChange={(value) => setStatus(value as AttendanceStatus)} options={["Present", "Absent"].map((item) => ({ label: item, value: item }))} />
        <TextField label="Remarks" value={remarks} onChange={setRemarks} />
        <div className="flex items-end gap-2">
          {editing ? (
            <button disabled={saving} onClick={() => { void updateExisting(); }} className="rounded-md bg-tower-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-40">{saving ? "Saving" : "Save Edit"}</button>
          ) : (
            <button disabled={saving || !driverId} onClick={() => { void persist(false); }} className="rounded-md bg-tower-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-40">{saving ? "Saving" : "Mark"}</button>
          )}
          <button disabled={saving || !drivers.length} onClick={() => { void persist(true); }} className="rounded-md border border-tower-border px-3 py-2 text-sm text-white disabled:opacity-40">Bulk</button>
        </div>
      </div>
      {message && <div className="mt-4 rounded-md border border-tower-success/40 bg-tower-success/10 px-3 py-2 text-sm text-green-200">{message}</div>}
      {error && <div className="mt-4 rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      <div className="mt-5">
        <DataTable
          columns={["Driver", "Date", "Status", "Remarks", "Actions"]}
          rows={recentEntries.map((entry) => [
            entry.driverName || drivers.find((driver) => driver.id === entry.driverId)?.name || "-",
            entry.date,
            <Status key={`${entry.id}-status`} value={entry.status} />,
            entry.remarks || "-",
            <div key={`${entry.id}-actions`} className="flex gap-2">
              <button onClick={() => startEdit(entry)} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-white">Edit</button>
              <button onClick={() => { void remove(entry); }} className="rounded-md border border-tower-danger/50 bg-tower-danger/10 px-3 py-1.5 text-xs text-red-200">Remove</button>
            </div>
          ])}
        />
      </div>
    </Panel>
  );
}

function DriverDetailsPage({ driver, trips, vehicles, customers, documents, transactions, onBack, onDocumentSave, onDocumentReplace, onDocumentDelete, onOpenTrip, token }: { driver: DriverProfile; trips: Trip[]; vehicles: Vehicle[]; customers: Customer[]; documents: DriverDocument[]; transactions: DriverTransaction[]; onBack: () => void; onDocumentSave: (document: DriverDocument, file?: File) => void | Promise<void>; onDocumentReplace: (documentId: string, patch: Partial<DriverDocument>, file?: File) => void | Promise<void>; onDocumentDelete: (document: DriverDocument) => void | Promise<void>; onOpenTrip: (trip: Trip) => void; token?: string }) {
  const [tab, setTab] = useState("Overview");
  const [monthPreset, setMonthPreset] = useState("Current Month");
  const [customMonth, setCustomMonth] = useState(today().slice(0, 7));
  const [tripPreset, setTripPreset] = useState("Current Month");
  const [tripFrom, setTripFrom] = useState(monthBounds().from);
  const [tripTo, setTripTo] = useState(monthBounds().to);
  const [documentModal, setDocumentModal] = useState(false);
  const [replaceDocument, setReplaceDocument] = useState<DriverDocument>();
  const currentTrip = getCurrentDriverTrip(driver.id, trips);
  const currentVehicle = vehicles.find((vehicle) => vehicle.id === currentTrip?.vehicleId);
  const monthRange = getDriverMonthRange(monthPreset, customMonth);
  const monthTrips = trips.filter((trip) => isWithinRange(trip.tripDate, monthRange.from, monthRange.to));
  const selectedAttendance = calculateAttendance(driver, trips, monthRange.from, monthRange.to);
  const currentMonthRange = monthBounds();
  const previousMonthRange = monthBounds(-1);
  const currentMonthAttendance = calculateAttendance(driver, trips, currentMonthRange.from, currentMonthRange.to);
  const previousMonthAttendance = calculateAttendance(driver, trips, previousMonthRange.from, previousMonthRange.to);
  const sixMonthAverageAttendance = calculateAverageAttendance(driver, trips, 6);
  const completedTrips = trips.filter((trip) => ["Completed", "Closed", "Paid"].includes(trip.status));
  const lastTrip = [...trips].sort((a, b) => +new Date(b.tripDate) - +new Date(a.tripDate))[0];
  const tripRange = getDriverTripRange(tripPreset, tripFrom, tripTo);
  const filteredTripHistory = trips.filter((trip) => isWithinRange(trip.tripDate, tripRange.from, tripRange.to));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower lg:flex-row lg:items-center lg:justify-between">
        <div>
          <button onClick={onBack} className="mb-3 rounded-md border border-tower-border px-3 py-1.5 text-sm text-tower-muted hover:text-white">Back to Drivers</button>
          <h3 className="text-2xl font-semibold">{driver.name}</h3>
          <p className="text-sm text-tower-muted">{driver.mobile}</p>
        </div>
        <div className="grid gap-2 text-sm md:grid-cols-3">
          <Info label="Current Status" value={<Status value={driver.status} />} />
          <Info label="Current Vehicle" value={currentVehicle?.number || "-"} />
          <Info label="License Expiry" value={<ExpiryDate value={driver.licenseExpiry} />} />
        </div>
      </div>

      <div className="flex overflow-x-auto rounded-lg border border-tower-border bg-tower-card p-1">
        {["Overview", "Documents", "Salary & Advances", "Trip History"].map((item) => (
          <button key={item} onClick={() => setTab(item)} className={cn("min-w-fit flex-1 rounded px-4 py-2 text-sm text-tower-muted", tab === item && "bg-tower-primary text-white")}>{item}</button>
        ))}
      </div>

      {tab === "Overview" && (
        <Panel title="Overview" action={<Segment value={monthPreset} onChange={setMonthPreset} values={["Current Month", "Previous Month", "Custom Month"]} />}>
          {monthPreset === "Custom Month" && <div className="mb-4 max-w-xs"><MonthInput label="Month" value={customMonth} onChange={setCustomMonth} /></div>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Info label="Driver Name" value={driver.name} />
            <Info label="Mobile Number" value={driver.mobile} />
            <Info label="Alternate Mobile" value={driver.alternateMobile || "-"} />
            <Info label="Address" value={driver.address} />
            <Info label="Date of Birth" value={driver.dateOfBirth || "-"} />
            <Info label="Joining Date" value={driver.joiningDate || "-"} />
            <Info label="Current Vehicle" value={currentVehicle?.number || "-"} />
            <Info label="Current Status" value={<Status value={driver.status} />} />
            <Info label="License Number" value={driver.licenseNumber} />
            <Info label="License Expiry" value={<ExpiryDate value={driver.licenseExpiry} />} />
            <Info label="Emergency Contact" value={`${driver.emergencyContactName || "-"} ${driver.emergencyContactNumber || ""}`} />
            <Info label="Bank Details" value={`${driver.bankName || "-"} ${driver.accountNumber || ""} ${driver.ifscCode || ""}`} />
            <Info label="Monthly Salary" value={money(driver.monthlySalary || 0)} />
            <Info label="Total Trips Completed" value={completedTrips.length} />
            <Info label="Selected Month Attendance" value={`${selectedAttendance.workDays} / ${selectedAttendance.totalDays} Days`} />
            <Info label="Current Month Attendance" value={`${currentMonthAttendance.workDays} / ${currentMonthAttendance.totalDays} Days`} />
            <Info label="Previous Month Attendance" value={`${previousMonthAttendance.workDays} / ${previousMonthAttendance.totalDays} Days`} />
            <Info label="Last 6 Month Average Attendance" value={`${sixMonthAverageAttendance}%`} />
            <Info label="Current Month Trip Count" value={monthTrips.length} />
            <Info label="Last Trip Date" value={lastTrip?.tripDate || "-"} />
          </div>
        </Panel>
      )}

      {tab === "Documents" && (
        <Panel title="Documents" action={<button onClick={() => setDocumentModal(true)} className="rounded-md bg-tower-primary px-3 py-2 text-xs font-medium text-white">+ Upload Document</button>}>
          <DataTable columns={["Document Type", "Uploaded Date", "Actions"]} rows={documents.map((document) => [
            document.type,
              document.uploadedDate,
              <div key={`${document.id}-actions`} className="flex min-w-[260px] flex-wrap gap-2">
                <button onClick={() => { void openSignedUpload(token, document.id, false, document.fileName); }} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-white">Preview</button>
                <button onClick={() => { void openSignedUpload(token, document.id, true, document.fileName); }} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-white">Download</button>
                <button onClick={() => setReplaceDocument(document)} className="rounded-md bg-tower-primary/90 px-3 py-1.5 text-xs font-medium text-white">Replace</button>
                <button onClick={() => { void onDocumentDelete(document); }} className="rounded-md border border-tower-danger/50 bg-tower-danger/10 px-3 py-1.5 text-xs text-red-200">Delete</button>
            </div>
          ])} />
        </Panel>
      )}

      {tab === "Salary & Advances" && (
        <div className="space-y-6">
          <Panel title="Monthly Salary" action="Auto month status">
            <div className="grid gap-4 md:grid-cols-3">
              <Info label="Fixed Monthly Salary" value={money(driver.monthlySalary || 0)} />
              <Info label="Current Month Salary Status" value={<Status value="Pending" />} />
              <Info label="Previous Salary Records" value="No payroll records yet" />
            </div>
          </Panel>
          <Panel title="Trip Advances" action={`${transactions.length} records`}>
            <DataTable columns={["Date", "Trip ID", "Route", "Purpose", "Amount"]} rows={transactions.map((transaction) => [transaction.date, transaction.tripNumber, transaction.route, transaction.purpose, money(transaction.amount)])} />
          </Panel>
        </div>
      )}

      {tab === "Trip History" && (
        <Panel title="Trip History" action={<Segment value={tripPreset} onChange={setTripPreset} values={["Current Month", "Previous Month", "Custom Range"]} />}>
          {tripPreset === "Custom Range" && <div className="mb-4 grid gap-3 md:grid-cols-2"><DateInput label="From" value={tripFrom} onChange={setTripFrom} /><DateInput label="To" value={tripTo} onChange={setTripTo} /></div>}
          <DataTable columns={["Trip ID", "Route", "Customer", "Vehicle", "Freight Amount", "Trip Date", "Status"]} rows={filteredTripHistory.map((trip) => [
            <button key={trip.id} onClick={() => onOpenTrip(trip)} className="text-left font-medium text-tower-primary hover:text-blue-300">{trip.tripNumber}</button>,
            `${trip.loadingPoint} to ${trip.unloadingPoint}`,
            customers.find((customer) => customer.id === trip.customerId)?.name || trip.consignorName,
            vehicles.find((vehicle) => vehicle.id === trip.vehicleId)?.number || "-",
            money(trip.freightAmount),
            trip.tripDate,
            <Status key={`${trip.id}-status`} value={trip.status} />
          ])} />
        </Panel>
      )}

      {documentModal && <DriverDocumentModal driverId={driver.id} onClose={() => setDocumentModal(false)} onSave={async (document, file) => { await onDocumentSave(document, file); setDocumentModal(false); }} />}
      {replaceDocument && <DriverDocumentModal driverId={driver.id} document={replaceDocument} onClose={() => setReplaceDocument(undefined)} onSave={async (document, file) => { await onDocumentReplace(replaceDocument.id, document, file); setReplaceDocument(undefined); }} />}
    </div>
  );
}

function AddDriverModal({ driver, onClose, onSave }: { driver?: DriverProfile; onClose: () => void; onSave: (driver: DriverProfile, documents: DriverDocument[], files: Record<string, File>) => void | Promise<void> }) {
  const [name, setName] = useState(driver?.name || "");
  const [mobile, setMobile] = useState(driver?.mobile || "");
  const [alternateMobile, setAlternateMobile] = useState(driver?.alternateMobile || "");
  const [address, setAddress] = useState(driver?.address || "");
  const [dateOfBirth, setDateOfBirth] = useState(driver?.dateOfBirth || today(-9000));
  const [joiningDate, setJoiningDate] = useState(driver?.joiningDate || today());
  const [licenseNumber, setLicenseNumber] = useState(driver?.licenseNumber || "");
  const [licenseExpiry, setLicenseExpiry] = useState(driver?.licenseExpiry || today(365));
  const [emergencyContactName, setEmergencyContactName] = useState(driver?.emergencyContactName || "");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState(driver?.emergencyContactNumber || "");
  const [bankName, setBankName] = useState(driver?.bankName || "");
  const [accountNumber, setAccountNumber] = useState(driver?.accountNumber || "");
  const [ifscCode, setIfscCode] = useState(driver?.ifscCode || "");
  const [monthlySalary, setMonthlySalary] = useState(driver?.monthlySalary || 0);
  const [files, setFiles] = useState<Record<string, File>>({});
  const driverId = `driver-${Date.now()}`;

  const handleFile = (type: string, file?: File) => {
    if (!file) return;
    setFiles((rows) => ({ ...rows, [type]: file }));
  };

  const uploadField = (label: string, type: string) => (
    <label className="block text-sm text-tower-muted">
      {label}
      <input type="file" accept="application/pdf,image/*" onChange={(event) => handleFile(type, event.target.files?.[0])} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white" />
    </label>
  );

  const save = () => {
    const docs = Object.entries(files).map(([type, file]) => ({ id: `driver-doc-${Date.now()}-${type}`, driverId, type, uploadedDate: today(), fileName: file.name, history: [] }));
    onSave({
      id: driver?.id || driverId,
      name,
      mobile,
      alternateMobile,
      address,
      dateOfBirth,
      joiningDate,
      licenseNumber,
      licenseExpiry,
      emergencyContactName,
      emergencyContactNumber,
      bankName,
      accountNumber,
      ifscCode,
      monthlySalary,
      status: "Available"
    }, docs, files);
  };

  return (
    <ModalShell title={driver ? "Edit Driver" : "Add Driver"} subtitle="Create a driver profile with compliance, bank, and document details." onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Driver Name" value={name} onChange={setName} />
        <TextField label="Mobile Number" value={mobile} onChange={setMobile} />
        <TextField label="Alternate Mobile Number" value={alternateMobile} onChange={setAlternateMobile} />
        <TextField label="Address" value={address} onChange={setAddress} />
        <DateInput label="Date of Birth" value={dateOfBirth} onChange={setDateOfBirth} />
        <DateInput label="Joining Date" value={joiningDate} onChange={setJoiningDate} />
        <TextField label="License Number" value={licenseNumber} onChange={setLicenseNumber} />
        <DateInput label="License Expiry Date" value={licenseExpiry} onChange={setLicenseExpiry} />
        <TextField label="Emergency Contact Name" value={emergencyContactName} onChange={setEmergencyContactName} />
        <TextField label="Emergency Contact Number" value={emergencyContactNumber} onChange={setEmergencyContactNumber} />
        <TextField label="Bank Name" value={bankName} onChange={setBankName} />
        <TextField label="Account Number" value={accountNumber} onChange={setAccountNumber} />
        <TextField label="IFSC Code" value={ifscCode} onChange={setIfscCode} />
        <NumberField label="Monthly Salary" value={monthlySalary} onChange={setMonthlySalary} />
        {uploadField("Driver Photo", "Driver Photo")}
        {uploadField("Driving License", "Driving License")}
        {uploadField("Aadhaar Card", "Aadhaar Card")}
        {uploadField("PAN Card", "PAN Card")}
        <div className="md:col-span-2">{uploadField("Other Documents", "Other")}</div>
      </div>
      <ModalActions onClose={onClose} onSave={save} disabled={!name.trim() || !mobile.trim() || !licenseNumber.trim()} label="Save Driver" />
    </ModalShell>
  );
}

function DriverDocumentModal({ driverId, document, onClose, onSave }: { driverId: string; document?: DriverDocument; onClose: () => void; onSave: (document: DriverDocument, file?: File) => void | Promise<void> }) {
  const initialType = document?.type && driverDocumentTypes.includes(document.type) ? document.type : document?.type ? "Other" : "Driving License";
  const [type, setType] = useState(initialType);
  const [customType, setCustomType] = useState(document?.type && !driverDocumentTypes.includes(document.type) ? document.type : "");
  const [fileName, setFileName] = useState(document?.fileName || "");
  const [fileUrl, setFileUrl] = useState(document?.fileUrl || "");
  const [file, setFile] = useState<File>();
  const resolvedType = type === "Other" ? customType.trim() : type;

  const handleFile = (file?: File) => {
    if (!file) return;
    setFile(file);
    setFileName(file.name);
    setFileUrl(URL.createObjectURL(file));
  };

  return (
    <ModalShell title={document ? "Replace Driver Document" : "Upload Driver Document"} subtitle={document ? "The previous file remains archived in document history." : "Upload driver compliance documents for preview and download."} onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <FieldSelect label="Document Type" value={type} onChange={setType} options={driverDocumentTypes.map((item) => ({ label: item, value: item }))} />
        {type === "Other" && <TextField label="Document Name" value={customType} onChange={setCustomType} />}
        <label className="block text-sm text-tower-muted md:col-span-2">
          Upload File
          <input type="file" accept="application/pdf,image/*" onChange={(event) => handleFile(event.target.files?.[0])} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white" />
        </label>
      </div>
      {fileUrl && (
        <div className="mt-4 rounded-md border border-tower-border bg-[#0B1220] p-3">
          <div className="mb-2 text-sm text-tower-muted">Document Preview</div>
          {fileName.toLowerCase().endsWith(".pdf") ? <iframe src={fileUrl} className="h-72 w-full rounded-md border border-tower-border" /> : <img src={fileUrl} className="max-h-72 rounded-md border border-tower-border object-contain" />}
        </div>
      )}
      {document?.history.length ? <div className="mt-4 text-xs text-tower-muted">Archived versions: {document.history.length}</div> : null}
      <ModalActions onClose={onClose} onSave={() => onSave({ id: document?.id || `driver-doc-${Date.now()}`, driverId, type: resolvedType, uploadedDate: today(), fileName: fileName || `${resolvedType || "document"}.pdf`, fileUrl, history: document?.history || [] }, file)} disabled={!resolvedType} label="Save Document" />
    </ModalShell>
  );
}

type VehicleDocument = {
  id: string;
  vehicleId: string;
  type: string;
  expiryDate: string;
  uploadedDate: string;
  fileName: string;
  fileUrl?: string;
  history: Array<{ fileName: string; expiryDate: string; uploadedDate: string }>;
};

type DieselEntry = {
  id: string;
  vehicleId: string;
  date: string;
  pump: string;
  amount: number;
  source: "Manual Entry" | "Trip Expense";
  remarks?: string;
  receiptName?: string;
  receiptFile?: File;
};

type MaintenanceEntry = {
  id: string;
  vehicleId: string;
  date: string;
  repairType: string;
  workshop: string;
  amount: number;
  remarks?: string;
  billName?: string;
  billUrl?: string;
  billFile?: File;
};

type VehicleExpenseEntry = {
  id: string;
  vehicleId: string;
  type: "Diesel" | "Maintenance";
  amount: number;
  status: "Unpaid";
  source: "Vehicle Module";
  date: string;
};

const vehicleStatuses = ["Available", "Assigned", "Loading", "In Transit", "Unloading", "Maintenance"];
const documentTypes = ["Insurance", "PUC", "Fitness", "Permit", "Road Tax", "RC", "Other"];
const petrolPumps = ["HP Pump Indore", "HP Pump Dewas", "Indian Oil Bypass", "Bharat Petroleum Ring Road"];
const vehicleTabs = ["Overview", "Documents", "Diesel", "Maintenance", "Trip History"];

function VehicleModule({ vehicles, trips, drivers, invoices, token, refreshData }: { vehicles: Vehicle[]; trips: Trip[]; drivers: Driver[]; invoices: Invoice[]; token?: string; refreshData: () => Promise<void> }) {
  const [localVehicles, setLocalVehicles] = useState(vehicles);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>();
  const [selectedTrip, setSelectedTrip] = useState<LocalTrip>();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [addOpen, setAddOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle>();
  const [deletingVehicleId, setDeletingVehicleId] = useState<string>();
  const [deleteError, setDeleteError] = useState("");
  const [documents, setDocuments] = useState<VehicleDocument[]>(() => vehicles.flatMap(vehicleDocumentsFromApi));
  const [dieselEntries, setDieselEntries] = useState<DieselEntry[]>(() => seedDieselEntries(trips));
  const [maintenanceEntries, setMaintenanceEntries] = useState<MaintenanceEntry[]>(() => seedMaintenanceEntries(trips));
  const [expenses, setExpenses] = useState<VehicleExpenseEntry[]>([]);

  const selectedVehicle = localVehicles.find((vehicle) => vehicle.id === selectedVehicleId);
  const filteredVehicles = localVehicles.filter((vehicle) => {
    const text = `${vehicle.number} ${vehicle.type} ${vehicle.ownerName}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (statusFilter === "All" || vehicle.status === statusFilter);
  });
  const expiringSoon = documents.filter((document) => ["Insurance", "PUC", "Fitness", "Permit", "Road Tax"].includes(document.type) && daysUntil(document.expiryDate) < 30).length;

  useEffect(() => {
    setLocalVehicles(vehicles);
    setDocuments(vehicles.flatMap(vehicleDocumentsFromApi));
  }, [vehicles]);

  if (selectedTrip) {
    return (
      <TripDetailsPage
        trip={selectedTrip}
        invoice={invoices.find((invoice) => invoice.tripId === selectedTrip.id)}
        onBack={() => setSelectedTrip(undefined)}
        onWorkflow={() => undefined}
        onGenerateInvoice={() => undefined}
        onPaymentStatus={() => undefined}
      />
    );
  }

  if (selectedVehicle) {
    return (
      <VehicleDetailsPage
        vehicle={selectedVehicle}
        trips={trips.filter((trip) => trip.vehicleId === selectedVehicle.id)}
        drivers={drivers}
        documents={documents.filter((document) => document.vehicleId === selectedVehicle.id)}
        dieselEntries={dieselEntries.filter((entry) => entry.vehicleId === selectedVehicle.id)}
        maintenanceEntries={maintenanceEntries.filter((entry) => entry.vehicleId === selectedVehicle.id)}
        onBack={() => setSelectedVehicleId(undefined)}
        onOpenTrip={(trip) => setSelectedTrip(enrichTrip(trip, invoices, 0))}
        onDocumentSave={async (document, file) => {
          if (file) await uploadFile(token, "vehicle", selectedVehicle.id, file, vehicleUploadType(document.type), false);
          const expiryPatch = vehicleExpiryPatch(document.type, document.expiryDate);
          if (expiryPatch) await updateVehicle(token, selectedVehicle.id, expiryPatch);
          await refreshData();
        }}
        onDocumentReplace={async (_documentId, patch, file) => {
          if (file) await uploadFile(token, "vehicle", selectedVehicle.id, file, vehicleUploadType(patch.type || "Document"), true);
          const expiryPatch = patch.expiryDate && patch.type ? vehicleExpiryPatch(patch.type, patch.expiryDate) : undefined;
          if (expiryPatch) await updateVehicle(token, selectedVehicle.id, expiryPatch);
          await refreshData();
        }}
        onDocumentDelete={async (document) => {
          if (!window.confirm(`Delete ${document.type}? This removes the file from S3.`)) return;
          await deleteUpload(token, document.id, "vehicle", selectedVehicle.id);
          await refreshData();
        }}
        onDieselSave={(entry) => {
          if (entry.receiptFile) void uploadFile(token, "expense", entry.id, entry.receiptFile, "Diesel", false);
          setDieselEntries((rows) => [entry, ...rows]);
          setExpenses((rows) => [{ id: `expense-${entry.id}`, vehicleId: entry.vehicleId, type: "Diesel", amount: entry.amount, status: "Unpaid", source: "Vehicle Module", date: entry.date }, ...rows]);
        }}
        onMaintenanceSave={(entry) => {
          if (entry.billFile) void uploadFile(token, "expense", entry.id, entry.billFile, "Maintenance", false);
          setMaintenanceEntries((rows) => [entry, ...rows]);
          setExpenses((rows) => [{ id: `expense-${entry.id}`, vehicleId: entry.vehicleId, type: "Maintenance", amount: entry.amount, status: "Unpaid", source: "Vehicle Module", date: entry.date }, ...rows]);
        }}
        token={token}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Total Vehicles" value={localVehicles.length} icon={Truck} tone="primary" />
        <Kpi title="Available Vehicles" value={localVehicles.filter((vehicle) => vehicle.status === "Available").length} icon={ShieldCheck} tone="success" />
        <Kpi title="On Trip Vehicles" value={localVehicles.filter((vehicle) => ["Assigned", "Loading", "In Transit", "Unloading"].includes(vehicle.status)).length} icon={Route} tone="warning" />
        <Kpi title="Documents Expiring Soon" value={expiringSoon} icon={AlertTriangle} tone={expiringSoon ? "danger" : "success"} />
      </section>

      <Panel
        title="Vehicle Management"
        action={
          <div className="flex items-center gap-3">
            <span>{filteredVehicles.length} records</span>
            <button onClick={() => setAddOpen(true)} className="rounded-md bg-tower-primary px-3 py-2 text-xs font-medium text-white">+ Add Vehicle</button>
          </div>
        }
      >
        {deleteError && <div className="mb-4 rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{deleteError}</div>}
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vehicle number, type, owner" className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-sm text-white outline-none ring-tower-primary focus:ring-2" />
          <Select value={statusFilter} onChange={setStatusFilter} options={[{ label: "All Statuses", value: "All" }, ...vehicleStatuses.map((status) => ({ label: status, value: status }))]} />
        </div>
        <DataTable
          columns={["Vehicle Number", "Vehicle Type", "Status", "Insurance Expiry", "PUC Expiry", "Fitness Expiry", "Service Due Date", "Actions"]}
          rows={filteredVehicles.map((vehicle) => [
            vehicle.number,
            vehicle.type,
            <Status key={`${vehicle.id}-status`} value={vehicle.status} />,
            <ExpiryDate key={`${vehicle.id}-insurance`} value={vehicle.insuranceExpiry} />,
            <ExpiryDate key={`${vehicle.id}-puc`} value={vehicle.pucExpiry} />,
            <ExpiryDate key={`${vehicle.id}-fitness`} value={vehicle.fitnessExpiry} />,
            <ExpiryDate key={`${vehicle.id}-service`} value={vehicle.serviceDue} />,
            <div key={`${vehicle.id}-actions`} className="flex flex-wrap gap-2">
              <button onClick={() => setSelectedVehicleId(vehicle.id)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-1.5 text-xs text-white hover:border-tower-primary/60">View More</button>
              <button onClick={() => setEditVehicle(vehicle)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-1.5 text-xs text-white hover:border-tower-primary/60">Edit</button>
              <button
                disabled={deletingVehicleId === vehicle.id}
                onClick={async () => {
                  if (!window.confirm("Are you sure you want to delete this Vehicle?")) return;
                  setDeleteError("");
                  setDeletingVehicleId(vehicle.id);
                  try {
                    await deleteVehicle(token, vehicle.id);
                    await refreshData();
                  } catch (error) {
                    setDeleteError(error instanceof Error ? error.message : "Vehicle could not be deleted.");
                  } finally {
                    setDeletingVehicleId(undefined);
                  }
                }}
                className="rounded-md border border-tower-danger/50 bg-tower-danger/10 px-3 py-1.5 text-xs text-red-200 disabled:opacity-40"
              >
                {deletingVehicleId === vehicle.id ? "Deleting" : "Delete"}
              </button>
            </div>
          ])}
        />
      </Panel>

      {expenses.length > 0 && (
        <Panel title="Vehicle Module Expense Sync" action={`${expenses.length} unpaid entries`}>
          <DataTable columns={["Date", "Vehicle", "Expense Type", "Amount", "Status", "Source"]} rows={expenses.slice(0, 6).map((expense) => [expense.date, localVehicles.find((vehicle) => vehicle.id === expense.vehicleId)?.number, expense.type, money(expense.amount), <Status key={expense.id} value={expense.status} />, expense.source])} />
        </Panel>
      )}

      {addOpen && (
        <AddVehicleModal
          onClose={() => setAddOpen(false)}
            onSave={async (vehicle) => {
            await createVehicle(token, {
              vehicleNumber: vehicle.number,
              rcNumber: vehicle.number,
              type: vehicle.type,
              insuranceExpiry: vehicle.insuranceExpiry,
              fitnessExpiry: vehicle.fitnessExpiry,
              pucExpiry: vehicle.pucExpiry,
              permitExpiry: vehicle.permitExpiry,
              ownerName: vehicle.ownerName
            });
            await refreshData();
            setAddOpen(false);
          }}
        />
      )}
      {editVehicle && (
        <AddVehicleModal
          vehicle={editVehicle}
          onClose={() => setEditVehicle(undefined)}
          onSave={async (vehicle) => {
            await updateVehicle(token, editVehicle.id, {
              vehicleNumber: vehicle.number,
              rcNumber: vehicle.number,
              type: vehicle.type,
              insuranceExpiry: vehicle.insuranceExpiry,
              fitnessExpiry: vehicle.fitnessExpiry,
              pucExpiry: vehicle.pucExpiry,
              permitExpiry: vehicle.permitExpiry,
              ownerName: vehicle.ownerName
            });
            await refreshData();
            setEditVehicle(undefined);
          }}
        />
      )}
    </div>
  );
}

function VehicleDetailsPage({
  vehicle,
  trips,
  drivers,
  documents,
  dieselEntries,
  maintenanceEntries,
  onBack,
  onOpenTrip,
  onDocumentSave,
  onDocumentReplace,
  onDocumentDelete,
  onDieselSave,
  onMaintenanceSave,
  token
}: {
  vehicle: Vehicle;
  trips: Trip[];
  drivers: Driver[];
  documents: VehicleDocument[];
  dieselEntries: DieselEntry[];
  maintenanceEntries: MaintenanceEntry[];
  onBack: () => void;
  onOpenTrip: (trip: Trip) => void;
  onDocumentSave: (document: VehicleDocument, file?: File) => void | Promise<void>;
  onDocumentReplace: (documentId: string, patch: Partial<VehicleDocument>, file?: File) => void | Promise<void>;
  onDocumentDelete: (document: VehicleDocument) => void | Promise<void>;
  onDieselSave: (entry: DieselEntry) => void;
  onMaintenanceSave: (entry: MaintenanceEntry) => void;
  token?: string;
}) {
  const [tab, setTab] = useState("Overview");
  const [documentModal, setDocumentModal] = useState(false);
  const [replaceDocument, setReplaceDocument] = useState<VehicleDocument>();
  const [dieselModal, setDieselModal] = useState(false);
  const [maintenanceModal, setMaintenanceModal] = useState(false);
  const [dieselFromDate, setDieselFromDate] = useState("");
  const [dieselToDate, setDieselToDate] = useState("");
  const [maintenanceFromDate, setMaintenanceFromDate] = useState("");
  const [maintenanceToDate, setMaintenanceToDate] = useState("");
  const lastTrip = [...trips].sort((a, b) => +new Date(b.tripDate) - +new Date(a.tripDate))[0];
  const currentDriver = drivers.find((driver) => driver.id === lastTrip?.driverId);
  const filteredDieselEntries = dieselEntries.filter((entry) => isWithinDateFilter(entry.date, dieselFromDate, dieselToDate));
  const filteredMaintenanceEntries = maintenanceEntries.filter((entry) => isWithinDateFilter(entry.date, maintenanceFromDate, maintenanceToDate));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower lg:flex-row lg:items-center lg:justify-between">
        <div>
          <button onClick={onBack} className="mb-3 rounded-md border border-tower-border px-3 py-1.5 text-sm text-tower-muted hover:text-white">Back to Vehicles</button>
          <h3 className="text-2xl font-semibold">{vehicle.number}</h3>
          <p className="text-sm text-tower-muted">{vehicle.type}</p>
        </div>
        <Status value={vehicle.status} />
      </div>

      <div className="flex overflow-x-auto rounded-lg border border-tower-border bg-tower-card p-1">
        {vehicleTabs.map((item) => (
          <button key={item} onClick={() => setTab(item)} className={cn("min-w-fit flex-1 rounded px-4 py-2 text-sm text-tower-muted", tab === item && "bg-tower-primary text-white")}>{item}</button>
        ))}
      </div>

      {tab === "Overview" && (
        <Panel title="Overview" action="Fleet profile">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Info label="Vehicle Number" value={vehicle.number} />
            <Info label="Vehicle Type" value={vehicle.type} />
            <Info label="RC Owner" value={vehicle.ownerName} />
            <Info label="Current Status" value={<Status value={vehicle.status} />} />
            <Info label="Last Trip" value={lastTrip?.tripNumber || "No trips yet"} />
            <Info label="Current Driver" value={currentDriver?.name || "Not assigned"} />
            <Info label="Insurance Expiry" value={<ExpiryDate value={vehicle.insuranceExpiry} />} />
            <Info label="PUC Expiry" value={<ExpiryDate value={vehicle.pucExpiry} />} />
            <Info label="Fitness Expiry" value={<ExpiryDate value={vehicle.fitnessExpiry} />} />
            <Info label="Service Due Date" value={<ExpiryDate value={vehicle.serviceDue} />} />
            <Info label="Total Diesel Entries" value={dieselEntries.length} />
            <Info label="Total Maintenance Entries" value={maintenanceEntries.length} />
          </div>
        </Panel>
      )}

      {tab === "Documents" && (
        <Panel title="Documents" action={<button onClick={() => setDocumentModal(true)} className="rounded-md bg-tower-primary px-3 py-2 text-xs font-medium text-white">+ Upload Document</button>}>
          <DataTable
            columns={["Document Type", "Expiry Date", "Uploaded Date", "Actions"]}
            rows={documents.map((document) => [
              document.type,
              <ExpiryDate key={`${document.id}-expiry`} value={document.expiryDate} />,
              document.uploadedDate,
              <div key={`${document.id}-actions`} className="flex min-w-[300px] flex-wrap gap-2">
                <button onClick={() => { void openSignedUpload(token, document.id, false, document.fileName); }} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-white">Preview Document</button>
                <button onClick={() => { void openSignedUpload(token, document.id, true, document.fileName); }} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-white">Download Document</button>
                <button onClick={() => setReplaceDocument(document)} className="rounded-md bg-tower-primary/90 px-3 py-1.5 text-xs font-medium text-white">Replace Document</button>
                <button onClick={() => { void onDocumentDelete(document); }} className="rounded-md border border-tower-danger/50 bg-tower-danger/10 px-3 py-1.5 text-xs text-red-200">Delete</button>
              </div>
            ])}
          />
        </Panel>
      )}

      {tab === "Diesel" && (
        <Panel title="Diesel" action={<button onClick={() => setDieselModal(true)} className="rounded-md bg-tower-primary px-3 py-2 text-xs font-medium text-white">+ Add Diesel</button>}>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <DateInput label="From Date" value={dieselFromDate} onChange={setDieselFromDate} />
            <DateInput label="To Date" value={dieselToDate} onChange={setDieselToDate} />
            <button onClick={() => { setDieselFromDate(""); setDieselToDate(""); }} className="self-end rounded-md border border-tower-border px-3 py-2 text-sm text-tower-muted hover:text-white">Clear</button>
          </div>
          <DataTable columns={["Date", "Petrol Pump", "Amount", "Source"]} rows={filteredDieselEntries.map((entry) => [entry.date, entry.pump, money(entry.amount), entry.source])} />
        </Panel>
      )}

      {tab === "Maintenance" && (
        <Panel title="Maintenance" action={<button onClick={() => setMaintenanceModal(true)} className="rounded-md bg-tower-primary px-3 py-2 text-xs font-medium text-white">+ Add Maintenance</button>}>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <DateInput label="From Date" value={maintenanceFromDate} onChange={setMaintenanceFromDate} />
            <DateInput label="To Date" value={maintenanceToDate} onChange={setMaintenanceToDate} />
            <button onClick={() => { setMaintenanceFromDate(""); setMaintenanceToDate(""); }} className="self-end rounded-md border border-tower-border px-3 py-2 text-sm text-tower-muted hover:text-white">Clear</button>
          </div>
          <DataTable columns={["Date", "Repair Type", "Workshop", "Amount", "Bill"]} rows={filteredMaintenanceEntries.map((entry) => [entry.date, entry.repairType, entry.workshop, money(entry.amount), entry.billUrl ? <a key={`${entry.id}-bill`} href={entry.billUrl} download={entry.billName} className="rounded-md border border-tower-border px-3 py-1.5 text-xs text-white">Download Bill</a> : entry.billName || "-"])} />
        </Panel>
      )}

      {tab === "Trip History" && (
        <Panel title="Trip History" action={`${trips.length} trips`}>
          <DataTable
            columns={["Trip ID", "Route", "Customer", "Driver", "Freight Amount", "Status"]}
            rows={trips.map((trip) => [
              <button key={trip.id} onClick={() => onOpenTrip(trip)} className="text-left font-medium text-tower-primary hover:text-blue-300">{trip.tripNumber}</button>,
              `${trip.loadingPoint} to ${trip.unloadingPoint}`,
              trip.customer?.name || trip.consignorName,
              trip.driver?.name || drivers.find((driver) => driver.id === trip.driverId)?.name,
              money(trip.freightAmount),
              <Status key={`${trip.id}-status`} value={trip.status} />
            ])}
          />
        </Panel>
      )}

      {documentModal && <DocumentModal vehicleId={vehicle.id} onClose={() => setDocumentModal(false)} onSave={async (document, file) => { await onDocumentSave(document, file); setDocumentModal(false); }} />}
      {replaceDocument && <DocumentModal vehicleId={vehicle.id} document={replaceDocument} onClose={() => setReplaceDocument(undefined)} onSave={async (document, file) => { await onDocumentReplace(replaceDocument.id, document, file); setReplaceDocument(undefined); }} />}
      {dieselModal && <DieselModal vehicleId={vehicle.id} onClose={() => setDieselModal(false)} onSave={(entry) => { onDieselSave(entry); setDieselModal(false); }} />}
      {maintenanceModal && <MaintenanceModal vehicleId={vehicle.id} onClose={() => setMaintenanceModal(false)} onSave={(entry) => { onMaintenanceSave(entry); setMaintenanceModal(false); }} />}
    </div>
  );
}

function AddVehicleModal({ vehicle, onClose, onSave }: { vehicle?: Vehicle; onClose: () => void; onSave: (vehicle: Vehicle) => void | Promise<void> }) {
  const [number, setNumber] = useState(vehicle?.number || "");
  const [type, setType] = useState(vehicle?.type || "32 FT MXL");
  const [ownerName, setOwnerName] = useState(vehicle?.ownerName || "NPFC Logistics");
  const [status, setStatus] = useState(vehicle?.status || "Available");
  const [insuranceExpiry, setInsuranceExpiry] = useState(vehicle?.insuranceExpiry || today(365));
  const [pucExpiry, setPucExpiry] = useState(vehicle?.pucExpiry || today(180));
  const [fitnessExpiry, setFitnessExpiry] = useState(vehicle?.fitnessExpiry || today(365));
  const [permitExpiry, setPermitExpiry] = useState(vehicle?.permitExpiry || today(365));
  const [serviceDue, setServiceDue] = useState(vehicle?.serviceDue || today(30));

  return (
    <ModalShell title={vehicle ? "Edit Vehicle" : "Add Vehicle"} subtitle="Create a fleet record with compliance dates." onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Vehicle Number" value={number} onChange={setNumber} />
        <TextField label="Vehicle Type" value={type} onChange={setType} />
        <TextField label="RC Owner" value={ownerName} onChange={setOwnerName} />
        <FieldSelect label="Status" value={status} onChange={setStatus} options={vehicleStatuses.map((item) => ({ label: item, value: item }))} />
        <DateInput label="Insurance Expiry" value={insuranceExpiry} onChange={setInsuranceExpiry} />
        <DateInput label="PUC Expiry" value={pucExpiry} onChange={setPucExpiry} />
        <DateInput label="Fitness Expiry" value={fitnessExpiry} onChange={setFitnessExpiry} />
        <DateInput label="Permit Expiry" value={permitExpiry} onChange={setPermitExpiry} />
        <DateInput label="Service Due Date" value={serviceDue} onChange={setServiceDue} />
      </div>
      <ModalActions onClose={onClose} onSave={() => onSave({ id: vehicle?.id || `vehicle-${Date.now()}`, number, type, ownerName, status, insuranceExpiry, permitExpiry, fitnessExpiry, pucExpiry, serviceDue })} disabled={!number.trim()} label="Save Vehicle" />
    </ModalShell>
  );
}

function DocumentModal({ vehicleId, document, onClose, onSave }: { vehicleId: string; document?: VehicleDocument; onClose: () => void; onSave: (document: VehicleDocument, file?: File) => void | Promise<void> }) {
  const initialType = document?.type && documentTypes.includes(document.type) ? document.type : document?.type ? "Other" : "Insurance";
  const [type, setType] = useState(initialType);
  const [customType, setCustomType] = useState(document?.type && !documentTypes.includes(document.type) ? document.type : "");
  const [expiryDate, setExpiryDate] = useState(document?.expiryDate || today(365));
  const [fileName, setFileName] = useState(document?.fileName || "");
  const [fileUrl, setFileUrl] = useState(document?.fileUrl || "");
  const [file, setFile] = useState<File>();
  const resolvedType = type === "Other" ? customType.trim() : type;

  const handleFile = (file?: File) => {
    if (!file) return;
    setFile(file);
    setFileName(file.name);
    setFileUrl(URL.createObjectURL(file));
  };

  return (
    <ModalShell title={document ? "Replace Document" : "Upload Document"} subtitle={document ? "Previous version will remain archived in history." : "Upload compliance document for preview and download."} onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <FieldSelect label="Document Type" value={type} onChange={setType} options={documentTypes.map((item) => ({ label: item, value: item }))} />
        {type === "Other" && <TextField label="Document Name" value={customType} onChange={setCustomType} />}
        <DateInput label="Expiry Date" value={expiryDate} onChange={setExpiryDate} />
        <label className="block text-sm text-tower-muted md:col-span-2">
          Upload File
          <input type="file" accept="application/pdf,image/*" onChange={(event) => handleFile(event.target.files?.[0])} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white" />
        </label>
      </div>
      {fileUrl && (
        <div className="mt-4 rounded-md border border-tower-border bg-[#0B1220] p-3">
          <div className="mb-2 text-sm text-tower-muted">Document Preview</div>
          {fileName.toLowerCase().endsWith(".pdf") ? <iframe src={fileUrl} className="h-72 w-full rounded-md border border-tower-border" /> : <img src={fileUrl} className="max-h-72 rounded-md border border-tower-border object-contain" />}
        </div>
      )}
      {document?.history.length ? <div className="mt-4 text-xs text-tower-muted">Archived versions: {document.history.length}</div> : null}
      <ModalActions onClose={onClose} onSave={() => onSave({ id: document?.id || `doc-${Date.now()}`, vehicleId, type: resolvedType, expiryDate, uploadedDate: today(), fileName: fileName || `${resolvedType || "document"}.pdf`, fileUrl, history: document?.history || [] }, file)} disabled={!expiryDate || !resolvedType} label="Save Document" />
    </ModalShell>
  );
}

function DieselModal({ vehicleId, onClose, onSave }: { vehicleId: string; onClose: () => void; onSave: (entry: DieselEntry) => void }) {
  const [date, setDate] = useState(today());
  const [pump, setPump] = useState(petrolPumps[0]);
  const [amount, setAmount] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [receiptName, setReceiptName] = useState("");
  const [receiptFile, setReceiptFile] = useState<File>();

  return (
    <ModalShell title="Add Diesel" subtitle="Operational fuel entry. Payment status stays in Expenses." onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <DateInput label="Date" value={date} onChange={setDate} />
        <FieldSelect label="Petrol Pump" value={pump} onChange={setPump} options={petrolPumps.map((item) => ({ label: item, value: item }))} />
        <NumberField label="Amount" value={amount} onChange={setAmount} />
        <label className="block text-sm text-tower-muted">
          Receipt Upload
          <input type="file" onChange={(event) => { const file = event.target.files?.[0]; setReceiptFile(file); setReceiptName(file?.name || ""); }} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white" />
        </label>
        <label className="block text-sm text-tower-muted md:col-span-2">
          Remarks
          <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white" />
        </label>
      </div>
      <ModalActions onClose={onClose} onSave={() => onSave({ id: `diesel-${Date.now()}`, vehicleId, date, pump, amount, source: "Manual Entry", remarks, receiptName, receiptFile })} disabled={!amount} label="Save Diesel" />
    </ModalShell>
  );
}

function MaintenanceModal({ vehicleId, onClose, onSave }: { vehicleId: string; onClose: () => void; onSave: (entry: MaintenanceEntry) => void }) {
  const [repairType, setRepairType] = useState("General Repair");
  const [workshop, setWorkshop] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(today());
  const [remarks, setRemarks] = useState("");
  const [billName, setBillName] = useState("");
  const [billUrl, setBillUrl] = useState("");
  const [billFile, setBillFile] = useState<File>();

  const handleBill = (file?: File) => {
    if (!file) return;
    setBillFile(file);
    setBillName(file.name);
    setBillUrl("");
  };

  return (
    <ModalShell title="Add Maintenance" subtitle="Operational repair entry. Payment status stays in Expenses." onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Repair Type" value={repairType} onChange={setRepairType} />
        <TextField label="Workshop Name" value={workshop} onChange={setWorkshop} />
        <NumberField label="Amount" value={amount} onChange={setAmount} />
        <DateInput label="Date" value={date} onChange={setDate} />
        <label className="block text-sm text-tower-muted">
          Bill Upload
          <input type="file" onChange={(event) => handleBill(event.target.files?.[0])} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white" />
        </label>
        <label className="block text-sm text-tower-muted">
          Remarks
          <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white" />
        </label>
      </div>
      <ModalActions onClose={onClose} onSave={() => onSave({ id: `maintenance-${Date.now()}`, vehicleId, date, repairType, workshop, amount, remarks, billName, billUrl, billFile })} disabled={!amount || !workshop.trim()} label="Save Maintenance" />
    </ModalShell>
  );
}

type InvoiceActivityRow = { dateTime: string; user: string; action: string; remarks: string };
type LocalInvoice = Invoice & { notes?: string; remarks?: string; additionalCharges?: number; activityLog?: InvoiceActivityRow[] };

function InvoiceModule({ invoices, trips, customers, payments, setData, token, refreshData }: { invoices: Invoice[]; trips: Trip[]; customers: Customer[]; payments: Payment[]; setData: React.Dispatch<React.SetStateAction<Data>>; token?: string; refreshData: () => Promise<void> }) {
  const [localInvoices, setLocalInvoices] = useState<LocalInvoice[]>(() => invoices.map((invoice) => hydrateInvoice(invoice, trips, payments)));
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>();
  const [manualOpen, setManualOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("Current Month");
  const [statusFilter, setStatusFilter] = useState("All");
  const [customerFilter, setCustomerFilter] = useState("All");
  const [customFrom, setCustomFrom] = useState(monthBounds().from);
  const [customTo, setCustomTo] = useState(monthBounds().to);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => setLocalInvoices(invoices.map((invoice) => hydrateInvoice(invoice, trips, payments))), [invoices, trips, payments]);

  const updateInvoices = (rows: LocalInvoice[]) => {
    setLocalInvoices(rows);
    setData((current) => ({ ...current, invoices: rows }));
  };
  const invoiceRows = localInvoices.map((invoice) => {
    const trip = trips.find((item) => item.id === invoice.tripId);
    const customer = customers.find((item) => item.id === invoice.customerId);
    return buildInvoiceRow(invoice, trip, customer, payments);
  });
  const range = invoiceDateRange(dateFilter, customFrom, customTo);
  const filtered = invoiceRows.filter((row) => {
    const haystack = `${row.invoice.invoiceNumber} ${row.customer?.name || ""} ${row.trip?.tripNumber || row.invoice.tripId}`.toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const matchesDate = (!range.from || row.invoice.invoiceDate >= range.from) && (!range.to || row.invoice.invoiceDate <= range.to);
    const matchesStatus = statusFilter === "All" || row.status === statusFilter;
    const matchesCustomer = customerFilter === "All" || row.invoice.customerId === customerFilter;
    return matchesSearch && matchesDate && matchesStatus && matchesCustomer;
  });
  const kpis = {
    total: localInvoices.length,
    monthGenerated: localInvoices.filter((invoice) => invoice.invoiceDate.slice(0, 7) === today().slice(0, 7)).length,
    outstanding: invoiceRows.reduce((sum, row) => sum + row.balance, 0),
    partial: invoiceRows.filter((row) => row.status === "Partially Paid").length,
    paid: invoiceRows.filter((row) => row.status === "Paid").length,
    collectedThisMonth: payments.filter((payment) => payment.paymentDate.slice(0, 7) === today().slice(0, 7)).reduce((sum, payment) => sum + paymentAllocatedAmount(payment), 0)
  };
  const collection = invoiceRows.reduce((summary, row) => ({ amount: summary.amount + row.amount, collected: summary.collected + row.paid, outstanding: summary.outstanding + row.balance }), { amount: 0, collected: 0, outstanding: 0 });
  const selectedInvoice = localInvoices.find((invoice) => invoice.id === selectedInvoiceId);

  const saveInvoice = async (invoice: LocalInvoice) => {
    if (!invoice.id.startsWith("invoice-") && !invoice.id.startsWith("local-")) {
      await updateInvoiceApi(token, invoice.id, {
        notes: invoice.notes,
        remarks: invoice.remarks,
        additionalCharges: invoice.additionalCharges || 0,
        paymentStatus: invoicePaymentStatusForApi(invoice.status)
      });
      await refreshData();
      return;
    }
    updateInvoices(localInvoices.map((item) => item.id === invoice.id ? invoice : item));
  };
  const deleteInvoice = async (invoice: LocalInvoice) => {
    if (!window.confirm(`Delete invoice ${invoice.invoiceNumber}? Linked invoice payments will also be removed.`)) return;
    if (!invoice.id.startsWith("invoice-") && !invoice.id.startsWith("local-")) {
      await deleteInvoiceApi(token, invoice.id);
      await refreshData();
      setSelectedInvoiceId(undefined);
      return;
    }
    updateInvoices(localInvoices.filter((item) => item.id !== invoice.id));
    setSelectedInvoiceId(undefined);
  };
  const generateInvoice = async (tripId: string) => {
    const trip = trips.find((item) => item.id === tripId);
    if (!trip || localInvoices.some((invoice) => invoice.tripId === trip.id)) return;
    if (!trip.id.startsWith("local-")) {
      const invoice = await generateInvoiceApi(token, trip.id);
      await refreshData();
      setSelectedInvoiceId(invoice.id || (invoice as any)._id);
      setManualOpen(false);
      return;
    }
    const invoice: LocalInvoice = hydrateInvoice({
      id: `invoice-${Date.now()}`,
      invoiceNumber: nextInvoiceNumber(localInvoices),
      tripId: trip.id,
      customerId: trip.customerId,
      invoiceDate: today(),
      dueDate: today(15),
      amount: trip.freightAmount,
      outstandingAmount: trip.freightAmount,
      status: "Generated",
      emailStatus: "Generated",
      pdfPath: `/storage/invoices/${new Date().getFullYear()}/${trip.tripNumber}.pdf`
    }, trips, payments);
    invoice.activityLog = [invoiceActivity("Invoice Generated", `Manual invoice generated from ${trip.tripNumber}.`)];
    updateInvoices([invoice, ...localInvoices]);
    setSelectedInvoiceId(invoice.id);
    setManualOpen(false);
  };

  if (selectedInvoice) {
    const trip = trips.find((item) => item.id === selectedInvoice.tripId);
    const customer = customers.find((item) => item.id === selectedInvoice.customerId);
    return <InvoiceDetailsPage invoice={selectedInvoice} trip={trip} customer={customer} payments={payments} token={token} refreshData={refreshData} onBack={() => setSelectedInvoiceId(undefined)} onSave={saveInvoice} onDelete={() => deleteInvoice(selectedInvoice)} />;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Kpi title="Total Invoices" value={kpis.total} icon={ReceiptText} tone="primary" />
        <Kpi title="Generated This Month" value={kpis.monthGenerated} icon={FileText} tone="success" />
        <Kpi title="Outstanding Amount" value={money(kpis.outstanding)} icon={Banknote} tone="danger" />
        <Kpi title="Partially Paid Invoices" value={kpis.partial} icon={Gauge} tone="warning" />
        <Kpi title="Fully Paid Invoices" value={kpis.paid} icon={ShieldCheck} tone="success" />
        <Kpi title="Amount Collected This Month" value={money(kpis.collectedThisMonth)} icon={CreditCard} tone="primary" />
      </section>

      <section className="rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Invoice Dashboard</h3>
            <p className="text-sm text-tower-muted">Central billing, collection, and trip-linked invoice control.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setManualOpen(true)} className="rounded-md bg-tower-primary px-4 py-2.5 text-sm font-medium text-white">Manual Generate Invoice</button>
            <button className="rounded-md border border-tower-border px-4 py-2.5 text-sm text-white">Download Selected Invoices</button>
            <button className="rounded-md border border-tower-border px-4 py-2.5 text-sm text-white">Download All Customer Invoices</button>
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.9fr]">
          <label className="block text-sm text-tower-muted">
            Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Invoice, customer, trip" className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white outline-none ring-tower-primary focus:ring-2" />
          </label>
          <FieldSelect label="Date Range" value={dateFilter} onChange={setDateFilter} options={["Current Month", "Previous Month", "Custom Range", "All Time"].map((item) => ({ label: item, value: item }))} />
          <FieldSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={["All", "Draft", "Generated", "Sent", "Partially Paid", "Paid", "Cancelled"].map((item) => ({ label: item, value: item }))} />
          <FieldSelect label="Customer" value={customerFilter} onChange={setCustomerFilter} options={[{ label: "All Customers", value: "All" }, ...customers.map((customer) => ({ label: customer.name, value: customer.id }))]} />
        </div>
        {dateFilter === "Custom Range" && <div className="mt-4 grid gap-3 md:grid-cols-2"><DateInput label="From" value={customFrom} onChange={setCustomFrom} /><DateInput label="To" value={customTo} onChange={setCustomTo} /></div>}
      </section>

      <Panel title="Invoice Collection Summary" action="Customer-wise breakdown">
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <Info label="Total Invoice Amount" value={money(collection.amount)} />
          <Info label="Total Collected" value={money(collection.collected)} />
          <Info label="Total Outstanding" value={money(collection.outstanding)} />
        </div>
        <DataTable columns={["Customer", "Invoice Amount", "Collected", "Outstanding"]} rows={customers.map((customer) => {
          const rows = invoiceRows.filter((row) => row.invoice.customerId === customer.id);
          return [customer.name, money(rows.reduce((sum, row) => sum + row.amount, 0)), money(rows.reduce((sum, row) => sum + row.paid, 0)), money(rows.reduce((sum, row) => sum + row.balance, 0))];
        })} />
      </Panel>

      <Panel title="Invoice Table" action={`${filtered.length} records`}>
        <DataTable
          columns={["Select", "Invoice No", "Trip ID", "Customer", "Invoice Date", "Amount", "Paid", "Balance", "Status", "Actions"]}
          rows={filtered.map((row) => [
            <input key={`${row.invoice.id}-select`} type="checkbox" checked={selectedIds.includes(row.invoice.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, row.invoice.id] : current.filter((id) => id !== row.invoice.id))} />,
            row.invoice.invoiceNumber,
            row.trip?.tripNumber || row.invoice.tripId,
            row.customer?.name || "-",
            row.invoice.invoiceDate,
            money(row.amount),
            money(row.paid),
            money(row.balance),
            <Status key={`${row.invoice.id}-status`} value={row.status} />,
            <div key={`${row.invoice.id}-actions`} className="flex flex-wrap gap-2">
              <button onClick={() => setSelectedInvoiceId(row.invoice.id)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-1.5 text-xs text-white hover:border-tower-primary/60">View More</button>
              <button onClick={() => { void deleteInvoice(row.invoice); }} className="rounded-md border border-tower-danger/50 bg-tower-danger/10 px-3 py-1.5 text-xs text-red-200 hover:bg-tower-danger/20">Delete</button>
            </div>
          ])}
        />
      </Panel>

      {manualOpen && <ManualInvoiceModal trips={trips} invoices={localInvoices} customers={customers} onClose={() => setManualOpen(false)} onGenerate={generateInvoice} />}
    </div>
  );
}

function InvoiceDetailsPage({ invoice, trip, customer, payments, token, refreshData, onBack, onSave, onDelete }: { invoice: LocalInvoice; trip?: Trip; customer?: Customer; payments: Payment[]; token?: string; refreshData: () => Promise<void>; onBack: () => void; onSave: (invoice: LocalInvoice) => void | Promise<void>; onDelete: () => void | Promise<void> }) {
  const [tab, setTab] = useState("Preview");
  const [editing, setEditing] = useState(false);
  const [freightAmount, setFreightAmount] = useState(invoice.amount - (invoice.additionalCharges || 0));
  const [additionalCharges, setAdditionalCharges] = useState(invoice.additionalCharges || 0);
  const [notes, setNotes] = useState(invoice.notes || "");
  const [remarks, setRemarks] = useState(invoice.remarks || "");
  const row = buildInvoiceRow(invoice, trip, customer, payments);
  const freight = tripFreightBreakdown(trip);
  const paymentRows = invoicePaymentRows(invoice, payments);
  const saveChanges = async () => {
    const amount = freightAmount + additionalCharges;
    const paid = row.paid;
    await onSave({ ...invoice, amount, outstandingAmount: Math.max(amount - paid, 0), additionalCharges, notes, remarks, activityLog: [invoiceActivity("Invoice Edited", "Preview fields updated."), ...(invoice.activityLog || [])] });
    setEditing(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower xl:flex-row xl:items-center xl:justify-between">
        <div>
          <button onClick={onBack} className="mb-3 rounded-md border border-tower-border px-3 py-1.5 text-sm text-tower-muted hover:text-white">Back</button>
          <h3 className="text-xl font-semibold">{invoice.invoiceNumber}</h3>
          <p className="text-sm text-tower-muted">{trip?.tripNumber || invoice.tripId} - {customer?.name || "Customer"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!invoice.pdfKey} onClick={() => { if (invoice.pdfKey) void openSignedUpload(token, invoice.pdfKey, false, `${invoice.invoiceNumber}.pdf`); }} className="rounded-md border border-tower-border px-4 py-2 text-sm text-white disabled:opacity-40">Preview PDF</button>
          <button disabled={!invoice.pdfKey} onClick={() => { if (invoice.pdfKey) void openSignedUpload(token, invoice.pdfKey, true, `${invoice.invoiceNumber}.pdf`); }} className="rounded-md border border-tower-border px-4 py-2 text-sm text-white disabled:opacity-40">Download PDF</button>
          <button onClick={async () => { await regenerateInvoiceApi(token, invoice.id); await refreshData(); }} className="rounded-md bg-tower-primary px-4 py-2 text-sm font-medium text-white">Regenerate PDF</button>
          <button className="rounded-md border border-tower-border px-4 py-2 text-sm text-white">Send via WhatsApp</button>
          <button onClick={() => { void onDelete(); }} className="rounded-md border border-tower-danger/50 bg-tower-danger/10 px-4 py-2 text-sm text-red-200">Delete Invoice</button>
        </div>
      </div>

      <Segment value={tab} onChange={setTab} values={["Preview", "Payment Tracking", "Activity Log"]} />

      {tab === "Preview" && (
        <Panel title="Invoice Preview" action={editing ? "Editing invoice" : "Customer-facing invoice"}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Info label="Invoice Number" value={invoice.invoiceNumber} />
            <Info label="Invoice Date" value={invoice.invoiceDate} />
            <Info label="Customer Details" value={customer?.name || "-"} />
            <Info label="GST Number" value={customer?.gstNumber || "-"} />
            <Info label="Trip Information" value={trip?.tripNumber || invoice.tripId} />
            <Info label="Vehicle Number" value={trip?.vehicle?.number || "-"} />
            <Info label="Source" value={trip?.loadingPoint || "-"} />
            <Info label="Destination" value={trip?.unloadingPoint || "-"} />
            <Info label="Material" value={freight.material} />
            <Info label="Weight (MT)" value={freight.weightMt.toFixed(2)} />
            {editing ? <NumberField label="Rate Per MT" value={freight.weightMt ? freightAmount / freight.weightMt : 0} onChange={(rate) => setFreightAmount(rate * freight.weightMt)} /> : <Info label="Rate Per MT" value={money(freight.ratePerMt)} />}
            <Info label="Total Freight" value={money(row.freight)} />
            {editing ? <NumberField label="Additional Charges" value={additionalCharges} onChange={setAdditionalCharges} /> : <Info label="Additional Charges" value={money(invoice.additionalCharges || 0)} />}
            <Info label="Total Amount" value={money(row.amount)} />
            <Info label="Customer Mobile Number" value={customer?.phone || "-"} />
            <Info label="Invoice PDF Path" value={invoice.pdfPath || "-"} />
            <Info label="Sent Status" value={invoice.emailStatus || row.status} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {editing ? <TextField label="Invoice Notes" value={notes} onChange={setNotes} /> : <Info label="Invoice Notes" value={invoice.notes || "-"} />}
            {editing ? <TextField label="Invoice Remarks" value={remarks} onChange={setRemarks} /> : <Info label="Invoice Remarks" value={invoice.remarks || "-"} />}
          </div>
          <div className="mt-5 flex justify-end gap-3 border-t border-tower-border pt-4">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="rounded-md border border-tower-border px-4 py-2 text-sm text-tower-muted hover:text-white">Cancel Changes</button>
                <button onClick={saveChanges} className="rounded-md bg-tower-primary px-4 py-2 text-sm font-medium text-white">Save Changes</button>
              </>
            ) : <button onClick={() => setEditing(true)} className="rounded-md bg-tower-primary px-4 py-2 text-sm font-medium text-white">Edit Preview</button>}
          </div>
        </Panel>
      )}

      {tab === "Payment Tracking" && (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-3">
            <Kpi title="Invoice Amount" value={money(row.amount)} icon={ReceiptText} tone="primary" />
            <Kpi title="Amount Paid" value={money(row.paid)} icon={CreditCard} tone="success" />
            <Kpi title="Outstanding Balance" value={money(row.balance)} icon={Banknote} tone={row.balance > 0 ? "danger" : "success"} />
          </section>
          <Panel title="Payment History" action="Customer allocations reflected automatically">
            <DataTable columns={["Date", "Amount", "Payment Mode", "Reference No", "Remarks"]} rows={paymentRows.map((payment) => [payment.paymentDate, money(payment.allocatedAmount), payment.mode, payment.referenceNumber, payment.remarks])} />
          </Panel>
        </div>
      )}

      {tab === "Activity Log" && (
        <Panel title="Activity Log" action="Invoice audit trail">
          <DataTable columns={["Date & Time", "User", "Action", "Remarks"]} rows={invoiceActivityLog(invoice, payments).map((entry) => [entry.dateTime, entry.user, entry.action, entry.remarks])} />
        </Panel>
      )}
    </div>
  );
}

function ManualInvoiceModal({ trips, invoices, customers, onClose, onGenerate }: { trips: Trip[]; invoices: Invoice[]; customers: Customer[]; onClose: () => void; onGenerate: (tripId: string) => void | Promise<void> }) {
  const availableTrips = trips.filter((trip) => !invoices.some((invoice) => invoice.tripId === trip.id));
  const [tripId, setTripId] = useState(availableTrips[0]?.id || "");
  const trip = trips.find((item) => item.id === tripId);
  const customer = customers.find((item) => item.id === trip?.customerId);
  return (
    <ModalShell title="Manual Generate Invoice" subtitle="One invoice is generated and linked to one trip." onClose={onClose}>
      <FieldSelect label="Trip" value={tripId} onChange={setTripId} options={availableTrips.map((trip) => ({ label: `${trip.tripNumber} - ${customers.find((customer) => customer.id === trip.customerId)?.name || "Customer"}`, value: trip.id }))} />
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Info label="Customer" value={customer?.name || "-"} />
        <Info label="Total Freight" value={money(trip?.freightAmount || 0)} />
        <Info label="Next Invoice Number" value={nextInvoiceNumber(invoices)} />
      </div>
      {!availableTrips.length && <div className="mt-4 rounded-md border border-tower-border bg-[#0B1220] p-3 text-sm text-tower-muted">All trips already have invoices.</div>}
      <ModalActions onClose={onClose} onSave={() => onGenerate(tripId)} disabled={!tripId} label="Generate Invoice" />
    </ModalShell>
  );
}

function CustomerModule({ customers, trips, invoices, payments, setData, token, refreshData }: { customers: Customer[]; trips: Trip[]; invoices: Invoice[]; payments: Payment[]; setData: React.Dispatch<React.SetStateAction<Data>>; token?: string; refreshData: () => Promise<void> }) {
  const [localCustomers, setLocalCustomers] = useState(customers);
  const [localInvoices, setLocalInvoices] = useState(invoices);
  const [localPayments, setLocalPayments] = useState(payments);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [revenueRange, setRevenueRange] = useState("All");
  const [datePreset, setDatePreset] = useState("All Time");
  const [customFrom, setCustomFrom] = useState(monthBounds().from);
  const [customTo, setCustomTo] = useState(monthBounds().to);
  const [addOpen, setAddOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer>();
  const [deletingCustomerId, setDeletingCustomerId] = useState<string>();
  const [deleteError, setDeleteError] = useState("");
  const [paymentCustomerId, setPaymentCustomerId] = useState<string>();
  const [outstandingCustomerId, setOutstandingCustomerId] = useState<string>();

  useEffect(() => setLocalCustomers(customers), [customers]);
  useEffect(() => setLocalInvoices(invoices), [invoices]);
  useEffect(() => setLocalPayments(payments), [payments]);

  const range = customerDateRange(datePreset, customFrom, customTo);
  const summaries = localCustomers.map((customer) => customerSummary(customer, trips, localInvoices, localPayments, range));
  const kpis = {
    totalCustomers: localCustomers.length,
    activeCustomers: summaries.filter((item) => item.status === "Active").length,
    revenueThisMonth: trips.filter((trip) => trip.tripDate.slice(0, 7) === today().slice(0, 7)).reduce((sum, trip) => sum + trip.freightAmount, 0),
    outstanding: localInvoices.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0),
    paymentsThisMonth: localPayments.filter((payment) => payment.paymentDate.slice(0, 7) === today().slice(0, 7)).reduce((sum, payment) => sum + payment.amount, 0),
    advance: summaries.reduce((sum, item) => sum + item.advance, 0)
  };
  const filtered = summaries.filter((item) => {
    const haystack = `${item.customer.name} ${item.customer.gstNumber} ${item.customer.phone}`.toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || (statusFilter === "Outstanding" ? item.outstanding > 0 : item.status === statusFilter);
    const matchesRevenue = revenueRange === "All" || (revenueRange === "0-1L" ? item.revenue <= 100000 : revenueRange === "1L-5L" ? item.revenue > 100000 && item.revenue <= 500000 : item.revenue > 500000);
    return matchesSearch && matchesStatus && matchesRevenue;
  });
  const selectedCustomer = localCustomers.find((customer) => customer.id === selectedCustomerId);
  const paymentCustomer = localCustomers.find((customer) => customer.id === paymentCustomerId);
  const outstandingCustomer = localCustomers.find((customer) => customer.id === outstandingCustomerId);

  const updateCustomers = (rows: Customer[]) => {
    setLocalCustomers(rows);
    setData((current) => ({ ...current, customers: rows }));
  };
  const savePayment = async (payment: Payment, updatedInvoices: Invoice[]) => {
    const allocations = payment.allocations?.length ? payment.allocations : payment.invoiceId ? [{ invoiceId: payment.invoiceId, amount: payment.amount }] : [];
    for (const allocation of allocations) {
      await createPayment(token, {
        invoiceId: allocation.invoiceId,
        amountReceived: allocation.amount,
        paymentDate: payment.paymentDate,
        mode: payment.mode === "Bank Transfer" ? "NEFT" : payment.mode,
        referenceNumber: payment.referenceNumber,
        remarks: payment.remarks
      });
    }
    await refreshData();
  };

  if (selectedCustomer) {
    return (
      <CustomerDetailsPage
        customer={selectedCustomer}
        trips={trips}
        invoices={localInvoices}
        payments={localPayments}
        onBack={() => setSelectedCustomerId(undefined)}
        onReceivePayment={() => setPaymentCustomerId(selectedCustomer.id)}
        onOutstanding={() => setOutstandingCustomerId(selectedCustomer.id)}
        onLocationsChange={async (locations) => {
          await updateCompany(token, selectedCustomer.id, { locations } as any);
          await refreshData();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Kpi title="Total Customers" value={kpis.totalCustomers} icon={UsersRound} tone="primary" />
        <Kpi title="Active Customers" value={kpis.activeCustomers} icon={ShieldCheck} tone="success" />
        <Kpi title="Revenue This Month" value={money(kpis.revenueThisMonth)} icon={Banknote} tone="success" />
        <Kpi title="Total Outstanding" value={money(kpis.outstanding)} icon={ReceiptText} tone="danger" />
        <Kpi title="Payments Received This Month" value={money(kpis.paymentsThisMonth)} icon={CreditCard} tone="primary" />
        <Kpi title="Customer Advance Balance" value={money(kpis.advance)} icon={Gauge} tone="warning" />
      </section>

      <section className="rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Customer Dashboard</h3>
            <p className="text-sm text-tower-muted">Customer, revenue, receivables, payment, and ledger control.</p>
          </div>
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-md bg-tower-primary px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-950/30">
            <span className="text-lg leading-none">+</span>
            Add Customer
          </button>
        </div>
        <div className="grid gap-3 xl:grid-cols-[1.4fr_0.8fr_0.8fr_1fr]">
          <label className="block text-sm text-tower-muted">
            Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, GST, mobile" className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white outline-none ring-tower-primary focus:ring-2" />
          </label>
          <FieldSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={["All", "Active", "Inactive", "Outstanding"].map((item) => ({ label: item === "Outstanding" ? "Outstanding Customers" : item, value: item }))} />
          <FieldSelect label="Revenue Range" value={revenueRange} onChange={setRevenueRange} options={[{ label: "All Revenue", value: "All" }, { label: "Up to 1L", value: "0-1L" }, { label: "1L to 5L", value: "1L-5L" }, { label: "Above 5L", value: "5L+" }]} />
          <FieldSelect label="Date Range" value={datePreset} onChange={setDatePreset} options={["All Time", "This Month", "Previous Month", "Custom Range"].map((item) => ({ label: item, value: item }))} />
        </div>
        {datePreset === "Custom Range" && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <DateInput label="From" value={customFrom} onChange={setCustomFrom} />
            <DateInput label="To" value={customTo} onChange={setCustomTo} />
          </div>
        )}
      </section>

      <Panel title="Customer Table" action={`${filtered.length} records`}>
        {deleteError && <div className="mb-4 rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{deleteError}</div>}
        <DataTable
          columns={["Customer", "GST", "Contact Person", "Phone", "Trips", "Revenue", "Received", "Pending", "Status", "Actions"]}
          rows={filtered.map((item) => [
            item.customer.name,
            item.customer.gstNumber,
            item.customer.contactPerson || "-",
            item.customer.phone,
            item.trips.length,
            money(item.revenue),
            money(item.received),
            <button key={`${item.customer.id}-pending`} onClick={() => setOutstandingCustomerId(item.customer.id)} className="font-medium text-tower-warning hover:text-white">{money(item.outstanding)}</button>,
            <Status key={`${item.customer.id}-status`} value={item.status} />,
            <div key={`${item.customer.id}-actions`} className="flex flex-wrap gap-2">
              <button onClick={() => setSelectedCustomerId(item.customer.id)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-1.5 text-xs text-white hover:border-tower-primary/60">View More</button>
              <button onClick={() => setEditCustomer(item.customer)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-1.5 text-xs text-white hover:border-tower-primary/60">Edit</button>
              <button
                disabled={deletingCustomerId === item.customer.id}
                onClick={async () => {
                  if (!window.confirm("Are you sure you want to delete this Company?")) return;
                  setDeleteError("");
                  setDeletingCustomerId(item.customer.id);
                  try {
                    await deleteCompany(token, item.customer.id);
                    await refreshData();
                  } catch (error) {
                    setDeleteError(error instanceof Error ? error.message : "Company could not be deleted.");
                  } finally {
                    setDeletingCustomerId(undefined);
                  }
                }}
                className="rounded-md border border-tower-danger/50 bg-tower-danger/10 px-3 py-1.5 text-xs text-red-200 disabled:opacity-40"
              >
                {deletingCustomerId === item.customer.id ? "Deleting" : "Delete"}
              </button>
            </div>
          ])}
        />
      </Panel>

      {addOpen && <AddCustomerModal onClose={() => setAddOpen(false)} onSave={async (customer) => { await createCompany(token, customerToCompanyPayload(customer)); await refreshData(); setAddOpen(false); }} />}
      {editCustomer && <AddCustomerModal customer={editCustomer} onClose={() => setEditCustomer(undefined)} onSave={async (customer) => { await updateCompany(token, editCustomer.id, customerToCompanyPayload(customer)); await refreshData(); setEditCustomer(undefined); }} />}
      {paymentCustomer && <ReceivePaymentModal customer={paymentCustomer} invoices={localInvoices} onClose={() => setPaymentCustomerId(undefined)} onSave={async (payment, updatedInvoices) => { await savePayment(payment, updatedInvoices); setPaymentCustomerId(undefined); }} />}
      {outstandingCustomer && <OutstandingModal customer={outstandingCustomer} invoices={localInvoices} trips={trips} onClose={() => setOutstandingCustomerId(undefined)} />}
    </div>
  );
}

function CustomerDetailsPage({ customer, trips, invoices, payments, onBack, onReceivePayment, onOutstanding, onLocationsChange }: { customer: Customer; trips: Trip[]; invoices: Invoice[]; payments: Payment[]; onBack: () => void; onReceivePayment: () => void; onOutstanding: () => void; onLocationsChange: (locations: CustomerLocation[]) => void | Promise<void> }) {
  const [tab, setTab] = useState("Overview");
  const [tripFilter, setTripFilter] = useState("Current Month");
  const [tripFrom, setTripFrom] = useState(monthBounds().from);
  const [tripTo, setTripTo] = useState(monthBounds().to);
  const [invoiceFilter, setInvoiceFilter] = useState("All");
  const [ledgerFilter, setLedgerFilter] = useState("All Time");
  const [ledgerFrom, setLedgerFrom] = useState(monthBounds().from);
  const [ledgerTo, setLedgerTo] = useState(monthBounds().to);
  const [allocationPaymentId, setAllocationPaymentId] = useState<string>();
  const [selectedTrip, setSelectedTrip] = useState<LocalTrip>();
  const summary = customerSummary(customer, trips, invoices, payments);
  const customerInvoices = invoices.filter((invoice) => invoice.customerId === customer.id);
  const customerPayments = payments.filter((payment) => payment.customerId === customer.id);
  const visibleTrips = summary.trips.filter((trip) => {
    const invoice = customerInvoices.find((item) => item.tripId === trip.id);
    const status = invoice ? invoiceStatus(invoice) : "Unpaid";
    const matchesDate = tripFilter === "Current Month" ? trip.tripDate.slice(0, 7) === today().slice(0, 7) : tripFilter === "Previous Month" ? trip.tripDate.slice(0, 7) === monthBounds(-1).from.slice(0, 7) : tripFilter === "Custom Range" ? isWithinRange(trip.tripDate, tripFrom, tripTo) : true;
    const matchesStatus = ["Paid", "Partially Paid", "Unpaid", "Overdue"].includes(tripFilter) ? status === tripFilter : true;
    return matchesDate && matchesStatus;
  });
  const visibleInvoices = customerInvoices.filter((invoice) => invoiceFilter === "All" || invoiceStatus(invoice) === invoiceFilter);
  const ledgerRows = buildCustomerLedger(customer, trips, invoices, payments).filter((row) => ledgerFilter === "All Time" ? true : ledgerFilter === "Custom Range" ? isWithinRange(row.date, ledgerFrom, ledgerTo) : row.date.slice(0, 7) === today().slice(0, 7));
  const allocationPayment = customerPayments.find((payment) => payment.id === allocationPaymentId);

  if (selectedTrip) {
    return (
      <TripDetailsPage
        trip={selectedTrip}
        invoice={invoices.find((invoice) => invoice.tripId === selectedTrip.id)}
        onBack={() => setSelectedTrip(undefined)}
        onWorkflow={() => undefined}
        onGenerateInvoice={() => undefined}
        onPaymentStatus={() => undefined}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower xl:flex-row xl:items-center xl:justify-between">
        <div>
          <button onClick={onBack} className="mb-3 rounded-md border border-tower-border px-3 py-1.5 text-sm text-tower-muted hover:text-white">Back</button>
          <h3 className="text-xl font-semibold">{customer.name}</h3>
          <p className="text-sm text-tower-muted">{customer.gstNumber} · {customer.phone}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onReceivePayment} className="rounded-md bg-tower-primary px-4 py-2 text-sm font-medium text-white">Add Payment</button>
          <button onClick={() => setTab("Ledger")} className="rounded-md border border-tower-border px-4 py-2 text-sm text-white">View Ledger</button>
          <button onClick={onOutstanding} className="rounded-md border border-tower-border px-4 py-2 text-sm text-white">View Pending Invoices</button>
        </div>
      </div>
      <Segment value={tab} onChange={setTab} values={["Overview", "Trips", "Invoices", "Payments", "Ledger", "Locations"]} />

      {tab === "Overview" && (
        <div className="space-y-6">
          <Panel title="Customer Overview">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Info label="Customer Name" value={customer.name} />
              <Info label="GST Number" value={customer.gstNumber} />
              <Info label="Contact Person" value={customer.contactPerson} />
              <Info label="Mobile Number" value={customer.phone} />
              <Info label="Email" value={customer.email} />
              <Info label="Billing Address" value={customer.address} />
            </div>
          </Panel>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Kpi title="Total Trips" value={summary.trips.length} icon={Route} tone="primary" />
            <Kpi title="Total Revenue" value={money(summary.revenue)} icon={Banknote} tone="success" />
            <Kpi title="Payments Received" value={money(summary.received)} icon={CreditCard} tone="primary" />
            <Kpi title="Current Outstanding" value={money(summary.outstanding)} icon={ReceiptText} tone="danger" />
            <Kpi title="Advance Balance" value={money(summary.advance)} icon={Gauge} tone="warning" />
            <Kpi title="Average Freight" value={money(summary.averageFreight)} icon={BarChart3} tone="success" />
          </section>
          <Panel title="Operational Summary">
            <div className="grid gap-3 md:grid-cols-3">
              <Info label="Current Month Revenue" value={money(summary.currentMonthRevenue)} />
              <Info label="Current Month Trips" value={summary.currentMonthTrips} />
              <Info label="Last Trip Date" value={summary.lastTripDate || "-"} />
            </div>
          </Panel>
        </div>
      )}

      {tab === "Trips" && (
        <Panel title="Trips" action={<Segment value={tripFilter} onChange={setTripFilter} values={["Current Month", "Previous Month", "Custom Range", "Paid", "Partially Paid", "Unpaid", "Overdue"]} />}>
          {tripFilter === "Custom Range" && <div className="mb-4 grid gap-3 md:grid-cols-2"><DateInput label="From" value={tripFrom} onChange={setTripFrom} /><DateInput label="To" value={tripTo} onChange={setTripTo} /></div>}
          <DataTable columns={["Trip ID", "Trip Date", "Route", "Vehicle", "Driver", "Freight Amount", "Invoice Number", "Payment Status"]} rows={visibleTrips.map((trip) => {
            const invoice = customerInvoices.find((item) => item.tripId === trip.id);
            return [
              <button key={trip.id} onClick={() => setSelectedTrip(enrichTrip(trip, invoices, 0))} className="text-left font-medium text-tower-primary hover:text-blue-300">{trip.tripNumber}</button>,
              trip.tripDate,
              `${trip.loadingPoint} to ${trip.unloadingPoint}`,
              trip.vehicle?.number,
              trip.driver?.name,
              money(trip.freightAmount),
              invoice?.invoiceNumber || "-",
              <Status key={`${trip.id}-status`} value={invoice ? invoiceStatus(invoice) : "Unpaid"} />
            ];
          })} />
        </Panel>
      )}

      {tab === "Invoices" && (
        <Panel title="Invoices" action={<Segment value={invoiceFilter} onChange={setInvoiceFilter} values={["All", "Paid", "Partially Paid", "Unpaid", "Overdue"]} />}>
          <DataTable columns={["Invoice Number", "Invoice Date", "Due Date", "Trip ID", "Freight Amount", "Paid Amount", "Balance Amount", "Status", "Actions"]} rows={visibleInvoices.map((invoice) => {
            const trip = trips.find((item) => item.id === invoice.tripId);
            return [invoice.invoiceNumber, invoice.invoiceDate, invoice.dueDate, trip?.tripNumber || "-", money(invoice.amount), money(invoice.amount - invoice.outstandingAmount), money(invoice.outstandingAmount), <Status key={invoice.id} value={invoiceStatus(invoice)} />, <div key={`${invoice.id}-actions`} className="flex gap-2"><button className="rounded-md border border-tower-border px-2 py-1 text-xs">View Invoice</button><button className="rounded-md border border-tower-border px-2 py-1 text-xs">Download PDF</button></div>];
          })} />
        </Panel>
      )}

      {tab === "Payments" && (
        <Panel title="Payments" action={<button onClick={onReceivePayment} className="rounded-md bg-tower-primary px-3 py-2 text-xs font-medium text-white">Receive Payment</button>}>
          <DataTable columns={["Date", "Amount", "Mode", "Reference Number", "Remarks", "Actions"]} rows={customerPayments.map((payment) => [payment.paymentDate, money(payment.amount), payment.mode, payment.referenceNumber, payment.remarks, <div key={payment.id} className="flex gap-2"><button onClick={() => setAllocationPaymentId(payment.id)} className="rounded-md border border-tower-border px-2 py-1 text-xs">View Allocation</button><button className="rounded-md border border-tower-border px-2 py-1 text-xs">Edit Payment</button><button className="rounded-md border border-tower-border px-2 py-1 text-xs">Download Receipt</button></div>])} />
        </Panel>
      )}

      {tab === "Ledger" && (
        <Panel title="Ledger" action={<div className="flex flex-wrap gap-2"><Segment value={ledgerFilter} onChange={setLedgerFilter} values={["All Time", "This Month", "Custom Range"]} /><button className="rounded-md border border-tower-border px-3 py-1.5 text-xs">Export PDF</button><button className="rounded-md border border-tower-border px-3 py-1.5 text-xs">Export Excel</button><button className="rounded-md border border-tower-border px-3 py-1.5 text-xs">Print</button></div>}>
          {ledgerFilter === "Custom Range" && <div className="mb-4 grid gap-3 md:grid-cols-2"><DateInput label="From" value={ledgerFrom} onChange={setLedgerFrom} /><DateInput label="To" value={ledgerTo} onChange={setLedgerTo} /></div>}
          <DataTable columns={["Date", "Particular", "Reference", "Debit", "Credit", "Running Balance"]} rows={ledgerRows.map((row) => [row.date, row.particular, row.reference, row.debit ? money(row.debit) : "-", row.credit ? money(row.credit) : "-", money(row.balance)])} />
        </Panel>
      )}

      {tab === "Locations" && <CustomerLocationsPanel locations={customer.locations || []} onChange={onLocationsChange} />}
      {allocationPayment && <PaymentAllocationModal payment={allocationPayment} invoices={customerInvoices} onClose={() => setAllocationPaymentId(undefined)} />}
    </div>
  );
}

function AddCustomerModal({ customer, onClose, onSave }: { customer?: Customer; onClose: () => void; onSave: (customer: Customer) => void | Promise<void> }) {
  const [name, setName] = useState(customer?.name || "");
  const [gstNumber, setGstNumber] = useState(customer?.gstNumber || "");
  const [contactPerson, setContactPerson] = useState(customer?.contactPerson || "");
  const [phone, setPhone] = useState(customer?.phone || "");
  const [email, setEmail] = useState(customer?.email || "");
  const [address, setAddress] = useState(customer?.address || "");
  const [locations, setLocations] = useState<CustomerLocation[]>(customer?.locations || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setError("");
    if (!name.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      await onSave({ id: customer?.id || `customer-${Date.now()}`, name, gstNumber, contactPerson, phone, email, address, locations });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Customer could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalShell title={customer ? "Edit Customer" : "Add Customer"} subtitle="Create customer master data and saved logistics locations." onClose={onClose}>
      {error && <div className="mb-4 rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Customer Name" value={name} onChange={setName} />
        <TextField label="GST Number" value={gstNumber} onChange={setGstNumber} />
        <TextField label="Contact Person Name" value={contactPerson} onChange={setContactPerson} />
        <TextField label="Mobile Number" value={phone} onChange={setPhone} />
        <TextField label="Email Address" value={email} onChange={setEmail} />
        <TextField label="Billing Address" value={address} onChange={setAddress} />
      </div>
      <div className="mt-5">
        <CustomerLocationsPanel locations={locations} onChange={setLocations} compact />
      </div>
      <ModalActions onClose={onClose} onSave={() => { void save(); }} disabled={!name.trim() || !phone.trim() || saving} label={saving ? "Saving..." : "Save Customer"} />
    </ModalShell>
  );
}

function CustomerLocationsPanel({ locations, onChange, compact }: { locations: CustomerLocation[]; onChange: (locations: CustomerLocation[]) => void | Promise<void>; compact?: boolean }) {
  const [editing, setEditing] = useState<CustomerLocation>();
  const save = (location: CustomerLocation) => {
    onChange(locations.some((item) => item.id === location.id) ? locations.map((item) => item.id === location.id ? location : item) : [...locations, location]);
    setEditing(undefined);
  };
  return (
    <Panel title="Locations" action={<button onClick={() => setEditing({ id: `loc-${Date.now()}`, name: "", address: "", createdDate: today() })} className="rounded-md bg-tower-primary px-3 py-2 text-xs font-medium text-white">Add New Location</button>}>
      <DataTable columns={["Location Name", "Address", "Created Date", "Actions"]} rows={locations.map((location) => [location.name, location.address, location.createdDate, <div key={location.id} className="flex gap-2"><button onClick={() => setEditing(location)} className="rounded-md border border-tower-border px-2 py-1 text-xs">Edit</button><button onClick={() => onChange(locations.filter((item) => item.id !== location.id))} className="rounded-md border border-tower-border px-2 py-1 text-xs text-tower-danger">Delete</button></div>])} />
      {!locations.length && <div className="mt-3 rounded-md border border-tower-border bg-[#0B1220] p-3 text-sm text-tower-muted">No saved locations yet.</div>}
      {editing && <LocationEditor location={editing} onClose={() => setEditing(undefined)} onSave={save} compact={compact} />}
    </Panel>
  );
}

function LocationEditor({ location, onClose, onSave, compact }: { location: CustomerLocation; onClose: () => void; onSave: (location: CustomerLocation) => void; compact?: boolean }) {
  const [name, setName] = useState(location.name);
  const [address, setAddress] = useState(location.address);
  const body = (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Location Name" value={name} onChange={setName} />
        <TextField label="Full Address" value={address} onChange={setAddress} />
      </div>
      <ModalActions onClose={onClose} onSave={() => onSave({ ...location, name, address })} disabled={!name.trim() || !address.trim()} label="Save Location" />
    </>
  );
  return compact ? <div className="mt-4 rounded-lg border border-tower-border bg-[#0B1220] p-4">{body}</div> : <ModalShell title="Location" subtitle="Saved customer loading or unloading point." onClose={onClose}>{body}</ModalShell>;
}

function ReceivePaymentModal({ customer, invoices, onClose, onSave }: { customer: Customer; invoices: Invoice[]; onClose: () => void; onSave: (payment: Payment, updatedInvoices: Invoice[]) => void | Promise<void> }) {
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState<Payment["mode"]>("NEFT");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const pending = invoices.filter((invoice) => invoice.customerId === customer.id && invoice.outstandingAmount > 0);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const allocated = Object.values(allocations).reduce((sum, value) => sum + Number(value || 0), 0);
  const invalid = allocated > amount || pending.some((invoice) => (allocations[invoice.id] || 0) > invoice.outstandingAmount);
  const setInvoiceAllocation = (invoice: Invoice, value: number) => {
    const safeValue = Math.min(Math.max(Number(value || 0), 0), invoice.outstandingAmount);
    setAllocations((current) => ({ ...current, [invoice.id]: safeValue }));
  };
  const save = () => {
    if (invalid || amount <= 0) return;
    const paymentAllocations = pending.map((invoice) => ({ invoiceId: invoice.id, amount: allocations[invoice.id] || 0 })).filter((item) => item.amount > 0);
    const updatedInvoices = invoices.map((invoice) => {
      const allocation = paymentAllocations.find((item) => item.invoiceId === invoice.id)?.amount || 0;
      if (!allocation) return invoice;
      const outstandingAmount = Math.max(invoice.outstandingAmount - allocation, 0);
      return { ...invoice, outstandingAmount, status: outstandingAmount <= 0 ? "Paid" : "Partial" };
    });
    onSave({ id: `payment-${Date.now()}`, customerId: customer.id, amount, paymentDate: date, mode, referenceNumber, remarks, allocations: paymentAllocations }, updatedInvoices);
  };
  return (
    <ModalShell title="Receive Payment" subtitle={`${customer.name} payment allocation`} onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <ReadOnlyField label="Customer" value={customer.name} />
        <DateInput label="Payment Date" value={date} onChange={setDate} />
        <NumberField label="Amount Received" value={amount} onChange={setAmount} />
        <FieldSelect label="Payment Mode" value={mode} onChange={(value) => setMode(value as Payment["mode"])} options={["NEFT", "RTGS", "UPI", "Cash", "Cheque", "Other"].map((item) => ({ label: item, value: item }))} />
        <TextField label="Reference Number" value={referenceNumber} onChange={setReferenceNumber} />
        <TextField label="Remarks" value={remarks} onChange={setRemarks} />
      </div>
      <div className="mt-5 grid gap-3 rounded-lg border border-tower-border bg-[#0B1220] p-4 md:grid-cols-3">
        <Info label="Payment Received" value={money(amount)} />
        <Info label="Allocated" value={money(allocated)} />
        <Info label="Remaining / Advance Balance" value={money(Math.max(amount - allocated, 0))} />
      </div>
      <div className="mt-5">
        <DataTable columns={["Select", "Invoice No", "Trip ID", "Invoice Date", "Total Amount", "Paid Amount", "Balance Amount", "Allocation"]} rows={pending.map((invoice) => [<input key={`${invoice.id}-select`} type="checkbox" checked={(allocations[invoice.id] || 0) > 0} onChange={(event) => setInvoiceAllocation(invoice, event.target.checked ? Math.min(invoice.outstandingAmount, Math.max(amount - allocated, 0) || invoice.outstandingAmount) : 0)} />, invoice.invoiceNumber, invoice.tripId, invoice.invoiceDate, money(invoice.amount), money(invoice.amount - invoice.outstandingAmount), money(invoice.outstandingAmount), <input key={invoice.id} type="number" min="0" max={invoice.outstandingAmount} value={allocations[invoice.id] || 0} onChange={(event) => setInvoiceAllocation(invoice, Number(event.target.value))} className="w-32 rounded-md border border-tower-border bg-tower-card px-2 py-1 text-white" />])} />
      </div>
      {invalid && <p className="mt-3 rounded-md border border-tower-danger/40 bg-tower-danger/10 px-3 py-2 text-sm text-red-200">Allocation cannot exceed invoice balance or payment amount.</p>}
      <ModalActions onClose={onClose} onSave={save} disabled={invalid || amount <= 0} label="Save Payment" />
    </ModalShell>
  );
}

function PaymentAllocationModal({ payment, invoices, onClose }: { payment: Payment; invoices: Invoice[]; onClose: () => void }) {
  const allocated = paymentAllocatedAmount(payment);
  const advance = Math.max(payment.amount - allocated, 0);
  const rows = payment.allocations?.map((allocation) => {
    const invoice = invoices.find((item) => item.id === allocation.invoiceId);
    return [invoice?.invoiceNumber || allocation.invoiceId, invoice?.tripId || "-", invoice?.invoiceDate || "-", money(invoice?.amount || 0), money(allocation.amount)];
  }) || [];

  return (
    <ModalShell title="Payment Allocation" subtitle={`${payment.referenceNumber || payment.id} allocation details`} onClose={onClose}>
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <Info label="Payment Received" value={money(payment.amount)} />
        <Info label="Allocated" value={money(allocated)} />
        <Info label="Advance Balance" value={money(advance)} />
      </div>
      <DataTable columns={["Invoice No", "Trip ID", "Invoice Date", "Total Amount", "Allocated Amount"]} rows={rows} />
      {!rows.length && <div className="mt-3 rounded-md border border-tower-border bg-[#0B1220] p-3 text-sm text-tower-muted">No invoice allocation. Full amount is held as customer advance.</div>}
    </ModalShell>
  );
}

function OutstandingModal({ customer, invoices, trips, onClose }: { customer: Customer; invoices: Invoice[]; trips: Trip[]; onClose: () => void }) {
  const [filter, setFilter] = useState("All");
  const rows = invoices.filter((invoice) => invoice.customerId === customer.id && invoice.outstandingAmount > 0).filter((invoice) => filter === "All" || invoiceStatus(invoice) === filter);
  return (
    <ModalShell title="Pending Invoices" subtitle={customer.name} onClose={onClose}>
      <div className="mb-4"><Segment value={filter} onChange={setFilter} values={["All", "Unpaid", "Partially Paid", "Overdue"]} /></div>
      <DataTable columns={["Invoice Number", "Trip ID", "Invoice Date", "Due Date", "Amount", "Paid Amount", "Balance Amount", "Days Outstanding"]} rows={rows.map((invoice) => {
        const trip = trips.find((item) => item.id === invoice.tripId);
        return [invoice.invoiceNumber, trip?.tripNumber || invoice.tripId, invoice.invoiceDate, invoice.dueDate, money(invoice.amount), money(invoice.amount - invoice.outstandingAmount), money(invoice.outstandingAmount), Math.max(Math.floor((+new Date(today()) - +new Date(invoice.dueDate)) / 86400000), 0)];
      })} />
    </ModalShell>
  );
}

function hydrateInvoice(invoice: Invoice, trips: Trip[], payments: Payment[]): LocalInvoice {
  const trip = trips.find((item) => item.id === invoice.tripId);
  const additionalCharges = invoice.additionalCharges || 0;
  const syncedAmount = (trip?.freightAmount ?? invoice.amount) + additionalCharges;
  const paid = invoicePaymentRows(invoice, payments).reduce((sum, payment) => sum + payment.allocatedAmount, 0);
  return {
    ...invoice,
    amount: syncedAmount,
    outstandingAmount: Math.max(syncedAmount - paid, 0),
    additionalCharges,
    activityLog: invoice.activityLog || [invoiceActivity("Invoice Generated", "Invoice available in billing module.")]
  };
}

function buildInvoiceRow(invoice: LocalInvoice, trip: Trip | undefined, customer: Customer | undefined, payments: Payment[]) {
  const paid = invoicePaymentRows(invoice, payments).reduce((sum, payment) => sum + payment.allocatedAmount, 0);
  const freightDetails = tripFreightBreakdown(trip);
  const freight = freightDetails.totalFreight || invoice.amount - (invoice.additionalCharges || 0);
  const amount = freight + (invoice.additionalCharges || 0);
  const balance = Math.max(amount - paid, 0);
  const status = invoiceDisplayStatus(invoice, paid, balance);
  return { invoice, trip, customer, freight, amount, paid, balance, status };
}

function tripFreightBreakdown(trip?: Trip) {
  const items = ((trip as any)?.items || []) as TripItem[];
  const weightMt = items.reduce((sum, item) => sum + Number(item.weight || 0), 0) || Number((trip as any)?.weightMt || 0);
  const totalFreight = Number(trip?.freightAmount || 0);
  const ratePerMt = weightMt ? totalFreight / weightMt : Number((trip as any)?.ratePerMt || 0);
  const material = items.length > 1 ? `${items[0]?.item || "Material"} +${items.length - 1}` : items[0]?.item || (trip as any)?.material || "Material";
  return { material, weightMt, ratePerMt, totalFreight };
}

function invoicePaymentRows(invoice: Invoice, payments: Payment[]) {
  return payments.flatMap((payment) => {
    const allocations = payment.allocations?.filter((allocation) => allocation.invoiceId === invoice.id) || [];
    if (allocations.length) return allocations.map((allocation) => ({ ...payment, allocatedAmount: allocation.amount }));
    if (payment.invoiceId === invoice.id) return [{ ...payment, allocatedAmount: payment.amount }];
    return [];
  });
}

function invoiceDisplayStatus(invoice: Invoice, paid: number, balance: number) {
  if (invoice.status === "Cancelled") return "Cancelled";
  if (balance <= 0) return "Paid";
  if (paid > 0) return "Partially Paid";
  if (invoice.emailStatus === "Sent" || invoice.status === "Sent") return "Sent";
  if (invoice.status === "Draft") return "Draft";
  return "Generated";
}

function invoiceActivity(action: string, remarks: string): InvoiceActivityRow {
  return { dateTime: new Date().toLocaleString("en-IN"), user: "NPFC Admin", action, remarks };
}

function invoiceActivityLog(invoice: LocalInvoice, payments: Payment[]) {
  const paymentEntries = invoicePaymentRows(invoice, payments).map((payment) => ({
    dateTime: `${payment.paymentDate} 00:00`,
    user: "NPFC Admin",
    action: "Payment Allocated",
    remarks: `${money(payment.allocatedAmount)} allocated via ${payment.mode} ${payment.referenceNumber || ""}`.trim()
  }));
  return [...(invoice.activityLog || []), ...paymentEntries].sort((a, b) => b.dateTime.localeCompare(a.dateTime));
}

function nextInvoiceNumber(invoices: Invoice[]) {
  const year = new Date().getFullYear();
  const max = invoices.reduce((highest, invoice) => {
    const match = invoice.invoiceNumber.match(/NPFC\/(\d{4})\/(\d+)$/);
    return match && Number(match[1]) === year ? Math.max(highest, Number(match[2])) : highest;
  }, 0);
  return `NPFC/${year}/${String(max + 1).padStart(6, "0")}`;
}

function invoiceDateRange(preset: string, customFrom: string, customTo: string): { from?: string; to?: string } {
  if (preset === "Current Month") return monthBounds();
  if (preset === "Previous Month") return monthBounds(-1);
  if (preset === "Custom Range") return { from: customFrom, to: customTo };
  return {};
}

function customerSummary(customer: Customer, trips: Trip[], invoices: Invoice[], payments: Payment[], range?: { from?: string; to?: string }) {
  const customerTrips = trips.filter((trip) => trip.customerId === customer.id && (!range?.from || trip.tripDate >= range.from) && (!range?.to || trip.tripDate <= range.to));
  const allCustomerTrips = trips.filter((trip) => trip.customerId === customer.id);
  const customerInvoices = invoices.filter((invoice) => invoice.customerId === customer.id);
  const customerPayments = payments.filter((payment) => payment.customerId === customer.id);
  const revenue = customerTrips.reduce((sum, trip) => sum + trip.freightAmount, 0);
  const received = customerPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const allocated = customerPayments.reduce((sum, payment) => sum + paymentAllocatedAmount(payment), 0);
  const outstanding = customerInvoices.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0);
  const tripDates = allCustomerTrips.map((trip) => trip.tripDate).sort();
  const lastTripDate = tripDates[tripDates.length - 1] || "";
  const status = lastTripDate && (+new Date(today()) - +new Date(lastTripDate)) / 86400000 <= 90 ? "Active" : "Inactive";
  const currentMonthTrips = allCustomerTrips.filter((trip) => trip.tripDate.slice(0, 7) === today().slice(0, 7));
  return {
    customer,
    trips: customerTrips,
    revenue,
    received,
    outstanding,
    advance: Math.max(received - allocated, 0),
    lastTripDate,
    status,
    currentMonthRevenue: currentMonthTrips.reduce((sum, trip) => sum + trip.freightAmount, 0),
    currentMonthTrips: currentMonthTrips.length,
    averageFreight: allCustomerTrips.length ? allCustomerTrips.reduce((sum, trip) => sum + trip.freightAmount, 0) / allCustomerTrips.length : 0
  };
}

function paymentAllocatedAmount(payment: Payment) {
  if (payment.allocations?.length) return payment.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  return payment.invoiceId ? payment.amount : 0;
}

function invoiceStatus(invoice: Invoice) {
  if (invoice.outstandingAmount <= 0) return "Paid";
  if (invoice.dueDate < today()) return "Overdue";
  if (invoice.outstandingAmount < invoice.amount) return "Partially Paid";
  return "Unpaid";
}

function buildCustomerLedger(customer: Customer, trips: Trip[], invoices: Invoice[], payments: Payment[]) {
  let balance = 0;
  const invoicedTripIds = new Set(invoices.filter((invoice) => invoice.customerId === customer.id).map((invoice) => invoice.tripId));
  return [
    ...trips.filter((trip) => trip.customerId === customer.id && !invoicedTripIds.has(trip.id)).map((trip) => ({ date: trip.tripDate, particular: `Trip ${trip.tripNumber}`, reference: "Unbilled Trip Freight", debit: trip.freightAmount, credit: 0 })),
    ...invoices.filter((invoice) => invoice.customerId === customer.id).map((invoice) => ({ date: invoice.invoiceDate, particular: "Invoice Generated", reference: invoice.invoiceNumber, debit: invoice.amount, credit: 0 })),
    ...payments.filter((payment) => payment.customerId === customer.id).map((payment) => ({ date: payment.paymentDate, particular: paymentAllocatedAmount(payment) < payment.amount ? "Payment Received / Advance" : "Payment Received", reference: payment.referenceNumber, debit: 0, credit: payment.amount }))
  ].sort((a, b) => a.date.localeCompare(b.date)).map((row) => {
    balance += row.debit - row.credit;
    return { ...row, balance };
  });
}

function customerDateRange(preset: string, customFrom: string, customTo: string) {
  if (preset === "This Month") return monthBounds();
  if (preset === "Previous Month") return monthBounds(-1);
  if (preset === "Custom Range") return { from: customFrom, to: customTo };
  return {};
}

function TripProfit({ trips }: { trips: Trip[] }) {
  return <Directory title="Trip Profit Calculation" columns={["Trip", "Revenue", "Expense", "Profit", "Margin"]} rows={trips.map((trip) => [trip.tripNumber, money(trip.freightAmount), money(trip.totalExpense), money(trip.profit), `${Math.round((trip.profit / trip.freightAmount) * 100)}%`])} />;
}

function Directory({ title, columns, rows }: { title: string; columns: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <Panel title={title} action={`${rows.length} records`}>
      <DataTable columns={columns} rows={rows} />
    </Panel>
  );
}

function PlaceholderModule({ name }: { name: string }) {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Panel title={name} action="Trip-linked">
        <div className="space-y-4 text-sm text-tower-muted">
          <p>This module is reserved for NPFC staff workflows and is linked back to trips, documents, financial records, or fleet assets.</p>
          <div className="grid gap-3">
            {["Create record", "Attach trip", "Upload document", "Export PDF", "Export Excel"].map((item) => (
              <button key={item} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-3 text-left text-white hover:border-tower-primary/60">{item}</button>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-tower-border bg-[#0B1220] p-4">
      <h4 className="mb-4 font-medium">{title}</h4>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ label: string; value: string }> }) {
  return (
    <label className="block text-sm text-tower-muted">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white outline-none ring-tower-primary focus:ring-2">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm text-tower-muted">
      {label}
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white outline-none ring-tower-primary focus:ring-2" />
    </label>
  );
}

function MonthInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm text-tower-muted">
      {label}
      <input type="month" value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white outline-none ring-tower-primary focus:ring-2" />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-sm text-tower-muted">
      {label}
      <input type="number" min="0" step="0.01" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white outline-none ring-tower-primary focus:ring-2" />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="block text-sm text-tower-muted">
      {label}
      <div className="mt-2 min-h-[2.625rem] rounded-md border border-tower-border bg-tower-card px-3 py-2 text-white">{formatCellValue(value) || "-"}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-tower-border bg-[#0B1220] p-3">
      <div className="text-xs uppercase tracking-[0.12em] text-tower-muted">{label}</div>
      <div className="mt-1 text-sm font-medium text-white">{formatCellValue(value) || "-"}</div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm text-tower-muted">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white outline-none ring-tower-primary focus:ring-2" />
    </label>
  );
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-tower-border bg-tower-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-tower-border px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-sm text-tower-muted">{subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-md border border-tower-border px-3 py-2 text-sm text-tower-muted hover:text-white">Close</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
      <div className="ml-auto h-full w-full max-w-4xl overflow-y-auto border-l border-tower-border bg-tower-card shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-tower-border bg-tower-card px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-sm text-tower-muted">{subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-md border border-tower-border px-3 py-2 text-sm text-tower-muted hover:text-white">Close</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ onClose, onSave, disabled, label }: { onClose: () => void; onSave: () => void; disabled?: boolean; label: string }) {
  return (
    <div className="mt-6 flex justify-end gap-3 border-t border-tower-border pt-4">
      <button onClick={onClose} className="rounded-md border border-tower-border px-4 py-2 text-sm text-tower-muted hover:text-white">Cancel</button>
      <button disabled={disabled} onClick={onSave} className="rounded-md bg-tower-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{label}</button>
    </div>
  );
}

function ExpiryDate({ value }: { value: string }) {
  const days = daysUntil(value);
  const tone = days < 0 ? "border-tower-danger/40 bg-tower-danger/10 text-tower-danger" : days < 30 ? "border-tower-warning/40 bg-tower-warning/10 text-tower-warning" : days > 60 ? "border-tower-success/40 bg-tower-success/10 text-tower-success" : "border-tower-primary/40 bg-tower-primary/10 text-tower-primary";
  const label = days < 0 ? "Expired" : `${days} days`;
  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", tone)} title={label}>{formatDisplayDate(value)}</span>;
}

function formatCellValue(value: React.ReactNode) {
  if (typeof value !== "string") return value;
  return isIsoDateLike(value) ? formatDisplayDate(value) : value;
}

function isIsoDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)?$/.test(value);
}

function formatDisplayDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function customerToCompanyPayload(customer: Customer) {
  return {
    companyName: customer.name,
    gstNumber: customer.gstNumber || "NA",
    address: customer.address || "NA",
    contactPerson: customer.contactPerson,
    phone: customer.phone,
    email: customer.email || undefined,
    locations: customer.locations || []
  };
}

function tripToPayload(trip: LocalTrip) {
  const totalWeight = (trip.items || []).reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const ratePerMt = totalWeight ? trip.freightAmount / totalWeight : 0;
  const firstItem = trip.items?.[0];
  return {
    tripId: trip.tripNumber,
    companyId: trip.customerId,
    vehicleId: trip.vehicleId,
    driverId: trip.driverId,
    source: trip.loadingPoint,
    destination: trip.unloadingPoint,
    material: firstItem?.item,
    weightMt: totalWeight,
    ratePerMt,
    freightAmount: trip.freightAmount,
    loadingDate: trip.tripDate,
    status: backendTripStatus(trip.status),
    expenses: [
      { type: "Diesel", amount: trip.dieselExpense || 0 },
      { type: "Toll", amount: trip.tollExpense || 0 },
      { type: "Loading", amount: trip.loadingExpense || 0 },
      { type: "Unloading", amount: trip.unloadingExpense || 0 },
      { type: "Other", amount: trip.otherExpense || 0, remarks: trip.remarks }
    ].filter((expense) => expense.amount > 0)
  };
}

function backendTripStatus(status: string) {
  if (status === "Draft") return "Trip Created";
  if (status === "Assigned") return "Vehicle Assigned";
  if (status === "Loading") return "Loading Started";
  if (status === "Completed" || status === "Paid" || status === "Closed" || status === "Payment Pending") return "Payment Received";
  if (workflow.includes(status) || status === "Cancelled") return status;
  return "Trip Created";
}

function invoicePaymentStatusForApi(status: string): "Draft" | "Generated" | "Sent" | "Partially Paid" | "Paid" | "Cancelled" {
  if (status === "Paid") return "Paid";
  if (status === "Partial" || status === "Partially Paid") return "Partially Paid";
  if (status === "Sent") return "Sent";
  if (status === "Cancelled") return "Cancelled";
  if (status === "Draft") return "Draft";
  return "Generated";
}

function driverUploadType(type: string) {
  if (/license/i.test(type)) return "License";
  if (/aadhaar|aadhar/i.test(type)) return "Aadhaar";
  if (/pan/i.test(type)) return "PAN";
  return type;
}

function vehicleUploadType(type: string) {
  if (/rc|registration/i.test(type)) return "RC";
  if (/insurance/i.test(type)) return "Insurance";
  if (/permit/i.test(type)) return "Permit";
  if (/fitness/i.test(type)) return "Fitness";
  if (/puc|pollution/i.test(type)) return "PUC";
  return type;
}

function vehicleExpiryPatch(type: string, expiryDate: string): Partial<VehiclePayload> | undefined {
  if (!expiryDate) return undefined;
  if (/insurance/i.test(type)) return { insuranceExpiry: expiryDate };
  if (/puc|pollution/i.test(type)) return { pucExpiry: expiryDate };
  if (/fitness/i.test(type)) return { fitnessExpiry: expiryDate };
  if (/permit/i.test(type)) return { permitExpiry: expiryDate };
  return undefined;
}

function driverDocumentsFromApi(driver: Driver): DriverDocument[] {
  return (((driver as any).documentUrls || []) as Array<{ type: string; url: string; key: string; uploadedAt?: string }>).map((document) => ({
    id: document.key,
    driverId: driver.id,
    type: document.type,
    uploadedDate: toDateInput(new Date(document.uploadedAt || Date.now())),
    fileName: document.key.split("/").pop() || document.type,
    fileUrl: document.url,
    history: []
  }));
}

function vehicleDocumentsFromApi(vehicle: Vehicle): VehicleDocument[] {
  return (((vehicle as any).documentUrls || []) as Array<{ type: string; url: string; key: string; uploadedAt?: string }>).map((document) => ({
    id: document.key,
    vehicleId: vehicle.id,
    type: document.type,
    expiryDate: vehicleDocumentExpiry(vehicle, document.type),
    uploadedDate: toDateInput(new Date(document.uploadedAt || Date.now())),
    fileName: document.key.split("/").pop() || document.type,
    fileUrl: document.url,
    history: []
  }));
}

function vehicleDocumentExpiry(vehicle: Vehicle, type: string) {
  if (/insurance/i.test(type)) return vehicle.insuranceExpiry;
  if (/permit/i.test(type)) return vehicle.permitExpiry;
  if (/fitness/i.test(type)) return vehicle.fitnessExpiry;
  return vehicle.pucExpiry || vehicle.serviceDue || today();
}

function enrichTrip(trip: Trip, invoices: Invoice[], index: number): LocalTrip {
  const invoice = invoices.find((item) => item.tripId === trip.id);
  const weight = Math.max(Math.round(trip.freightAmount / 1800), 1);
  const item = itemOptions[index % itemOptions.length];
  const items = [{ id: `${trip.id}-item-1`, item, weight, rate: Math.round(trip.freightAmount / weight) }];
  return {
    ...trip,
    status: normalizeTripStatus(trip.status),
    items,
    payer: "Consigner",
    invoiceStatus: invoice ? (invoice.emailStatus === "Sent" ? "Sent" : "Generated") : "Not Generated",
    paymentStatus: invoice ? normalizePaymentStatus(invoice.status, invoice.outstandingAmount) : "Pending"
  };
}

function normalizeTripStatus(status: string) {
  if (status === "Draft") return "Trip Created";
  if (status === "Assigned") return "Vehicle Assigned";
  if (status === "Loading") return "Loading Started";
  if (status === "Completed" || status === "Paid" || status === "Closed" || status === "Payment Pending") return "Payment Received";
  return workflow.includes(status) ? status : "Trip Created";
}

function normalizePaymentStatus(status: string, outstanding: number): "Pending" | "Partial" | "Paid" {
  if (status === "Paid" || outstanding <= 0) return "Paid";
  if (status === "Partial") return "Partial";
  return "Pending";
}

function nextWorkflowStatus(status: string) {
  const index = workflow.indexOf(status);
  return index >= 0 ? workflow[index + 1] : undefined;
}

function workflowButton(status: string) {
  return ({
    "Trip Created": "Assign Vehicle",
    "Vehicle Assigned": "Start Loading",
    "Loading Started": "Mark Loaded",
    Loaded: "Start Transit",
    "In Transit": "Reached Destination",
    "Reached Destination": "Start Unloading",
    "Unloading Started": "Mark Delivered",
    Delivered: "Generate Invoice",
    "Invoice Generated": "Payment Received"
  } as Record<string, string>)[status] || "Next Step";
}

function openWhatsAppStatusDraft(trip: LocalTrip, status: string) {
  const message = `Dear Customer,\nYour shipment for Trip #${trip.tripNumber} has been updated.\n\nCurrent Status:\n${status}\n\nThank you.`;
  const phone = trip.customer?.phone || "";
  const digits = phone.replace(/\D/g, "");
  const url = `https://wa.me/${digits ? digits : ""}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function nextTripNumber(trips: LocalTrip[]) {
  const max = trips.reduce((highest, trip) => {
    const match = trip.tripNumber.match(/(\d+)$/);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  return `TRIP-${String(max + 1).padStart(4, "0")}`;
}

function today(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return toDateInput(date);
}

function monthBounds(offset = 0) {
  const date = new Date();
  const first = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  const last = new Date(date.getFullYear(), date.getMonth() + offset + 1, 0);
  return { from: toDateInput(first), to: toDateInput(last) };
}

function profitLossDateRange(preset: string) {
  const now = new Date();
  if (preset === "Today") return { from: toDateInput(now), to: toDateInput(now) };
  if (preset === "This Week") {
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
    return { from: toDateInput(from), to: toDateInput(to) };
  }
  if (preset === "Last Month") return monthBounds(-1);
  if (preset === "Quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const from = new Date(now.getFullYear(), quarterStartMonth, 1);
    const to = new Date(now.getFullYear(), quarterStartMonth + 3, 0);
    return { from: toDateInput(from), to: toDateInput(to) };
  }
  if (preset === "Year") return { from: toDateInput(new Date(now.getFullYear(), 0, 1)), to: toDateInput(new Date(now.getFullYear(), 11, 31)) };
  return monthBounds();
}

function statementDateRange(range: string) {
  if (range === "Daily") return profitLossDateRange("Today");
  if (range === "Weekly") return profitLossDateRange("This Week");
  if (range === "Quarterly") return profitLossDateRange("Quarter");
  if (range === "Yearly") return profitLossDateRange("Year");
  return monthBounds();
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateRange(preset: string, customFrom: string, customTo: string) {
  const now = new Date();
  let from = new Date(now.getFullYear(), now.getMonth(), 1);
  let to = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  if (preset === "Today") {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    to = new Date(from);
  } else if (preset === "This Week") {
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
    to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
  } else if (preset === "Last Month") {
    const bounds = monthBounds(-1);
    from = new Date(bounds.from);
    to = new Date(bounds.to);
  } else if (preset === "Custom Range") {
    from = new Date(customFrom);
    to = new Date(customTo);
  }

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function daysUntil(value: string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((+date - +now) / 86400000);
}

function countExpiringVehicleDocs(vehicles: Vehicle[]) {
  return vehicles.filter((vehicle) =>
    [vehicle.insuranceExpiry, vehicle.fitnessExpiry, vehicle.permitExpiry].some((date) => {
      const days = daysUntil(date);
      return days >= 0 && days <= 30;
    })
  ).length;
}

function isWithinDateFilter(value: string, from: string, to: string) {
  return (!from || value >= from) && (!to || value <= to);
}

function isWithinRange(value: string, from: string, to: string) {
  return value >= from && value <= to;
}

function enrichDriverProfile(driver: Driver): DriverProfile {
  return {
    ...driver,
    alternateMobile: "",
    dateOfBirth: today(-11000),
    joiningDate: today(-500),
    emergencyContactName: "",
    emergencyContactNumber: "",
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    monthlySalary: 28000
  };
}

function getCurrentDriverTrip(driverId: string, trips: Trip[]) {
  return [...trips]
    .filter((trip) => trip.driverId === driverId && !["Completed", "Closed", "Paid"].includes(trip.status))
    .sort((a, b) => +new Date(b.tripDate) - +new Date(a.tripDate))[0];
}

function resolveDriverStatus(driver: DriverProfile, trips: Trip[]) {
  if (driver.status === "Inactive" || driver.status === "Leave") return driver.status;
  const activeTrip = getCurrentDriverTrip(driver.id, trips);
  if (!activeTrip) return "Available";
  if (activeTrip.status === "Assigned" || activeTrip.status === "Draft") return "Assigned";
  return "On Trip";
}

function getDriverMonthRange(preset: string, customMonth: string) {
  const bounds = preset === "Previous Month" ? monthBounds(-1) : preset === "Custom Month" ? monthStringBounds(customMonth) : monthBounds();
  return bounds;
}

function getDriverTripRange(preset: string, customFrom: string, customTo: string) {
  if (preset === "Previous Month") return monthBounds(-1);
  if (preset === "Custom Range") return { from: customFrom, to: customTo };
  return monthBounds();
}

function monthStringBounds(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return monthBounds();
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  return { from: toDateInput(first), to: toDateInput(last) };
}

function calculateActiveWorkDays(driver: DriverProfile, trips: Trip[], from: string, to: string) {
  if (driver.status === "Leave") return "Leave";
  const days = new Set(trips.map((trip) => trip.tripDate));
  const activeTrip = getCurrentDriverTrip(driver.id, trips);
  if (activeTrip) days.add(today());
  return Array.from(days).filter((date) => isWithinRange(date, from, to)).length;
}

function calculateAttendance(driver: DriverProfile, trips: Trip[], from: string, to: string, manualEntries: AttendanceEntry[] = []) {
  const totalDays = attendanceTotalDays(from, to);
  if (driver.status === "Leave") return { workDays: 0, totalDays };
  const days = new Set(trips.filter((trip) => isWithinRange(trip.tripDate, from, to)).map((trip) => trip.tripDate));
  const activeTrip = getCurrentDriverTrip(driver.id, trips);
  if (activeTrip && isWithinRange(today(), from, to)) days.add(today());
  manualEntries.filter((entry) => isWithinRange(entry.date, from, to)).forEach((entry) => {
    if (entry.status === "Present") days.add(entry.date);
    if (entry.status === "Absent") days.delete(entry.date);
  });
  return { workDays: days.size, totalDays };
}

function attendanceTotalDays(from: string, to: string) {
  const currentMonth = today().slice(0, 7);
  if (from.slice(0, 7) === currentMonth) return Math.min(new Date().getDate(), inclusiveDays(from, to));
  return inclusiveDays(from, to);
}

function inclusiveDays(from: string, to: string) {
  const start = new Date(from);
  const end = new Date(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(Math.round((+end - +start) / 86400000) + 1, 0);
}

function formatAttendance(attendance: { workDays: number; totalDays: number }) {
  return `${attendance.workDays}/${attendance.totalDays}`;
}

function attendancePercent(attendance: { workDays: number; totalDays: number }) {
  return attendance.totalDays ? Math.round((attendance.workDays / attendance.totalDays) * 100) : 0;
}

function averageAttendancePercent(rows: Array<{ workDays: number; totalDays: number }>) {
  const totals = rows.reduce((sum, attendance) => ({ workDays: sum.workDays + attendance.workDays, totalDays: sum.totalDays + attendance.totalDays }), { workDays: 0, totalDays: 0 });
  return totals.totalDays ? Math.round((totals.workDays / totals.totalDays) * 100) : 0;
}

function calculateAverageAttendance(driver: DriverProfile, trips: Trip[], monthCount: number) {
  const percentages = Array.from({ length: monthCount }, (_, index) => {
    const range = monthBounds(-index);
    return attendancePercent(calculateAttendance(driver, trips, range.from, range.to));
  });
  return percentages.length ? Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length) : 0;
}

function seedVehicleDocuments(vehicles: Vehicle[]): VehicleDocument[] {
  return vehicles.flatMap((vehicle) => [
    { id: `${vehicle.id}-insurance`, vehicleId: vehicle.id, type: "Insurance", expiryDate: vehicle.insuranceExpiry, uploadedDate: vehicle.insuranceExpiry < today() ? vehicle.insuranceExpiry : today(-45), fileName: `${vehicle.number}-insurance.pdf`, history: [] },
    { id: `${vehicle.id}-puc`, vehicleId: vehicle.id, type: "PUC", expiryDate: vehicle.pucExpiry, uploadedDate: today(-45), fileName: `${vehicle.number}-puc.pdf`, history: [] },
    { id: `${vehicle.id}-fitness`, vehicleId: vehicle.id, type: "Fitness", expiryDate: vehicle.fitnessExpiry, uploadedDate: today(-45), fileName: `${vehicle.number}-fitness.pdf`, history: [] },
    { id: `${vehicle.id}-permit`, vehicleId: vehicle.id, type: "Permit", expiryDate: vehicle.permitExpiry, uploadedDate: today(-45), fileName: `${vehicle.number}-permit.pdf`, history: [] }
  ]);
}

function seedDriverDocuments(drivers: Driver[]): DriverDocument[] {
  return drivers.flatMap((driver) => [
    { id: `${driver.id}-license`, driverId: driver.id, type: "Driving License", uploadedDate: today(-45), fileName: `${driver.name}-license.pdf`, history: [] },
    { id: `${driver.id}-aadhaar`, driverId: driver.id, type: "Aadhaar Card", uploadedDate: today(-45), fileName: `${driver.name}-aadhaar.pdf`, history: [] },
    { id: `${driver.id}-pan`, driverId: driver.id, type: "PAN Card", uploadedDate: today(-45), fileName: `${driver.name}-pan.pdf`, history: [] }
  ]);
}

function seedDriverTransactions(trips: Trip[]): DriverTransaction[] {
  return trips
    .filter((trip) => (trip.advance || 0) > 0)
    .map((trip) => ({
      id: `${trip.id}-driver-advance`,
      driverId: trip.driverId,
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      vehicleId: trip.vehicleId,
      date: trip.tripDate,
      route: `${trip.loadingPoint} to ${trip.unloadingPoint}`,
      purpose: "Driver Advance",
      amount: trip.advance || 0,
      remarks: "Synced from Trip Management"
    }));
}

function seedDieselEntries(trips: Trip[]): DieselEntry[] {
  return trips
    .filter((trip) => (trip.dieselExpense || 0) > 0)
    .map((trip) => ({ id: `${trip.id}-diesel-history`, vehicleId: trip.vehicleId, date: trip.tripDate, pump: "Trip Expense", amount: trip.dieselExpense || 0, source: "Trip Expense", remarks: trip.tripNumber }));
}

function seedMaintenanceEntries(trips: Trip[]): MaintenanceEntry[] {
  return trips
    .filter((trip) => (trip.otherExpense || 0) > 0)
    .map((trip) => ({ id: `${trip.id}-maintenance-history`, vehicleId: trip.vehicleId, date: trip.tripDate, repairType: "Trip Misc Repair", workshop: "Trip Expense", amount: trip.otherExpense || 0, remarks: trip.tripNumber }));
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-tower-border bg-tower-card p-5 shadow-tower">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold">{title}</h3>
        {action && <div className="text-sm text-tower-muted">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-tower-border text-left text-xs uppercase tracking-[0.12em] text-tower-muted">
            {columns.map((column) => <th key={column} className="pb-3 pr-4 font-medium">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-tower-border/70 transition hover:bg-white/5 last:border-0">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="py-3 pr-4 align-middle text-slate-100">{formatCellValue(cell)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const tone = value.includes("Paid") || value.includes("Available") || value === "Completed" ? "bg-tower-success/10 text-tower-success" : value.includes("Pending") || value.includes("Loading") || value.includes("Assigned") ? "bg-tower-warning/10 text-tower-warning" : value.includes("Overdue") || value.includes("Maintenance") ? "bg-tower-danger/10 text-tower-danger" : "bg-tower-primary/10 text-tower-primary";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tone)}>{value}</span>;
}

function Segment({ value, onChange, values }: { value: string; onChange: (value: string) => void; values: string[] }) {
  return (
    <div className="flex rounded-md border border-tower-border bg-[#0B1220] p-1">
      {values.map((item) => (
        <button key={item} onClick={() => onChange(item)} className={cn("flex-1 rounded px-2 py-1.5 text-xs text-tower-muted", value === item && "bg-tower-primary text-white")}>{item}</button>
      ))}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ label: string; value: string }> }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-sm text-white outline-none">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function SelectField({ label, control, name, options }: { label: string; control: any; name: string; options: Array<{ label: string; value: string }> }) {
  return (
    <label className="block text-sm text-tower-muted">
      {label}
      <Controller control={control} name={name} render={({ field }) => <select {...field} className="mt-2 w-full rounded-md border border-tower-border bg-[#0B1220] px-3 py-2 text-white">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>} />
    </label>
  );
}

function Logo() {
  return (
    <div className="grid h-11 w-11 place-items-center rounded-lg border border-tower-primary/50 bg-tower-primary/15">
      <Truck className="text-tower-primary" size={24} />
    </div>
  );
}

function Skeleton() {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 10 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-lg border border-tower-border bg-tower-card" />)}</div>;
}
