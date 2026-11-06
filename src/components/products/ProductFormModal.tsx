import React, { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  createProduct,
  updateProduct,
  generateInternalBarcode,
  getNextInternalBarcodeSequence,
  isBarcodeTaken,
  getProductById
} from '../../lib/productService';
import { useAppStore } from '../../store/useStore';
import { Product } from '../../types';
import { X, Sparkles, Save, Barcode, Calendar, DollarSign, Package, Loader2 } from 'lucide-react';

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  quantity: z.number().min(0, 'Quantity cannot be negative'),
  purchasePrice: z.number().min(0, 'Purchase price cannot be negative'),
  mrp: z.number().min(0, 'MRP cannot be negative'),
  sellingPrice: z.number().min(0, 'Selling price cannot be negative'),
  minStock: z.number().min(0, 'Minimum stock cannot be negative'),
  expiryDate: z.string().nullable().optional(),
  barcode: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
  onSuccess: () => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  productToEdit,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingBarcode, setIsGeneratingBarcode] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  
  const lastKeyTimeRef = useRef(0);
  const scanBufferRef = useRef('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      quantity: 0,
      purchasePrice: 0,
      mrp: 0,
      sellingPrice: 0,
      minStock: 10,
      expiryDate: '',
      barcode: '',
    },
  });

  const watchMrp = watch('mrp');
  const watchBarcode = watch('barcode');

  // Sync Selling Price to MRP when MRP changes (unless user typed a custom selling price)
  useEffect(() => {
    if (!productToEdit && watchMrp > 0) {
      setValue('sellingPrice', watchMrp);
    }
  }, [watchMrp, productToEdit, setValue]);

  // Populate form on edit or open with empty barcode ready for scanning
  useEffect(() => {
    if (isOpen) {
      if (productToEdit) {
        reset({
          name: productToEdit.name,
          quantity: productToEdit.quantity,
          purchasePrice: productToEdit.purchasePrice,
          mrp: productToEdit.mrp,
          sellingPrice: productToEdit.sellingPrice || productToEdit.mrp,
          minStock: productToEdit.minStock,
          expiryDate: typeof productToEdit.expiryDate === 'string' ? productToEdit.expiryDate : '',
          barcode: productToEdit.barcode || '',
        });
      } else {
        // Default barcode is empty - ready for barcode scanner gun input
        reset({
          name: '',
          quantity: 0,
          purchasePrice: 0,
          mrp: 0,
          sellingPrice: 0,
          minStock: 10,
          expiryDate: '',
          barcode: '',
        });
      }

      // Auto focus barcode or name field
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, productToEdit, reset]);

  // Generate internal EAN-13 barcode on explicit button click
  const handleGenerateBarcode = async () => {
    try {
      setIsGeneratingBarcode(true);
      const seq = await getNextInternalBarcodeSequence();
      const code = generateInternalBarcode(seq);

      const conflict = await isBarcodeTaken(code, productToEdit?.id);
      if (conflict) {
        toast.error(`Generated barcode ${code} conflicts with "${conflict.name}". Please try again.`);
        return;
      }

      setValue('barcode', code);
      toast.success(`Generated internal EAN-13 barcode: ${code}`);
    } catch (err: any) {
      toast.error('Unable to fetch barcode sequence counter from server. Please try again.');
    } finally {
      setIsGeneratingBarcode(false);
    }
  };

  // Scan detection on barcode input (timing gap < 50ms for scanner gun)
  const handleBarcodeKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now();
    const gap = now - lastKeyTimeRef.current;
    lastKeyTimeRef.current = now;

    if (gap > 50 && scanBufferRef.current.length > 0) {
      scanBufferRef.current = '';
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const val = scanBufferRef.current.trim() || (watchBarcode || '').trim();
      if (val.length >= 8) {
        setValue('barcode', val);
        const conflict = await isBarcodeTaken(val, productToEdit?.id);
        if (conflict) {
          toast.error(`This barcode is already assigned to "${conflict.name}"`);
        } else {
          toast.success(`Barcode "${val}" scanned & clear!`);
        }
      }
      scanBufferRef.current = '';
    } else if (e.key.length === 1) {
      scanBufferRef.current += e.key;
    }
  };

  const onSubmit = async (values: ProductFormValues) => {
    try {
      setIsSubmitting(true);

      if (productToEdit) {
        await updateProduct(productToEdit.id, {
          name: values.name,
          quantity: values.quantity,
          purchasePrice: values.purchasePrice,
          mrp: values.mrp,
          sellingPrice: values.sellingPrice,
          minStock: values.minStock,
          expiryDate: values.expiryDate || null,
          barcode: values.barcode,
        });
        toast.success(`Updated product "${values.name}"`);
      } else {
        await createProduct({
          name: values.name,
          quantity: values.quantity,
          purchasePrice: values.purchasePrice,
          mrp: values.mrp,
          sellingPrice: values.sellingPrice,
          minStock: values.minStock,
          expiryDate: values.expiryDate || null,
          barcode: values.barcode,
        });
        toast.success(`Created product "${values.name}"`);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full p-6 shadow-2xl relative my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {productToEdit ? 'Edit Product' : 'Add New Product'}
              </h2>
              <p className="text-xs text-slate-500">
                {productToEdit ? 'Modify product attributes and pricing' : 'Add product to store catalog'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          
          {/* Product Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Product Name *
            </label>
            <input
              type="text"
              {...register('name')}
              placeholder="e.g. Vanilla Cannoli (Pack of 4)"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              autoFocus
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          {/* Pricing Row: Purchase Price, MRP, Selling Price */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Purchase Price (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-xs font-bold">₹</span>
                <input
                  type="number"
                  step="0.01"
                  {...register('purchasePrice', { valueAsNumber: true })}
                  className="w-full pl-7 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
              </div>
              {errors.purchasePrice && <p className="text-xs text-red-500 mt-1">{errors.purchasePrice.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                MRP (₹) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-xs font-bold">₹</span>
                <input
                  type="number"
                  step="0.01"
                  {...register('mrp', { valueAsNumber: true })}
                  className="w-full pl-7 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
              </div>
              {errors.mrp && <p className="text-xs text-red-500 mt-1">{errors.mrp.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Selling Price (₹) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-xs font-bold">₹</span>
                <input
                  type="number"
                  step="0.01"
                  {...register('sellingPrice', { valueAsNumber: true })}
                  className="w-full pl-7 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                />
              </div>
              {errors.sellingPrice && <p className="text-xs text-red-500 mt-1">{errors.sellingPrice.message}</p>}
            </div>
          </div>

          {/* Stock & Expiry Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Initial Stock
              </label>
              <input
                type="number"
                {...register('quantity', { valueAsNumber: true })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
              {errors.quantity && <p className="text-xs text-red-500 mt-1">{errors.quantity.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Min Stock Alert
              </label>
              <input
                type="number"
                {...register('minStock', { valueAsNumber: true })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
              {errors.minStock && <p className="text-xs text-red-500 mt-1">{errors.minStock.message}</p>}
            </div>


            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Expiry Date
              </label>
              <input
                type="date"
                {...register('expiryDate')}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>
          </div>

          {/* Barcode Section (Scan-First EAN-13 Verified Logic) */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Barcode className="w-4 h-4 text-emerald-600" />
                Barcode Value (Scan or Enter)
              </label>

              <button
                type="button"
                onClick={handleGenerateBarcode}
                disabled={isGeneratingBarcode}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs text-emerald-800 font-bold rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                {isGeneratingBarcode ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Generate Barcode
                  </>
                )}
              </button>
            </div>

            <input
              ref={barcodeInputRef}
              type="text"
              {...register('barcode')}
              onKeyDown={handleBarcodeKeyDown}
              placeholder="Scan product barcode (e.g. 8906017291337) or click Generate Barcode..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-sm tracking-wider focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />

            {watchBarcode && (
              <div className="p-2 bg-white rounded border border-dashed border-slate-300 text-center">
                <span className="font-mono text-xs font-bold text-slate-700 tracking-widest uppercase">
                  ||||||| | ||||| || ||| {watchBarcode}
                </span>
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              Scan printed product barcode directly with a scanner gun, or click <strong>Generate Barcode</strong> for house-made items without a printed code.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : productToEdit ? 'Update Product' : 'Create Product'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
