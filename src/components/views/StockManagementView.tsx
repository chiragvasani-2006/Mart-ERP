import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useStore';
import { Product } from '../../types';
import { UpdateStockModal } from '../stock/UpdateStockModal';
import { StockHistoryModal } from '../stock/StockHistoryModal';
import { ProductFormModal } from '../products/ProductFormModal';
import { getStockReportData, exportReportToExcel } from '../../lib/reportsService';
import toast from 'react-hot-toast';
import {
  Package,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Search,
  SlidersHorizontal,
  Edit,
  History,
  PlusCircle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Layers,
  FileSpreadsheet
} from 'lucide-react';

export const StockManagementView: React.FC = () => {
  const products = useAppStore((state) => state.productSearchIndex);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'out_of_stock' | 'low_stock' | 'in_stock'>('all');
  const [sortByPriority, setSortByPriority] = useState(true);

  // Modals state
  const [selectedProductForUpdate, setSelectedProductForUpdate] = useState<Product | null>(null);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<Product | null>(null);
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<Product | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Real-time Summary Card Counters
  const summaryMetrics = useMemo(() => {
    let total = products.length;
    let outOfStock = 0;
    let lowStock = 0;
    let inStock = 0;

    for (const p of products) {
      if (p.quantity === 0) {
        outOfStock++;
      } else if (p.quantity <= p.minStock) {
        lowStock++;
      } else {
        inStock++;
      }
    }

    return { total, outOfStock, lowStock, inStock };
  }, [products]);

  // Derived Filtered & Sorted Product List
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // 1. Text Search
      const searchKey = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !searchKey ||
        product.name.toLowerCase().includes(searchKey) ||
        (product.barcode && product.barcode.toLowerCase().includes(searchKey));

      if (!matchesSearch) return false;

      // 2. Status Filter
      if (statusFilter === 'out_of_stock') return product.quantity === 0;
      if (statusFilter === 'low_stock') return product.quantity > 0 && product.quantity <= product.minStock;
      if (statusFilter === 'in_stock') return product.quantity > product.minStock;

      return true;
    }).sort((a, b) => {
      if (sortByPriority) {
        // Priority ranking: Out of Stock (0) -> Low Stock (1) -> In Stock (2)
        const getRank = (p: typeof a) => {
          if (p.quantity === 0) return 0;
          if (p.quantity <= p.minStock) return 1;
          return 2;
        };
        const rankDiff = getRank(a) - getRank(b);
        if (rankDiff !== 0) return rankDiff;
      }
      return a.name.localeCompare(b.name);
    });
  }, [products, searchTerm, statusFilter, sortByPriority]);

  // Pagination logic
  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  // Derived status badge renderer
  const renderStatusBadge = (product: Product) => {
    if (product.quantity === 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
          <XCircle className="w-3.5 h-3.5" />
          Out of Stock
        </span>
      );
    }
    if (product.quantity <= product.minStock) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5" />
          Low Stock
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
        <CheckCircle2 className="w-3.5 h-3.5" />
        In Stock
      </span>
    );
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExportStock = async () => {
    try {
      setIsExporting(true);
      const data = await getStockReportData();
      const headers = ['Product Name', 'Barcode', 'Quantity', 'Min Stock', 'Purchase Price (₹)', 'Selling Price (₹)', 'Valuation Cost (₹)', 'Health Status'];
      const rows = data.rows.map(r => [
        r.name,
        r.barcode,
        r.quantity,
        r.minStock,
        r.purchasePrice,
        r.sellingPrice,
        r.stockValuationAtCost,
        r.status
      ]);
      exportReportToExcel('Stock_Health_Report', headers, rows);
      toast.success('Stock report downloaded successfully!');
    } catch (e: any) {
      toast.error('Export failed: ' + e.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Stock Operations & Inventory Health
          </h1>
          <p className="text-sm text-slate-500">
            Monitor stock levels, log manual updates, and inspect historical stock movements
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportStock}
          disabled={isExporting}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {isExporting ? 'Downloading...' : 'Download Stock Excel'}
        </button>
      </div>

      {/* SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        {/* Total Products */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Products</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{summaryMetrics.total}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Active inventory items</p>
          </div>
          <div className="w-12 h-12 bg-slate-100 text-slate-700 rounded-2xl flex items-center justify-center">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* Low Stock */}
        <div
          onClick={() => {
            setStatusFilter('low_stock');
            setCurrentPage(1);
          }}
          className="bg-white rounded-2xl border border-amber-200 bg-amber-50/20 p-5 shadow-xs flex items-center justify-between cursor-pointer hover:border-amber-400 transition"
        >
          <div>
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Low Stock Alerts</p>
            <p className="text-2xl font-black text-amber-900 mt-1">{summaryMetrics.lowStock}</p>
            <p className="text-[11px] text-amber-700/80 mt-0.5">Below minimum threshold</p>
          </div>
          <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Out of Stock */}
        <div
          onClick={() => {
            setStatusFilter('out_of_stock');
            setCurrentPage(1);
          }}
          className="bg-white rounded-2xl border border-red-200 bg-red-50/20 p-5 shadow-xs flex items-center justify-between cursor-pointer hover:border-red-400 transition"
        >
          <div>
            <p className="text-xs font-bold text-red-800 uppercase tracking-wider">Out of Stock</p>
            <p className="text-2xl font-black text-red-900 mt-1">{summaryMetrics.outOfStock}</p>
            <p className="text-[11px] text-red-700/80 mt-0.5">Urgent reorder required</p>
          </div>
          <div className="w-12 h-12 bg-red-100 text-red-700 rounded-2xl flex items-center justify-center">
            <XCircle className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search products by name or barcode..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
          </div>

          {/* Sort Priority Toggle */}
          <button
            type="button"
            onClick={() => setSortByPriority(!sortByPriority)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
              sortByPriority
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-emerald-600" />
            {sortByPriority ? 'Priority Sort (Low Stock First)' : 'Alphabetical Sort'}
          </button>

        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100">
          {[
            { id: 'all', label: `All Products (${summaryMetrics.total})` },
            { id: 'out_of_stock', label: `Out of Stock (${summaryMetrics.outOfStock})` },
            { id: 'low_stock', label: `Low Stock (${summaryMetrics.lowStock})` },
            { id: 'in_stock', label: `In Stock (${summaryMetrics.inStock})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setStatusFilter(tab.id as any);
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* STOCK TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-3.5">Product Name</th>
                <th className="p-3.5">Current Stock</th>
                <th className="p-3.5">Min Stock</th>
                <th className="p-3.5">MRP / Price</th>
                <th className="p-3.5">Health Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-bold text-slate-600">No products match search/filter</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try clearing filters or search term</p>
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50/80 transition">
                    
                    {/* Product Name */}
                    <td className="p-3.5 font-bold text-slate-900">
                      <div>{product.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {product.barcode || 'No barcode'}
                      </div>
                    </td>

                    {/* Current Stock */}
                    <td className="p-3.5 font-black text-slate-900 text-sm">
                      {product.quantity} <span className="text-xs font-normal text-slate-400">units</span>
                    </td>

                    {/* Min Stock */}
                    <td className="p-3.5 text-slate-600 font-semibold">
                      {product.minStock} units
                    </td>

                    {/* MRP / Price */}
                    <td className="p-3.5 text-slate-700 font-semibold">
                      ₹{product.sellingPrice || product.mrp}
                    </td>

                    {/* Status Badge */}
                    <td className="p-3.5">
                      {renderStatusBadge(product)}
                    </td>

                    {/* Actions */}
                    <td className="p-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        
                        {/* Update Stock Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedProductForUpdate(product)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg transition text-[11px] cursor-pointer"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          Update Stock
                        </button>

                        {/* History Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedProductForHistory(product)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition text-[11px] cursor-pointer"
                        >
                          <History className="w-3.5 h-3.5 text-slate-500" />
                          History
                        </button>

                        {/* Edit Product Button */}
                        <button
                          type="button"
                          onClick={() => setSelectedProductForEdit(product)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title="Edit Product Details"
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION FOOTER */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-hidden"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
            <span>
              Showing {filteredProducts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, filteredProducts.length)} of {filteredProducts.length} items
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-700 px-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

      {/* MODALS */}

      {/* 1. Update Stock Modal */}
      <UpdateStockModal
        isOpen={Boolean(selectedProductForUpdate)}
        onClose={() => setSelectedProductForUpdate(null)}
        product={selectedProductForUpdate}
        onSuccess={() => setSelectedProductForUpdate(null)}
      />

      {/* 2. Stock History Modal */}
      <StockHistoryModal
        isOpen={Boolean(selectedProductForHistory)}
        onClose={() => setSelectedProductForHistory(null)}
        product={selectedProductForHistory}
      />

      {/* 3. Edit Product Form Modal (Reused Phase 2) */}
      <ProductFormModal
        isOpen={Boolean(selectedProductForEdit)}
        onClose={() => setSelectedProductForEdit(null)}
        productToEdit={selectedProductForEdit}
        onSuccess={() => setSelectedProductForEdit(null)}
      />

    </div>
  );
};
