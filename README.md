# NPFC Logistics SaaS

Production-ready logistics management system for trips, fleet documents, invoices, payments, and compliance alerts.

## Stack

- Frontend: React, TypeScript, Tailwind CSS, Vite
- Backend: Node.js, Express, TypeScript
- Database: MongoDB Atlas with Mongoose models
- Authentication: JWT with role-based access control
- File storage: AWS S3
- PDF generation: Puppeteer invoice renderer uploaded to S3

## Run Locally

```powershell
npm run install-all
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:8000`

Demo fallback login when `MONGODB_URI` is not configured:

- Username: `admin`
- Password: `admin123`

## Environment

Copy `.env.example` to `.env` and set:

- `MONGODB_URI`
- `JWT_SECRET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_BUCKET_NAME`

Optional backup settings:

- `BACKUP_ENABLED=true`
- `BACKUP_CRON=0 2 * * *`
- `BACKUP_DIR=backups`

## API Structure

The backend uses modular controllers, services, middleware, validation, and Mongoose models under `backend/src`.

- `models`: Users, Companies, Drivers, Vehicles, Trips, Invoices, Payments
- `controllers`: Auth, dashboard, backups, masters, trips, invoices, payments, uploads
- `services`: S3 storage, invoice PDF generation, dashboard aggregation, Mongo backups
- `middleware`: JWT auth, role checks, validation, uploads, error handling

Key protected API groups:

- `/api/auth/login`
- `/api/dashboard`
- `/api/users`
- `/api/companies`, `/api/drivers`, `/api/vehicles`, `/api/trips`
- `/api/invoices`, `/api/payments`
- `/api/uploads/:entity/:id`, where `entity` is `driver`, `vehicle`, `invoice`, or `expense`
- `/api/backups` and `/api/backups/run` for Admin backup status and manual backup execution

## Roles

- Admin: full access
- Accountant: invoices and payments
- Operations: trips, vehicles, drivers, companies, document uploads
- Viewer: read-only access

## Storage

Uploaded files are stored in AWS S3 only. MongoDB stores URLs and S3 keys for:

- Driver documents: License, Aadhaar, PAN
- Vehicle documents: RC, Insurance, Permit, Fitness
- Invoice PDFs
- Expense receipts

Document endpoints support upload, preview via signed URL, replace, and delete.

## Backups

When `BACKUP_ENABLED=true`, the backend schedules `mongodump` with `BACKUP_CRON`. Ensure MongoDB Database Tools are installed on the host and that the process has write access to `BACKUP_DIR`.
