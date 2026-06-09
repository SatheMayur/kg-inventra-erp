# StoreHub (Store_KG)

This is the source code for **StoreHub**, an enterprise inventory management system.

## 🚀 GitHub Integration

This version of StoreHub is linked to the [yiwodoy-source/Store_KG](https://github.com/yiwodoy-source/Store_KG) repository.

### Features
- **Dynamic Seeding**: The application attempts to fetch `users.json` and `items.json` from the GitHub repository during the seeding process.
- **Inventory Sync**: Admins can sync inventory directly from a `inventory.csv` file hosted on the GitHub repository via the **Bulk Import** dialog.
- **CI/CD**: GitHub Actions are configured to automatically build and validate changes.

## 🛠️ Setup

1. **Install Dependencies**:
   ```bash
   bun install
   # or
   npm install
   ```

2. **Database Setup**:
   ```bash
   bun run db:push
   bun run db:generate
   ```

3. **Run Development Server**:
   ```bash
   bun run dev
   ```

## 📊 Seeding

To seed the database, log in with any account. If the database is empty, it will auto-seed. 
It will prioritize data from GitHub if available.

## 📝 License

MIT
