import React from 'react';
import { NavItem } from '../../types';
import { 
  Package, 
  PlusCircle, 
  Boxes, 
  ShoppingCart, 
  CalendarOff, 
  Users, 
  BarChart3,
  LucideIcon
} from 'lucide-react';

interface PlaceholderProps {
  tab: NavItem;
}

const META: Record<NavItem, { title: string; subtitle: string; icon: LucideIcon; phase: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview of business performance', icon: BarChart3, phase: 'Phase 1' },
  products: { title: 'Products Catalog', subtitle: 'Manage product details, pricing, barcodes & SKUs', icon: Package, phase: 'Phase 2' },
  'new-stock': { title: 'New Stock Entry', subtitle: 'Goods receiving via OCR Invoice import, Excel, or Manual entry', icon: PlusCircle, phase: 'Phase 3' },
  'stock-management': { title: 'Stock Management', subtitle: 'Stock level audits, low stock alerts & inventory adjustments', icon: Boxes, phase: 'Phase 4' },
  pos: { title: 'Point of Sale (POS)', subtitle: 'Fast counter checkout with instant barcode lookup & receipt printing', icon: ShoppingCart, phase: 'Phase 5' },
  expiry: { title: 'Expiry Tracker', subtitle: 'Monitor upcoming product expiries (30, 60, 90 days) & stock removal', icon: CalendarOff, phase: 'Phase 6' },
  suppliers: { title: 'Suppliers Ledger', subtitle: 'Track supplier balances, invoices & payments', icon: Users, phase: 'Phase 7' },
  reports: { title: 'Reports & Analytics', subtitle: 'Detailed sales, purchase, profit & stock reporting', icon: BarChart3, phase: 'Phase 8' },
  settings: { title: 'Settings', subtitle: 'App branding, store info & data management', icon: BarChart3, phase: 'Phase 1' },
};

export const PlaceholderView: React.FC<PlaceholderProps> = ({ tab }) => {
  const config = META[tab] || { title: tab, subtitle: 'Module placeholder', icon: Package, phase: 'Upcoming' };
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-6 shadow-xs border border-amber-200/60">
        <Icon className="w-8 h-8" />
      </div>

      <span className="px-3 py-1 bg-amber-50 text-amber-800 text-xs font-semibold rounded-full border border-amber-200 mb-3">
        Scheduled for {config.phase}
      </span>

      <h2 className="text-2xl font-bold text-slate-800 tracking-tight mb-2">
        {config.title}
      </h2>

      <p className="text-slate-500 max-w-md text-sm leading-relaxed mb-8">
        {config.subtitle}. This screen will be fully populated in the upcoming phase as part of RetailFlow's modular rollout.
      </p>

      <div className="bg-white border border-slate-200/80 rounded-xl p-5 max-w-lg w-full shadow-xs text-left">
        <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
          Phase 1 Active Core
        </div>
        <p className="text-sm text-slate-600">
          Settings page and live Dashboard metrics are fully functional. Navigate to <strong className="text-slate-800">Settings</strong> to configure store info & backup export, or view <strong className="text-slate-800">Dashboard</strong> for live metrics.
        </p>
      </div>
    </div>
  );
};
