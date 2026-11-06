import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import toast from 'react-hot-toast';
import {
  ReportType,
  DateFilter,
  getDateRangeLabel,
  getSalesReportData,
  getPurchaseReportData,
  getProfitReportData,
  getStockReportData,
  getExpiryReportData,
  getSupplierReportData,
  exportReportToPDF,
  exportReportToExcel
} from '../../lib/reportsService';
import {
  BarChart3,
  FileSpreadsheet,
  FileText,
  Printer,
  Calendar,
  ShoppingBag,
  Receipt,
  TrendingUp,
  Package,
  CalendarOff,
  Users,
  Search,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown
} from 'lucide-react';
import { format } from 'date-fns';

export const ReportsView: React.FC = () => {
  const [activeReport, setActiveReport] = useState<ReportType>('sales');
  const [dateFilterType, setDateFilterType] = useState<DateFilter['type']>('today');
  const [customStartDate, setCustomStartDate] = useState<string>(
    format(new Date(), 'yyyy-MM-01')
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );

  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `RetailFlow_Report_${activeReport}_${format(new Date(), 'yyyyMMdd')}`,
  });

  const currentFilter: DateFilter = {
    type: dateFilterType,
    startDate: customStartDate,
    endDate: customEndDate,
  };

  const dateRangeLabel = getDateRangeLabel(currentFilter);

  // 1. Fetch Sales Report
  const { data: salesData, isLoading: isLoadingSales } = useQuery({
    queryKey: ['reports', 'sales', dateFilterType, customStartDate, customEndDate],
    queryFn: () => getSalesReportData(currentFilter),
    enabled: activeReport === 'sales',
  });

  // 2. Fetch Purchase Report
  const { data: purchaseData, isLoading: isLoadingPurchase } = useQuery({
    queryKey: ['reports', 'purchase', dateFilterType, customStartDate, customEndDate],
    queryFn: () => getPurchaseReportData(currentFilter),
    enabled: activeReport === 'purchase',
  });

  // 3. Fetch Profit Report
  const { data: profitData, isLoading: isLoadingProfit } = useQuery({
    queryKey: ['reports', 'profit', dateFilterType, customStartDate, customEndDate],
    queryFn: () => getProfitReportData(currentFilter),
    enabled: activeReport === 'profit',
  });

  // 4. Fetch Stock Report
  const { data: stockData, isLoading: isLoadingStock } = useQuery({
    queryKey: ['reports', 'stock'],
    queryFn: () => getStockReportData(),
    enabled: activeReport === 'stock',
  });

  // 5. Fetch Expiry Report
  const { data: expiryData, isLoading: isLoadingExpiry } = useQuery({
    queryKey: ['reports', 'expiry'],
    queryFn: () => getExpiryReportData(),
    enabled: activeReport === 'expiry',
  });

  // 6. Fetch Supplier Report
  const { data: supplierData, isLoading: isLoadingSupplier } = useQuery({
    queryKey: ['reports', 'supplier'],
    queryFn: () => getSupplierReportData(),
    enabled: activeReport === 'supplier',
  });

  // Export PDF Handler
  const handleExportPDF = async () => {
    try {
      if (activeReport === 'sales' && salesData) {
        const headers = ['Date', 'Time', 'Invoice #', 'Payment', 'Items', 'Subtotal (₹)', 'Discount (₹)', 'Total (₹)'];
        const rows = salesData.rows.map((r) => [
          r.date, r.time, r.invoiceNumber, r.paymentMethod, r.itemsCount, r.subtotal, r.discount, r.total
        ]);
        await exportReportToPDF('Sales Report', dateRangeLabel, headers, rows);
      } else if (activeReport === 'purchase' && purchaseData) {
        const headers = ['Invoice Date', 'Invoice #', 'Supplier', 'Source', 'Line Items', 'Amount (₹)', 'Status'];
        const rows = purchaseData.rows.map((r) => [
          r.invoiceDate, r.invoiceNumber, r.supplierName, r.sourceType, r.lineItemsCount, r.amount, r.paymentStatus
        ]);
        await exportReportToPDF('Purchase Report', dateRangeLabel, headers, rows);
      } else if (activeReport === 'profit' && profitData) {
        const headers = ['Date', 'Sales Count', 'Revenue (₹)', 'Profit (₹)', 'Margin (%)'];
        const rows = profitData.rows.map((r) => [
          r.date, r.salesCount, r.revenue, r.profit, `${r.marginPercent}%`
        ]);
        await exportReportToPDF('Profit Report', dateRangeLabel, headers, rows);
      } else if (activeReport === 'stock' && stockData) {
        const headers = ['Product', 'Barcode', 'Category', 'Stock Qty', 'Min Stock', 'Cost Price (₹)', 'Selling Price (₹)', 'Valuation (Cost) (₹)', 'Status'];
        const rows = stockData.rows.map((r) => [
          r.name, r.barcode, r.category, r.quantity, r.minStock, r.purchasePrice, r.sellingPrice, r.stockValuationAtCost, r.status
        ]);
        await exportReportToPDF('Stock Report', 'Current Snapshot', headers, rows);
      } else if (activeReport === 'expiry' && expiryData) {
        const headers = ['Product', 'Barcode', 'Stock Qty', 'Expiry Date', 'Remaining Days', 'Category Window', 'Status'];
        const rows = expiryData.rows.map((r) => [
          r.name, r.barcode, r.quantity, r.expiryDate, r.remainingDays < 0 ? `${r.remainingDays}d (Expired)` : `+${r.remainingDays}d`, r.bucketLabel, r.status
        ]);
        await exportReportToPDF('Expiry Report', 'Current Snapshot', headers, rows);
      } else if (activeReport === 'supplier' && supplierData) {
        const headers = ['Supplier Name', 'Total Purchase (₹)', 'Total Paid (₹)', 'Total Pending (₹)', 'Status'];
        const rows = supplierData.rows.map((r) => [
          r.name, r.totalPurchase, r.totalPaid, r.totalPending, r.status
        ]);
        await exportReportToPDF('Supplier Report', 'Current Snapshot', headers, rows);
      }
      toast.success('PDF report generated and downloaded.');
    } catch (err: any) {
      console.error('PDF export failed:', err);
      toast.error('Failed to export PDF');
    }
  };

  // Export Excel Handler
  const handleExportExcel = () => {
    try {
      if (activeReport === 'sales' && salesData) {
        const headers = ['Date', 'Time', 'Invoice Number', 'Payment Method', 'Items Count', 'Subtotal', 'Discount', 'Total'];
        const rows = salesData.rows.map((r) => [
          r.date, r.time, r.invoiceNumber, r.paymentMethod, r.itemsCount, r.subtotal, r.discount, r.total
        ]);
        exportReportToExcel('Sales_Report', headers, rows);
      } else if (activeReport === 'purchase' && purchaseData) {
        const headers = ['Invoice Date', 'Invoice Number', 'Supplier', 'Source', 'Line Items', 'Amount', 'Payment Status'];
        const rows = purchaseData.rows.map((r) => [
          r.invoiceDate, r.invoiceNumber, r.supplierName, r.sourceType, r.lineItemsCount, r.amount, r.paymentStatus
        ]);
        exportReportToExcel('Purchase_Report', headers, rows);
      } else if (activeReport === 'profit' && profitData) {
        const headers = ['Date', 'Sales Count', 'Revenue', 'Profit', 'Margin %'];
        const rows = profitData.rows.map((r) => [
          r.date, r.salesCount, r.revenue, r.profit, r.marginPercent
        ]);
        exportReportToExcel('Profit_Report', headers, rows);
      } else if (activeReport === 'stock' && stockData) {
        const headers = ['Product Name', 'Barcode', 'Category', 'Stock Qty', 'Min Stock', 'Purchase Price', 'Selling Price', 'Valuation (Cost)', 'Status'];
        const rows = stockData.rows.map((r) => [
          r.name, r.barcode, r.category, r.quantity, r.minStock, r.purchasePrice, r.sellingPrice, r.stockValuationAtCost, r.status
        ]);
        exportReportToExcel('Stock_Report', headers, rows);
      } else if (activeReport === 'expiry' && expiryData) {
        const headers = ['Product Name', 'Barcode', 'Stock Qty', 'Expiry Date', 'Remaining Days', 'Bucket Window', 'Status'];
        const rows = expiryData.rows.map((r) => [
          r.name, r.barcode, r.quantity, r.expiryDate, r.remainingDays, r.bucketLabel, r.status
        ]);
        exportReportToExcel('Expiry_Report', headers, rows);
      } else if (activeReport === 'supplier' && supplierData) {
        const headers = ['Supplier Name', 'Total Purchase', 'Total Paid', 'Total Pending', 'Status'];
        const rows = supplierData.rows.map((r) => [
          r.name, r.totalPurchase, r.totalPaid, r.totalPending, r.status
        ]);
        exportReportToExcel('Supplier_Report', headers, rows);
      }
      toast.success('Excel workbook downloaded.');
    } catch (err: any) {
      console.error('Excel export failed:', err);
      toast.error('Failed to export Excel file');
    }
  };

  const isCurrentSnapshotReport = activeReport === 'stock' || activeReport === 'expiry' || activeReport === 'supplier';

  return (
    <div className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="pb-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            Reports & Analytics
          </h1>
          <p className="text-sm text-slate-500">
            Generate and export operational reports derived live from shared store data
          </p>
        </div>

        {/* Export Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportPDF}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <FileText className="w-4 h-4 text-red-400" />
            PDF Export
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
            Excel Export
          </button>
          <button
            type="button"
            onClick={() => handlePrint && handlePrint()}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl shadow-2xs transition flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            Print
          </button>
        </div>
      </div>

      {/* REPORT TYPE SELECTOR TABS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <button
          type="button"
          onClick={() => setActiveReport('sales')}
          className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeReport === 'sales'
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          Sales
        </button>

        <button
          type="button"
          onClick={() => setActiveReport('purchase')}
          className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeReport === 'purchase'
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Purchase
        </button>

        <button
          type="button"
          onClick={() => setActiveReport('profit')}
          className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeReport === 'profit'
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Profit
        </button>

        <button
          type="button"
          onClick={() => setActiveReport('stock')}
          className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeReport === 'stock'
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
          }`}
        >
          <Package className="w-4 h-4" />
          Stock
        </button>

        <button
          type="button"
          onClick={() => setActiveReport('expiry')}
          className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeReport === 'expiry'
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
          }`}
        >
          <CalendarOff className="w-4 h-4" />
          Expiry
        </button>

        <button
          type="button"
          onClick={() => setActiveReport('supplier')}
          className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeReport === 'supplier'
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Supplier
        </button>
      </div>

      {/* DATE RANGE FILTER CONTROLS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2 text-slate-700 font-bold">
          <Calendar className="w-4 h-4 text-emerald-600" />
          <span>Report Scope:</span>
          <span className="text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 font-extrabold">
            {isCurrentSnapshotReport ? 'Live Current Snapshot' : dateRangeLabel}
          </span>
        </div>

        {!isCurrentSnapshotReport && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDateFilterType('today')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                dateFilterType === 'today'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDateFilterType('week')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                dateFilterType === 'week'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => setDateFilterType('month')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                dateFilterType === 'month'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              30 Days
            </button>
            <button
              type="button"
              onClick={() => setDateFilterType('custom')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                dateFilterType === 'custom'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Custom Range
            </button>

            {dateFilterType === 'custom' && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-md font-bold text-slate-800 focus:outline-hidden"
                />
                <span className="text-slate-400 font-bold">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-md font-bold text-slate-800 focus:outline-hidden"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* PRINTABLE CONTAINER & REPORT BODY */}
      <div ref={printRef} className="space-y-6">
        
        {/* ------------------------------------------------------------------ */}
        {/* 1. SALES REPORT VIEW                                               */}
        {/* ------------------------------------------------------------------ */}
        {activeReport === 'sales' && salesData && (
          <div className="space-y-4">
            
            {/* Sales Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Sales Revenue</p>
                <p className="text-2xl font-black text-emerald-700">₹{salesData.summary.totalRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Discount Given</p>
                <p className="text-2xl font-black text-amber-700">₹{salesData.summary.totalDiscount.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Items Sold</p>
                <p className="text-2xl font-black text-indigo-700">{salesData.summary.totalItemsSold.toLocaleString()} units</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Transactions</p>
                <p className="text-2xl font-black text-slate-900">{salesData.summary.totalSalesCount}</p>
              </div>
            </div>

            {/* Sales Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 overflow-x-auto">
              <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider mb-3">
                Sales Transaction Ledger ({salesData.rows.length} sales)
              </h3>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-3">Date & Time</th>
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Payment</th>
                    <th className="py-2.5 px-3 text-center">Items</th>
                    <th className="py-2.5 px-3 text-right">Subtotal</th>
                    <th className="py-2.5 px-3 text-right">Discount</th>
                    <th className="py-2.5 px-3 text-right">Total Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {salesData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No sales found within the selected date range.
                      </td>
                    </tr>
                  ) : (
                    salesData.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          {row.date} <span className="text-[10px] text-slate-400 font-normal">({row.time})</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{row.invoiceNumber}</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700">
                            {row.paymentMethod}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">{row.itemsCount}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-800">₹{row.subtotal.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-amber-700">₹{row.discount.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-black text-emerald-700">₹{row.total.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 font-extrabold text-xs bg-slate-50">
                  <tr>
                    <td colSpan={3} className="py-3 px-3 uppercase text-slate-800">Summary Total</td>
                    <td className="py-3 px-3 text-center text-indigo-700">{salesData.summary.totalItemsSold} units</td>
                    <td className="py-3 px-3 text-right text-slate-800">—</td>
                    <td className="py-3 px-3 text-right text-amber-700">₹{salesData.summary.totalDiscount.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right text-emerald-700">₹{salesData.summary.totalRevenue.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 2. PURCHASE REPORT VIEW                                            */}
        {/* ------------------------------------------------------------------ */}
        {activeReport === 'purchase' && purchaseData && (
          <div className="space-y-4">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Purchase Amount</p>
                <p className="text-2xl font-black text-slate-900">₹{purchaseData.summary.totalPurchaseAmount.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Invoices Imported</p>
                <p className="text-2xl font-black text-indigo-700">{purchaseData.summary.totalInvoicesCount}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 overflow-x-auto">
              <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider mb-3">
                Purchase Invoices ({purchaseData.rows.length} invoices)
              </h3>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-3">Invoice Date</th>
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Supplier</th>
                    <th className="py-2.5 px-3">Source Type</th>
                    <th className="py-2.5 px-3 text-center">Line Items</th>
                    <th className="py-2.5 px-3 text-right">Invoice Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {purchaseData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        No purchase invoices found within the selected date range.
                      </td>
                    </tr>
                  ) : (
                    purchaseData.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-800">{row.invoiceDate}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{row.invoiceNumber}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{row.supplierName}</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700">
                            {row.sourceType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">{row.lineItemsCount}</td>
                        <td className="py-2.5 px-3 text-right font-black text-slate-900">₹{row.amount.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 font-extrabold text-xs bg-slate-50">
                  <tr>
                    <td colSpan={5} className="py-3 px-3 uppercase text-slate-800">Total Purchase Volume</td>
                    <td className="py-3 px-3 text-right text-slate-900">₹{purchaseData.summary.totalPurchaseAmount.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 3. PROFIT REPORT VIEW                                              */}
        {/* ------------------------------------------------------------------ */}
        {activeReport === 'profit' && profitData && (
          <div className="space-y-4">
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Revenue</p>
                <p className="text-2xl font-black text-slate-900">₹{profitData.summary.totalRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Gross Profit</p>
                <p className="text-2xl font-black text-emerald-700">₹{profitData.summary.totalProfit.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Overall Profit Margin</p>
                <p className="text-2xl font-black text-indigo-700">{profitData.summary.overallMarginPercent}%</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 overflow-x-auto">
              <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider mb-3">
                Daily Profit Breakdown
              </h3>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-center">Sales Count</th>
                    <th className="py-2.5 px-3 text-right">Revenue</th>
                    <th className="py-2.5 px-3 text-right">Gross Profit</th>
                    <th className="py-2.5 px-3 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {profitData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        No profit data recorded for the selected date range.
                      </td>
                    </tr>
                  ) : (
                    profitData.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{row.date}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">{row.salesCount}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-800">₹{row.revenue.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-black text-emerald-700">₹{row.profit.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-indigo-700">{row.marginPercent}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 font-extrabold text-xs bg-slate-50">
                  <tr>
                    <td className="py-3 px-3 uppercase text-slate-800">Summary Total</td>
                    <td className="py-3 px-3 text-center text-slate-800">{profitData.summary.totalSalesCount} sales</td>
                    <td className="py-3 px-3 text-right text-slate-900">₹{profitData.summary.totalRevenue.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right text-emerald-700">₹{profitData.summary.totalProfit.toLocaleString()}</td>
                    <td className="py-3 px-3 text-right text-indigo-700">{profitData.summary.overallMarginPercent}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>

          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 4. STOCK REPORT VIEW                                               */}
        {/* ------------------------------------------------------------------ */}
        {activeReport === 'stock' && stockData && (
          <div className="space-y-4">
            
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Products</p>
                <p className="text-2xl font-black text-slate-900">{stockData.summary.totalProducts}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Units in Stock</p>
                <p className="text-2xl font-black text-indigo-700">{stockData.summary.totalStockUnits.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Low Stock / Out of Stock</p>
                <p className="text-2xl font-black text-amber-700">
                  {stockData.summary.lowStockCount} <span className="text-xs text-red-600">({stockData.summary.outOfStockCount} Out)</span>
                </p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Stock Valuation (Cost)</p>
                <p className="text-2xl font-black text-emerald-700">₹{stockData.summary.totalValuationCost.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 overflow-x-auto">
              <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider mb-3">
                Live Inventory Status Snapshot ({stockData.rows.length} products)
              </h3>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3 text-center">Stock Qty</th>
                    <th className="py-2.5 px-3 text-center">Min Stock</th>
                    <th className="py-2.5 px-3 text-right">Cost Price</th>
                    <th className="py-2.5 px-3 text-right">Selling Price</th>
                    <th className="py-2.5 px-3 text-right">Valuation (Cost)</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {stockData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No products available in database.
                      </td>
                    </tr>
                  ) : (
                    stockData.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{row.barcode}</td>
                        <td className="py-2.5 px-3 text-center font-extrabold text-slate-900">{row.quantity}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-500">{row.minStock}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-700">₹{row.purchasePrice}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">₹{row.sellingPrice}</td>
                        <td className="py-2.5 px-3 text-right font-black text-slate-900">₹{row.stockValuationAtCost.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-center">
                          {row.status === 'Out of Stock' ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-800">
                              Out of Stock
                            </span>
                          ) : row.status === 'Low Stock' ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                              Low Stock
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 5. EXPIRY REPORT VIEW                                             */}
        {/* ------------------------------------------------------------------ */}
        {activeReport === 'expiry' && expiryData && (
          <div className="space-y-4">
            
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Expired Products</p>
                <p className="text-2xl font-black text-red-600">{expiryData.summary.expiredCount}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Expiring in 30 Days</p>
                <p className="text-2xl font-black text-amber-600">{expiryData.summary.days30Count}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Expiring in 60 Days</p>
                <p className="text-2xl font-black text-yellow-600">{expiryData.summary.days60Count}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Expiring in 90 Days</p>
                <p className="text-2xl font-black text-slate-800">{expiryData.summary.days90Count}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 overflow-x-auto">
              <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider mb-3">
                Live Expiry Tracking Report ({expiryData.rows.length} relevant items)
              </h3>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3 text-center">Current Stock</th>
                    <th className="py-2.5 px-3">Expiry Date</th>
                    <th className="py-2.5 px-3">Remaining Days</th>
                    <th className="py-2.5 px-3 text-center">Window</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {expiryData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No products expiring within 90 days.
                      </td>
                    </tr>
                  ) : (
                    expiryData.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{row.barcode}</td>
                        <td className="py-2.5 px-3 text-center font-extrabold text-slate-900">{row.quantity}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">{row.expiryDate}</td>
                        <td className="py-2.5 px-3 font-extrabold">
                          {row.remainingDays < 0 ? (
                            <span className="text-red-600">{row.remainingDays} days</span>
                          ) : (
                            <span className="text-slate-800">+{row.remainingDays} days</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-600">{row.bucketLabel}</td>
                        <td className="py-2.5 px-3 text-center">
                          {row.status === 'Expired' ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-800">
                              Expired
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                              Expiring Soon
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 6. SUPPLIER REPORT VIEW                                           */}
        {/* ------------------------------------------------------------------ */}
        {activeReport === 'supplier' && supplierData && (
          <div className="space-y-4">
            
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Suppliers</p>
                <p className="text-2xl font-black text-slate-900">{supplierData.summary.totalSuppliers}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Purchase Volume</p>
                <p className="text-2xl font-black text-slate-900">₹{supplierData.summary.totalPurchase.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Paid Amount</p>
                <p className="text-2xl font-black text-emerald-700">₹{supplierData.summary.totalPaid.toLocaleString()}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <p className="text-[11px] font-black uppercase text-slate-500">Total Pending Balance</p>
                <p className="text-2xl font-black text-amber-700">₹{supplierData.summary.totalPending.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 overflow-x-auto">
              <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider mb-3">
                Supplier Ledger Snapshot ({supplierData.rows.length} suppliers)
              </h3>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-3">Supplier Name</th>
                    <th className="py-2.5 px-3 text-right">Total Purchase</th>
                    <th className="py-2.5 px-3 text-right">Total Paid</th>
                    <th className="py-2.5 px-3 text-right">Total Pending</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {supplierData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        No suppliers registered in database.
                      </td>
                    </tr>
                  ) : (
                    supplierData.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{row.name}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">₹{row.totalPurchase.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-700">₹{row.totalPaid.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-amber-700">₹{row.totalPending.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                            row.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : row.status === 'Partial'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>
        )}

      </div>

    </div>
  );
};
