export type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
} | Date | string;

export interface Product {
  id: string;
  name: string;
  nameLower: string;       // auto-derived lowercase(name)
  quantity: number;
  purchasePrice: number;
  mrp: number;
  sellingPrice: number;    // default = mrp unless later overridden
  minStock: number;
  expiryDate: FirestoreTimestamp | null;
  barcode: string;         // unique
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface Supplier {
  id: string;
  name: string;
  nameLower: string;
  totalPurchase: number;
  totalPaid: number;
  totalPending: number;
  status: 'Pending' | 'Partial' | 'Paid';
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface PurchaseLineItem {
  productId: string;
  productName: string;
  qty: number;
  purchasePrice: number;
}

export interface PurchaseHistory {
  id: string;
  supplierId: string;
  invoiceNumber: string;
  invoiceDate: FirestoreTimestamp;
  amount: number;
  paymentStatus: 'Pending' | 'Partial' | 'Paid';
  lineItems: PurchaseLineItem[];
  sourceType: 'manual' | 'ocr' | 'excel';
  createdAt: FirestoreTimestamp;
}

export interface SaleItem {
  productId: string;
  productName: string;
  qty: number;
  sellingPriceAtSale: number;   // snapshot at time of sale
  purchasePriceAtSale: number;  // snapshot at time of sale
}

export interface Sale {
  id: string;
  items: SaleItem[];
  discountType: 'flat' | 'percentage' | null;
  discountValue: number;
  subtotal: number;
  total: number;
  profit: number;
  createdAt: FirestoreTimestamp;
}

export interface StockHistory {
  id: string;
  productId: string;
  productName: string;   // denormalized
  changeType: 'New Purchase' | 'Damaged' | 'Expired' | 'Manual Correction' | 'POS Sale' | 'Customer Return';
  quantityChange: number; // signed (+ for add, - for remove)
  reason: string;
  relatedDocId: string | null;
  createdAt: FirestoreTimestamp;
}

export interface StoreSettings {
  appName: string;
  logoUrl: string | null;
  storeName: string;
  phone: string;
  address: string;
  adminPasswordHash: string;  // never read/compared client-side
  updatedAt: FirestoreTimestamp;
}

export type NavItem = 
  | 'dashboard'
  | 'products'
  | 'new-stock'
  | 'stock-management'
  | 'pos'
  | 'expiry'
  | 'suppliers'
  | 'reports'
  | 'settings';
