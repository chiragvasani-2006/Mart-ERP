import { doc, collection, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import { ProductSearchProjection } from '../store/useStore';
import { Sale, SaleItem } from '../types';

export interface CartLineItem {
  product: ProductSearchProjection;
  qty: number;
}

export interface CommitPOSSaleParams {
  items: CartLineItem[];
  discountType: 'flat' | 'percentage' | null;
  discountValue: number;
}

/**
 * Commits a POS sale atomically in a Firestore transaction.
 * Re-validates stock levels for all items, updates product stock, logs stock history per item,
 * and creates the Sale document with snapshotted prices & profit.
 */
export async function commitPOSSale(params: CommitPOSSaleParams): Promise<Sale> {
  const { items, discountType, discountValue } = params;

  if (!items || items.length === 0) {
    throw new Error('Cart is empty. Cannot complete sale.');
  }

  const createdSale = await runTransaction(db, async (transaction) => {
    const nowIso = new Date().toISOString();
    const productReads: {
      cartItem: CartLineItem;
      productRef: any;
      snapData: any;
    }[] = [];

    // Step 1: READ all products and validate stock levels
    for (const item of items) {
      const productRef = doc(db, 'products', item.product.id);
      const pSnap = await transaction.get(productRef);

      if (!pSnap.exists()) {
        throw new Error(`Product "${item.product.name}" no longer exists in database.`);
      }

      const snapData = pSnap.data();
      const currentQty = snapData.quantity || 0;

      if (item.qty > currentQty) {
        throw new Error(
          `Insufficient stock for "${snapData.name || item.product.name}": requested ${item.qty}, but only ${currentQty} available.`
        );
      }

      productReads.push({
        cartItem: item,
        productRef,
        snapData,
      });
    }

    // Calculate financials
    let subtotal = 0;
    let totalPurchaseCost = 0;
    const saleItems: SaleItem[] = [];

    for (const { cartItem, snapData } of productReads) {
      const sellingPriceAtSale = Number(snapData.sellingPrice ?? snapData.mrp ?? cartItem.product.sellingPrice ?? 0);
      const purchasePriceAtSale = Number(snapData.purchasePrice ?? cartItem.product.purchasePrice ?? 0);

      const lineSubtotal = sellingPriceAtSale * cartItem.qty;
      subtotal += lineSubtotal;
      totalPurchaseCost += purchasePriceAtSale * cartItem.qty;

      saleItems.push({
        productId: cartItem.product.id,
        productName: snapData.name || cartItem.product.name,
        qty: cartItem.qty,
        sellingPriceAtSale,
        purchasePriceAtSale,
      });
    }

    // Calculate discount amount
    let discountAmount = 0;
    const dVal = Number(discountValue) || 0;

    if (discountType === 'percentage') {
      discountAmount = Math.min(subtotal, (subtotal * dVal) / 100);
    } else if (discountType === 'flat') {
      discountAmount = Math.min(subtotal, Math.max(0, dVal));
    }

    const total = Math.max(0, subtotal - discountAmount);
    // Realized profit = total revenue - total purchase cost of goods sold
    const profit = total - totalPurchaseCost;

    // Step 2: WRITE Sale doc, update Product stock, log StockHistory
    const saleRef = doc(collection(db, 'sales'));
    const saleData: Omit<Sale, 'id'> = {
      items: saleItems,
      discountType: dVal > 0 ? discountType : null,
      discountValue: dVal,
      subtotal,
      total,
      profit,
      createdAt: nowIso,
    };

    transaction.set(saleRef, saleData);

    // Update each product and log StockHistory
    for (const { cartItem, productRef, snapData } of productReads) {
      const currentQty = snapData.quantity || 0;
      const newQty = currentQty - cartItem.qty;

      transaction.update(productRef, {
        quantity: newQty,
        updatedAt: nowIso,
      });

      const historyRef = doc(collection(db, 'stockHistory'));
      transaction.set(historyRef, {
        productId: cartItem.product.id,
        productName: snapData.name || cartItem.product.name,
        changeType: 'POS Sale',
        quantityChange: -cartItem.qty,
        reason: 'POS Billing Checkout',
        relatedDocId: saleRef.id,
        createdAt: nowIso,
      });
    }

    return {
      id: saleRef.id,
      ...saleData,
    } as Sale;
  });

  return createdSale;
}
