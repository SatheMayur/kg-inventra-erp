# StoreHub — Inventory Management System

A modern, full-featured inventory management system built with Next.js 16, Prisma ORM, and SQLite.

## Features

- **Dashboard** — Overview of inventory, low stock alerts, recent requests & transactions
- **Inventory Management** — Add, edit, restock, and soft-delete items with stock level tracking
- **Request System** — Employees submit item requests; admins approve/reject
- **Issuance** — Process approved requests with optimistic concurrency control
- **Transactions** — Full transaction history with CSV export
- **Reporting** — Department consumption charts, top items, stockout risk prediction, month-over-month comparison
- **User Management** — Create/edit/deactivate users, reset passwords
- **Settings** — Feature flags for CSV export, tooltips, reporting, barcode (planned)
- **Dark Theme** — Beautiful amber-accented dark UI with glass morphism login screen

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Database**: Prisma ORM + SQLite
- **State**: Zustand
- **Charts**: Recharts
- **Icons**: Lucide React

## Quick Start

### Prerequisites
- Node.js 18+ (or Bun)
- npm or Bun package manager

### Option 1: Automated Setup

```bash
chmod +x setup.sh
./setup.sh
```

### Option 2: Manual Setup

```bash
# Install dependencies
npm install
# or: bun install

# Setup database
npx prisma db push
npx prisma generate
# or: bun run db:push && bun run db:generate

# Start development server
npm run dev
# or: bun run dev
```

### Open the App

Navigate to **http://localhost:3000**

## Demo Credentials

| Role     | Employee ID   | Password |
|----------|---------------|----------|
| Admin    | jbshah        | pass123  |
| Admin    | software      | pass123  |
| Employee | nitintailor   | pass123  |

The database auto-seeds with 30+ employees and 12 sample items on first login.

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout with dark theme
│   ├── page.tsx                # Main page (login/app shell)
│   ├── globals.css             # Global styles + dark theme
│   └── api/                    # API routes
│       ├── auth/               # Login & seed
│       ├── items/              # CRUD + restock
│       ├── requests/           # Create, approve, reject, cancel, issue
│       ├── transactions/       # List with filters
│       ├── users/              # CRUD + reset password + toggle active
│       ├── reporting/          # Dashboard, dept consumption, top items, stockout risk, period comparison
│       └── settings/           # Feature flags
├── components/
│   ├── app-shell.tsx           # Main app layout with sidebar
│   ├── login-screen.tsx        # Login page with demo accounts
│   ├── views/                  # All view components
│   │   ├── dashboard-view.tsx
│   │   ├── inventory-view.tsx
│   │   ├── requests-view.tsx
│   │   ├── issuance-view.tsx
│   │   ├── transactions-view.tsx
│   │   ├── users-view.tsx
│   │   ├── reporting-view.tsx
│   │   └── settings-view.tsx
│   └── ui/                     # shadcn/ui components
├── lib/
│   ├── api.ts                  # Typed API client
│   ├── db.ts                   # Prisma client singleton
│   ├── store.ts                # Zustand store
│   └── utils.ts                # Utility functions
└── hooks/
    ├── use-mobile.ts
    └── use-toast.ts

prisma/
└── schema.prisma               # Database schema
```

## Production Build

```bash
npm run build
npm run start
# or: bun run build && bun run start
```

## Notes

- Passwords are stored as plaintext for demo purposes — use hashing in production
- SQLite database file is stored at `db/custom.db`
- The `.env` file contains `DATABASE_URL=file:./db/custom.db` — update if needed
- Feature flags can be toggled from the Settings page

## License

MIT
