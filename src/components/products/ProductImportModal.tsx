import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { batchImportProducts, ParsedImportRow } from '../../lib/productService';
import { useQueryClient } from '@tanstack/react-query';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  HelpCircle,
  FileText
} from 'lucide-react';

interface ProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ProductImportModal: React.FC<ProductImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number } | null>(null);

  if (!isOpen) return null;

  const normalizeKey = (key: string): string => {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsParsing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        // Convert sheet to json with raw headers
        const rawJson: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          toast.error('Selected file is empty or contains no data');
          setIsParsing(false);
          return;
        }

        // Map column names dynamically
        const mappedRows: ParsedImportRow[] = rawJson.map((row) => {
          let name = '';
          let quantity = 0;
          let purchasePrice = 0;
          let mrp = 0;
          let sellingPrice = 0;
          let minStock = 10;
          let expiryDate: string | null = null;
          let barcode = '';

          for (const key of Object.keys(row)) {
            const normKey = normalizeKey(key);
            const val = row[key];

            // Synonym Matching logic
            if (['productname', 'name', 'itemname', 'item', 'product'].includes(normKey)) {
              name = String(val).trim();
            } else if (['quantity', 'qty', 'stock', 'count'].includes(normKey)) {
              quantity = Number(val) || 0;
            } else if (['purchaseprice', 'costprice', 'cost', 'buyprice'].includes(normKey)) {
              purchasePrice = Number(val) || 0;
            } else if (['mrp', 'maxretailprice', 'listprice'].includes(normKey)) {
              mrp = Number(val) || 0;
            } else if (['sellingprice', 'saleprice', 'price'].includes(normKey)) {
              sellingPrice = Number(val) || 0;
            } else if (['minimumstock', 'minstock', 'reorderlevel'].includes(normKey)) {
              minStock = Number(val) || 10;
            } else if (['expirydate', 'expiry', 'expdate'].includes(normKey)) {
              if (val) {
                // If excel serial date
                if (typeof val === 'number') {
                  const dateObj = XLSX.SSF.parse_date_code(val);
                  if (dateObj) {
                    expiryDate = `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}-${String(dateObj.d).padStart(2, '0')}`;
                  }
                } else {
                  expiryDate = String(val).trim();
                }
              }
            } else if (['barcode', 'upc', 'ean', 'code'].includes(normKey)) {
              barcode = String(val).trim();
            }
          }

          // If selling price wasn't specified, default to MRP
          if (!sellingPrice && mrp > 0) {
            sellingPrice = mrp;
          }

          const isValid = Boolean(name);

          return {
            name,
            quantity,
            purchasePrice,
            mrp,
            sellingPrice,
            minStock,
            expiryDate,
            barcode,
            isValid,
            validationError: isValid ? undefined : 'Missing Product Name',
          };
        });

        // Filter out completely empty rows
        const cleanedRows = mappedRows.filter(
          (r) => r.name || r.quantity > 0 || r.mrp > 0 || r.barcode
        );

        setParsedRows(cleanedRows);
        toast.success(`Parsed ${cleanedRows.length} rows from file`);
      } catch (err: any) {
        toast.error('Failed to parse file: ' + err.message);
      } finally {
        setIsParsing(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      toast.error('No valid products to import');
      return;
    }

    try {
      setIsImporting(true);
      setImportProgress({ processed: 0, total: validRows.length });

      const { updatedCount, createdCount } = await batchImportProducts(
        validRows,
        (processed, total) => {
          setImportProgress({ processed, total });
        }
      );

      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });

      toast.success(
        `Import completed! Created: ${createdCount} new products, Updated: ${updatedCount} existing products.`
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Import failed: ' + err.message);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const safeRows = parsedRows || [];
  const validCount = safeRows.filter((r) => r && r.isValid).length;
  const invalidCount = safeRows.length - validCount;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full p-6 shadow-2xl relative my-8 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Bulk Import Products (Excel/CSV)
              </h2>
              <p className="text-xs text-slate-500">
                Auto-detects columns and merges matching products by name
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          
          {/* File Upload Box */}
          {parsedRows.length === 0 ? (
            <div className="border-2 border-dashed border-slate-300 bg-slate-50 rounded-2xl p-8 text-center hover:bg-slate-100/80 transition cursor-pointer flex flex-col items-center justify-center"
                 onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mb-3">
                <Upload className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                Click to select Excel (.xlsx, .xls) or CSV file
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Supported columns: Product Name, Quantity, Purchase Price, MRP, Selling Price, Min Stock, Expiry Date, Barcode
              </p>
              {isParsing && (
                <div className="flex items-center gap-2 mt-4 text-xs font-semibold text-amber-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Parsing spreadsheet file...
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Summary Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>File: <strong>{fileName}</strong></span>
                  <span className="text-slate-400">({parsedRows.length} total rows)</span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {validCount} Ready to Import
                  </span>
                  {invalidCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {invalidCount} Skipped (No Name)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setParsedRows([]); setFileName(null); }}
                    className="text-slate-500 hover:text-slate-800 underline text-[11px]"
                  >
                    Change File
                  </button>
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto text-xs">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Product Name</th>
                      <th className="p-2.5">Qty</th>
                      <th className="p-2.5">MRP</th>
                      <th className="p-2.5">Selling Price</th>
                      <th className="p-2.5">Barcode</th>
                      <th className="p-2.5">Expiry</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className={row.isValid ? 'hover:bg-slate-50' : 'bg-red-50/40 text-slate-400'}>
                        <td className="p-2.5 whitespace-nowrap">
                          {row.isValid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[10px]">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600 font-semibold text-[10px]">
                              <AlertCircle className="w-3 h-3 text-red-500" />
                              Skipped
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 font-semibold">
                          {row.name || <span className="italic text-slate-400">(Blank)</span>}
                        </td>
                        <td className="p-2.5">{row.quantity}</td>
                        <td className="p-2.5">₹{row.mrp}</td>
                        <td className="p-2.5">₹{row.sellingPrice}</td>
                        <td className="p-2.5 font-mono text-[11px]">{row.barcode || '(Auto)'}</td>
                        <td className="p-2.5">{row.expiryDate || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p>
                  <strong>Merge Rule:</strong> Matching is performed by case-insensitive Product Name. If a product already exists, its quantity, MRP, selling price, min stock, and barcode will be updated. Otherwise, a new product is created.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
          >
            Cancel
          </button>

          {parsedRows.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isImporting || validCount === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {importProgress
                      ? `Importing (${importProgress.processed}/${importProgress.total})...`
                      : 'Importing Products...'}
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm Import ({validCount} Products)
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
