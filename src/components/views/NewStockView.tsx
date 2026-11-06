import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getSuppliersList, commitNewStock, getNextInvoiceNumber, CommitNewStockItem } from '../../lib/stockService';
import { Supplier } from '../../types';
import {
  FileSpreadsheet,
  Scan,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  Calendar,
  DollarSign,
  FileText,
  Building2,
  Receipt,
  Sparkles,
  ChevronRight,
  RefreshCw,
  HelpCircle,
  PackageCheck
} from 'lucide-react';

export const NewStockView: React.FC = () => {
  const queryClient = useQueryClient();

  // Step 1: Supplier & Invoice Metadata State
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Supplier Autocomplete State
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  // Active Import Tab: 'ocr' | 'excel'
  const [activeMode, setActiveMode] = useState<'ocr' | 'excel'>('ocr');

  // OCR Processing state
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);

  // Excel Processing state
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const [isExcelParsing, setIsExcelParsing] = useState(false);

  // Review / Preview Items State (for both OCR and Excel)
  const [reviewItems, setReviewItems] = useState<CommitNewStockItem[]>([]);
  const [isCommitting, setIsCommitting] = useState(false);

  // Fetch suppliers list & auto-increment next invoice number on mount
  useEffect(() => {
    getSuppliersList().then(setSuppliersList).catch(console.warn);
    getNextInvoiceNumber().then((nextNum) => setInvoiceNumber(nextNum)).catch(console.warn);
  }, []);

  const handleRefreshInvoiceNumber = async () => {
    try {
      const nextNum = await getNextInvoiceNumber();
      setInvoiceNumber(nextNum);
      toast.success(`Generated next invoice number: ${nextNum}`);
    } catch (e) {
      console.warn('Failed to generate next invoice number', e);
    }
  };

  // Filtered suppliers for autocomplete
  const filteredSuppliers = suppliersList.filter((s) =>
    s.name.toLowerCase().includes(supplierName.trim().toLowerCase())
  );

  const isMetadataValid = Boolean(supplierName.trim() && invoiceNumber.trim() && invoiceDate);

  // Helper to convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // OCR Upload & Gemini Extract Handler
  const handleOcrFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isMetadataValid) {
      toast.error('Please enter Supplier Name, Invoice Number, and Date first!');
      return;
    }

    setOcrFile(file);
    setIsOcrProcessing(true);

    try {
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'image/jpeg';

      const response = await fetch('/api/extract-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Invoice extraction failed');
      }

      if (!data.items || data.items.length === 0) {
        toast.error('No items could be extracted from this invoice image. You can add items manually below.');
        setReviewItems([
          {
            productName: '',
            quantity: 1,
            purchasePrice: 0,
            mrp: 0,
            sellingPrice: 0,
            minStock: 10,
            expiryDate: '',
          },
        ]);
      } else {
        const mapped: CommitNewStockItem[] = data.items.map((item: any) => ({
          productName: item.productName || '',
          quantity: Number(item.quantity) || 1,
          purchasePrice: Number(item.purchasePrice) || 0,
          mrp: Number(item.mrp) || 0,
          sellingPrice: Number(item.mrp) || Number(item.purchasePrice) || 0,
          minStock: 10,
          expiryDate: item.expiryDate || '',
        }));

        setReviewItems(mapped);
        toast.success(`OCR extracted ${mapped.length} line items from invoice!`);
      }
    } catch (err: any) {
      console.warn('OCR invoice extraction error:', err);
      const isFetchErr = err.message && err.message.includes('fetch');
      const msg = isFetchErr
        ? 'AI OCR server API unreachable. Please check GEMINI_API_KEY in .env file and ensure server is running (npm run dev).'
        : (err.message || 'Failed to analyze invoice file');
      
      toast.error(msg, { duration: 6000 });

      // Provide a manual entry row as fallback so user can still enter invoice data
      setReviewItems((prev) => prev.length === 0 ? [{
        productName: '',
        quantity: 1,
        purchasePrice: 0,
        mrp: 0,
        sellingPrice: 0,
        minStock: 10,
        expiryDate: '',
      }] : prev);
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // Excel Upload Handler
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isMetadataValid) {
      toast.error('Please enter Supplier Name, Invoice Number, and Date first!');
      return;
    }

    setExcelFileName(file.name);
    setIsExcelParsing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        const rawJson: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          toast.error('Spreadsheet is empty or has no rows');
          setIsExcelParsing(false);
          return;
        }

        const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

        const mapped: CommitNewStockItem[] = rawJson
          .map((row) => {
            let productName = '';
            let quantity = 0;
            let purchasePrice = 0;
            let mrp = 0;
            let sellingPrice = 0;
            let minStock = 10;
            let expiryDate = '';

            for (const key of Object.keys(row)) {
              const normKey = normalizeKey(key);
              const val = row[key];

              if (['productname', 'name', 'itemname', 'item', 'product'].includes(normKey)) {
                productName = String(val).trim();
              } else if (['quantity', 'qty', 'stock', 'count'].includes(normKey)) {
                quantity = Number(val) || 0;
              } else if (['purchaseprice', 'costprice', 'cost', 'rate', 'buyprice'].includes(normKey)) {
                purchasePrice = Number(val) || 0;
              } else if (['mrp', 'maxretailprice', 'listprice'].includes(normKey)) {
                mrp = Number(val) || 0;
              } else if (['sellingprice', 'saleprice', 'price'].includes(normKey)) {
                sellingPrice = Number(val) || 0;
              } else if (['minimumstock', 'minstock', 'reorderlevel'].includes(normKey)) {
                minStock = Number(val) || 10;
              } else if (['expirydate', 'expiry', 'expdate'].includes(normKey)) {
                if (val) {
                  if (typeof val === 'number') {
                    const dateObj = XLSX.SSF.parse_date_code(val);
                    if (dateObj) {
                      expiryDate = `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}-${String(dateObj.d).padStart(2, '0')}`;
                    }
                  } else {
                    expiryDate = String(val).trim();
                  }
                }
              }
            }

            if (!sellingPrice && mrp > 0) sellingPrice = mrp;
            if (!mrp && sellingPrice > 0) mrp = sellingPrice;

            return {
              productName,
              quantity,
              purchasePrice,
              mrp,
              sellingPrice,
              minStock,
              expiryDate,
            };
          })
          .filter((r) => Boolean(r.productName));

        setReviewItems(mapped);
        toast.success(`Parsed ${mapped.length} stock line items from Excel!`);
      } catch (err: any) {
        toast.error('Failed to parse Excel file: ' + err.message);
      } finally {
        setIsExcelParsing(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Row Manipulation Handlers for Review Table
  const handleUpdateItem = (index: number, field: keyof CommitNewStockItem, value: any) => {
    setReviewItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAddBlankRow = () => {
    setReviewItems((prev) => [
      ...prev,
      {
        productName: '',
        quantity: 1,
        purchasePrice: 0,
        mrp: 0,
        sellingPrice: 0,
        minStock: 10,
        expiryDate: '',
      },
    ]);
  };

  const handleRemoveRow = (index: number) => {
    setReviewItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Total invoice calculated sum
  const calculatedTotalAmount = reviewItems.reduce(
    (acc, r) => acc + r.quantity * (r.purchasePrice || r.sellingPrice || r.mrp || 0),
    0
  );

  // SHARED COMMIT NEW STOCK EXECUTION
  const handleConfirmStockImport = async () => {
    if (!isMetadataValid) {
      toast.error('Please specify Supplier Name, Invoice Number, and Date');
      return;
    }

    const validItems = reviewItems.filter((r) => r.productName.trim().length > 0 && r.quantity > 0);
    if (validItems.length === 0) {
      toast.error('Please ensure at least one valid line item with a Product Name and Quantity > 0');
      return;
    }

    try {
      setIsCommitting(true);

      const result = await commitNewStock({
        supplierName,
        invoiceNumber,
        invoiceDate,
        sourceType: activeMode,
        items: validItems,
      });

      // Refresh cache/queries
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });

      toast.success(
        `Successfully recorded delivery! Recorded ₹${result.totalAmount.toLocaleString()} across ${result.itemsProcessed} products.`
      );

      // Reset state and set next auto-incremented invoice number for next entry
      setReviewItems([]);
      setOcrFile(null);
      setExcelFileName(null);
      
      const nextInv = await getNextInvoiceNumber();
      setInvoiceNumber(nextInv);
    } catch (err: any) {
      toast.error('Failed to commit stock delivery: ' + err.message);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
          New Stock Delivery Entry
        </h1>
        <p className="text-sm text-slate-500">
          Record incoming supplier deliveries via OCR AI invoice scan or Excel spreadsheet
        </p>
      </div>

      {/* STEP 1: Supplier & Invoice Manual Entry Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <div className="w-7 h-7 bg-emerald-100 text-emerald-800 rounded-lg flex items-center justify-center font-bold text-xs">
            1
          </div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Supplier & Invoice Details
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Supplier Name with Autocomplete */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              Supplier Name *
            </label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => {
                setSupplierName(e.target.value);
                setShowSupplierDropdown(true);
              }}
              onFocus={() => setShowSupplierDropdown(true)}
              placeholder="e.g. Amul Dairy & Foods"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />

            {/* Autocomplete Dropdown */}
            {showSupplierDropdown && supplierName.trim().length > 0 && filteredSuppliers.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden max-h-48 overflow-y-auto">
                <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Existing Suppliers
                </div>
                {filteredSuppliers.map((sup) => (
                  <button
                    key={sup.id}
                    type="button"
                    onClick={() => {
                      setSupplierName(sup.name);
                      setShowSupplierDropdown(false);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 transition flex items-center justify-between"
                  >
                    <span>{sup.name}</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      Pending: ₹{sup.totalPending || 0}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-1">
              If new, supplier will be created automatically.
            </p>
          </div>

          {/* Invoice Number */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                Invoice Number *
              </label>
              <button
                type="button"
                onClick={handleRefreshInvoiceNumber}
                title="Generate next auto-incremented invoice number"
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md transition flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Auto-Next
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. 101 or INV-101"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Auto-incremented from last invoice (e.g., 101 → 102). You can also edit manually.
            </p>
          </div>

          {/* Invoice Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              Invoice Date *
            </label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
          </div>

        </div>
      </div>

      {/* STEP 2: Import Method Selector Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-emerald-100 text-emerald-800 rounded-lg flex items-center justify-center font-bold text-xs">
              2
            </div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Choose Import Method
            </h2>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveMode('ocr')}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeMode === 'ocr'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Scan className="w-3.5 h-3.5 text-emerald-600" />
              OCR AI Invoice Scan
            </button>
            <button
              onClick={() => setActiveMode('excel')}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeMode === 'excel'
                  ? 'bg-white text-blue-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
              Excel Stock Import
            </button>
          </div>
        </div>

        {/* MODE A: OCR AI INVOICE SCAN */}
        {activeMode === 'ocr' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-emerald-300 bg-emerald-50/40 rounded-2xl p-6 text-center hover:bg-emerald-50/80 transition cursor-pointer relative">
              <input
                type="file"
                accept="image/jpeg, image/png, image/webp, application/pdf"
                onChange={handleOcrFileUpload}
                disabled={!isMetadataValid || isOcrProcessing}
                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-3">
                <Scan className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                Upload Supplier Invoice Photo or PDF
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Gemini AI will automatically extract product line items, quantities, MRPs, cost rates, and expiry dates.
              </p>

              {!isMetadataValid && (
                <p className="text-xs font-bold text-emerald-700 mt-3 bg-emerald-100/80 py-1 px-3 rounded-md inline-block">
                  ⚠️ Fill Supplier Name, Invoice Number & Date above to unlock upload
                </p>
              )}

              {isOcrProcessing && (
                <div className="flex items-center justify-center gap-2 mt-4 text-xs font-bold text-emerald-700 animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  Gemini AI analyzing invoice image...
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODE B: EXCEL STOCK IMPORT */}
        {activeMode === 'excel' && (
          <div className="space-y-4">
            <div
              onClick={() => {
                if (isMetadataValid) excelInputRef.current?.click();
                else toast.error('Please enter Supplier Name, Invoice Number, and Date first!');
              }}
              className="border-2 border-dashed border-emerald-300/80 bg-emerald-50/40 rounded-2xl p-6 text-center hover:bg-emerald-50/80 transition cursor-pointer"
            >
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleExcelUpload}
                disabled={!isMetadataValid || isExcelParsing}
                className="hidden"
              />
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                Upload Stock Delivery Spreadsheet (.xlsx, .xls, .csv)
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Auto-detects product columns. Applies defaults for missing values (Qty=0, Price=0, MinStock=10).
              </p>

              {!isMetadataValid && (
                <p className="text-xs font-bold text-emerald-700 mt-3 bg-emerald-100/80 py-1 px-3 rounded-md inline-block">
                  ⚠️ Fill Supplier Name, Invoice Number & Date above to unlock upload
                </p>
              )}

              {isExcelParsing && (
                <div className="flex items-center justify-center gap-2 mt-4 text-xs font-bold text-emerald-700 animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  Parsing spreadsheet file...
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* STEP 3: Review & Edit Extracted Line Items */}
      {reviewItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-emerald-100 text-emerald-800 rounded-lg flex items-center justify-center font-bold text-xs">
                3
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Review & Confirm Delivery Items
                </h2>
                <p className="text-xs text-slate-500">
                  Verify or edit extracted rates & quantities before committing to inventory
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAddBlankRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>

              <div className="text-right">
                <div className="text-xs text-slate-400 font-medium">Total Invoice Value</div>
                <div className="text-base font-extrabold text-emerald-800">
                  ₹{calculatedTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          {/* Review Table */}
          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3">Product Name *</th>
                  <th className="p-3 w-24">Qty *</th>
                  <th className="p-3 w-28">Cost Price (₹)</th>
                  <th className="p-3 w-28">MRP (₹)</th>
                  <th className="p-3 w-28">Selling Price (₹)</th>
                  <th className="p-3 w-32">Expiry Date</th>
                  <th className="p-3 w-12 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reviewItems.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50/80 transition">
                    
                    {/* Name */}
                    <td className="p-2.5">
                      <input
                        type="text"
                        value={item.productName}
                        onChange={(e) => handleUpdateItem(index, 'productName', e.target.value)}
                        placeholder="e.g. Pistachio Cannoli"
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </td>

                    {/* Qty */}
                    <td className="p-2.5">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleUpdateItem(index, 'quantity', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </td>

                    {/* Purchase Price */}
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="0.01"
                        value={item.purchasePrice}
                        onChange={(e) => handleUpdateItem(index, 'purchasePrice', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </td>

                    {/* MRP */}
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="0.01"
                        value={item.mrp}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          handleUpdateItem(index, 'mrp', val);
                          if (!item.sellingPrice) handleUpdateItem(index, 'sellingPrice', val);
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </td>

                    {/* Selling Price */}
                    <td className="p-2.5">
                      <input
                        type="number"
                        step="0.01"
                        value={item.sellingPrice}
                        onChange={(e) => handleUpdateItem(index, 'sellingPrice', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-emerald-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </td>

                    {/* Expiry Date */}
                    <td className="p-2.5">
                      <input
                        type="date"
                        value={item.expiryDate || ''}
                        onChange={(e) => handleUpdateItem(index, 'expiryDate', e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </td>

                    {/* Action */}
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(index)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-slate-400" />
              This will update product stock levels, record a PurchaseHistory doc, log StockHistory, and set Supplier balance.
            </div>

            <button
              type="button"
              onClick={handleConfirmStockImport}
              disabled={isCommitting || reviewItems.length === 0}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-md cursor-pointer disabled:opacity-50"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Committing Stock Delivery...
                </>
              ) : (
                <>
                  <PackageCheck className="w-4 h-4" />
                  Confirm & Commit Delivery ({reviewItems.length} Products)
                </>
              )}
            </button>
          </div>

        </div>
      )}

    </div>
  );
};
