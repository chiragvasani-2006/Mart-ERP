import {
  collection,
  doc,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { Product, Supplier, PurchaseHistory, Sale, StockHistory } from '../types';

const LOCAL_STORAGE_PRODUCTS_KEY = 'retailflow_products';
const LOCAL_STORAGE_SUPPLIERS_KEY = 'retailflow_suppliers';
const LOCAL_STORAGE_SALES_KEY = 'retailflow_sales';
const LOCAL_STORAGE_PURCHASES_KEY = 'retailflow_purchases';
const LOCAL_STORAGE_STOCK_HISTORY_KEY = 'retailflow_stock_history';

// Helper to format date relative to today
const getDateDaysAgo = (daysAgo: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

const getDateDaysInFuture = (daysInFuture: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysInFuture);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD format
};

export async function seedTestingData(): Promise<{ success: boolean; message: string }> {
  try {
    const now = new Date().toISOString();

    // 1. SAMPLE PRODUCTS
    const sampleProducts: Omit<Product, 'id'>[] = [
      {
        name: 'Cannoli Vanilla Cream Shells 6pk',
        nameLower: 'cannoli vanilla cream shells 6pk',
        quantity: 25,
        purchasePrice: 120,
        mrp: 220,
        sellingPrice: 199,
        minStock: 10,
        expiryDate: getDateDaysInFuture(45),
        barcode: '8906017291337',
        createdAt: getDateDaysAgo(20),
        updatedAt: now,
      },
      {
        name: 'Pistachio Cannoli Crunch 250g',
        nameLower: 'pistachio cannoli crunch 250g',
        quantity: 18,
        purchasePrice: 180,
        mrp: 299,
        sellingPrice: 280,
        minStock: 5,
        expiryDate: getDateDaysInFuture(60),
        barcode: '8901030353001',
        createdAt: getDateDaysAgo(18),
        updatedAt: now,
      },
      {
        name: 'Whole Milk Organic 1L',
        nameLower: 'whole milk organic 1l',
        quantity: 3, // Low stock alert
        purchasePrice: 50,
        mrp: 75,
        sellingPrice: 70,
        minStock: 8,
        expiryDate: getDateDaysInFuture(12), // Expiring in 12 days
        barcode: '8901233014104',
        createdAt: getDateDaysAgo(10),
        updatedAt: now,
      },
      {
        name: 'Dark Chocolate Callebaut 500g',
        nameLower: 'dark chocolate callebaut 500g',
        quantity: 12,
        purchasePrice: 320,
        mrp: 499,
        sellingPrice: 450,
        minStock: 4,
        expiryDate: getDateDaysInFuture(120),
        barcode: '8901058852332',
        createdAt: getDateDaysAgo(30),
        updatedAt: now,
      },
      {
        name: 'French Butter Unsalted 500g',
        nameLower: 'french butter unsalted 500g',
        quantity: 0, // Out of stock alert
        purchasePrice: 210,
        mrp: 350,
        sellingPrice: 320,
        minStock: 5,
        expiryDate: getDateDaysInFuture(25),
        barcode: '8901725111106',
        createdAt: getDateDaysAgo(25),
        updatedAt: now,
      },
      {
        name: 'Strawberry Fruit Glaze 1kg',
        nameLower: 'strawberry fruit glaze 1kg',
        quantity: 4, // Low stock
        purchasePrice: 140,
        mrp: 240,
        sellingPrice: 220,
        minStock: 6,
        expiryDate: getDateDaysInFuture(5), // Expiring in 5 days
        barcode: '2000000000015',
        createdAt: getDateDaysAgo(15),
        updatedAt: now,
      },
      {
        name: 'Artisanal Yeast Extract 100g',
        nameLower: 'artisanal yeast extract 100g',
        quantity: 15,
        purchasePrice: 40,
        mrp: 80,
        sellingPrice: 75,
        minStock: 5,
        expiryDate: getDateDaysAgo(3).split('T')[0], // Expired 3 days ago
        barcode: '2000000000022',
        createdAt: getDateDaysAgo(40),
        updatedAt: now,
      },
      {
        name: 'Almond Flour Extra Fine 1kg',
        nameLower: 'almond flour extra fine 1kg',
        quantity: 14,
        purchasePrice: 450,
        mrp: 750,
        sellingPrice: 690,
        minStock: 5,
        expiryDate: getDateDaysInFuture(90),
        barcode: '2000000000039',
        createdAt: getDateDaysAgo(12),
        updatedAt: now,
      },
      {
        name: 'Ricotta Cheese Fresh 500g',
        nameLower: 'ricotta cheese fresh 500g',
        quantity: 2, // Low stock
        purchasePrice: 160,
        mrp: 280,
        sellingPrice: 260,
        minStock: 5,
        expiryDate: getDateDaysInFuture(8), // Expiring in 8 days
        barcode: '2000000000046',
        createdAt: getDateDaysAgo(8),
        updatedAt: now,
      },
      {
        name: 'Espresso Coffee Beans 1kg',
        nameLower: 'espresso coffee beans 1kg',
        quantity: 20,
        purchasePrice: 600,
        mrp: 990,
        sellingPrice: 920,
        minStock: 4,
        expiryDate: getDateDaysInFuture(180),
        barcode: '2000000000053',
        createdAt: getDateDaysAgo(50),
        updatedAt: now,
      },
    ];

    // 2. SAMPLE SUPPLIERS
    const sampleSuppliers: Supplier[] = [
      {
        id: 'sup_101',
        name: 'Gourmet Bakers Wholesale Ltd',
        nameLower: 'gourmet bakers wholesale ltd',
        totalPurchase: 45000,
        totalPaid: 35000,
        totalPending: 10000,
        status: 'Partial',
        createdAt: getDateDaysAgo(60),
        updatedAt: now,
      },
      {
        id: 'sup_102',
        name: 'FreshDairy Farms & Co',
        nameLower: 'freshdairy farms & co',
        totalPurchase: 18500,
        totalPaid: 18500,
        totalPending: 0,
        status: 'Paid',
        createdAt: getDateDaysAgo(45),
        updatedAt: now,
      },
      {
        id: 'sup_103',
        name: 'SweetImports Trading Co',
        nameLower: 'sweetimports trading co',
        totalPurchase: 28000,
        totalPaid: 15000,
        totalPending: 13000,
        status: 'Pending',
        createdAt: getDateDaysAgo(30),
        updatedAt: now,
      },
      {
        id: 'sup_104',
        name: 'Global Packaging Corp',
        nameLower: 'global packaging corp',
        totalPurchase: 12000,
        totalPaid: 12000,
        totalPending: 0,
        status: 'Paid',
        createdAt: getDateDaysAgo(20),
        updatedAt: now,
      },
    ];

    // 3. SAMPLE PURCHASES
    const samplePurchases: PurchaseHistory[] = [
      {
        id: 'pur_101',
        supplierId: 'sup_101',
        invoiceNumber: 'INV-GBW-9021',
        invoiceDate: getDateDaysAgo(15).split('T')[0],
        amount: 25000,
        paymentStatus: 'Partial',
        sourceType: 'manual',
        createdAt: getDateDaysAgo(15),
        lineItems: [
          { productId: 'p_1', productName: 'Cannoli Vanilla Cream Shells 6pk', qty: 50, purchasePrice: 120 },
          { productId: 'p_4', productName: 'Dark Chocolate Callebaut 500g', qty: 30, purchasePrice: 320 },
          { productId: 'p_8', productName: 'Almond Flour Extra Fine 1kg', qty: 20, purchasePrice: 470 },
        ],
      },
      {
        id: 'pur_102',
        supplierId: 'sup_102',
        invoiceNumber: 'INV-FDF-4011',
        invoiceDate: getDateDaysAgo(8).split('T')[0],
        amount: 8500,
        paymentStatus: 'Paid',
        sourceType: 'excel',
        createdAt: getDateDaysAgo(8),
        lineItems: [
          { productId: 'p_3', productName: 'Whole Milk Organic 1L', qty: 50, purchasePrice: 50 },
          { productId: 'p_5', productName: 'French Butter Unsalted 500g', qty: 20, purchasePrice: 210 },
          { productId: 'p_9', productName: 'Ricotta Cheese Fresh 500g', qty: 10, purchasePrice: 160 },
        ],
      },
      {
        id: 'pur_103',
        supplierId: 'sup_103',
        invoiceNumber: 'INV-SIT-7720',
        invoiceDate: getDateDaysAgo(2).split('T')[0],
        amount: 18000,
        paymentStatus: 'Pending',
        sourceType: 'manual',
        createdAt: getDateDaysAgo(2),
        lineItems: [
          { productId: 'p_2', productName: 'Pistachio Cannoli Crunch 250g', qty: 40, purchasePrice: 180 },
          { productId: 'p_6', productName: 'Strawberry Fruit Glaze 1kg', qty: 25, purchasePrice: 140 },
          { productId: 'p_10', productName: 'Espresso Coffee Beans 1kg', qty: 12, purchasePrice: 600 },
        ],
      },
    ];

    // 4. SAMPLE SALES
    const sampleSales: Sale[] = [
      {
        id: 'sale_101',
        subtotal: 878,
        discountType: 'percentage',
        discountValue: 10,
        total: 790.2,
        profit: 310,
        createdAt: getDateDaysAgo(0), // Today
        items: [
          { productId: 'p_1', productName: 'Cannoli Vanilla Cream Shells 6pk', qty: 2, purchasePriceAtSale: 120, sellingPriceAtSale: 199 },
          { productId: 'p_2', productName: 'Pistachio Cannoli Crunch 250g', qty: 1, purchasePriceAtSale: 180, sellingPriceAtSale: 280 },
          { productId: 'p_3', productName: 'Whole Milk Organic 1L', qty: 2, purchasePriceAtSale: 50, sellingPriceAtSale: 70 },
        ],
      },
      {
        id: 'sale_102',
        subtotal: 1370,
        discountType: 'flat',
        discountValue: 100,
        total: 1270,
        profit: 480,
        createdAt: getDateDaysAgo(0), // Today
        items: [
          { productId: 'p_8', productName: 'Almond Flour Extra Fine 1kg', qty: 1, purchasePriceAtSale: 450, sellingPriceAtSale: 690 },
          { productId: 'p_4', productName: 'Dark Chocolate Callebaut 500g', qty: 1, purchasePriceAtSale: 320, sellingPriceAtSale: 450 },
          { productId: 'p_3', productName: 'Whole Milk Organic 1L', qty: 3, purchasePriceAtSale: 50, sellingPriceAtSale: 70 },
        ],
      },
      {
        id: 'sale_103',
        subtotal: 1119,
        discountType: 'percentage',
        discountValue: 5,
        total: 1063,
        profit: 410,
        createdAt: getDateDaysAgo(1), // Yesterday
        items: [
          { productId: 'p_1', productName: 'Cannoli Vanilla Cream Shells 6pk', qty: 3, purchasePriceAtSale: 120, sellingPriceAtSale: 199 },
          { productId: 'p_10', productName: 'Espresso Coffee Beans 1kg', qty: 1, purchasePriceAtSale: 600, sellingPriceAtSale: 920 },
        ],
      },
      {
        id: 'sale_104',
        subtotal: 1840,
        discountType: 'flat',
        discountValue: 150,
        total: 1690,
        profit: 640,
        createdAt: getDateDaysAgo(3),
        items: [
          { productId: 'p_10', productName: 'Espresso Coffee Beans 1kg', qty: 2, purchasePriceAtSale: 600, sellingPriceAtSale: 920 },
        ],
      },
      {
        id: 'sale_105',
        subtotal: 960,
        discountType: 'flat',
        discountValue: 0,
        total: 960,
        profit: 380,
        createdAt: getDateDaysAgo(5),
        items: [
          { productId: 'p_2', productName: 'Pistachio Cannoli Crunch 250g', qty: 2, purchasePriceAtSale: 180, sellingPriceAtSale: 280 },
          { productId: 'p_4', productName: 'Dark Chocolate Callebaut 500g', qty: 1, purchasePriceAtSale: 320, sellingPriceAtSale: 450 },
        ],
      },
      {
        id: 'sale_106',
        subtotal: 2160,
        discountType: 'percentage',
        discountValue: 10,
        total: 1944,
        profit: 750,
        createdAt: getDateDaysAgo(12),
        items: [
          { productId: 'p_8', productName: 'Almond Flour Extra Fine 1kg', qty: 2, purchasePriceAtSale: 450, sellingPriceAtSale: 690 },
          { productId: 'p_1', productName: 'Cannoli Vanilla Cream Shells 6pk', qty: 4, purchasePriceAtSale: 120, sellingPriceAtSale: 199 },
        ],
      },
    ];

    // 5. SAMPLE STOCK HISTORY
    const sampleStockHistory: StockHistory[] = [
      {
        id: 'sh_101',
        productId: 'p_1',
        productName: 'Cannoli Vanilla Cream Shells 6pk',
        changeType: 'New Purchase',
        quantityChange: 50,
        reason: 'Restock via Invoice INV-GBW-9021',
        relatedDocId: 'pur_101',
        createdAt: getDateDaysAgo(15),
      },
      {
        id: 'sh_102',
        productId: 'p_3',
        productName: 'Whole Milk Organic 1L',
        changeType: 'POS Sale',
        quantityChange: -2,
        reason: 'Sold via Counter 1 POS',
        relatedDocId: 'sale_101',
        createdAt: getDateDaysAgo(0),
      },
      {
        id: 'sh_103',
        productId: 'p_5',
        productName: 'French Butter Unsalted 500g',
        changeType: 'Manual Correction',
        quantityChange: -5,
        reason: 'Spoilage / Damaged items written off',
        relatedDocId: null,
        createdAt: getDateDaysAgo(2),
      },
    ];

    // WRITE TO FIRESTORE
    try {
      // Products
      for (const p of sampleProducts) {
        const docRef = doc(collection(db, 'products'));
        await setDoc(docRef, p);
      }

      // Suppliers
      for (const s of sampleSuppliers) {
        await setDoc(doc(db, 'suppliers', s.id), s);
      }

      // Purchases
      for (const pur of samplePurchases) {
        await setDoc(doc(db, 'purchaseHistory', pur.id), pur);
      }

      // Sales
      for (const sale of sampleSales) {
        await setDoc(doc(db, 'sales', sale.id), sale);
      }

      // Stock History
      for (const sh of sampleStockHistory) {
        await setDoc(doc(db, 'stockHistory', sh.id), sh);
      }
    } catch (e) {
      console.warn('Firestore seed experienced fallback to local storage:', e);
    }

    // Always set local storage arrays as well to guarantee instant local rendering
    const fullProductsWithIds = sampleProducts.map((p, idx) => ({ id: `p_${idx + 1}`, ...p }));
    localStorage.setItem(LOCAL_STORAGE_PRODUCTS_KEY, JSON.stringify(fullProductsWithIds));
    localStorage.setItem(LOCAL_STORAGE_SUPPLIERS_KEY, JSON.stringify(sampleSuppliers));
    localStorage.setItem(LOCAL_STORAGE_PURCHASES_KEY, JSON.stringify(samplePurchases));
    localStorage.setItem(LOCAL_STORAGE_SALES_KEY, JSON.stringify(sampleSales));
    localStorage.setItem(LOCAL_STORAGE_STOCK_HISTORY_KEY, JSON.stringify(sampleStockHistory));

    return { success: true, message: 'Successfully seeded 10 products, 4 suppliers, sales & purchase histories!' };
  } catch (error) {
    console.error('Failed to seed testing data:', error);
    return { success: false, message: 'Failed to populate seed data.' };
  }
}
