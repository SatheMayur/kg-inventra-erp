#!/bin/bash
# StoreHub — Local Setup Script
# Run this script after extracting the source code

set -e

echo "============================================="
echo "  StoreHub — Inventory Management System"
echo "  Local Setup Script"
echo "============================================="
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Download: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check for bun or npm
if command -v bun &> /dev/null; then
    PKG_MANAGER="bun"
    echo "✅ Using Bun: $(bun --version)"
elif command -v npm &> /dev/null; then
    PKG_MANAGER="npm"
    echo "✅ Using npm: $(npm --version)"
else
    echo "❌ No package manager found. Please install Bun or npm."
    exit 1
fi

echo ""
echo "Step 1: Installing dependencies..."
if [ "$PKG_MANAGER" = "bun" ]; then
    bun install
else
    npm install
fi

echo ""
echo "Step 2: Setting up database..."
if [ "$PKG_MANAGER" = "bun" ]; then
    bun run db:push
    bun run db:generate
else
    npx prisma db push
    npx prisma generate
fi

echo ""
echo "============================================="
echo "  ✅ Setup Complete!"
echo "============================================="
echo ""
echo "To start the development server:"
echo ""
if [ "$PKG_MANAGER" = "bun" ]; then
    echo "  bun run dev"
else
    echo "  npm run dev"
fi
echo ""
echo "Then open http://localhost:3000 in your browser"
echo ""
echo "Demo login credentials:"
echo "  Admin:     empId = jbshah,   password = pass123"
echo "  Admin:     empId = software, password = pass123"
echo "  Employee:  empId = nitintailor, password = pass123"
echo ""
echo "The database will be auto-seeded with sample data on first login."
echo ""
