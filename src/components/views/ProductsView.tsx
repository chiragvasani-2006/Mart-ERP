import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore, ProductSearchProjection } from '../../store/useStore';
import { deleteProduct, getProductById } from '../../lib/productService';
import { ProductFormModal } from '../products/ProductFormModal';
import { ProductImportModal } from '../products/ProductImportModal';
import { Product } from '../../types';
import toast from 'react-hot-toast';
import {
  Search,
  Plus,
  FileSpreadsheet,
  Edit2,
  Trash2,
  Package,
  Barcode,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  X,
  Calendar,
  DollarSign
} from 'lucide-react';

export const ProductsView: React.FC = () => {
  const queryClient = useQueryClient();
  const productSearchIndex = useAppStore((state) => state.productSearchIndex);
  const isProductIndexLoaded = useAppStore((state) => state.isProductIndexLoaded);

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  // Modals state
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Delete Confirm Modal state
  const [productToDelete, setProductToDelete] = useState<ProductSearchProjection | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Instant in-memory search filtering via search index
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return productSearchIndex;

    return productSearchIndex.filter((p) => {
      const nameMatch = p.nameLower ? p.nameLower.includes(q) : p.name.toLowerCase().includes(q);
      const barcodeMatch = p.barcode ? p.barcode.toLowerCase().includes(q) : false;
      return nameMatch || barcodeMatch;
    });
  }, [productSearchIndex, searchQuery]);

  // Client-side pagination
  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, currentPage, PAGE_SIZE]);

  // Handle Edit click
  const handleOpenEdit = async (item: ProductSearchProjection) => {
    try {
      const fullDoc = await getProductById(item.id);
      if (fullDoc) {
        setProductToEdit(fullDoc);
      } else {
        // Fallback using projection data
        setProductToEdit({
          id: item.id,
          name: item.name,
          nameLower: item.nameLower,
          quantity: item.quantity,
          purchasePrice: item.purchasePrice || 0,
          mrp: item.mrp,
          sellingPrice: item.sellingPrice,
          minStock: item.minStock || 10,
          expiryDate: item.expiryDate || null,
          barcode: item.barcode,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      setIsAddEditOpen(true);
    } catch (err: any) {
      toast.error('Could not load product details');
    }
  };

  // Handle Delete Confirmation
  const handleConfirmDelete = async () => {
    if (!productToDelete) return;

    try {
      setIsDeleting(true);
      await deleteProduct(productToDelete.id);
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
      toast.success(`Deleted product "${productToDelete.name}"`);
      setProductToDelete(null);
    } catch (err: any) {
      toast.error('Failed to delete product: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Products Catalog
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {productSearchIndex.length} SKUs
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Manage product pricing, stock levels, barcodes & Excel imports
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-semibold text-xs transition shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Import Excel/CSV
          </button>

          <button
            onClick={() => {
              setProductToEdit(null);
              setIsAddEditOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>
      </div>

      {/* Search Bar & Instant Filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search products instantly by name or scan/type barcode..."
            className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        
        {searchQuery && (
          <p className="text-xs text-slate-500 mt-2 px-1">
            Showing {filteredProducts.length} results matching "<strong>{searchQuery}</strong>"
          </p>
        )}
      </div>

      {/* Products Table or Empty State */}
      {productSearchIndex.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs my-6">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-200 shadow-xs">
            <Package className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">
            No products in catalog yet
          </h2>
          <p className="text-slate-500 text-sm max-w-md mx-auto mt-1 mb-6">
            Get started by adding your first product manually, or import your existing inventory from an Excel/CSV spreadsheet.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setIsImportOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-xl transition shadow-2xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Import Excel File
            </button>
            <button
              onClick={() => {
                setProductToEdit(null);
                setIsAddEditOpen(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add First Product
            </button>
          </div>
        </div>
      ) : filteredProducts.length === 0 ? (
        /* No Search Match State */
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
          <p className="text-slate-600 font-medium text-sm">
            No products match search "<strong>{searchQuery}</strong>"
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="mt-3 text-xs text-emerald-700 hover:underline font-bold"
          >
            Clear Search
          </button>
        </div>
      ) : (
        /* Products Table */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-4">Product Name</th>
                  <th className="p-4">Stock Qty</th>
                  <th className="p-4">MRP</th>
                  <th className="p-4">Selling Price</th>
                  <th className="p-4">Min Stock</th>
                  <th className="p-4">Expiry Date</th>
                  <th className="p-4">Barcode</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-800">
                {paginatedProducts.map((p) => {
                  const isLowStock = p.quantity <= (p.minStock || 10);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition">
                      
                      {/* Name */}
                      <td className="p-4 font-bold text-slate-900">
                        {p.name}
                      </td>

                      {/* Stock Quantity */}
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-extrabold ${isLowStock ? 'text-red-600' : 'text-slate-800'}`}>
                            {p.quantity}
                          </span>
                          {isLowStock && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Low Stock
                            </span>
                          )}
                        </div>
                      </td>

                      {/* MRP */}
                      <td className="p-4 text-slate-600 font-medium">
                        ₹{p.mrp}
                      </td>

                      {/* Selling Price */}
                      <td className="p-4 font-bold text-slate-900">
                        ₹{p.sellingPrice || p.mrp}
                      </td>

                      {/* Min Stock */}
                      <td className="p-4 text-slate-500 font-medium">
                        {p.minStock || 10}
                      </td>

                      {/* Expiry Date */}
                      <td className="p-4 text-slate-600 text-xs">
                        {p.expiryDate ? (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {p.expiryDate}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Barcode */}
                      <td className="p-4">
                        {p.barcode ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-slate-800 font-mono text-xs font-bold border border-slate-200">
                            <Barcode className="w-3.5 h-3.5 text-slate-500" />
                            {p.barcode}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                            title="Edit product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setProductToDelete(p)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            title="Delete product"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <div>
                Showing page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({filteredProducts.length} items)
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Add/Edit Product */}
      <ProductFormModal
        isOpen={isAddEditOpen}
        onClose={() => setIsAddEditOpen(false)}
        productToEdit={productToEdit}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['products'] });
          queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
        }}
      />

      {/* MODAL 2: Excel Import */}
      <ProductImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['products'] });
          queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
        }}
      />

      {/* MODAL 3: Delete Confirmation */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 text-center space-y-4">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900">Delete Product?</h3>
              <p className="text-xs text-slate-600 mt-1">
                Are you sure you want to delete <strong>"{productToDelete.name}"</strong>?
              </p>
              <p className="text-[11px] text-slate-400 mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                Note: Historical sales receipts and stock audit logs referencing this product will NOT be deleted.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Product'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
