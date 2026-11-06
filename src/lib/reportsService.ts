import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { Sale, PurchaseHistory, Product, Supplier, StoreSettings } from '../types';
import { getStoreSettings } from './dataService';
import { differenceInCalendarDays, parseISO, startOfDay, endOfDay, subDays, startOfMonth, format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export type ReportType = 'sales' | 'purchase' | 'profit' | 'stock' | 'expiry' | 'supplier';
export type DateFilterType = 'today' | 'week' | 'month' | 'custom';

export interface DateFilter {
  type: DateFilterType;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

// Helper to convert timestamp / ISO / Date into Date object
export function parseTsToDate(ts: any): Date {
  if (!ts) return new Date();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'string') return parseISO(ts);
  if (typeof ts === 'number') return new Date(ts);
  if (ts.toDate && typeof ts.toDate === 'function') return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  try {
    return new Date(ts);
  } catch {
    return new Date();
  }
}

// Check if a date falls within date range filter
export function isDateInRange(dateInput: any, filter: DateFilter): boolean {
  const date = parseTsToDate(dateInput);
  const now = new Date();

  if (filter.type === 'today') {
    const s = startOfDay(now);
    const e = endOfDay(now);
    return date >= s && date <= e;
  }

  if (filter.type === 'week') {
    const s = startOfDay(subDays(now, 6)); // last 7 days
    const e = endOfDay(now);
    return date >= s && date <= e;
  }

  if (filter.type === 'month') {
    const s = startOfDay(subDays(now, 29)); // last 30 days
    const e = endOfDay(now);
    return date >= s && date <= e;
  }

  if (filter.type === 'custom') {
    if (!filter.startDate || !filter.endDate) return true;
    const s = startOfDay(parseISO(filter.startDate));
    const e = endOfDay(parseISO(filter.endDate));
    return date >= s && date <= e;
  }

  return true;
}

export function getDateRangeLabel(filter: DateFilter): string {
  const now = new Date();
  if (filter.type === 'today') {
    return `Today (${format(now, 'dd MMM yyyy')})`;
  }
  if (filter.type === 'week') {
    return `Last 7 Days (${format(subDays(now, 6), 'dd MMM')} – ${format(now, 'dd MMM yyyy')})`;
  }
  if (filter.type === 'month') {
    return `Last 30 Days (${format(subDays(now, 29), 'dd MMM')} – ${format(now, 'dd MMM yyyy')})`;
  }
  if (filter.type === 'custom') {
    if (filter.startDate && filter.endDate) {
      return `${format(parseISO(filter.startDate), 'dd MMM yyyy')} – ${format(parseISO(filter.endDate), 'dd MMM yyyy')}`;
    }
  }
  return 'All Time';
}

// ---------------------------------------------------------------------------
// 1. SALES REPORT FETCH & COMPUTATION
// ---------------------------------------------------------------------------
export interface SalesReportRow {
  id: string;
  invoiceNumber: string;
  date: string;
  time: string;
  itemsCount: number;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  total: number;
}

export interface SalesReportData {
  rows: SalesReportRow[];
  summary: {
    totalRevenue: number;
    totalDiscount: number;
    totalItemsSold: number;
    totalSalesCount: number;
  };
}

export async function getSalesReportData(filter: DateFilter): Promise<SalesReportData> {
  let sales: Sale[] = [];
  try {
    const snap = await getDocs(collection(db, 'sales'));
    sales = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Sale));
  } catch (e) {
    const raw = localStorage.getItem('retailflow_sales');
    sales = raw ? JSON.parse(raw) : [];
  }

  const filtered = sales.filter((s) => isDateInRange(s.createdAt, filter));

  // Sort most recent first
  filtered.sort((a, b) => parseTsToDate(b.createdAt).getTime() - parseTsToDate(a.createdAt).getTime());

  let totalRevenue = 0;
  let totalDiscount = 0;
  let totalItemsSold = 0;

  const rows: SalesReportRow[] = filtered.map((s) => {
    const dt = parseTsToDate(s.createdAt);
    const itemsCount = s.items ? s.items.reduce((acc, item) => acc + (item.qty || 0), 0) : 0;
    
    totalRevenue += Number(s.total || 0);
    totalDiscount += Number(s.discountValue || 0);
    totalItemsSold += itemsCount;

    return {
      id: s.id,
      invoiceNumber: (s as any).invoiceNumber || `INV-${s.id.slice(0, 6).toUpperCase()}`,
      date: format(dt, 'dd MMM yyyy'),
      time: format(dt, 'hh:mm a'),
      itemsCount,
      paymentMethod: (s as any).paymentMethod || 'Cash',
      subtotal: s.subtotal || s.total,
      discount: s.discountValue || 0,
      total: s.total || 0,
    };
  });

  return {
    rows,
    summary: {
      totalRevenue,
      totalDiscount,
      totalItemsSold,
      totalSalesCount: filtered.length,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. PURCHASE REPORT FETCH & COMPUTATION
// ---------------------------------------------------------------------------
export interface PurchaseReportRow {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  invoiceDate: string;
  sourceType: string;
  lineItemsCount: number;
  amount: number;
  paymentStatus: string;
}

export interface PurchaseReportData {
  rows: PurchaseReportRow[];
  summary: {
    totalPurchaseAmount: number;
    totalInvoicesCount: number;
  };
}

export async function getPurchaseReportData(filter: DateFilter): Promise<PurchaseReportData> {
  let purchases: PurchaseHistory[] = [];
  let suppliersMap: Record<string, string> = {};

  try {
    const purSnap = await getDocs(collection(db, 'purchaseHistory'));
    purchases = purSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PurchaseHistory));

    const supSnap = await getDocs(collection(db, 'suppliers'));
    supSnap.docs.forEach((d) => {
      const data = d.data();
      suppliersMap[d.id] = data.name || 'Unknown Supplier';
    });
  } catch (e) {
    const rawP = localStorage.getItem('retailflow_purchases');
    purchases = rawP ? JSON.parse(rawP) : [];
    const rawS = localStorage.getItem('retailflow_suppliers');
    if (rawS) {
      const list: Supplier[] = JSON.parse(rawS);
      list.forEach((s) => (suppliersMap[s.id] = s.name));
    }
  }

  const filtered = purchases.filter((p) => isDateInRange(p.invoiceDate || p.createdAt, filter));
  filtered.sort((a, b) => parseTsToDate(b.invoiceDate || b.createdAt).getTime() - parseTsToDate(a.invoiceDate || a.createdAt).getTime());

  let totalPurchaseAmount = 0;

  const rows: PurchaseReportRow[] = filtered.map((p) => {
    const dt = parseTsToDate(p.invoiceDate || p.createdAt);
    const amt = Number(p.amount || 0);
    totalPurchaseAmount += amt;

    const supName = suppliersMap[p.supplierId] || 'Supplier';

    return {
      id: p.id,
      invoiceNumber: p.invoiceNumber || 'N/A',
      supplierName: supName,
      invoiceDate: format(dt, 'dd MMM yyyy'),
      sourceType: p.sourceType || 'manual',
      lineItemsCount: p.lineItems ? p.lineItems.length : 0,
      amount: amt,
      paymentStatus: p.paymentStatus || 'Paid',
    };
  });

  return {
    rows,
    summary: {
      totalPurchaseAmount,
      totalInvoicesCount: filtered.length,
    },
  };
}

// ---------------------------------------------------------------------------
// 3. PROFIT REPORT FETCH & COMPUTATION
// ---------------------------------------------------------------------------
export interface ProfitDayRow {
  date: string;
  salesCount: number;
  revenue: number;
  profit: number;
  marginPercent: number;
}

export interface ProfitReportData {
  rows: ProfitDayRow[];
  summary: {
    totalRevenue: number;
    totalProfit: number;
    overallMarginPercent: number;
    totalSalesCount: number;
  };
}

export async function getProfitReportData(filter: DateFilter): Promise<ProfitReportData> {
  let sales: Sale[] = [];
  try {
    const snap = await getDocs(collection(db, 'sales'));
    sales = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Sale));
  } catch (e) {
    const raw = localStorage.getItem('retailflow_sales');
    sales = raw ? JSON.parse(raw) : [];
  }

  const filtered = sales.filter((s) => isDateInRange(s.createdAt, filter));

  // Group by day YYYY-MM-DD
  const dailyGroups: Record<string, { dateObj: Date; count: number; revenue: number; profit: number }> = {};

  let totalRevenue = 0;
  let totalProfit = 0;

  for (const s of filtered) {
    const dt = parseTsToDate(s.createdAt);
    const dayKey = format(dt, 'yyyy-MM-dd');

    if (!dailyGroups[dayKey]) {
      dailyGroups[dayKey] = {
        dateObj: dt,
        count: 0,
        revenue: 0,
        profit: 0,
      };
    }

    const rev = Number(s.total || 0);
    const prf = Number(s.profit || 0);

    dailyGroups[dayKey].count += 1;
    dailyGroups[dayKey].revenue += rev;
    dailyGroups[dayKey].profit += prf;

    totalRevenue += rev;
    totalProfit += prf;
  }

  // Sort dates descending
  const sortedKeys = Object.keys(dailyGroups).sort((a, b) => b.localeCompare(a));

  const rows: ProfitDayRow[] = sortedKeys.map((key) => {
    const g = dailyGroups[key];
    const margin = g.revenue > 0 ? (g.profit / g.revenue) * 100 : 0;

    return {
      date: format(g.dateObj, 'dd MMM yyyy'),
      salesCount: g.count,
      revenue: g.revenue,
      profit: g.profit,
      marginPercent: Math.round(margin * 10) / 10,
    };
  });

  const overallMarginPercent = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0;

  return {
    rows,
    summary: {
      totalRevenue,
      totalProfit,
      overallMarginPercent,
      totalSalesCount: filtered.length,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. STOCK REPORT FETCH & COMPUTATION
// ---------------------------------------------------------------------------
export interface StockReportRow {
  id: string;
  name: string;
  barcode: string;
  category: string;
  quantity: number;
  minStock: number;
  purchasePrice: number;
  sellingPrice: number;
  stockValuationAtCost: number;
  stockValuationAtSelling: number;
  status: 'Out of Stock' | 'Low Stock' | 'OK';
}

export interface StockReportData {
  rows: StockReportRow[];
  summary: {
    totalProducts: number;
    totalStockUnits: number;
    lowStockCount: number;
    outOfStockCount: number;
    totalValuationCost: number;
    totalValuationSelling: number;
  };
}

export async function getStockReportData(): Promise<StockReportData> {
  let products: Product[] = [];
  try {
    const snap = await getDocs(collection(db, 'products'));
    products = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
  } catch (e) {
    const raw = localStorage.getItem('retailflow_products');
    products = raw ? JSON.parse(raw) : [];
  }

  let totalStockUnits = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let totalValuationCost = 0;
  let totalValuationSelling = 0;

  const rows: StockReportRow[] = products.map((p) => {
    const qty = Number(p.quantity || 0);
    const minS = Number(p.minStock || 0);
    const purchaseP = Number(p.purchasePrice || 0);
    const sellingP = Number(p.sellingPrice || 0);

    const costVal = qty * purchaseP;
    const sellVal = qty * sellingP;

    totalStockUnits += qty;
    totalValuationCost += costVal;
    totalValuationSelling += sellVal;

    let status: 'Out of Stock' | 'Low Stock' | 'OK' = 'OK';
    if (qty === 0) {
      status = 'Out of Stock';
      outOfStockCount++;
    } else if (qty <= minS) {
      status = 'Low Stock';
      lowStockCount++;
    }

    return {
      id: p.id,
      name: p.name,
      barcode: p.barcode || 'N/A',
      category: (p as any).category || 'General',
      quantity: qty,
      minStock: minS,
      purchasePrice: purchaseP,
      sellingPrice: sellingP,
      stockValuationAtCost: costVal,
      stockValuationAtSelling: sellVal,
      status,
    };
  });

  // Sort: Out of Stock first, then Low Stock, then OK
  rows.sort((a, b) => {
    const rank = { 'Out of Stock': 1, 'Low Stock': 2, OK: 3 };
    return rank[a.status] - rank[b.status];
  });

  return {
    rows,
    summary: {
      totalProducts: products.length,
      totalStockUnits,
      lowStockCount,
      outOfStockCount,
      totalValuationCost,
      totalValuationSelling,
    },
  };
}

// ---------------------------------------------------------------------------
// 5. EXPIRY REPORT FETCH & COMPUTATION
// ---------------------------------------------------------------------------
export interface ExpiryReportRow {
  id: string;
  name: string;
  barcode: string;
  quantity: number;
  expiryDate: string;
  remainingDays: number;
  bucketLabel: string;
  status: 'Expired' | 'Expiring Soon' | 'OK';
}

export interface ExpiryReportData {
  rows: ExpiryReportRow[];
  summary: {
    expiredCount: number;
    days30Count: number;
    days60Count: number;
    days90Count: number;
    totalExpiryTrackedProducts: number;
  };
}

export async function getExpiryReportData(): Promise<ExpiryReportData> {
  let products: Product[] = [];
  try {
    const snap = await getDocs(collection(db, 'products'));
    products = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
  } catch (e) {
    const raw = localStorage.getItem('retailflow_products');
    products = raw ? JSON.parse(raw) : [];
  }

  const today = startOfDay(new Date());
  let expiredCount = 0;
  let days30Count = 0;
  let days60Count = 0;
  let days90Count = 0;

  const rows: ExpiryReportRow[] = [];

  for (const p of products) {
    if (!p.expiryDate) continue;

    let remainingDays = 999;
    let formattedDate = p.expiryDate;

    try {
      const parsed = parseTsToDate(p.expiryDate);
      remainingDays = differenceInCalendarDays(startOfDay(parsed), today);
      formattedDate = format(parsed, 'dd MMM yyyy');
    } catch {
      continue;
    }

    if (remainingDays > 90) continue; // Only include <= 90d relevant

    let bucketLabel = '';
    let status: 'Expired' | 'Expiring Soon' | 'OK' = 'OK';

    if (remainingDays < 0) {
      bucketLabel = 'Expired';
      status = 'Expired';
      expiredCount++;
    } else if (remainingDays <= 30) {
      bucketLabel = '0–30 Days';
      status = 'Expiring Soon';
      days30Count++;
    } else if (remainingDays <= 60) {
      bucketLabel = '31–60 Days';
      status = 'Expiring Soon';
      days60Count++;
    } else if (remainingDays <= 90) {
      bucketLabel = '61–90 Days';
      status = 'OK';
      days90Count++;
    }

    rows.push({
      id: p.id,
      name: p.name,
      barcode: p.barcode || 'N/A',
      quantity: Number(p.quantity || 0),
      expiryDate: formattedDate,
      remainingDays,
      bucketLabel,
      status,
    });
  }

  // Sort: soonest to expire / already expired longest first
  rows.sort((a, b) => a.remainingDays - b.remainingDays);

  return {
    rows,
    summary: {
      expiredCount,
      days30Count,
      days60Count,
      days90Count,
      totalExpiryTrackedProducts: rows.length,
    },
  };
}

// ---------------------------------------------------------------------------
// 6. SUPPLIER REPORT FETCH & COMPUTATION
// ---------------------------------------------------------------------------
export interface SupplierReportRow {
  id: string;
  name: string;
  totalPurchase: number;
  totalPaid: number;
  totalPending: number;
  status: 'Pending' | 'Partial' | 'Paid';
}

export interface SupplierReportData {
  rows: SupplierReportRow[];
  summary: {
    totalSuppliers: number;
    totalPurchase: number;
    totalPaid: number;
    totalPending: number;
  };
}

export async function getSupplierReportData(): Promise<SupplierReportData> {
  let suppliers: Supplier[] = [];
  try {
    const snap = await getDocs(collection(db, 'suppliers'));
    suppliers = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Supplier));
  } catch (e) {
    const raw = localStorage.getItem('retailflow_suppliers');
    suppliers = raw ? JSON.parse(raw) : [];
  }

  let totalPurchase = 0;
  let totalPaid = 0;
  let totalPending = 0;

  const rows: SupplierReportRow[] = suppliers.map((s) => {
    const pur = Number(s.totalPurchase || 0);
    const paid = Number(s.totalPaid || 0);
    const pend = Number(s.totalPending || 0);

    totalPurchase += pur;
    totalPaid += paid;
    totalPending += pend;

    return {
      id: s.id,
      name: s.name,
      totalPurchase: pur,
      totalPaid: paid,
      totalPending: pend,
      status: s.status || (pend <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Pending'),
    };
  });

  // Sort highest pending first
  rows.sort((a, b) => b.totalPending - a.totalPending);

  return {
    rows,
    summary: {
      totalSuppliers: suppliers.length,
      totalPurchase,
      totalPaid,
      totalPending,
    },
  };
}

// ---------------------------------------------------------------------------
// 7. EXPORT HELPERS (PDF, EXCEL)
// ---------------------------------------------------------------------------
export async function exportReportToPDF(
  reportTitle: string,
  dateRangeLabel: string,
  headers: string[],
  tableRows: (string | number)[][]
) {
  const settings: StoreSettings = await getStoreSettings();
  const doc = new jsPDF();

  // Header branding
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(settings.storeName || 'RetailFlow Store', 14, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  if (settings.address) {
    doc.text(settings.address, 14, 26);
  }
  if (settings.phone) {
    doc.text(`Phone: ${settings.phone}`, 14, 31);
  }

  // Divider line
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(14, 35, 196, 35);

  // Report Title & Date Subheader
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(reportTitle.toUpperCase(), 14, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Period / Scope: ${dateRangeLabel}`, 14, 50);
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, 14, 55);

  // AutoTable
  autoTable(doc, {
    startY: 60,
    head: [headers],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59], // dark slate
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${reportTitle.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

export function exportReportToExcel(
  reportTitle: string,
  headers: string[],
  tableRows: (string | number)[][]
) {
  const wb = XLSX.utils.book_new();

  // Create objects for json_to_sheet
  const dataObjects = tableRows.map((row) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx];
    });
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(dataObjects.length ? dataObjects : [{}]);
  XLSX.utils.book_append_sheet(wb, ws, reportTitle.slice(0, 31));

  XLSX.writeFile(wb, `${reportTitle.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
}
