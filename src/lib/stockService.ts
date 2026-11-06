import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  writeBatch,
  addDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { Supplier, Product, PurchaseHistory, StockHistory } from '../types';
import { useAppStore } from '../store/useStore';
import { generateUniqueBarcode } from './productService';

export interface CommitNewStockItem {
  productName: string;
  quantity: number;
  purchasePrice: number;
  mrp: number;
  sellingPrice: number;
  minStock?: number;
  expiryDate?: string | null;
}

export interface CommitNewStockPayload {
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  sourceType: 'ocr' | 'excel' | 'manual';
  items: CommitNewStockItem[];
}

const LOCAL_STORAGE_SUPPLIERS_KEY = 'retailflow_suppliers';

function getLocalSuppliers(): Supplier[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SUPPLIERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalSuppliers(suppliers: Supplier[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_SUPPLIERS_KEY, JSON.stringify(suppliers));
  } catch (e) {
    console.error('Failed to update local storage suppliers', e);
  }
}

// Fetch list of suppliers for autocomplete
export async function getSuppliersList(): Promise<Supplier[]> {
  try {
    const suppliersRef = collection(db, 'suppliers');
    const snap = await getDocs(suppliersRef);
    const suppliers: Supplier[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));
    if (suppliers.length > 0) {
      setLocalSuppliers(suppliers);
      return suppliers;
    }
  } catch (e) {
    console.warn('Failed to fetch suppliers from Firestore, using local:', e);
  }
  return getLocalSuppliers();
}

/**
 * SHARED COMMIT NEW STOCK PATH
 * Updates Products, Suppliers, PurchaseHistory, and StockHistory atomically.
 * Automatically creates supplier if name does not exist.
 * Automatically creates product if product name does not exist.
 * Chunked in batched writes <= 400 ops per commit.
 */
export async function commitNewStock(payload: CommitNewStockPayload): Promise<{
  supplierId: string;
  purchaseHistoryId: string;
  totalAmount: number;
  itemsProcessed: number;
}> {
  const { supplierName, invoiceNumber, invoiceDate, sourceType, items } = payload;
  const now = new Date().toISOString();

  const trimmedSupplier = supplierName.trim();
  const supplierKey = trimmedSupplier.toLowerCase();

  // 1. Calculate total invoice amount
  const totalInvoiceAmount = items.reduce(
    (acc, item) => acc + (item.quantity * (item.purchasePrice || item.sellingPrice || item.mrp || 0)),
    0
  );

  // 2. Fetch or create Supplier
  const existingSuppliers = await getSuppliersList();
  let supplierDocId: string;
  let isNewSupplier = false;
  let targetSupplier = existingSuppliers.find(s => s.nameLower === supplierKey || s.name.trim().toLowerCase() === supplierKey);

  let batch = writeBatch(db);
  let batchOpCount = 0;

  if (targetSupplier) {
    supplierDocId = targetSupplier.id;
    const supplierRef = doc(db, 'suppliers', supplierDocId);
    const newTotalPurchase = (targetSupplier.totalPurchase || 0) + totalInvoiceAmount;
    const newTotalPending = (targetSupplier.totalPending || 0) + totalInvoiceAmount;

    batch.update(supplierRef, {
      totalPurchase: newTotalPurchase,
      totalPending: newTotalPending,
      updatedAt: now,
    });
    batchOpCount++;
  } else {
    // Create new supplier
    isNewSupplier = true;
    const supplierRef = doc(collection(db, 'suppliers'));
    supplierDocId = supplierRef.id;

    const newSupplierData = {
      name: trimmedSupplier,
      nameLower: supplierKey,
      totalPurchase: totalInvoiceAmount,
      totalPaid: 0,
      totalPending: totalInvoiceAmount,
      status: 'Pending' as const,
      createdAt: now,
      updatedAt: now,
    };

    batch.set(supplierRef, newSupplierData);
    batchOpCount++;

    // Add to local cache list
    targetSupplier = { id: supplierDocId, ...newSupplierData };
    setLocalSuppliers([...existingSuppliers, targetSupplier]);
  }

  // 3. Prepare PurchaseHistory reference
  const purchaseHistoryRef = doc(collection(db, 'purchaseHistory'));
  const purchaseHistoryId = purchaseHistoryRef.id;

  // 4. Match and process Product items
  const currentProjections = useAppStore.getState().productSearchIndex;
  const existingProductMap = new Map<string, typeof currentProjections[0]>();
  const existingBarcodes = new Set<string>();

  for (const p of currentProjections) {
    existingProductMap.set(p.name.trim().toLowerCase(), p);
    if (p.barcode) existingBarcodes.add(p.barcode.toLowerCase());
  }

  const lineItemsForPurchase: Array<{
    productId: string;
    productName: string;
    qty: number;
    purchasePrice: number;
  }> = [];

  for (const item of items) {
    const pName = item.productName.trim();
    const pKey = pName.toLowerCase();
    const existingP = existingProductMap.get(pKey);

    let productId: string;

    if (existingP) {
      productId = existingP.id;
      const productRef = doc(db, 'products', productId);

      const updatedQty = (existingP.quantity || 0) + item.quantity;
      const updateData: Record<string, any> = {
        quantity: updatedQty,
        updatedAt: now,
      };

      if (item.purchasePrice > 0) updateData.purchasePrice = item.purchasePrice;
      if (item.mrp > 0) updateData.mrp = item.mrp;
      if (item.sellingPrice > 0) updateData.sellingPrice = item.sellingPrice;
      if (item.expiryDate) updateData.expiryDate = item.expiryDate;

      batch.update(productRef, updateData);
      batchOpCount++;
    } else {
      // Create brand new Product
      const newProductRef = doc(collection(db, 'products'));
      productId = newProductRef.id;

      const barcode = await generateUniqueBarcode();
      existingBarcodes.add(barcode.toLowerCase());

      const newProductData = {
        name: pName,
        nameLower: pKey,
        quantity: item.quantity,
        purchasePrice: item.purchasePrice || 0,
        mrp: item.mrp || item.sellingPrice || 0,
        sellingPrice: item.sellingPrice || item.mrp || 0,
        minStock: item.minStock || 10,
        expiryDate: item.expiryDate || null,
        barcode: barcode,
        createdAt: now,
        updatedAt: now,
      };

      batch.set(newProductRef, newProductData);
      batchOpCount++;

      // Cache in local search index map
      existingProductMap.set(pKey, {
        id: productId,
        name: pName,
        nameLower: pKey,
        barcode: barcode,
        quantity: item.quantity,
        purchasePrice: item.purchasePrice || 0,
        sellingPrice: item.sellingPrice || item.mrp || 0,
        mrp: item.mrp || item.sellingPrice || 0,
        minStock: item.minStock || 10,
        expiryDate: item.expiryDate || null,
      });
    }

    lineItemsForPurchase.push({
      productId,
      productName: pName,
      qty: item.quantity,
      purchasePrice: item.purchasePrice || 0,
    });

    // Create StockHistory record per line item
    const stockHistoryRef = doc(collection(db, 'stockHistory'));
    batch.set(stockHistoryRef, {
      productId,
      productName: pName,
      changeType: 'New Purchase' as const,
      quantityChange: item.quantity,
      reason: `Invoice ${invoiceNumber} from ${trimmedSupplier}`,
      relatedDocId: purchaseHistoryId,
      createdAt: now,
    });
    batchOpCount++;

    // If batch size gets close to 400 ops, commit and reset
    if (batchOpCount >= 400) {
      try {
        await batch.commit();
      } catch (err) {
        console.warn('Batch commit chunk failed:', err);
      }
      batch = writeBatch(db);
      batchOpCount = 0;
    }
  }

  // Set PurchaseHistory doc
  batch.set(purchaseHistoryRef, {
    supplierId: supplierDocId,
    supplierName: trimmedSupplier,
    invoiceNumber: invoiceNumber.trim(),
    invoiceDate: invoiceDate,
    amount: totalInvoiceAmount,
    paymentStatus: 'Pending' as const,
    sourceType: sourceType,
    lineItems: lineItemsForPurchase,
    createdAt: now,
  });
  batchOpCount++;

  if (batchOpCount > 0) {
    try {
      await batch.commit();
    } catch (err) {
      console.warn('Final batch commit failed:', err);
    }
  }

  // Update local invoice cache for auto-incrementing
  const match = invoiceNumber.trim().match(/(\d+)/g);
  if (match && match.length > 0) {
    const lastNum = parseInt(match[match.length - 1], 10);
    if (!isNaN(lastNum)) {
      const currentHighest = parseInt(localStorage.getItem('retailflow_last_invoice_num') || '0', 10);
      if (lastNum > currentHighest) {
        localStorage.setItem('retailflow_last_invoice_num', String(lastNum));
      }
    }
  }

  return {
    supplierId: supplierDocId,
    purchaseHistoryId,
    totalAmount: totalInvoiceAmount,
    itemsProcessed: items.length,
  };
}

/**
 * Auto-increments invoice number based on highest recorded invoice in purchaseHistory.
 * Handles formats like "101" -> "102", "INV-101" -> "INV-102", "INV101" -> "INV102".
 * Defaults to "101" if no existing invoices are found.
 */
export async function getNextInvoiceNumber(): Promise<string> {
  let highestNum = 100; // Default baseline so first auto-generated invoice is 101
  let samplePrefix = '';
  let sampleSuffix = '';

  const cachedLast = localStorage.getItem('retailflow_last_invoice_num');
  if (cachedLast) {
    const val = parseInt(cachedLast, 10);
    if (!isNaN(val) && val > highestNum) {
      highestNum = val;
    }
  }

  try {
    const phRef = collection(db, 'purchaseHistory');
    const snap = await getDocs(phRef);

    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.invoiceNumber) {
        const invStr = String(data.invoiceNumber).trim();
        const match = invStr.match(/^(.*?)(\d+)(\D*)$/);
        if (match) {
          const prefix = match[1];
          const numVal = parseInt(match[2], 10);
          const suffix = match[3];

          if (!isNaN(numVal) && numVal > highestNum && numVal < 100000000) {
            highestNum = numVal;
            samplePrefix = prefix;
            sampleSuffix = suffix;
          }
        }
      }
    });
  } catch (e) {
    console.warn('Could not query purchaseHistory for next invoice number:', e);
  }

  const nextNum = highestNum + 1;
  if (samplePrefix || sampleSuffix) {
    return `${samplePrefix}${nextNum}${sampleSuffix}`;
  }

  return String(nextNum);
}

export type StockChangeReason = 'New Purchase' | 'Damaged' | 'Expired' | 'Manual Correction' | 'Customer Return';

export interface UpdateStockParams {
  productId: string;
  productName: string;
  currentQuantity: number;
  changeType: StockChangeReason;
  quantityValue: number; // For New Purchase / Damaged / Expired: positive absolute number. For Manual Correction: signed number.
  notes?: string;
}

/**
 * Manually updates product stock and records StockHistory entry atomically in Firestore.
 * Prevents negative stock level.
 */
export async function updateStockManual(params: UpdateStockParams): Promise<{
  newQuantity: number;
  signedChange: number;
}> {
  const { productId, productName, currentQuantity, changeType, quantityValue, notes } = params;
  const now = new Date().toISOString();

  let signedChange = 0;

  if (changeType === 'New Purchase' || changeType === 'Customer Return') {
    signedChange = Math.abs(quantityValue);
  } else if (changeType === 'Damaged' || changeType === 'Expired') {
    signedChange = -Math.abs(quantityValue);
  } else if (changeType === 'Manual Correction') {
    signedChange = quantityValue; // Can be positive or negative
  }

  const newQuantity = currentQuantity + signedChange;

  if (newQuantity < 0) {
    throw new Error(
      `Stock update rejected: Resulting quantity cannot be negative (${newQuantity}). Current stock is ${currentQuantity}.`
    );
  }

  const batch = writeBatch(db);

  // 1. Update Product document
  const productRef = doc(db, 'products', productId);
  batch.update(productRef, {
    quantity: newQuantity,
    updatedAt: now,
  });

  // 2. Add StockHistory document
  const historyRef = doc(collection(db, 'stockHistory'));
  const historyData: Omit<StockHistory, 'id'> = {
    productId,
    productName,
    changeType,
    quantityChange: signedChange,
    reason: notes && notes.trim() ? notes.trim() : `Manual update (${changeType})`,
    relatedDocId: null,
    createdAt: now,
  };

  batch.set(historyRef, historyData);

  await batch.commit();

  return { newQuantity, signedChange };
}

/**
 * Fetches StockHistory log entries for a given product ID, ordered most recent first.
 */
export async function getProductStockHistory(productId: string): Promise<StockHistory[]> {
  try {
    const historyRef = collection(db, 'stockHistory');
    // Query by productId
    const q = query(historyRef, where('productId', '==', productId));
    const snap = await getDocs(q);

    const logs: StockHistory[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as StockHistory));

    // Sort descending by createdAt
    logs.sort((a, b) => {
      const timeA = typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : 0;
      const timeB = typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return logs;
  } catch (err) {
    console.warn('Error fetching stock history:', err);
    return [];
  }
}

export interface RemoveExpiredStockItemInput {
  productId: string;
  productName: string;
  currentQuantity: number;
  qtyToRemove?: number; // Defaults to currentQuantity if not provided
  reason?: string;
}

/**
 * Bulk removes expired stock for multiple products in chunked atomic batches.
 * Logs a StockHistory entry per affected product.
 */
export async function bulkRemoveExpiredStock(items: RemoveExpiredStockItemInput[]): Promise<number> {
  if (!items || items.length === 0) return 0;

  const now = new Date().toISOString();
  // Firestore writeBatch limit is 500 ops. Each item requires 2 ops (1 update + 1 history insert).
  const CHUNK_SIZE = 200;
  let totalProcessed = 0;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const item of chunk) {
      const removeQty = Math.min(
        item.currentQuantity,
        Math.abs(item.qtyToRemove ?? item.currentQuantity)
      );
      if (removeQty <= 0) continue;

      const newQty = Math.max(0, item.currentQuantity - removeQty);
      const productRef = doc(db, 'products', item.productId);

      batch.update(productRef, {
        quantity: newQty,
        updatedAt: now,
      });

      const historyRef = doc(collection(db, 'stockHistory'));
      const historyData: Omit<StockHistory, 'id'> = {
        productId: item.productId,
        productName: item.productName,
        changeType: 'Expired',
        quantityChange: -removeQty,
        reason: item.reason && item.reason.trim() ? item.reason.trim() : 'Expired Stock Removal',
        relatedDocId: null,
        createdAt: now,
      };

      batch.set(historyRef, historyData);
      totalProcessed++;
    }

    await batch.commit();
  }

  return totalProcessed;
}

