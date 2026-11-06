import React, { useEffect, useState } from 'react';
import { getProductStockHistory } from '../../lib/stockService';
import { StockHistory, Product } from '../../types';
import { X, History, Loader2, Calendar, FileText, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';

interface StockHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

export const StockHistoryModal: React.FC<StockHistoryModalProps> = ({
  isOpen,
  onClose,
  product,
}) => {
  const [logs, setLogs] = useState<StockHistory[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && product) {
      setIsLoading(true);
      getProductStockHistory(product.id)
        .then(setLogs)
        .catch(console.warn)
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A';
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

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'New Purchase':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'POS Sale':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Damaged':
      case 'Expired':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'Manual Correction':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-150 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Stock Audit History</h3>
              <p className="text-xs text-slate-500 font-semibold">{product.name} (Barcode: {product.barcode})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          
          {isLoading ? (
            <div className="py-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span>Fetching stock history logs...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-500" />
              <p className="font-semibold text-slate-600">No stock history found</p>
              <p className="text-[11px] text-slate-400 mt-1">Changes from purchases, sales, or manual updates will be logged here.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3">Date & Time</th>
                    <th className="p-3">Type</th>
                    <th className="p-3 text-right">Qty Change</th>
                    <th className="p-3">Reason / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => {
                    const isPositive = log.quantityChange > 0;
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition">
                        
                        {/* Date */}
                        <td className="p-3 text-slate-600 font-medium whitespace-nowrap">
                          {formatDate(log.createdAt)}
                        </td>

                        {/* Type Badge */}
                        <td className="p-3">
                          <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold border ${getBadgeStyle(log.changeType)}`}>
                            {log.changeType}
                          </span>
                        </td>

                        {/* Qty Change */}
                        <td className="p-3 text-right font-extrabold whitespace-nowrap">
                          <span className={`inline-flex items-center gap-0.5 ${isPositive ? 'text-emerald-700' : 'text-red-600'}`}>
                            {isPositive ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )}
                            {isPositive ? `+${log.quantityChange}` : log.quantityChange}
                          </span>
                        </td>

                        {/* Reason */}
                        <td className="p-3 text-slate-600 font-normal max-w-xs truncate">
                          {log.reason || '—'}
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0 text-xs text-slate-500">
          <span>Total Records: {logs.length}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
