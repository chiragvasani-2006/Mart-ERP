import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDashboardMetrics } from '../../lib/dataService';
import { DollarSign, TrendingUp, Calendar, PackageCheck, RefreshCw } from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { data: metrics, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboardMetrics'],
    queryFn: fetchDashboardMetrics,
    staleTime: 0,
  });

  const formatCurrency = (amount?: number) => {
    const val = amount || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Real-time sales, profit & product metrics for Cannoli Bakery & Gourmet
          </p>
        </div>

        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition shadow-2xs self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          Refresh Metrics
        </button>
      </div>

      {/* Exactly 5 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* 1. Today's Sales */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Today's Sales
            </span>
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {isLoading ? (
              <div className="h-9 w-28 bg-slate-100 animate-pulse rounded-md"></div>
            ) : (
              formatCurrency(metrics?.todaySales)
            )}
          </div>
          <p className="text-xs text-slate-400 mt-2">Total gross revenue recorded today</p>
        </div>

        {/* 2. Monthly Sales */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Monthly Sales
            </span>
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {isLoading ? (
              <div className="h-9 w-28 bg-slate-100 animate-pulse rounded-md"></div>
            ) : (
              formatCurrency(metrics?.monthlySales)
            )}
          </div>
          <p className="text-xs text-slate-400 mt-2">Cumulative revenue for current month</p>
        </div>

        {/* 3. Today's Profit */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Today's Profit
            </span>
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {isLoading ? (
              <div className="h-9 w-28 bg-slate-100 animate-pulse rounded-md"></div>
            ) : (
              formatCurrency(metrics?.todayProfit)
            )}
          </div>
          <p className="text-xs text-slate-400 mt-2">Net profit generated today</p>
        </div>

        {/* 4. Monthly Profit */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Monthly Profit
            </span>
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {isLoading ? (
              <div className="h-9 w-28 bg-slate-100 animate-pulse rounded-md"></div>
            ) : (
              formatCurrency(metrics?.monthlyProfit)
            )}
          </div>
          <p className="text-xs text-slate-400 mt-2">Net profit generated this month</p>
        </div>

        {/* 5. Total Products */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Products
            </span>
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
              <PackageCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {isLoading ? (
              <div className="h-9 w-20 bg-slate-100 animate-pulse rounded-md"></div>
            ) : (
              metrics?.totalProducts || 0
            )}
          </div>
          <p className="text-xs text-slate-400 mt-2">SKUs in product catalog</p>
        </div>

      </div>
    </div>
  );
};
