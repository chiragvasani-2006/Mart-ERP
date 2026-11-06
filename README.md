# 🏪 Cannoli Bakery & Gourmet ERP System

**Cannoli ERP** (RetailFlow) is a full-stack, enterprise-grade Point-of-Sale (POS), inventory control, bulk product import/export, supplier management, and AI OCR invoice scanning application powered by **React 19**, **TypeScript**, **Tailwind CSS**, **Express**, **Google Cloud Firebase Firestore**, and **Google Gemini AI**.

---

## 🔑 Master Admin Allowed Credentials

Only the following **two authorized System Admin accounts** are permitted to log in:

| Account | Admin Email | Admin Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Primary Client Admin** | `admin@gmail.com` | `admin` | Full Master Admin Access |
| **Secondary Super Admin** | `cvasani751@gmail.com` | `Admin` | Full Master Admin Access |

*Note: Access will be denied for any other email or password combination.*

---

## 🤖 Antigravity AI One-Click Setup Prompt

If you share this project with a friend or colleague using **Google Antigravity AI**, copy and send them the prompt below to automatically set up, configure, and launch the application:

```text
Please set up and run this project:
1. Run `npm install` to install all required dependencies.
2. Ensure a `.env` file exists with `GEMINI_API_KEY=AIzaSyCDKg7ZZ6mqxcLoHq9tDEvlqsGJ-jRXVgw` and `PORT=3000`.
3. Verify that `firebase-applet-config.json` is configured for project `cenoli-erp`.
4. Run `npm run lint` (`npx tsc --noEmit`) to verify clean TypeScript compilation.
5. Run `npm run dev` to start the development server on http://localhost:3000.
```

---

## 🚀 Step-by-Step Manual Setup Guide

Follow these steps to manually set up and run this project on a new system.

### 1. Clone the GitHub Repository
```bash
git clone https://github.com/YOUR_USERNAME/cannoli-erp.git
cd cannoli-erp
```

---

### 2. Install Project Dependencies
Install all required Node.js packages:
```bash
npm install
```

---

### 3. Configure Environment Variables (`.env`) & Gemini AI
The **AI OCR Supplier Invoice Scanner** uses Google Gemini AI (`gemini-3.6-flash`). 

1. Create a `.env` file in the root project directory:
   ```bash
   cp .env.example .env
   ```
2. Ensure your `.env` contains:
   ```env
   # Google Gemini API Key for AI OCR Invoice Scanning
   GEMINI_API_KEY=AQ.Ab8RN6I2TJNHjKtWse6s6fA7hgEZ1sPqwpdeeISsyK68uasRYw

   # Backend Server Port
   PORT=3000
   ```

---

### 4. Configure Firebase Firestore Security Rules

Ensure your Firebase Firestore rules in the **Firebase Console** (Database `cenoli-erp`) allow read/write access:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

---

### 5. Run the Development Server
Start the full-stack development server:
```bash
npm run dev
```
- Launches Express API backend and Vite frontend together on **`http://localhost:3000`**.
- Open your browser and navigate to **`http://localhost:3000`**.

---

## 🛠️ Production Build & Maintenance Commands

| Command | Action |
| :--- | :--- |
| **`npm run dev`** | Start full-stack Express API server & Vite frontend on `http://localhost:3000` |
| **`npm run lint`** | Run TypeScript compilation check (`tsc --noEmit`) |
| **`npm run build`** | Compile production bundle (`vite build` + `esbuild server.ts`) |
| **`npm start`** | Launch compiled production Node.js server (`node dist/server.cjs`) |

---

## 📋 Key Modules & Features

### 1. POS Billing Counter
- **Hardware Barcode Scanner Support**: Instant cart updates when scanning with USB or Bluetooth barcode guns.
- **Multi-Format Barcodes**: Full support for EAN-13 (with mod-10 check digit verification), UPC-A, EAN-8, and Code 128 barcodes.
- **Discounts & Receipts**: Apply flat (`₹`) or percentage (`%`) cart discounts and print thermal receipts.

### 2. Products Catalog & Bulk Excel/CSV Import
- **High-Speed Batch Import Engine**: Bulk import Excel (`.xlsx`, `.xls`) or `.csv` catalog files with atomic barcode sequence generation and chunked transactional writes.
- **EAN-13 Generator**: Auto-generates 13-digit EAN-13 barcodes starting with prefix **`20`** (e.g. `2000000000015`) using a transactional Firestore counter (`counters/internalBarcode`).

### 3. New Stock & AI Invoice OCR Scanner
- **Gemini AI Invoice Extraction**: Upload photos or PDFs of supplier invoices to extract product names, quantities, MRP, and cost rates automatically.
- **Excel Delivery Import**: Record stock entries directly via spreadsheet uploads.

### 4. Suppliers & Ledgers
- **Supplier Payment Ledgers**: Monitor total purchases, amounts paid out, and outstanding dues per supplier.
- **Pay Supplier Action**: Record manual payments to suppliers.

### 5. Reports & Data Export
- **One-Click Backup**: Download raw CSV backups or unified Excel workbooks (`.xlsx`) for all transactional data.

### 6. Settings & Security
- **System Data Wipe**: Clean operational data (Products, Suppliers, Sales, Stock History) with password confirmation (`Admin`).
- **Sanitized UI**: Hides admin email addresses from all navigation bars and header menus.

---

## ❓ Troubleshooting Guide

### Issue: "Rendered more hooks than during the previous render" on Excel Import
- **Status**: **Resolved**.
- **Fix**: All React state hooks in `ProductImportModal.tsx` are rendered at top-level before early conditional returns.

### Issue: Firebase `permission-denied` Error
- **Cause**: Firestore security rules in Firebase Console are blocking reads/writes.
- **Fix**: Update Firestore Security Rules in Firebase Console to `allow read, write: if true;`.

### Issue: Port 3000 is already in use
- **Fix**: Terminate any active process occupying port 3000:
  ```bash
  # Linux / macOS
  kill -9 $(lsof -t -i:3000)

  # Windows (Command Prompt)
  netstat -ano | findstr :3000
  taskkill /PID <PID> /F
  ```
  Then restart with `npm run dev`.

---
*Cannoli Bakery & Gourmet ERP • Enterprise Edition*
