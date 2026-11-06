import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Sale, StoreSettings } from '../../types';
import { Printer, CheckCircle2, X, PlusCircle, Building2 } from 'lucide-react';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  storeSettings?: StoreSettings | null;
  onNewBill: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  sale,
  storeSettings,
  onNewBill,
}) => {
  const printableRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printableRef,
    documentTitle: `Receipt_${sale?.id || 'POS'}`,
  });

  if (!isOpen || !sale) return null;

  const storeName = storeSettings?.storeName || 'Cannoli Bakery & Gourmet';
  const phone = storeSettings?.phone || '+91 98765 43210';
  const address = storeSettings?.address || '123 Gourmet Lane, Bakery District';
  const logoUrl = storeSettings?.logoUrl;

  const formatDate = (ts: any) => {
    if (!ts) return new Date().toLocaleString('en-IN');
    try {
      const date = typeof ts === 'string' ? new Date(ts) : ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(ts);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-emerald-600 text-white shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-200" />
            <h3 className="text-sm font-bold tracking-wide">Sale Completed Successfully!</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-emerald-700 rounded-lg text-emerald-100 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PRINTABLE RECEIPT CONTENT CONTAINER */}
        <div className="p-6 bg-slate-50 border-b border-slate-200 overflow-y-auto max-h-[60vh]">
          <div
            ref={printableRef}
            className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs font-mono text-slate-800 text-xs space-y-4 print:p-4 print:shadow-none print:border-none print:w-full print:m-0"
          >
            
            {/* Store Branding */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
              {logoUrl ? (
                <img src={logoUrl} alt="Store Logo" className="w-12 h-12 mx-auto mb-1.5 object-contain" />
              ) : (
                <div className="w-10 h-10 bg-slate-900 text-white rounded-lg flex items-center justify-center mx-auto mb-1.5 font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
              )}
              <h2 className="text-sm font-black uppercase text-slate-900">{storeName}</h2>
              <p className="text-[11px] text-slate-600 font-sans">{address}</p>
              <p className="text-[11px] text-slate-600 font-sans">Phone: {phone}</p>
            </div>

            {/* Receipt Meta */}
            <div className="flex justify-between text-[11px] text-slate-600 pb-2 border-b border-dashed border-slate-300">
              <div>
                <p><strong>Receipt #:</strong> {sale.id.slice(0, 10).toUpperCase()}</p>
                <p><strong>Date:</strong> {formatDate(sale.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-900 uppercase">POS TAX INVOICE</p>
                <p className="text-emerald-700 font-semibold">PAID IN FULL</p>
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <div className="grid grid-cols-12 font-bold uppercase text-[10px] text-slate-500 pb-1 border-b border-slate-200">
                <span className="col-span-6">Item</span>
                <span className="col-span-2 text-center">Qty</span>
                <span className="col-span-2 text-right">Price</span>
                <span className="col-span-2 text-right">Total</span>
              </div>
              <div className="divide-y divide-slate-100 py-1 space-y-1">
                {sale.items.map((item, idx) => {
                  const lineTotal = item.sellingPriceAtSale * item.qty;
                  return (
                    <div key={idx} className="grid grid-cols-12 py-1 items-center">
                      <span className="col-span-6 font-semibold text-slate-900 truncate pr-1">
                        {item.productName}
                      </span>
                      <span className="col-span-2 text-center text-slate-700">
                        {item.qty}
                      </span>
                      <span className="col-span-2 text-right text-slate-700">
                        ₹{item.sellingPriceAtSale}
                      </span>
                      <span className="col-span-2 text-right font-bold text-slate-900">
                        ₹{lineTotal.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Totals & Discount */}
            <div className="pt-2 border-t border-dashed border-slate-300 space-y-1.5 text-[11px]">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>₹{sale.subtotal.toLocaleString()}</span>
              </div>

              {sale.discountValue > 0 && (
                <div className="flex justify-between text-amber-700 font-semibold">
                  <span>
                    Discount ({sale.discountType === 'percentage' ? `${sale.discountValue}%` : `Flat ₹${sale.discountValue}`}):
                  </span>
                  <span>
                    -₹{(sale.subtotal - sale.total).toLocaleString()}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-sm font-black text-slate-900 pt-1.5 border-t border-slate-200">
                <span>TOTAL AMOUNT:</span>
                <span className="text-emerald-700">₹{sale.total.toLocaleString()}</span>
              </div>

              <div className="flex justify-between text-slate-700 font-bold pt-1 border-t border-slate-100">
                <span>Amount Due:</span>
                <span>₹0.00 (Fully Paid)</span>
              </div>
            </div>

            {/* Footer Note */}
            <div className="text-center pt-3 border-t border-dashed border-slate-300 text-[10px] text-slate-500 font-sans">
              <p className="font-bold text-slate-700">Thank you for shopping with us!</p>
              <p className="mt-0.5">Please retain this receipt for warranty or returns.</p>
            </div>

          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-white flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4" />
            Print Receipt
          </button>

          <button
            type="button"
            onClick={() => {
              onNewBill();
              onClose();
            }}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-md"
          >
            <PlusCircle className="w-4 h-4" />
            Start New Bill
          </button>
        </div>

      </div>
    </div>
  );
};
