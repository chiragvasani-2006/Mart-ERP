import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAppStore, ProductSearchProjection } from '../../store/useStore';
import { bulkRemoveExpiredStock } from '../../lib/stockService';
import {
  CalendarOff,
  AlertTriangle,
  Clock,
  Trash2,
  Search,
  CheckCircle2,
  X,
  AlertCircle,
  Package,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { differenceInCalendarDays, parseISO, startOfDay, format } from 'date-fns';

export type ExpiryBucket = 'expired' | '30' | '60' | '90';

export interface ExpiryProductItem {
  product: ProductSearchProjection;
  remainingDays: number;
  bucket: ExpiryBucket;
  formattedExpiryDate: string;
}

export const ExpiryManagementView: React.FC = () => {
  const queryClient = useQueryClient();
  const products = useAppStore((state) => state.productSearchIndex);

  const [activeBucket, setActiveBucket] = useState<ExpiryBucket>('expired');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Single item remove modal state
  const [selectedItemForRemoval, setSelectedItemForRemoval] = useState<ExpiryProductItem | null>(null);
  const [removeQtyInput, setRemoveQtyInput] = useState<string>('');
  const [removeReason, setRemoveReason] = useState<string>('Spoiled / Expired');

  // Bulk remove modal state
  const [isBulkRemoveModalOpen, setIsBulkRemoveModalOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Compute Live Expiry Items from Products Store
  const { allExpiryItems, bucketCounts, expiredItemsList } = useMemo(() => {
    const today = startOfDay(new Date());
    const items: ExpiryProductItem[] = [];
    const expiredList: ExpiryProductItem[] = [];

    let expiredCount = 0;
    let days30Count = 0;
    let days60Count = 0;
    let days90Count = 0;

    for (const p of products) {
      if (!p.expiryDate) continue;

      let remainingDays = 999;
      let formattedExpiryDate = p.expiryDate;

      try {
        const parsedDate = typeof p.expiryDate === 'string' ? parseISO(p.expiryDate) : new Date(p.expiryDate);
        remainingDays = differenceInCalendarDays(startOfDay(parsedDate), today);
        formattedExpiryDate = format(parsedDate, 'dd MMM yyyy');
      } catch {
        continue;
      }

      let bucket: ExpiryBucket | null = null;

      if (remainingDays < 0) {
        bucket = 'expired';
        expiredCount++;
      } else if (remainingDays <= 30) {
        bucket = '30';
        days30Count++;
      } else if (remainingDays <= 60) {
        bucket = '60';
        days60Count++;
      } else if (remainingDays <= 90) {
        bucket = '90';
        days90Count++;
      }

      if (bucket) {
        const item: ExpiryProductItem = {
          product: p,
          remainingDays,
          bucket,
          formattedExpiryDate,
        };
        items.push(item);
        if (bucket === 'expired') {
          expiredList.push(item);
        }
      }
    }

    return {
      allExpiryItems: items,
      bucketCounts: {
        expired: expiredCount,
        '30': days30Count,
        '60': days60Count,
        '90': days90Count,
      },
      expiredItemsList: expiredList,
    };
  }, [products]);

  // 2. Filter & Sort Items for Current Active Bucket
  const filteredAndSortedItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const bucketFiltered = allExpiryItems.filter((item) => {
      if (item.bucket !== activeBucket) return false;
      if (!query) return true;
      return (
        item.product.nameLower.includes(query) ||
        (item.product.barcode && item.product.barcode.toLowerCase().includes(query))
      );
    });

    // Default sort: soonest to expire / already expired longest first
    bucketFiltered.sort((a, b) => a.remainingDays - b.remainingDays);

    return bucketFiltered;
  }, [allExpiryItems, activeBucket, searchQuery]);

  // Reset pagination on bucket or search query change
  const totalItems = filteredAndSortedItems.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedItems.slice(start, start + pageSize);
  }, [filteredAndSortedItems, currentPage, pageSize]);

  // Helper function to handle live invalidation after removal
  const triggerLiveSync = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
    queryClient.invalidateQueries({ queryKey: ['stockManagement'] });
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  };

  // Open single removal modal
  const handleOpenSingleRemoveModal = (item: ExpiryProductItem) => {
    setSelectedItemForRemoval(item);
    setRemoveQtyInput(String(item.product.quantity));
    setRemoveReason('Spoiled / Expired');
  };

  // Confirm Single Item Removal
  const handleConfirmSingleRemove = async () => {
    if (!selectedItemForRemoval) return;

    const qtyVal = parseInt(removeQtyInput, 10);
    if (isNaN(qtyVal) || qtyVal <= 0) {
      toast.error('Please enter a valid removal quantity greater than 0.');
      return;
    }

    if (qtyVal > selectedItemForRemoval.product.quantity) {
      toast.error(`Cannot remove more than current stock (${selectedItemForRemoval.product.quantity} units).`);
      return;
    }

    try {
      setIsSubmitting(true);
      await bulkRemoveExpiredStock([
        {
          productId: selectedItemForRemoval.product.id,
          productName: selectedItemForRemoval.product.name,
          currentQuantity: selectedItemForRemoval.product.quantity,
          qtyToRemove: qtyVal,
          reason: removeReason || 'Expired Stock Removal',
        },
      ]);

      triggerLiveSync();
      toast.success(`Successfully removed ${qtyVal} units of expired "${selectedItemForRemoval.product.name}".`);
      setSelectedItemForRemoval(null);
    } catch (err: any) {
      console.error('Failed to remove expired stock:', err);
      toast.error(err.message || 'Failed to remove expired stock');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm Bulk Remove All Expired
  const handleConfirmBulkRemoveAllExpired = async () => {
    if (expiredItemsList.length === 0) return;

    try {
      setIsSubmitting(true);
      const itemsToProcess = expiredItemsList.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        currentQuantity: item.product.quantity,
        qtyToRemove: item.product.quantity, // Clear full current quantity
        reason: 'Bulk Expired Stock Removal',
      }));

      const count = await bulkRemoveExpiredStock(itemsToProcess);

      triggerLiveSync();
      toast.success(`Bulk Cleanup Complete: Removed expired stock for ${count} products.`);
      setIsBulkRemoveModalOpen(false);
    } catch (err: any) {
      console.error('Failed bulk expired removal:', err);
      toast.error(err.message || 'Failed to execute bulk expired stock removal');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper for Status Badge styling & label
  const renderStatusBadge = (item: ExpiryProductItem) => {
    const days = item.remainingDays;

    if (days < 0) {
      const positiveDaysAgo = Math.abs(days);
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-red-50 text-red-700 border border-red-200">
          <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
          Expired {positiveDaysAgo === 0 ? 'Today' : `${positiveDaysAgo}d ago`}
        </span>
      );
    }

    if (days === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600 shrink-0" />
          Expires Today
        </span>
      );
    }

    if (days <= 30) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600 shrink-0" />
          Expiring in {days} {days === 1 ? 'day' : 'days'}
        </span>
      );
    }

    if (days <= 60) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-yellow-50 text-yellow-800 border border-yellow-200">
          <Clock className="w-3 h-3 text-yellow-600 shrink-0" />
          In {days} days (60-day window)
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
        <Clock className="w-3 h-3 text-slate-500 shrink-0" />
        In {days} days (90-day window)
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="pb-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <CalendarOff className="w-6 h-6 text-red-600" />
            Expiry Management
          </h1>
          <p className="text-sm text-slate-500">
            Live derived tracking for expired and soon-to-expire stock based on product expiry dates
          </p>
        </div>

        {/* Bulk Remove All Expired Button (Visible on Expired Tab when count > 0) */}
        {activeBucket === 'expired' && bucketCounts.expired > 0 && (
          <button
            onClick={() => setIsBulkRemoveModalOpen(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <Trash2 className="w-4 h-4" />
            Remove All Expired ({bucketCounts.expired})
          </button>
        )}
      </div>

      {/* FILTER BUCKET TABS WITH COUNT BADGES */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        
        {/* Expired Bucket */}
        <button
          type="button"
          onClick={() => {
            setActiveBucket('expired');
            setCurrentPage(1);
          }}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
            activeBucket === 'expired'
              ? 'bg-red-500 text-white border-red-600 shadow-md ring-2 ring-red-500/30'
              : 'bg-white hover:bg-red-50/50 text-slate-800 border-slate-200 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-black uppercase tracking-wider ${activeBucket === 'expired' ? 'text-red-100' : 'text-slate-500'}`}>
              Expired
            </span>
            <AlertTriangle className={`w-4 h-4 ${activeBucket === 'expired' ? 'text-white' : 'text-red-600'}`} />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black">{bucketCounts.expired}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              activeBucket === 'expired' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-800'
            }`}>
              Passed
            </span>
          </div>
        </button>

        {/* 30 Days Bucket */}
        <button
          type="button"
          onClick={() => {
            setActiveBucket('30');
            setCurrentPage(1);
          }}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
            activeBucket === '30'
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-500/30'
              : 'bg-white hover:bg-emerald-50/50 text-slate-800 border-slate-200 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-black uppercase tracking-wider ${activeBucket === '30' ? 'text-emerald-100' : 'text-slate-500'}`}>
              30 Days
            </span>
            <Clock className={`w-4 h-4 ${activeBucket === '30' ? 'text-white' : 'text-emerald-600'}`} />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black">{bucketCounts['30']}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              activeBucket === '30' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'
            }`}>
              0–30d
            </span>
          </div>
        </button>

        {/* 60 Days Bucket */}
        <button
          type="button"
          onClick={() => {
            setActiveBucket('60');
            setCurrentPage(1);
          }}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
            activeBucket === '60'
              ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-500/30'
              : 'bg-white hover:bg-blue-50/50 text-slate-800 border-slate-200 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-black uppercase tracking-wider ${activeBucket === '60' ? 'text-blue-100' : 'text-slate-500'}`}>
              60 Days
            </span>
            <Clock className={`w-4 h-4 ${activeBucket === '60' ? 'text-white' : 'text-blue-600'}`} />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black">{bucketCounts['60']}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              activeBucket === '60' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800'
            }`}>
              31–60d
            </span>
          </div>
        </button>

        {/* 90 Days Bucket */}
        <button
          type="button"
          onClick={() => {
            setActiveBucket('90');
            setCurrentPage(1);
          }}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
            activeBucket === '90'
              ? 'bg-slate-800 text-white border-slate-900 shadow-md ring-2 ring-slate-800/30'
              : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-black uppercase tracking-wider ${activeBucket === '90' ? 'text-slate-300' : 'text-slate-500'}`}>
              90 Days
            </span>
            <Clock className={`w-4 h-4 ${activeBucket === '90' ? 'text-white' : 'text-slate-600'}`} />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black">{bucketCounts['90']}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              activeBucket === '90' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-800'
            }`}>
              61–90d
            </span>
          </div>
        </button>

      </div>

      {/* TABLE CONTAINER & CONTROLS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
        
        {/* Search & Header Controls */}
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
              placeholder="Search product name or barcode..."
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

        {/* EXPIRY ITEMS TABLE */}
        <div className="overflow-x-auto min-h-[280px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4 text-center">Current Stock</th>
                <th className="py-3 px-4">Expiry Date</th>
                <th className="py-3 px-4">Remaining Days</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 space-y-2">
                    <CheckCircle2 className="w-8 h-8 mx-auto opacity-30 text-emerald-600" />
                    <p className="text-xs font-bold text-slate-600">No Products Found in this Expiry Category</p>
                    <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                      All products in this category have zero stock or non-matching dates.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const isZeroStock = item.product.quantity === 0;

                  return (
                    <tr
                      key={item.product.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isZeroStock ? 'opacity-60 bg-slate-50/40' : ''
                      }`}
                    >
                      {/* Product Name & Barcode */}
                      <td className="py-3 px-4 font-bold text-slate-900">
                        <div className="min-w-0">
                          <p className="truncate font-extrabold text-slate-900">{item.product.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            Barcode: {item.product.barcode || 'N/A'}
                          </p>
                        </div>
                      </td>

                      {/* Current Stock */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block font-extrabold px-2 py-0.5 rounded-md ${
                            isZeroStock
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {item.product.quantity} {item.product.quantity === 1 ? 'unit' : 'units'}
                        </span>
                      </td>

                      {/* Expiry Date */}
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {item.formattedExpiryDate}
                      </td>

                      {/* Remaining Days */}
                      <td className="py-3 px-4 font-extrabold">
                        {item.remainingDays < 0 ? (
                          <span className="text-red-600">{item.remainingDays} days</span>
                        ) : item.remainingDays === 0 ? (
                          <span className="text-amber-700">Today (0 days)</span>
                        ) : (
                          <span className="text-slate-800">+{item.remainingDays} days</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {renderStatusBadge(item)}
                      </td>

                      {/* Row Actions */}
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          disabled={isZeroStock}
                          onClick={() => handleOpenSingleRemoveModal(item)}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-[11px] rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                          title="Remove expired units from product stock"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove Expired
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION CONTROLS */}
        {totalPages > 1 && (
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalItems)} of {totalItems} items
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

      {/* SINGLE ITEM REMOVE EXPIRED MODAL */}
      {selectedItemForRemoval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 bg-red-600 text-white">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Trash2 className="w-5 h-5 text-red-200" />
                Remove Expired Stock
              </div>
              <button
                onClick={() => setSelectedItemForRemoval(null)}
                className="p-1 hover:bg-red-700 rounded-lg text-red-100 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-800 space-y-1">
                <p className="font-bold">Product: {selectedItemForRemoval.product.name}</p>
                <p>Current Available Stock: <strong>{selectedItemForRemoval.product.quantity} units</strong></p>
                <p>Expiry Date: <strong>{selectedItemForRemoval.formattedExpiryDate}</strong></p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Quantity to Remove</label>
                <input
                  type="number"
                  min="1"
                  max={selectedItemForRemoval.product.quantity}
                  value={removeQtyInput}
                  onChange={(e) => setRemoveQtyInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
                <p className="text-[11px] text-slate-400">
                  Defaults to full current quantity ({selectedItemForRemoval.product.quantity}). Enter a lower amount if removing partial stock.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Reason / Notes</label>
                <input
                  type="text"
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder="Reason for removal (e.g. Spoiled, Moldy, Disposed)..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedItemForRemoval(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSingleRemove}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Removing...' : 'Confirm Stock Removal'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BULK REMOVE ALL EXPIRED MODAL */}
      {isBulkRemoveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 bg-red-600 text-white">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-red-200" />
                Confirm Bulk Removal of All Expired Stock
              </div>
              <button
                onClick={() => setIsBulkRemoveModalOpen(false)}
                className="p-1 hover:bg-red-700 rounded-lg text-red-100 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-2">
                <p className="font-bold text-sm">Action Warning:</p>
                <p>
                  You are about to remove <strong>ALL stock</strong> for <strong>{expiredItemsList.length} expired products</strong> in a single transaction.
                </p>
                <p>
                  This will deduct <strong>{expiredItemsList.reduce((acc, curr) => acc + curr.product.quantity, 0)} total stock units</strong> and write a <code>StockHistory</code> log entry for each affected product.
                </p>
              </div>

              {/* Preview List of Expired Items */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Products to be cleared ({expiredItemsList.length})
                </p>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-2 divide-y divide-slate-100 bg-slate-50 text-xs">
                  {expiredItemsList.map((item) => (
                    <div key={item.product.id} className="py-2 flex justify-between items-center px-2">
                      <div>
                        <p className="font-bold text-slate-900">{item.product.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Expired {item.formattedExpiryDate} ({Math.abs(item.remainingDays)} days ago)
                        </p>
                      </div>
                      <span className="font-extrabold text-red-700 bg-red-100 px-2 py-0.5 rounded-md text-[11px]">
                        -{item.product.quantity} units
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsBulkRemoveModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmBulkRemoveAllExpired}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Clearing Expired Stock...' : 'Confirm Bulk Clear All'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
