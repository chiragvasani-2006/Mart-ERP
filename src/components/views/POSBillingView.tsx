import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAppStore, ProductSearchProjection } from '../../store/useStore';
import { commitPOSSale, CartLineItem } from '../../lib/posService';
import { getStoreSettings } from '../../lib/dataService';
import { ReceiptModal } from '../pos/ReceiptModal';
import { Sale } from '../../types';
import {
  Search,
  Barcode,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Percent,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Receipt,
  X,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export const POSBillingView: React.FC = () => {
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Live in-memory product index from Zustand store
  const productIndex = useAppStore((state) => state.productSearchIndex);
  const lookupByBarcode = useAppStore((state) => state.lookupByBarcode);

  // Cart & Discount State
  const [cart, setCart] = useState<CartLineItem[]>([]);
  const [discountType, setDiscountType] = useState<'flat' | 'percentage'>('flat');
  const [discountValue, setDiscountValue] = useState<string>('0');

  // Search & Auto-complete state
  const [searchQuery, setSearchQuery] = useState('');
  const [stockAlert, setStockAlert] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);

  // Completed Sale for Receipt Modal
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Store Settings Query
  const { data: storeSettings } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: getStoreSettings,
  });

  // Auto-focus search input on mount and keep ready for scanner
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Filtered dropdown matches for typing search
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return productIndex
      .filter(
        (p) =>
          p.nameLower.includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      )
      .slice(0, 8); // Max 8 dropdown suggestions for clean UX
  }, [productIndex, searchQuery]);

  // Helper to add item to cart with strict stock guard check
  const handleAddToCart = (product: ProductSearchProjection, addQty = 1) => {
    setStockAlert(null);

    // 1. Stock Guard Check
    const existingIndex = cart.findIndex((item) => item.product.id === product.id);
    const existingQty = existingIndex >= 0 ? cart[existingIndex].qty : 0;
    const requestedQty = existingQty + addQty;

    if (requestedQty > product.quantity) {
      const msg = `Stock Limit Reached: "${product.name}" has only ${product.quantity} in stock (${existingQty} already in cart).`;
      setStockAlert(msg);
      toast.error(msg, { id: `stock-limit-${product.id}` });
      return;
    }

    if (existingIndex >= 0) {
      const updated = [...cart];
      updated[existingIndex].qty += addQty;
      setCart(updated);
    } else {
      setCart([...cart, { product, qty: addQty }]);
    }

    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  // Global Hardware Barcode Scanner Listener (Works automatically anywhere on POS screen)
  useEffect(() => {
    let lastKeyTime = 0;
    let scanBuffer = '';

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing inside modal inputs or textareas (other than main search input)
      const target = e.target as HTMLElement;
      if (target && target.tagName === 'INPUT' && target !== searchInputRef.current) {
        return;
      }
      if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const now = Date.now();
      const gap = now - lastKeyTime;
      lastKeyTime = now;

      // If gap between keypresses > 40ms, reset scan buffer (scanner gun keystrokes are < 30ms)
      if (gap > 40 && scanBuffer.length > 0) {
        scanBuffer = '';
      }

      if (e.key === 'Enter') {
        if (scanBuffer.length >= 6) {
          e.preventDefault();
          const scannedCode = scanBuffer.trim();
          const match = lookupByBarcode(scannedCode);
          if (match) {
            handleAddToCart(match, 1);
            toast.success(`⚡ Scanned & Added: "${match.name}" (₹${match.sellingPrice || match.mrp})`, {
              id: `scanned-${match.id}-${Date.now()}`
            });
          } else {
            toast.error(`⚠️ Barcode "${scannedCode}" not found in inventory catalog.`, {
              id: `not-found-${scannedCode}`
            });
          }
        }
        scanBuffer = '';
      } else if (e.key.length === 1) {
        scanBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [lookupByBarcode, cart, productIndex]);

  // Handle Search Input Keydown (Scanner Enter handler when input is explicitly focused)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = searchQuery.trim();
      if (!val) return;

      // Check barcode exact lookup
      const barcodeMatch = lookupByBarcode(val);
      if (barcodeMatch) {
        handleAddToCart(barcodeMatch, 1);
        toast.success(`⚡ Scanned & Added: "${barcodeMatch.name}"`, { id: `scanned-${barcodeMatch.id}` });
        return;
      }

      // If no exact barcode match, select first search suggestion if available
      if (searchMatches.length > 0) {
        handleAddToCart(searchMatches[0], 1);
      } else {
        toast.error(`No product found matching "${val}"`);
      }
    }
  };

  // Update quantity in cart
  const handleUpdateQty = (productId: string, newQty: number) => {
    setStockAlert(null);
    if (newQty <= 0) {
      handleRemoveItem(productId);
      return;
    }

    const item = cart.find((c) => c.product.id === productId);
    if (!item) return;

    if (newQty > item.product.quantity) {
      const msg = `Cannot exceed available stock of ${item.product.quantity} units for "${item.product.name}".`;
      setStockAlert(msg);
      toast.error(msg, { id: `stock-limit-${productId}` });
      return;
    }

    setCart(
      cart.map((c) => (c.product.id === productId ? { ...c, qty: newQty } : c))
    );
  };

  // Remove item from cart
  const handleRemoveItem = (productId: string) => {
    setCart(cart.filter((c) => c.product.id !== productId));
    setStockAlert(null);
  };

  // Cart Financial Calculations
  const subtotal = useMemo(() => {
    return cart.reduce(
      (acc, item) => acc + (item.product.sellingPrice || item.product.mrp || 0) * item.qty,
      0
    );
  }, [cart]);

  const discountValNum = parseFloat(discountValue) || 0;

  const discountAmount = useMemo(() => {
    if (discountType === 'percentage') {
      return Math.min(subtotal, (subtotal * discountValNum) / 100);
    }
    return Math.min(subtotal, Math.max(0, discountValNum));
  }, [subtotal, discountType, discountValNum]);

  const totalAmount = Math.max(0, subtotal - discountAmount);

  // Complete Bill Action Handler
  const handleCompleteBill = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty. Add items before completing sale.');
      return;
    }

    try {
      setIsCommitting(true);
      setStockAlert(null);

      const sale = await commitPOSSale({
        items: cart,
        discountType,
        discountValue: discountValNum,
      });

      // Invalidate queries so Dashboard, Products & Stock Management stay in live sync
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['stockManagement'] });

      toast.success('Sale completed successfully!');
      
      // Open Receipt Modal
      setCompletedSale(sale);
      setIsReceiptOpen(true);
    } catch (err: any) {
      console.error('POS Sale error:', err);
      const errorMsg = err.message || 'Failed to complete sale';
      setStockAlert(errorMsg);
      toast.error(errorMsg, { duration: 5000 });
    } finally {
      setIsCommitting(false);
    }
  };

  // Start new bill callback
  const handleStartNewBill = () => {
    setCart([]);
    setDiscountValue('0');
    setSearchQuery('');
    setStockAlert(null);
    setCompletedSale(null);
    setIsReceiptOpen(false);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="pb-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-emerald-600" />
            POS Billing Counter
          </h1>
          <p className="text-sm text-slate-500">
            Scan barcode or search products to process fast counter checkout
          </p>
        </div>
        <button
          onClick={handleStartNewBill}
          className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
        >
          Clear Cart / New Bill
        </button>
      </div>

      {/* Stock Guard Alert Banner */}
      {stockAlert && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{stockAlert}</span>
          </div>
          <button
            onClick={() => setStockAlert(null)}
            className="p-1 text-red-400 hover:text-red-700 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SEARCH BAR & DROP-DOWN matches */}
      <div className="relative">
        <div className="relative bg-white rounded-2xl border-2 border-emerald-500 shadow-md p-1.5 flex items-center gap-2 focus-within:ring-4 focus-within:ring-emerald-500/20 transition">
          <div className="pl-3 text-emerald-600 flex items-center gap-1.5 shrink-0">
            <Barcode className="w-5 h-5" />
            <Search className="w-4 h-4 text-slate-400" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scan barcode or type product name / code (Press Enter to add)..."
            className="w-full bg-transparent px-2 py-2 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg pr-3"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Live Search Suggestions Dropdown */}
        {searchQuery.trim().length > 0 && searchMatches.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-slate-200 shadow-2xl z-40 overflow-hidden divide-y divide-slate-100 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
            {searchMatches.map((product) => {
              const isOutOfStock = product.quantity === 0;
              return (
                <div
                  key={product.id}
                  onClick={() => {
                    if (!isOutOfStock) handleAddToCart(product, 1);
                  }}
                  className={`p-3 flex items-center justify-between gap-4 transition cursor-pointer ${
                    isOutOfStock
                      ? 'bg-slate-50 opacity-60 cursor-not-allowed'
                      : 'hover:bg-emerald-50/80'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{product.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Barcode: {product.barcode || 'N/A'} • Stock: {product.quantity} units
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-black text-slate-900">₹{product.sellingPrice || product.mrp}</p>
                    {isOutOfStock ? (
                      <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md">
                        Out of Stock
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5">
                        <Plus className="w-3 h-3" /> Add
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* POS MAIN GRID: Cart (Left 7 Cols) + Summary Card (Right 5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* CART LINE ITEMS TABLE */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4 flex flex-col justify-between min-h-[420px]">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-600" />
                Cart Items ({cart.length})
              </h2>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-[11px] font-semibold text-red-600 hover:underline"
                >
                  Clear Cart
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <ShoppingCart className="w-10 h-10 mx-auto opacity-20 text-slate-500" />
                <p className="text-xs font-bold text-slate-600">Cart is Empty</p>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  Scan a product barcode or use search input above to add items to bill.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto pr-1">
                {cart.map((item) => {
                  const lineTotal = (item.product.sellingPrice || item.product.mrp || 0) * item.qty;
                  const isMaxStock = item.qty >= item.product.quantity;

                  return (
                    <div
                      key={item.product.id}
                      className="py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      {/* Product Name & Details */}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 truncate">{item.product.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          ₹{item.product.sellingPrice || item.product.mrp} × {item.qty} units
                          <span className="ml-2 text-slate-500">
                            (Max Stock: {item.product.quantity})
                          </span>
                        </p>
                      </div>

                      {/* Touch-Friendly Quantity Controls */}
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(item.product.id, item.qty - 1)}
                          className="w-7 h-7 bg-white hover:bg-slate-200 text-slate-800 rounded-lg flex items-center justify-center font-bold shadow-2xs cursor-pointer active:scale-95 transition"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) => handleUpdateQty(item.product.id, parseInt(e.target.value, 10) || 0)}
                          className="w-10 text-center bg-transparent font-black text-slate-900 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(item.product.id, item.qty + 1)}
                          disabled={isMaxStock}
                          className="w-7 h-7 bg-white hover:bg-slate-200 text-slate-800 rounded-lg flex items-center justify-center font-bold shadow-2xs cursor-pointer active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          title={isMaxStock ? 'Stock limit reached' : 'Add 1 more'}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Line Total & Remove */}
                      <div className="text-right shrink-0 min-w-[70px]">
                        <p className="font-extrabold text-slate-900">₹{lineTotal.toLocaleString()}</p>
                      </div>

                      <button
                        onClick={() => handleRemoveItem(item.product.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Stats Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Distinct Items: {cart.length}</span>
            <span>Total Quantity: {cart.reduce((a, b) => a + b.qty, 0)} units</span>
          </div>
        </div>

        {/* BILL SUMMARY & CHECKOUT CARD */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 space-y-5">
            
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center justify-between">
              <span>Payment Summary</span>
              <Receipt className="w-4 h-4 text-emerald-600" />
            </h2>

            {/* Subtotal */}
            <div className="flex justify-between items-center text-xs text-slate-600 font-semibold">
              <span>Subtotal:</span>
              <span className="text-sm font-bold text-slate-900">₹{subtotal.toLocaleString()}</span>
            </div>

            {/* Discount Control Box */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Bill Discount</span>
                <div className="flex items-center gap-1 bg-slate-200 p-0.5 rounded-lg text-[10px]">
                  <button
                    type="button"
                    onClick={() => setDiscountType('flat')}
                    className={`px-2 py-0.5 rounded-md font-extrabold cursor-pointer transition ${
                      discountType === 'flat' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    ₹ Flat
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percentage')}
                    className={`px-2 py-0.5 rounded-md font-extrabold cursor-pointer transition ${
                      discountType === 'percentage' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    % Percent
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'flat' ? 'Amount in ₹' : 'Discount %'}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between text-[11px] text-emerald-800 font-bold pt-1">
                  <span>Applied Discount:</span>
                  <span>-₹{discountAmount.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Final Bill Total */}
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Final Total</p>
                <p className="text-[11px] text-emerald-600 font-semibold">Inclusive of all taxes</p>
              </div>
              <p className="text-2xl font-black text-emerald-900">₹{totalAmount.toLocaleString()}</p>
            </div>

            {/* COMPLETE BILL UNMISSABLE BUTTON */}
            <button
              type="button"
              onClick={handleCompleteBill}
              disabled={isCommitting || cart.length === 0}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl transition shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCommitting ? (
                <>Processing Sale Transaction...</>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  COMPLETE BILL & PRINT RECEIPT
                  <ArrowRight className="w-4 h-4 ml-1 opacity-80" />
                </>
              )}
            </button>

          </div>
        </div>

      </div>

      {/* RECEIPT MODAL */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        sale={completedSale}
        storeSettings={storeSettings}
        onNewBill={handleStartNewBill}
      />

    </div>
  );
};
