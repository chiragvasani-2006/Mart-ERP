import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  DocumentData,
  QueryDocumentSnapshot,
  onSnapshot
} from 'firebase/firestore';
import { db } from './firebase';
import { Product } from '../types';
import { ProductSearchProjection, useAppStore } from '../store/useStore';
import { seedTestingData } from './seedService';

const LOCAL_STORAGE_PRODUCTS_KEY = 'retailflow_products';

function getLocalProducts(): Product[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PRODUCTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalProducts(products: Product[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_PRODUCTS_KEY, JSON.stringify(products));
  } catch (e) {
    console.error('Failed to update local storage products', e);
  }
}

function formatExpiryDateString(expiry: any): string | null {
  if (!expiry) return null;
  if (typeof expiry === 'string') return expiry;
  if (typeof expiry === 'object' && expiry.toDate && typeof expiry.toDate === 'function') {
    return expiry.toDate().toISOString().split('T')[0];
  }
  if (expiry instanceof Date) {
    return expiry.toISOString().split('T')[0];
  }
  return String(expiry);
}

let autoSeedTriggered = false;

// 1. Live Firestore listener setup for in-memory Zustand search index
export function setupProductIndexListener() {
  const setIndex = useAppStore.getState().setProductSearchIndex;

  try {
    const productsRef = collection(db, 'products');
    const unsubscribe = onSnapshot(productsRef, (snapshot) => {
      if (snapshot.empty) {
        setIndex([]);
        setLocalProducts([]);
        return;
      }

      const projections: ProductSearchProjection[] = [];
      const fullProducts: Product[] = [];

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const p: Product = {
          id: docSnap.id,
          name: data.name || '',
          nameLower: data.nameLower || (data.name ? data.name.toLowerCase() : ''),
          quantity: Number(data.quantity) || 0,
          purchasePrice: Number(data.purchasePrice) || 0,
          mrp: Number(data.mrp) || 0,
          sellingPrice: Number(data.sellingPrice) ?? Number(data.mrp) ?? 0,
          minStock: Number(data.minStock) || 0,
          expiryDate: data.expiryDate || null,
          barcode: data.barcode || '',
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
        };

        fullProducts.push(p);
        projections.push({
          id: p.id,
          name: p.name,
          nameLower: p.nameLower,
          barcode: p.barcode,
          quantity: p.quantity,
          purchasePrice: p.purchasePrice,
          sellingPrice: p.sellingPrice,
          mrp: p.mrp,
          minStock: p.minStock,
          expiryDate: formatExpiryDateString(p.expiryDate),
        });
      });

      setIndex(projections);
      setLocalProducts(fullProducts);
    }, (error) => {
      console.warn('Product snapshot listener offline fallback:', error);
      // Fallback to local storage
      const local = getLocalProducts();
      setIndex(local.map(p => ({
        id: p.id,
        name: p.name,
        nameLower: p.nameLower || p.name.toLowerCase(),
        barcode: p.barcode,
        quantity: p.quantity,
        purchasePrice: p.purchasePrice,
        sellingPrice: p.sellingPrice,
        mrp: p.mrp,
        minStock: p.minStock,
        expiryDate: formatExpiryDateString(p.expiryDate),
      })));
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Failed to attach product snapshot listener:', err);
    return () => {};
  }
}


// 2. Verified Professional EAN-13 Barcode System

/**
 * 1. EAN-13 Check Digit Calculation
 * Standard mod-10 algorithm with 1 and 3 position weights.
 * Verified: 890601729133 -> check digit 7 (Bisleri 1L barcode 8906017291337)
 */
export function calculateEAN13CheckDigit(digits12: string): number {
  const digits = digits12.split('').map(Number);
  let sum = 0;
  digits.forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 1 : 3);
  });
  return (10 - (sum % 10)) % 10;
}

/**
 * 2. Internal Barcode Generation (fallback for products without printed barcodes)
 * Uses GS1 "in-store use" prefix '20', 10-digit zero-padded sequence, and 1 check digit.
 * Format: 13 numeric digits total e.g. 2000000000017
 */
export function generateInternalBarcode(sequenceNumber: number): string {
  const prefix = '20';
  const sequence = String(sequenceNumber).padStart(10, '0');
  const first12 = prefix + sequence; // 12 digits total
  const checkDigit = calculateEAN13CheckDigit(first12);
  return first12 + checkDigit; // 13 digits EAN-13
}

/**
 * Transactionally increments Firestore document counters/internalBarcode.
 * SOLE source of sequence numbers across all devices - NO localStorage fallback.
 */
export async function getNextInternalBarcodeSequence(): Promise<number> {
  try {
    const counterRef = doc(db, 'counters', 'internalBarcode');
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const current = snap.exists() ? (snap.data().value || 0) : 0;
      const next = current + 1;
      tx.set(counterRef, { value: next }, { merge: true });
      return next;
    });
  } catch (err: any) {
    if (err?.code === 'permission-denied' || (err?.message && (err.message.includes('permission') || err.message.includes('Permission')))) {
      throw new Error("Firebase Permission Denied: Go to Firebase Console -> Firestore -> Rules and change 'allow read, write: if false;' to 'allow read, write: if true;' then click Publish.");
    }
    throw err;
  }
}

/**
 * Atomically reserves a block of N sequence numbers from counters/internalBarcode in 1 transaction.
 * High-speed batch processing for bulk Excel/CSV product imports!
 */
export async function reserveInternalBarcodeSequences(count: number): Promise<number> {
  if (count <= 0) return 1;
  try {
    const counterRef = doc(db, 'counters', 'internalBarcode');
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const current = snap.exists() ? (snap.data().value || 0) : 0;
      const nextStart = current + 1;
      const nextEnd = current + count;
      tx.set(counterRef, { value: nextEnd }, { merge: true });
      return nextStart;
    });
  } catch (err: any) {
    if (err?.code === 'permission-denied' || (err?.message && (err.message.includes('permission') || err.message.includes('Permission')))) {
      throw new Error("Firebase Permission Denied: Go to Firebase Console -> Firestore -> Rules and change 'allow read, write: if false;' to 'allow read, write: if true;' then click Publish.");
    }
    console.warn('Batch barcode reservation had network issue, fallback to timestamp sequences:', err);
    return Math.floor(Date.now() / 1000);
  }
}

/**
 * Helper to generate a unique internal EAN-13 barcode
 */
export async function generateUniqueBarcode(): Promise<string> {
  const seq = await getNextInternalBarcodeSequence();
  return generateInternalBarcode(seq);
}

/**
 * 4. Duplicate Barcode Check (Run before product save)
 * Returns the conflicting Product if found, or null if clear.
 */
export async function isBarcodeTaken(barcode: string, excludeProductId?: string): Promise<Product | null> {
  const clean = (barcode || '').trim();
  if (!clean) return null;

  // Check in-memory projections first
  const existingProjections = useAppStore.getState().productSearchIndex;
  const match = existingProjections.find(
    p => p.barcode.toLowerCase() === clean.toLowerCase() && p.id !== excludeProductId
  );
  if (match) {
    return {
      id: match.id,
      name: match.name,
      nameLower: match.nameLower,
      quantity: match.quantity,
      purchasePrice: match.purchasePrice,
      sellingPrice: match.sellingPrice,
      mrp: match.mrp,
      minStock: match.minStock,
      expiryDate: match.expiryDate,
      barcode: match.barcode,
      createdAt: '',
      updatedAt: '',
    };
  }

  // Also query Firestore for multi-device verification
  try {
    const q = query(collection(db, 'products'), where('barcode', '==', clean), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const existing = snap.docs[0];
      if (existing.id === excludeProductId) return null;
      return { id: existing.id, ...existing.data() } as Product;
    }
  } catch (e) {
    console.warn('Firestore duplicate barcode query had network issue:', e);
  }

  return null;
}

// 3. Get single product by ID
export async function getProductById(id: string): Promise<Product | null> {
  try {
    const docRef = doc(db, 'products', id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Product;
    }
  } catch (e) {
    console.warn('Firestore fetch failed, checking local', e);
  }

  const local = getLocalProducts();
  const found = local.find(p => p.id === id);
  return found || null;
}

// 4. Create Product
export interface CreateProductInput {
  name: string;
  quantity: number;
  purchasePrice: number;
  mrp: number;
  sellingPrice?: number;
  minStock: number;
  expiryDate?: string | null;
  barcode?: string;
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  let finalBarcode = (input.barcode || '').trim();

  if (!finalBarcode) {
    // If no barcode provided, generate internal EAN-13 via Firestore counter
    const seq = await getNextInternalBarcodeSequence();
    finalBarcode = generateInternalBarcode(seq);
  }

  // Check duplicate barcode
  const conflict = await isBarcodeTaken(finalBarcode);
  if (conflict) {
    throw new Error(`This barcode is already assigned to "${conflict.name}"`);
  }

  const now = new Date().toISOString();
  const nameTrimmed = input.name.trim();

  const productData: Omit<Product, 'id'> = {
    name: nameTrimmed,
    nameLower: nameTrimmed.toLowerCase(),
    quantity: Number(input.quantity) || 0,
    purchasePrice: Number(input.purchasePrice) || 0,
    mrp: Number(input.mrp) || 0,
    sellingPrice: Number(input.sellingPrice ?? input.mrp) || 0,
    minStock: Number(input.minStock) || 0,
    expiryDate: input.expiryDate || null,
    barcode: finalBarcode,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const productsCol = collection(db, 'products');
    const docRef = await addDoc(productsCol, productData);
    const created: Product = { id: docRef.id, ...productData };

    // Update local storage copy
    const local = getLocalProducts();
    setLocalProducts([...local, created]);

    return created;
  } catch (e) {
    console.warn('Firestore addDoc failed, creating in local fallback:', e);
    const fallbackId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const created: Product = { id: fallbackId, ...productData };

    const local = getLocalProducts();
    setLocalProducts([...local, created]);

    // Force update Zustand search index for offline smoothness
    const currentProjections = useAppStore.getState().productSearchIndex;
    useAppStore.getState().setProductSearchIndex([
      ...currentProjections,
      {
        id: created.id,
        name: created.name,
        nameLower: created.nameLower,
        barcode: created.barcode,
        quantity: created.quantity,
        purchasePrice: created.purchasePrice,
        sellingPrice: created.sellingPrice,
        mrp: created.mrp,
        minStock: created.minStock,
        expiryDate: formatExpiryDateString(created.expiryDate),
      }
    ]);

    return created;
  }
}

// 5. Update Product
export async function updateProduct(
  id: string,
  input: Partial<CreateProductInput>
): Promise<void> {
  let updatedBarcode = input.barcode !== undefined ? input.barcode.trim() : undefined;

  if (updatedBarcode) {
    const conflict = await isBarcodeTaken(updatedBarcode, id);
    if (conflict) {
      throw new Error(`This barcode is already assigned to "${conflict.name}"`);
    }
  }

  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    updatedAt: now,
  };

  if (input.name !== undefined) {
    updateData.name = input.name.trim();
    updateData.nameLower = input.name.trim().toLowerCase();
  }
  if (input.quantity !== undefined) updateData.quantity = Number(input.quantity) || 0;
  if (input.purchasePrice !== undefined) updateData.purchasePrice = Number(input.purchasePrice) || 0;
  if (input.mrp !== undefined) updateData.mrp = Number(input.mrp) || 0;
  if (input.sellingPrice !== undefined) updateData.sellingPrice = Number(input.sellingPrice) || 0;
  if (input.minStock !== undefined) updateData.minStock = Number(input.minStock) || 0;
  if (input.expiryDate !== undefined) updateData.expiryDate = input.expiryDate || null;
  if (updatedBarcode !== undefined) updateData.barcode = updatedBarcode;

  try {
    const docRef = doc(db, 'products', id);
    await updateDoc(docRef, updateData);
  } catch (e) {
    console.warn('Firestore updateDoc failed, updating local fallback', e);
  }

  // Update local storage copy
  const local = getLocalProducts();
  const updatedLocal = local.map((p) => (p.id === id ? { ...p, ...updateData } : p));
  setLocalProducts(updatedLocal);
}

// 6. Delete Product
export async function deleteProduct(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'products', id);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn('Firestore deleteDoc failed, deleting local fallback', e);
  }

  const local = getLocalProducts();
  const filtered = local.filter((p) => p.id !== id);
  setLocalProducts(filtered);
}

// 7. Paginated Products Fetch (for server cursor pagination when needed)
export interface PaginatedResult {
  products: Product[];
  lastDocSnap: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export async function fetchProductsPaginated(
  lastDocSnap: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = 50
): Promise<PaginatedResult> {
  try {
    const productsRef = collection(db, 'products');
    let q = query(productsRef, orderBy('nameLower'), limit(pageSize));

    if (lastDocSnap) {
      q = query(productsRef, orderBy('nameLower'), startAfter(lastDocSnap), limit(pageSize));
    }

    const snap = await getDocs(q);
    const docs = snap.docs;
    const products: Product[] = docs.map(d => ({ id: d.id, ...d.data() } as Product));

    return {
      products,
      lastDocSnap: docs.length > 0 ? docs[docs.length - 1] : null,
      hasMore: docs.length === pageSize,
    };
  } catch (e) {
    console.warn('Firestore paginated fetch fallback:', e);
    const local = getLocalProducts();
    return {
      products: local,
      lastDocSnap: null,
      hasMore: false,
    };
  }
}

// 8. Bulk Excel Import Products (Fast batch processing with auto barcode assignment)
export interface ParsedImportRow {
  name: string;
  quantity: number;
  purchasePrice: number;
  mrp: number;
  sellingPrice: number;
  minStock: number;
  expiryDate: string | null;
  barcode: string;
  isValid: boolean;
  validationError?: string;
}

export async function batchImportProducts(
  rows: ParsedImportRow[],
  onProgress?: (processed: number, total: number) => void
): Promise<{ updatedCount: number; createdCount: number }> {
  const validRows = rows.filter(r => r.isValid && r.name.trim());
  if (validRows.length === 0) {
    return { updatedCount: 0, createdCount: 0 };
  }

  // 1. Get current products & barcode indexes for instant duplicate checking
  const currentProjections = useAppStore.getState().productSearchIndex;
  const existingNameMap = new Map<string, ProductSearchProjection>();
  const existingBarcodes = new Set<string>();

  for (const p of currentProjections) {
    existingNameMap.set(p.name.trim().toLowerCase(), p);
    if (p.barcode) existingBarcodes.add(p.barcode.toLowerCase());
  }

  // 2. Count how many new products need internal barcode generation
  let neededBarcodesCount = 0;
  for (const row of validRows) {
    const nameKey = row.name.trim().toLowerCase();
    const existing = existingNameMap.get(nameKey);
    if (!existing) {
      const bCode = (row.barcode || '').trim();
      if (!bCode || existingBarcodes.has(bCode.toLowerCase())) {
        neededBarcodesCount++;
      }
    }
  }

  // 3. Reserve sequence numbers in ONE atomic transaction
  let barcodeSequenceCounter = 0;
  if (neededBarcodesCount > 0) {
    barcodeSequenceCounter = await reserveInternalBarcodeSequences(neededBarcodesCount);
  }

  let updatedCount = 0;
  let createdCount = 0;
  let processedCount = 0;
  const now = new Date().toISOString();

  // 4. Batch commit in chunks of 400 (Firestore maximum batch size is 500)
  const BATCH_SIZE = 400;
  const chunks: ParsedImportRow[][] = [];

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    chunks.push(validRows.slice(i, i + BATCH_SIZE));
  }

  const newProjectionsToAppend: ProductSearchProjection[] = [];

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    let opsInBatch = 0;

    for (const row of chunk) {
      const nameKey = row.name.trim().toLowerCase();
      const existingProduct = existingNameMap.get(nameKey);

      if (existingProduct) {
        // UPDATE existing product
        const docRef = doc(db, 'products', existingProduct.id);
        const updateData: Record<string, any> = {
          quantity: row.quantity,
          mrp: row.mrp,
          sellingPrice: row.sellingPrice || row.mrp,
          minStock: row.minStock,
          updatedAt: now,
        };
        if (row.purchasePrice > 0) updateData.purchasePrice = row.purchasePrice;
        if (row.expiryDate) updateData.expiryDate = row.expiryDate;
        if (row.barcode && row.barcode.trim()) updateData.barcode = row.barcode.trim();

        batch.update(docRef, updateData);
        updatedCount++;
      } else {
        // CREATE new product
        const newDocRef = doc(collection(db, 'products'));
        let assignedBarcode = (row.barcode || '').trim();

        if (!assignedBarcode || existingBarcodes.has(assignedBarcode.toLowerCase())) {
          assignedBarcode = generateInternalBarcode(barcodeSequenceCounter++);
        }
        existingBarcodes.add(assignedBarcode.toLowerCase());

        const newProduct: Omit<Product, 'id'> = {
          name: row.name.trim(),
          nameLower: nameKey,
          quantity: Number(row.quantity) || 0,
          purchasePrice: Number(row.purchasePrice) || 0,
          mrp: Number(row.mrp) || 0,
          sellingPrice: Number(row.sellingPrice) || Number(row.mrp) || 0,
          minStock: Number(row.minStock) || 0,
          expiryDate: row.expiryDate || null,
          barcode: assignedBarcode,
          createdAt: now,
          updatedAt: now,
        };

        batch.set(newDocRef, newProduct);
        createdCount++;

        const newProj: ProductSearchProjection = {
          id: newDocRef.id,
          name: newProduct.name,
          nameLower: newProduct.nameLower,
          barcode: newProduct.barcode,
          quantity: newProduct.quantity,
          purchasePrice: newProduct.purchasePrice,
          sellingPrice: newProduct.sellingPrice,
          mrp: newProduct.mrp,
          minStock: newProduct.minStock,
          expiryDate: formatExpiryDateString(newProduct.expiryDate),
        };

        existingNameMap.set(nameKey, newProj);
        newProjectionsToAppend.push(newProj);
      }

      opsInBatch++;
      processedCount++;
    }

    if (opsInBatch > 0) {
      try {
        await batch.commit();
      } catch (e) {
        console.warn('Batch commit failed on Firestore, processing locally fallback:', e);
      }
    }

    if (onProgress) {
      onProgress(processedCount, validRows.length);
    }
  }

  // 5. Instantly update Zustand search projections for real-time POS availability
  if (newProjectionsToAppend.length > 0) {
    const updatedList = [...currentProjections, ...newProjectionsToAppend];
    useAppStore.getState().setProductSearchIndex(updatedList);
  }

  return { updatedCount, createdCount };
}
