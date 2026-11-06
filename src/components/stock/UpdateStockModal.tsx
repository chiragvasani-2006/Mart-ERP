import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { updateStockManual, StockChangeReason } from '../../lib/stockService';
import { Product } from '../../types';
import { useQueryClient } from '@tanstack/react-query';
import { X, Package, ArrowRight, AlertTriangle, Save, Loader2 } from 'lucide-react';

interface UpdateStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSuccess: () => void;
}

export const UpdateStockModal: React.FC<UpdateStockModalProps> = ({
  isOpen,
  onClose,
  product,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [changeType, setChangeType] = useState<StockChangeReason>('Manual Correction');
  const [quantityInput, setQuantityInput] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !product) return null;

  const currentQty = product.quantity || 0;
  const numVal = parseFloat(quantityInput) || 0;

  // Calculate resulting stock for live preview
  let signedChange = 0;
  if (changeType === 'New Purchase' || changeType === 'Customer Return') {
    signedChange = Math.abs(numVal);
  } else if (changeType === 'Damaged' || changeType === 'Expired') {
    signedChange = -Math.abs(numVal);
  } else if (changeType === 'Manual Correction') {
    signedChange = numVal;
  }

  const projectedQty = currentQty + signedChange;
  const isNegative = projectedQty < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (numVal === 0 && changeType !== 'Manual Correction') {
      setErrorMsg('Please enter a non-zero quantity.');
      return;
    }

    if (isNegative) {
      setErrorMsg(`Stock cannot be reduced below 0. Resulting stock would be ${projectedQty}.`);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await updateStockManual({
        productId: product.id,
        productName: product.name,
        currentQuantity: currentQty,
        changeType,
        quantityValue: numVal,
        notes,
      });

      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });

      toast.success(
        `Updated ${product.name} stock to ${res.newQuantity} (${res.signedChange >= 0 ? '+' : ''}${res.signedChange})`
      );

      // Reset state and close
      setQuantityInput('0');
      setNotes('');
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update stock');
      toast.error(err.message || 'Failed to update stock');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Update Product Stock</h3>
              <p className="text-xs text-slate-500 truncate max-w-[240px]">{product.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Current Stock Banner */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Current Stock Level:</span>
            <span className="text-sm font-black text-slate-900">{currentQty} units</span>
          </div>

          {/* Reason Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Reason / Change Type *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['New Purchase', 'Damaged', 'Expired', 'Manual Correction', 'Customer Return'] as StockChangeReason[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setChangeType(type);
                    setErrorMsg(null);
                  }}
                  className={`px-3 py-2 text-xs font-semibold rounded-xl border transition text-left flex items-center justify-between cursor-pointer ${
                    changeType === type
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="truncate">{type}</span>
                  <span className="text-[10px] opacity-80 shrink-0 ml-1">
                    {type === 'New Purchase' && '(+)'}
                    {type === 'Customer Return' && '(+)'}
                    {type === 'Damaged' && '(-)'}
                    {type === 'Expired' && '(-)'}
                    {type === 'Manual Correction' && '(+/-)'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Quantity Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              {changeType === 'Manual Correction' ? 'Signed Quantity Delta (+/-)' : 'Quantity Amount'} *
            </label>
            <input
              type="number"
              step="1"
              value={quantityInput}
              onChange={(e) => {
                setQuantityInput(e.target.value);
                setErrorMsg(null);
              }}
              placeholder={changeType === 'Manual Correction' ? 'e.g. -3 or 5' : 'e.g. 10'}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              {changeType === 'New Purchase' && 'Will increase stock by entered amount.'}
              {changeType === 'Damaged' && 'Will decrease stock by entered amount.'}
              {changeType === 'Expired' && 'Will decrease stock by entered amount.'}
              {changeType === 'Manual Correction' && 'Type positive number to add stock, or negative (e.g. -5) to subtract.'}
            </p>
          </div>

          {/* Live Preview Projection */}
          <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold transition ${
            isNegative ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            <span className="flex items-center gap-1.5">
              Stock Projection:
            </span>
            <div className="flex items-center gap-2">
              <span>{currentQty}</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-60" />
              <span className="text-sm font-extrabold">{projectedQty} units</span>
            </div>
          </div>

          {/* Optional Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Reason Detail / Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Shelf audit correction or batch #401"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isNegative}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Stock Adjustment
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
