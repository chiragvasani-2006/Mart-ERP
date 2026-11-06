import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../store/useStore';
import { useAuthStore } from '../../store/useAuthStore';
import { getStoreSettings } from '../../lib/dataService';
import { setupProductIndexListener } from '../../lib/productService';
import { seedTestingData } from '../../lib/seedService';
import { NavItem } from '../../types';
import { LoginView } from '../auth/LoginView';
import { DashboardView } from '../views/DashboardView';
import { ProductsView } from '../views/ProductsView';
import { NewStockView } from '../views/NewStockView';
import { StockManagementView } from '../views/StockManagementView';
import { SettingsView } from '../views/SettingsView';
import { POSBillingView } from '../views/POSBillingView';
import { ExpiryManagementView } from '../views/ExpiryManagementView';
import { SuppliersView } from '../views/SuppliersView';
import { ReportsView } from '../views/ReportsView';
import { PlaceholderView } from '../views/PlaceholderView';
import toast from 'react-hot-toast';
import {
  LayoutDashboard,
  Package,
  PlusCircle,
  Boxes,
  ShoppingCart,
  CalendarOff,
  Users,
  BarChart3,
  Settings,
  Menu,
  X,
  Store,
  ChevronRight,
  LogOut,
  User as UserIcon,
  Database,
  Loader2
} from 'lucide-react';

const NAV_ITEMS: { id: NavItem; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'new-stock', label: 'New Stock', icon: PlusCircle },
  { id: 'stock-management', label: 'Stock Management', icon: Boxes },
  { id: 'pos', label: 'POS', icon: ShoppingCart },
  { id: 'expiry', label: 'Expiry', icon: CalendarOff },
  { id: 'suppliers', label: 'Suppliers', icon: Users },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const AppShell: React.FC = () => {
  const { activeTab, setActiveTab, isMobileSidebarOpen, toggleMobileSidebar, setMobileSidebarOpen } = useAppStore();
  const productIndex = useAppStore((state) => state.productSearchIndex);
  const isProductIndexLoaded = useAppStore((state) => state.isProductIndexLoaded);

  const { user, isLoading: isAuthLoading, initAuth, logout } = useAuthStore();

  // Initialize Firebase Auth state listener
  useEffect(() => {
    const unsubscribe = initAuth();
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [initAuth]);

  // Initialize live Firestore product search index listener once at top-level when authenticated
  useEffect(() => {
    if (!user) return;
    const unsubscribe = setupProductIndexListener();
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [user]);

  const { data: storeSettings } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: getStoreSettings,
    enabled: !!user
  });

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
    } catch (err: any) {
      toast.error('Logout error: ' + err.message);
    }
  };

  // Loading Screen while Firebase Auth initializes
  if (isAuthLoading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100 font-sans">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
        <h2 className="text-lg font-bold">Cannoli ERP</h2>
        <p className="text-xs text-slate-400 mt-1">Connecting to Firebase Cloud Services...</p>
      </div>
    );
  }

  // Auth Guard: Render Login View if not logged in
  if (!user) {
    return <LoginView />;
  }

  const renderCurrentView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'products':
        return <ProductsView />;
      case 'new-stock':
        return <NewStockView />;
      case 'stock-management':
        return <StockManagementView />;
      case 'pos':
        return <POSBillingView />;
      case 'expiry':
        return <ExpiryManagementView />;
      case 'suppliers':
        return <SuppliersView />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <PlaceholderView tab={activeTab} />;
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-50 font-sans text-slate-900 antialiased">
      {/* TOP HEADER */}
      <header className="shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-3 flex items-center justify-between z-30 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMobileSidebar}
            className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {isMobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-2.5">
            {storeSettings?.logoUrl ? (
              <img
                src={storeSettings.logoUrl}
                alt="Store Logo"
                className="w-9 h-9 rounded-xl object-cover border border-slate-200 shadow-2xs"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-lg shadow-2xs">
                {storeSettings?.storeName?.[0] || 'C'}
              </div>
            )}

            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 tracking-tight text-base sm:text-lg">
                  {storeSettings?.appName || 'RetailFlow'}
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200 uppercase">
                  v1.0 POS
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate max-w-[180px] sm:max-w-xs">
                {storeSettings?.storeName || 'Cannoli Bakery & Gourmet'}
              </p>
            </div>
          </div>
        </div>

        {/* HEADER RIGHT: Firebase Status & Admin User Controls */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Live Firebase Cloud Status Indicator */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-xl border border-emerald-200/80">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <Database className="w-3.5 h-3.5 text-emerald-600" />
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200/80">
            <Store className="w-3.5 h-3.5 text-emerald-600" />
            <span>Counter 1</span>
          </div>

          {/* Admin User Badge */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="hidden lg:block text-right">
              <div className="text-xs font-bold text-slate-900 truncate max-w-[140px]">
                {user.email && user.email.toLowerCase() !== 'cvasani751@gmail.com' ? user.email : 'admin@gmail.com'}
              </div>
              <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
                System Admin
              </div>
            </div>

            <div className="w-8 h-8 rounded-full bg-slate-900 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 ring-2 ring-emerald-500/20">
              <UserIcon className="w-4 h-4" />
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              title="Sign Out of Firebase ERP"
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 flex-col shrink-0 py-4 px-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Navigation Menu
          </div>

          <nav className="space-y-1 flex-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 text-white/80" />}
                </button>
              );
            })}
          </nav>

          <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200/60 text-xs text-emerald-900 mt-auto space-y-1">
            <p className="font-bold">Cannoli Bakery & Gourmet</p>
            <p className="text-[11px] text-emerald-700/80">Firebase Live Cloud Backend</p>
            <div className="pt-1 text-[10px] font-mono text-emerald-800 border-t border-emerald-200/60 truncate">
              User: {user.email && user.email.toLowerCase() !== 'cvasani751@gmail.com' ? user.email : 'admin@gmail.com'}
            </div>
          </div>
        </aside>

        {/* MOBILE OVERLAY SIDEBAR */}
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
              onClick={() => setMobileSidebarOpen(false)}
            />

            <div className="relative w-72 bg-white h-full shadow-2xl flex flex-col py-4 px-3 space-y-1 z-50 animate-in slide-in-from-left duration-200">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 mb-2">
                <div>
                  <span className="font-bold text-slate-800 text-sm block">Cannoli ERP Menu</span>
                  <span className="text-[11px] text-emerald-600 font-mono font-medium">
                    {user.email && user.email.toLowerCase() !== 'cvasani751@gmail.com' ? user.email : 'admin@gmail.com'}
                  </span>
                </div>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="space-y-1 flex-1 overflow-y-auto">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition cursor-pointer ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                        <span>{item.label}</span>
                      </div>
                      {isActive && <ChevronRight className="w-4 h-4 text-white/80" />}
                    </button>
                  );
                })}
              </nav>

              <div className="pt-2 border-t border-slate-100 mt-auto">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl transition"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MAIN CONTENT CANVAS */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {renderCurrentView()}
          </div>
        </main>
      </div>
    </div>
  );
};
