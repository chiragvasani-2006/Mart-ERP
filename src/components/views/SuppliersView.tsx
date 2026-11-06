import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  getAllSuppliers,
  getPurchaseHistoryForSupplier,
  recordSupplierPayment,
  RecordPaymentPayload
} from '../../lib/supplierService';
import { Supplier, PurchaseHistory } from '../../types';
import {
  Users,
  CreditCard,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  ArrowLeft,
  FileText,
  PlusCircle,
  X,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Building2,
  Receipt,
  Wallet,
  ArrowUpRight
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

export const SuppliersView: React.FC = () => {
  const queryClient = useQueryClient();

  // Selected supplier for detail view drill-down
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  // Table search & pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Pay Supplier Modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Bank' | 'Baki/credit'>('Cash');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // 1. Fetch All Suppliers
  const {
    data: suppliers = [],
    isLoading: isLoadingSuppliers,
    isError: isErrorSuppliers,
  } = useQuery({
    queryKey: ['suppliers'],
    queryFn: getAllSuppliers,
  });

  // Selected supplier object
  const selectedSupplier = useMemo(() => {
    if (!selectedSupplierId) return null;
    return suppliers.find((s) => s.id === selectedSupplierId) || null;
  }, [suppliers, selectedSupplierId]);

  // 2. Fetch Purchase History for Selected Supplier
  const {
    data: purchaseHistory = [],
    isLoading: isLoadingPurchases,
  } = useQuery({
    queryKey: ['purchaseHistory', selectedSupplierId],
    queryFn: () => getPurchaseHistoryForSupplier(selectedSupplierId!),
    enabled: !!selectedSupplierId,
  });

  // Summary Metrics Calculation across all suppliers
  const summaryMetrics = useMemo(() => {
    let totalSuppliers = suppliers.length;
    let totalPending = 0;
    let totalPaid = 0;
    let totalPurchase = 0;

    for (const sup of suppliers) {
      totalPending += Number(sup.totalPending || 0);
      totalPaid += Number(sup.totalPaid || 0);
      totalPurchase += Number(sup.totalPurchase || 0);
    }

    return {
      totalSuppliers,
      totalPending,
      totalPaid,
      totalPurchase,
    };
  }, [suppliers]);

  // Filter & Sort Main Suppliers Table
  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = suppliers;

    if (q) {
      list = suppliers.filter((s) =>
        s.nameLower ? s.nameLower.includes(q) : s.name.toLowerCase().includes(q)
      );
    }

    // Default sort: highest Pending amount first
    return [...list].sort((a, b) => (b.totalPending || 0) - (a.totalPending || 0));
  }, [suppliers, searchQuery]);

  // Pagination for main table
  const totalItems = filteredSuppliers.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSuppliers.slice(start, start + pageSize);
  }, [filteredSuppliers, currentPage, pageSize]);

  // Helper function to format status badge
  const renderStatusBadge = (status: 'Pending' | 'Partial' | 'Paid', totalPending: number) => {
    if (status === 'Paid' || totalPending <= 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Paid Off
        </span>
      );
    }

    if (status === 'Partial') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-blue-50 text-blue-800 border border-blue-200">
          <Clock className="w-3 h-3 text-blue-600" />
          Partial
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
        <AlertCircle className="w-3 h-3 text-amber-600" />
        Pending
      </span>
    );
  };

  // Open Pay Supplier Modal
  const handleOpenPaymentModal = () => {
    if (!selectedSupplier) return;
    const pendingVal = selectedSupplier.totalPending || 0;
    setPaymentAmountInput(pendingVal > 0 ? String(pendingVal) : '0');
    setPaymentMethod('Cash');
    setPaymentNotes('');
    setIsPaymentModalOpen(true);
  };

  // Submit Payment Handler
  const handleConfirmPayment = async () => {
    if (!selectedSupplier) return;

    const amountNum = parseFloat(paymentAmountInput);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Please enter a valid payment amount greater than 0.');
      return;
    }

    const pendingVal = selectedSupplier.totalPending || 0;
    if (amountNum > pendingVal && pendingVal > 0) {
      toast.error(`Payment amount (₹${amountNum}) cannot exceed pending payable balance of ₹${pendingVal.toLocaleString()}.`);
      return;
    }

    try {
      setIsSubmittingPayment(true);
      await recordSupplierPayment({
        supplierId: selectedSupplier.id,
        amount: amountNum,
        paymentMethod,
        notes: paymentNotes,
      });

      // Live sync invalidations
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseHistory', selectedSupplier.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });

      toast.success(`Payment of ₹${amountNum.toLocaleString()} paid to supplier ${selectedSupplier.name}`);
      setIsPaymentModalOpen(false);
    } catch (err: any) {
      console.error('Failed to record payment:', err);
      toast.error(err.message || 'Failed to record payment');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A';
    try {
      const date = typeof ts === 'string' ? parseISO(ts) : ts.toDate ? ts.toDate() : new Date(ts);
      return format(date, 'dd MMM yyyy');
    } catch {
      return String(ts);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* ---------------------------------------------------------------------- */}
      {/* 1. SUPPLIER DETAIL VIEW (DRILL-DOWN)                                   */}
      {/* ---------------------------------------------------------------------- */}
      {selectedSupplier ? (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          {/* Header & Back Button */}
          <div className="pb-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedSupplierId(null)}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer"
                title="Back to all suppliers"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Building2 className="w-6 h-6 text-emerald-600" />
                  {selectedSupplier.name}
                </h1>
                <p className="text-sm text-slate-500">
                  Supplier Account Overview & Purchase Invoices
                </p>
              </div>
            </div>

            {/* Pay Supplier Button */}
            <button
              type="button"
              disabled={selectedSupplier.totalPending <= 0}
              onClick={handleOpenPaymentModal}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowUpRight className="w-4 h-4" />
              Pay Supplier
            </button>
          </div>

          {/* Supplier Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <p className="text-xs font-black uppercase text-slate-500">Total Purchase Cost</p>
              <p className="text-xl font-black text-slate-900">₹{selectedSupplier.totalPurchase?.toLocaleString() || 0}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <p className="text-xs font-black uppercase text-slate-500">Total Paid to Supplier</p>
              <p className="text-xl font-black text-emerald-700">₹{selectedSupplier.totalPaid?.toLocaleString() || 0}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <p className="text-xs font-black uppercase text-slate-500">Pending Payable Balance</p>
              <p className="text-xl font-black text-amber-700">₹{selectedSupplier.totalPending?.toLocaleString() || 0}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
              <p className="text-xs font-black uppercase text-slate-500">Account Status</p>
              <div className="pt-0.5">
                {renderStatusBadge(selectedSupplier.status, selectedSupplier.totalPending)}
              </div>
            </div>
          </div>

          {/* PURCHASE HISTORY TABLE FOR THIS SUPPLIER */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                Stock Invoices & Purchases ({purchaseHistory.length} Invoices)
              </h2>
            </div>

            <div className="overflow-x-auto min-h-[240px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Invoice Date</th>
                    <th className="py-3 px-4">Import Source</th>
                    <th className="py-3 px-4 text-center">Line Items</th>
                    <th className="py-3 px-4 text-right">Invoice Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {isLoadingPurchases ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        Loading purchase history...
                      </td>
                    </tr>
                  ) : purchaseHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 space-y-2">
                        <FileText className="w-8 h-8 mx-auto opacity-30 text-slate-500" />
                        <p className="text-xs font-bold text-slate-600">No Purchase Invoices Found</p>
                        <p className="text-[11px] text-slate-400">
                          Stock purchases imported via New Stock for this supplier will automatically appear here.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    purchaseHistory.map((ph) => (
                      <tr key={ph.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-bold text-slate-900 font-mono">
                          {ph.invoiceNumber}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-700">
                          {formatDate(ph.invoiceDate)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700">
                            {ph.sourceType || 'manual'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-800">
                          {ph.lineItems ? ph.lineItems.length : 0} items
                        </td>
                        <td className="py-3 px-4 text-right font-black text-slate-900">
                          ₹{ph.amount?.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : (
        /* ---------------------------------------------------------------------- */
        /* 2. ALL SUPPLIERS LIST VIEW                                             */
        /* ---------------------------------------------------------------------- */
        <div className="space-y-6">
          
          {/* Header */}
          <div className="pb-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                <Users className="w-6 h-6 text-emerald-600" />
                Suppliers & Payments
              </h1>
              <p className="text-sm text-slate-500">
                Track supplier stock purchase balances, pending bills, and record payments paid to suppliers
              </p>
            </div>
          </div>

          {/* SUMMARY CARDS (Top of page) */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-500">Total Suppliers</span>
                <Users className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-2xl font-black text-slate-900">{summaryMetrics.totalSuppliers}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-500">Pending Payable</span>
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-2xl font-black text-amber-700">₹{summaryMetrics.totalPending.toLocaleString()}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-500">Total Paid Out</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-2xl font-black text-emerald-700">₹{summaryMetrics.totalPaid.toLocaleString()}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-500">Total Purchase</span>
                <CreditCard className="w-5 h-5 text-slate-700" />
              </div>
              <p className="text-2xl font-black text-slate-900">₹{summaryMetrics.totalPurchase.toLocaleString()}</p>
            </div>

          </div>

          {/* MAIN SUPPLIERS TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            
            {/* Search & Page Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-100">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search supplier by name..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <span>Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 focus:outline-hidden"
                >
                  <option value={10}>10 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto min-h-[280px]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4 text-right">Purchase Cost</th>
                    <th className="py-3 px-4 text-right">Total Paid Out</th>
                    <th className="py-3 px-4 text-right">Pending Payable</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {isLoadingSuppliers ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        Loading suppliers list...
                      </td>
                    </tr>
                  ) : paginatedSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 space-y-2">
                        <Users className="w-8 h-8 mx-auto opacity-30 text-slate-500" />
                        <p className="text-xs font-bold text-slate-600">No Suppliers Found</p>
                        <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                          Suppliers are created automatically when importing new stock in New Stock.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedSuppliers.map((sup) => (
                      <tr
                        key={sup.id}
                        onClick={() => setSelectedSupplierId(sup.id)}
                        className="hover:bg-emerald-50/50 transition cursor-pointer group"
                      >
                        <td className="py-3 px-4 font-bold text-slate-900 group-hover:text-emerald-600">
                          {sup.name}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          ₹{sup.totalPurchase?.toLocaleString() || 0}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-700">
                          ₹{sup.totalPaid?.toLocaleString() || 0}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-amber-700">
                          ₹{sup.totalPending?.toLocaleString() || 0}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {renderStatusBadge(sup.status, sup.totalPending)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalItems)} of {totalItems} suppliers
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-slate-800 px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>
      )}

      {/* PAY SUPPLIER MODAL */}
      {isPaymentModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 bg-emerald-600 text-white">
              <div className="flex items-center gap-2 font-bold text-sm">
                <ArrowUpRight className="w-5 h-5 text-emerald-200" />
                Pay Supplier (Payment Out)
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1 hover:bg-emerald-700 rounded-lg text-emerald-100 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <p className="font-bold text-sm">{selectedSupplier.name}</p>
                <p>Current Pending Payable Balance: <strong className="text-amber-800">₹{selectedSupplier.totalPending?.toLocaleString()}</strong></p>
              </div>

              {/* Amount Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Payment Out Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedSupplier.totalPending}
                  value={paymentAmountInput}
                  onChange={(e) => setPaymentAmountInput(e.target.value)}
                  placeholder="Enter amount paid to supplier..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Payment Mode</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank">Bank Transfer</option>
                  <option value="Baki/credit">Baki / Credit</option>
                </select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Notes / Transaction Ref (Optional)</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Transaction ref # or notes..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden"
                />
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  disabled={isSubmittingPayment}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingPayment ? 'Processing...' : 'Confirm Payment'}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};
