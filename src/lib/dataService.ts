import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { useAppStore } from '../store/useStore';
import {
  Product,
  Supplier,
  PurchaseHistory,
  Sale,
  StockHistory,
  StoreSettings
} from '../types';
import * as XLSX from 'xlsx';

const INITIAL_SETTINGS: StoreSettings = {
  appName: 'RetailFlow',
  logoUrl: null,
  storeName: 'Cannoli Bakery & Gourmet',
  phone: '+91 98765 43210',
  address: '123 Gourmet Lane, Bakery District',
  adminPasswordHash: 'admin123', // Simple hashed/plain token for v1 demo
  updatedAt: new Date().toISOString()
};

const LOCAL_STORAGE_SETTINGS_KEY = 'retailflow_store_settings';
const LOCAL_STORAGE_PRODUCTS_KEY = 'retailflow_products';
const LOCAL_STORAGE_SUPPLIERS_KEY = 'retailflow_suppliers';
const LOCAL_STORAGE_SALES_KEY = 'retailflow_sales';
const LOCAL_STORAGE_PURCHASES_KEY = 'retailflow_purchases';
const LOCAL_STORAGE_STOCK_HISTORY_KEY = 'retailflow_stock_history';

// Helper to get local data safely
function getLocalArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalArray<T>(key: string, data: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to set local storage', e);
  }
}

// 1. Store Settings Service
export async function getStoreSettings(): Promise<StoreSettings> {
  try {
    const docRef = doc(db, 'storeSettings', 'main');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as StoreSettings;
    }
  } catch (e) {
    console.warn('Firestore offline/unreachable, fallback to local settings', e);
  }

  const localRaw = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
  if (localRaw) {
    try {
      return JSON.parse(localRaw);
    } catch {
      // fallback
    }
  }
  
  // Save initial default
  localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(INITIAL_SETTINGS));
  return INITIAL_SETTINGS;
}

export async function updateStoreSettings(settings: Partial<StoreSettings>): Promise<StoreSettings> {
  const current = await getStoreSettings();
  const updated: StoreSettings = {
    ...current,
    ...settings,
    updatedAt: new Date().toISOString()
  };

  try {
    const docRef = doc(db, 'storeSettings', 'main');
    await setDoc(docRef, updated, { merge: true });
  } catch (e) {
    console.warn('Could not save to Firestore, saving locally', e);
  }

  localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(updated));
  return updated;
}

// 2. Dashboard Metrics Service
export interface DashboardMetrics {
  todaySales: number;
  monthlySales: number;
  todayProfit: number;
  monthlyProfit: number;
  totalProducts: number;
}

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  let sales: Sale[] = [];
  let productsCount = 0;

  try {
    const salesSnap = await getDocs(collection(db, 'sales'));
    sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Sale));

    const productsSnap = await getDocs(collection(db, 'products'));
    productsCount = productsSnap.size;
  } catch (e) {
    // Fallback to local storage
    sales = getLocalArray<Sale>(LOCAL_STORAGE_SALES_KEY);
    productsCount = getLocalArray<Product>(LOCAL_STORAGE_PRODUCTS_KEY).length;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let todaySales = 0;
  let monthlySales = 0;
  let todayProfit = 0;
  let monthlyProfit = 0;

  for (const sale of sales) {
    let saleTime = 0;
    if (sale.createdAt) {
      if (typeof sale.createdAt === 'string') {
        saleTime = new Date(sale.createdAt).getTime();
      } else if (typeof sale.createdAt === 'number') {
        saleTime = sale.createdAt;
      } else if (sale.createdAt && typeof (sale.createdAt as any).toDate === 'function') {
        saleTime = (sale.createdAt as any).toDate().getTime();
      } else if (sale.createdAt && (sale.createdAt as any).seconds) {
        saleTime = (sale.createdAt as any).seconds * 1000;
      }
    }

    if (saleTime >= startOfMonth) {
      monthlySales += sale.total || 0;
      monthlyProfit += sale.profit || 0;

      if (saleTime >= startOfToday) {
        todaySales += sale.total || 0;
        todayProfit += sale.profit || 0;
      }
    }
  }

  return {
    todaySales,
    monthlySales,
    todayProfit,
    monthlyProfit,
    totalProducts: productsCount
  };
}

// 3. Backup & Restore CSV & XLS Export Services
function downloadFile(content: string | Blob, fileName: string, contentType: string) {
  const blob = typeof content === 'string' ? new Blob([content], { type: contentType }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportAllCollectionsCSV() {
  let products = getLocalArray<Product>(LOCAL_STORAGE_PRODUCTS_KEY);
  let suppliers = getLocalArray<Supplier>(LOCAL_STORAGE_SUPPLIERS_KEY);
  let sales = getLocalArray<Sale>(LOCAL_STORAGE_SALES_KEY);
  let purchases = getLocalArray<PurchaseHistory>(LOCAL_STORAGE_PURCHASES_KEY);
  let stockHistory = getLocalArray<StockHistory>(LOCAL_STORAGE_STOCK_HISTORY_KEY);
  let storeSettings = await getStoreSettings();

  try {
    const pSnap = await getDocs(collection(db, 'products'));
    if (!pSnap.empty) products = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product));

    const supSnap = await getDocs(collection(db, 'suppliers'));
    if (!supSnap.empty) suppliers = supSnap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));

    const sSnap = await getDocs(collection(db, 'sales'));
    if (!sSnap.empty) sales = sSnap.docs.map(d => ({ id: d.id, ...d.data() } as Sale));

    const purSnap = await getDocs(collection(db, 'purchaseHistory'));
    if (!purSnap.empty) purchases = purSnap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseHistory));

    const stSnap = await getDocs(collection(db, 'stockHistory'));
    if (!stSnap.empty) stockHistory = stSnap.docs.map(d => ({ id: d.id, ...d.data() } as StockHistory));
  } catch (e) {
    // Keep local arrays
  }

  // 1. Products CSV
  const productsHeaders = 'id,name,quantity,purchasePrice,mrp,sellingPrice,minStock,expiryDate,barcode,createdAt,updatedAt\n';
  const productsRows = products.map(p => 
    `"${p.id}","${p.name.replace(/"/g, '""')}",${p.quantity},${p.purchasePrice},${p.mrp},${p.sellingPrice},${p.minStock},"${p.expiryDate || ''}","${p.barcode || ''}","${p.createdAt}","${p.updatedAt}"`
  ).join('\n');
  downloadFile(productsHeaders + productsRows, 'RetailFlow_Products.csv', 'text/csv');

  // 2. Suppliers CSV
  const suppliersHeaders = 'id,name,totalPurchase,totalPaid,totalPending,status,createdAt,updatedAt\n';
  const suppliersRows = suppliers.map(s => 
    `"${s.id}","${s.name.replace(/"/g, '""')}",${s.totalPurchase},${s.totalPaid},${s.totalPending},"${s.status}","${s.createdAt}","${s.updatedAt}"`
  ).join('\n');
  downloadFile(suppliersHeaders + suppliersRows, 'RetailFlow_Suppliers.csv', 'text/csv');

  // 3. Sales CSV
  const salesHeaders = 'id,subtotal,discountType,discountValue,total,profit,createdAt\n';
  const salesRows = sales.map(s => 
    `"${s.id}",${s.subtotal},"${s.discountType || ''}",${s.discountValue},${s.total},${s.profit},"${s.createdAt}"`
  ).join('\n');
  downloadFile(salesHeaders + salesRows, 'RetailFlow_Sales.csv', 'text/csv');

  // 4. Purchases CSV
  const purchasesHeaders = 'id,supplierId,invoiceNumber,invoiceDate,amount,paymentStatus,sourceType,createdAt\n';
  const purchasesRows = purchases.map(p => 
    `"${p.id}","${p.supplierId}","${p.invoiceNumber}",${p.invoiceDate},${p.amount},"${p.paymentStatus}","${p.sourceType}","${p.createdAt}"`
  ).join('\n');
  downloadFile(purchasesHeaders + purchasesRows, 'RetailFlow_PurchaseHistory.csv', 'text/csv');

  // 5. Stock History CSV
  const stockHeaders = 'id,productId,productName,changeType,quantityChange,reason,relatedDocId,createdAt\n';
  const stockRows = stockHistory.map(st => 
    `"${st.id}","${st.productId}","${st.productName.replace(/"/g, '""')}","${st.changeType}",${st.quantityChange},"${(st.reason || '').replace(/"/g, '""')}","${st.relatedDocId || ''}","${st.createdAt}"`
  ).join('\n');
  downloadFile(stockHeaders + stockRows, 'RetailFlow_StockHistory.csv', 'text/csv');

  // 6. Store Settings CSV
  const settingsHeaders = 'appName,storeName,phone,address,updatedAt\n';
  const settingsRow = `"${storeSettings.appName}","${storeSettings.storeName}","${storeSettings.phone}","${storeSettings.address}","${storeSettings.updatedAt}"\n`;
  downloadFile(settingsHeaders + settingsRow, 'RetailFlow_StoreSettings.csv', 'text/csv');
}

export async function exportAllCollectionsXLS() {
  let products = getLocalArray<Product>(LOCAL_STORAGE_PRODUCTS_KEY);
  let suppliers = getLocalArray<Supplier>(LOCAL_STORAGE_SUPPLIERS_KEY);
  let sales = getLocalArray<Sale>(LOCAL_STORAGE_SALES_KEY);
  let purchases = getLocalArray<PurchaseHistory>(LOCAL_STORAGE_PURCHASES_KEY);
  let stockHistory = getLocalArray<StockHistory>(LOCAL_STORAGE_STOCK_HISTORY_KEY);
  let storeSettings = await getStoreSettings();

  try {
    const pSnap = await getDocs(collection(db, 'products'));
    if (!pSnap.empty) products = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product));

    const supSnap = await getDocs(collection(db, 'suppliers'));
    if (!supSnap.empty) suppliers = supSnap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));

    const sSnap = await getDocs(collection(db, 'sales'));
    if (!sSnap.empty) sales = sSnap.docs.map(d => ({ id: d.id, ...d.data() } as Sale));

    const purSnap = await getDocs(collection(db, 'purchaseHistory'));
    if (!purSnap.empty) purchases = purSnap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseHistory));

    const stSnap = await getDocs(collection(db, 'stockHistory'));
    if (!stSnap.empty) stockHistory = stSnap.docs.map(d => ({ id: d.id, ...d.data() } as StockHistory));
  } catch (e) {
    // Keep local
  }

  const wb = XLSX.utils.book_new();

  // Products Sheet
  const productsWS = XLSX.utils.json_to_sheet(products.length ? products : [{ id: '', name: '', quantity: 0, purchasePrice: 0, mrp: 0, sellingPrice: 0, minStock: 0, expiryDate: '', barcode: '', createdAt: '', updatedAt: '' }]);
  XLSX.utils.book_append_sheet(wb, productsWS, 'Products');

  // Suppliers Sheet
  const suppliersWS = XLSX.utils.json_to_sheet(suppliers.length ? suppliers : [{ id: '', name: '', totalPurchase: 0, totalPaid: 0, totalPending: 0, status: 'Paid', createdAt: '', updatedAt: '' }]);
  XLSX.utils.book_append_sheet(wb, suppliersWS, 'Suppliers');

  // Sales Sheet
  const salesWS = XLSX.utils.json_to_sheet(sales.length ? sales : [{ id: '', subtotal: 0, discountType: '', discountValue: 0, total: 0, profit: 0, createdAt: '' }]);
  XLSX.utils.book_append_sheet(wb, salesWS, 'Sales');

  // Purchases Sheet
  const purchasesWS = XLSX.utils.json_to_sheet(purchases.length ? purchases : [{ id: '', supplierId: '', invoiceNumber: '', invoiceDate: '', amount: 0, paymentStatus: 'Paid', sourceType: 'manual', createdAt: '' }]);
  XLSX.utils.book_append_sheet(wb, purchasesWS, 'Purchases');

  // Stock History Sheet
  const stockWS = XLSX.utils.json_to_sheet(stockHistory.length ? stockHistory : [{ id: '', productId: '', productName: '', changeType: 'Manual Correction', quantityChange: 0, reason: '', relatedDocId: '', createdAt: '' }]);
  XLSX.utils.book_append_sheet(wb, stockWS, 'Stock History');

  // Settings Sheet
  const settingsWS = XLSX.utils.json_to_sheet([{
    appName: storeSettings.appName,
    storeName: storeSettings.storeName,
    phone: storeSettings.phone,
    address: storeSettings.address,
    updatedAt: storeSettings.updatedAt
  }]);
  XLSX.utils.book_append_sheet(wb, settingsWS, 'Store Settings');

  XLSX.writeFile(wb, 'RetailFlow_Backup.xlsx');
}

// 4. Danger Zone - Reset System Data
export async function resetSystemData(password: string): Promise<{ success: boolean; message: string }> {
  const settings = await getStoreSettings();

  // Validate admin password (accepts 'Admin', 'admin', 'admin123', 'cvasani751')
  const trimmed = password.trim();
  const expectedPass = settings.adminPasswordHash || 'admin123';
  
  const isValidPass =
    trimmed === expectedPass ||
    trimmed === 'Admin' ||
    trimmed === 'admin' ||
    trimmed === 'admin123' ||
    trimmed.toLowerCase() === 'cvasani751' ||
    trimmed.toLowerCase() === 'admin';

  if (!isValidPass) {
    return { success: false, message: 'Invalid Admin Password. Please enter "Admin" to confirm system reset.' };
  }

  // Operational transactional collections to wipe
  const collectionsToWipe = ['products', 'suppliers', 'sales', 'purchaseHistory', 'stockHistory', 'counters'];
  let totalDeletedDocs = 0;

  for (const colName of collectionsToWipe) {
    try {
      const snap = await getDocs(collection(db, colName));
      if (!snap.empty) {
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const chunk = docs.slice(i, i + 400);
          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          totalDeletedDocs += chunk.length;
        }
      }
    } catch (e: any) {
      console.error(`Firestore wipe error for collection "${colName}":`, e);
      return {
        success: false,
        message: `Failed to wipe collection "${colName}" in Firebase: ${e.message || 'Permission denied or network issue'}`
      };
    }
  }

  // Clear all local storage keys
  localStorage.removeItem(LOCAL_STORAGE_PRODUCTS_KEY);
  localStorage.removeItem(LOCAL_STORAGE_SUPPLIERS_KEY);
  localStorage.removeItem(LOCAL_STORAGE_SALES_KEY);
  localStorage.removeItem(LOCAL_STORAGE_PURCHASES_KEY);
  localStorage.removeItem(LOCAL_STORAGE_STOCK_HISTORY_KEY);
  localStorage.removeItem('retailflow_last_invoice_num');

  // Reset Zustand in-memory product search index
  try {
    useAppStore.getState().setProductSearchIndex([]);
  } catch (e) {
    // ignore
  }

  return { 
    success: true, 
    message: `All transactional data (${totalDeletedDocs} documents wiped) successfully removed from Firebase & local storage.` 
  };
}
