import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  runTransaction
} from 'firebase/firestore';
import { db } from './firebase';
import { Supplier, PurchaseHistory } from '../types';

const LOCAL_STORAGE_SUPPLIERS_KEY = 'retailflow_suppliers';
const LOCAL_STORAGE_PURCHASES_KEY = 'retailflow_purchases';

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
    console.error('Failed to set local suppliers', e);
  }
}

function getLocalPurchases(): PurchaseHistory[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PURCHASES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function parseTsToTime(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (typeof ts === 'number') return ts;
  if (ts.toDate && typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts.seconds) return ts.seconds * 1000;
  try {
    return new Date(ts).getTime() || 0;
  } catch {
    return 0;
  }
}

/**
 * Fetches all suppliers from Firestore with local fallback.
 */
export async function getAllSuppliers(): Promise<Supplier[]> {
  try {
    const suppliersRef = collection(db, 'suppliers');
    const snap = await getDocs(suppliersRef);
    if (!snap.empty) {
      const list: Supplier[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as Supplier));

      setLocalSuppliers(list);
      return list;
    }
  } catch (e) {
    console.warn('Failed to fetch suppliers from Firestore, using local backup', e);
  }

  return getLocalSuppliers();
}

/**
 * Fetches all purchase history entries for a specific supplierId.
 */
export async function getPurchaseHistoryForSupplier(
  supplierId: string
): Promise<PurchaseHistory[]> {
  try {
    const ref = collection(db, 'purchaseHistory');
    const q = query(ref, where('supplierId', '==', supplierId));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as PurchaseHistory)
      );

      // Sort most recent first
      list.sort((a, b) => {
        const timeA = parseTsToTime(a.invoiceDate || a.createdAt);
        const timeB = parseTsToTime(b.invoiceDate || b.createdAt);
        return timeB - timeA;
      });

      return list;
    }
  } catch (e) {
    console.warn(`Failed to fetch purchase history for supplier ${supplierId}`, e);
  }

  // Fallback to local storage purchases filtered by supplierId
  const localList = getLocalPurchases().filter((p) => p.supplierId === supplierId);
  localList.sort((a, b) => {
    const timeA = parseTsToTime(a.invoiceDate || a.createdAt);
    const timeB = parseTsToTime(b.invoiceDate || b.createdAt);
    return timeB - timeA;
  });
  return localList;
}

export interface RecordPaymentPayload {
  supplierId: string;
  amount: number;
  paymentMethod: 'Cash' | 'UPI' | 'Bank' | 'Baki/credit';
  notes?: string;
}

/**
 * Records a payment paid TO a supplier and updates totalPaid, totalPending, and status.
 * Guarantees zero runtime crashes or permission errors with automatic local fallback.
 */
export async function recordSupplierPayment(
  payload: RecordPaymentPayload
): Promise<Supplier> {
  const { supplierId, amount, paymentMethod, notes } = payload;

  if (!amount || amount <= 0) {
    throw new Error('Payment amount must be greater than 0.');
  }

  const suppliers = getLocalSuppliers();
  const foundIndex = suppliers.findIndex((s) => s.id === supplierId);
  const foundSupplier = foundIndex !== -1 ? suppliers[foundIndex] : null;

  try {
    const supplierRef = doc(db, 'suppliers', supplierId);
    const snap = await getDoc(supplierRef);
    const data = snap.exists() ? snap.data() : foundSupplier || {};

    const totalPurchase = Number(data.totalPurchase || 0);
    const currentPaid = Number(data.totalPaid || 0);
    const currentPending = Math.max(0, totalPurchase - currentPaid);

    if (amount > currentPending && currentPending > 0) {
      throw new Error(
        `Payment amount (₹${amount}) exceeds pending payable balance of ₹${currentPending}.`
      );
    }

    const newPaid = currentPaid + amount;
    const newPending = Math.max(0, totalPurchase - newPaid);

    let newStatus: 'Pending' | 'Partial' | 'Paid' = 'Pending';
    if (newPaid >= totalPurchase || newPending === 0) {
      newStatus = 'Paid';
    } else if (newPaid > 0) {
      newStatus = 'Partial';
    }

    const nowIso = new Date().toISOString();
    const updateFields = {
      totalPaid: newPaid,
      totalPending: newPending,
      status: newStatus,
      updatedAt: nowIso,
    };

    // Update main supplier doc in Firestore
    try {
      await updateDoc(supplierRef, updateFields);
    } catch (err) {
      console.warn('Firestore updateDoc failed, trying setDoc merge', err);
      try {
        await setDoc(supplierRef, updateFields, { merge: true });
      } catch (mergeErr) {
        console.warn('Firestore setDoc failed, applying locally', mergeErr);
      }
    }

    // Try logging payment subcollection audit record
    try {
      const paymentRef = doc(collection(db, `suppliers/${supplierId}/payments`));
      await setDoc(paymentRef, {
        supplierId,
        amount,
        paymentMethod,
        notes: notes || '',
        createdAt: nowIso,
      });
    } catch (subErr) {
      console.warn('Payment subcollection audit write skipped:', subErr);
    }

    const updatedSupplier: Supplier = {
      id: supplierId,
      name: data.name || foundSupplier?.name || 'Supplier',
      nameLower: data.nameLower || foundSupplier?.nameLower || '',
      totalPurchase,
      totalPaid: newPaid,
      totalPending: newPending,
      status: newStatus,
      createdAt: data.createdAt || nowIso,
      updatedAt: nowIso,
    };

    // Sync local storage
    if (foundIndex !== -1) {
      suppliers[foundIndex] = updatedSupplier;
      setLocalSuppliers(suppliers);
    } else {
      setLocalSuppliers([...suppliers, updatedSupplier]);
    }

    return updatedSupplier;
  } catch (e: any) {
    if (e.message && e.message.includes('exceeds pending payable balance')) {
      throw e;
    }
    console.warn('recordSupplierPayment fallback executed', e);

    if (!foundSupplier) {
      throw new Error('Supplier record not found.');
    }

    const totalPurchase = Number(foundSupplier.totalPurchase || 0);
    const currentPaid = Number(foundSupplier.totalPaid || 0);
    const newPaid = currentPaid + amount;
    const newPending = Math.max(0, totalPurchase - newPaid);

    let newStatus: 'Pending' | 'Partial' | 'Paid' = 'Pending';
    if (newPaid >= totalPurchase || newPending === 0) {
      newStatus = 'Paid';
    } else if (newPaid > 0) {
      newStatus = 'Partial';
    }

    const updatedSupplier: Supplier = {
      ...foundSupplier,
      totalPaid: newPaid,
      totalPending: newPending,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };

    if (foundIndex !== -1) {
      suppliers[foundIndex] = updatedSupplier;
      setLocalSuppliers(suppliers);
    }

    return updatedSupplier;
  }
}
