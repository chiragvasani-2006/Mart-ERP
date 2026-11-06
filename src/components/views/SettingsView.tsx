import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { 
  getStoreSettings, 
  updateStoreSettings, 
  exportAllCollectionsCSV, 
  exportAllCollectionsXLS, 
  resetSystemData 
} from '../../lib/dataService';
import { seedTestingData } from '../../lib/seedService';
import { 
  Building2, 
  Upload, 
  FileSpreadsheet, 
  FileText, 
  AlertTriangle, 
  Lock, 
  Trash2, 
  Save, 
  Store,
  X,
  CheckCircle2,
  Image as ImageIcon,
  Sparkles,
  Database,
  ShieldCheck,
  LogOut,
  Mail
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

const settingsSchema = z.object({
  appName: z.string().min(1, 'App Name is required'),
  storeName: z.string().min(1, 'Store Name is required'),
  phone: z.string().min(1, 'Phone number is required'),
  address: z.string().min(1, 'Address is required')
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export const SettingsView: React.FC = () => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, logout } = useAuthStore();

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [isExportingXLS, setIsExportingXLS] = useState(false);
  const [isSeedingData, setIsSeedingData] = useState(false);

  // Seed Sample Testing Data Handler
  const handleSeedTestingData = async () => {
    try {
      setIsSeedingData(true);
      const res = await seedTestingData();
      if (res.success) {
        toast.success(res.message);
        queryClient.invalidateQueries();
      } else {
        toast.error(res.message);
      }
    } catch (e: any) {
      toast.error('Seeding failed: ' + e.message);
    } finally {
      setIsSeedingData(false);
    }
  };

  // Danger Zone Modals State Flow:
  // Step 1: Warning Dialog -> Step 2: Password Dialog -> Step 3: Final Confirmation
  const [resetStep, setResetStep] = useState<0 | 1 | 2 | 3>(0);
  const [adminPassword, setAdminPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Fetch Store Settings
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['storeSettings'],
    queryFn: getStoreSettings
  });

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      appName: 'RetailFlow',
      storeName: 'Cannoli Bakery & Gourmet',
      phone: '+91 98765 43210',
      address: '123 Gourmet Lane, Bakery District'
    }
  });

  useEffect(() => {
    if (settingsData) {
      reset({
        appName: settingsData.appName || 'RetailFlow',
        storeName: settingsData.storeName || 'Cannoli Bakery & Gourmet',
        phone: settingsData.phone || '+91 98765 43210',
        address: settingsData.address || '123 Gourmet Lane, Bakery District'
      });
      setLogoUrl(settingsData.logoUrl || null);
    }
  }, [settingsData, reset]);

  // Save Settings Mutation
  const saveMutation = useMutation({
    mutationFn: (values: SettingsFormValues) => {
      return updateStoreSettings({
        ...values,
        logoUrl
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storeSettings'] });
      toast.success('Store settings saved successfully!');
    },
    onError: (err: any) => {
      toast.error('Failed to save settings: ' + err.message);
    }
  });

  const onSubmit = (values: SettingsFormValues) => {
    saveMutation.mutate(values);
  };

  // Image Upload with Client-Side Canvas Compression
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setLogoUrl(compressedDataUrl);
          toast.success('Logo uploaded & compressed!');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // CSV Export Handler
  const handleCSVExport = async () => {
    try {
      setIsExportingCSV(true);
      await exportAllCollectionsCSV();
      toast.success('CSV Backup exported successfully (6 collection files)');
    } catch (e: any) {
      toast.error('CSV export failed: ' + e.message);
    } finally {
      setIsExportingCSV(false);
    }
  };

  // XLS Export Handler
  const handleXLSExport = async () => {
    try {
      setIsExportingXLS(true);
      await exportAllCollectionsXLS();
      toast.success('Excel workbook exported successfully!');
    } catch (e: any) {
      toast.error('XLS export failed: ' + e.message);
    } finally {
      setIsExportingXLS(false);
    }
  };

  // Danger Zone Reset Execution
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = adminPassword.trim();
    if (!trimmed) {
      setPasswordError('Please enter admin password');
      return;
    }

    const isValidPass =
      trimmed === 'Admin' ||
      trimmed === 'admin' ||
      trimmed === 'admin123' ||
      trimmed.toLowerCase() === 'cvasani751';

    if (!isValidPass) {
      setPasswordError('Invalid Admin Password. Please enter valid password: Admin');
      return;
    }

    setPasswordError('');
    setResetStep(3); // Go to final confirmation
  };

  const handleExecuteReset = async () => {
    try {
      setIsResetting(true);
      const res = await resetSystemData(adminPassword);
      if (!res.success) {
        toast.error(res.message);
        setPasswordError(res.message);
        setResetStep(2); // Back to password step if failed
        return;
      }

      toast.success(res.message || 'System operational data wiped successfully!');
      queryClient.clear();
      queryClient.invalidateQueries();
      setResetStep(0);
      setAdminPassword('');
    } catch (e: any) {
      toast.error('System reset failed: ' + e.message);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      {/* Header */}
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <span>⚙️</span>
          Settings
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage store branding, business details, data backups, and system reset
        </p>
      </div>

      {/* CARD 0: Firebase Backend & Admin Account Status */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Firebase Cloud Backend & Admin Account
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] uppercase tracking-wider rounded-full border border-emerald-500/30 font-bold">
                  Active
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Master Admin Email: <span className="text-emerald-400 font-bold">admin@gmail.com</span>
              </p>
            </div>
          </div>
        </div>
     </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* CARD 1: App Branding */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-3">
            <span className="text-xl">🏪</span>
            <div>
              <h2 className="text-base font-bold text-slate-800">App Branding</h2>
              <p className="text-xs text-slate-500">Configure application identity and logo</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                App Name
              </label>
              <input
                type="text"
                {...register('appName')}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                placeholder="RetailFlow"
              />
              {errors.appName && (
                <p className="text-xs text-red-500 mt-1">{errors.appName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Logo
              </label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Store Logo" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-400" />
                  )}
                </div>

                <div className="space-y-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-slate-500" />
                    Upload Logo
                  </button>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl(null)}
                      className="block text-xs text-red-600 hover:underline"
                    >
                      Remove logo
                    </button>
                  )}
                  <p className="text-[11px] text-slate-400">Compressed automatically on upload</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: Store Information */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-3">
            <span className="text-xl">🏬</span>
            <div>
              <h2 className="text-base font-bold text-slate-800">Store Information</h2>
              <p className="text-xs text-slate-500">Business details displayed on invoices, reports, and printed receipts</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Store Name
                </label>
                <input
                  type="text"
                  {...register('storeName')}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  placeholder="Cannoli Bakery & Gourmet"
                />
                {errors.storeName && (
                  <p className="text-xs text-red-500 mt-1">{errors.storeName.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Phone
                </label>
                <input
                  type="text"
                  {...register('phone')}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                  placeholder="+91 98765 43210"
                />
                {errors.phone && (
                  <p className="text-xs text-red-500 mt-1">{errors.phone.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Address
              </label>
              <textarea
                rows={3}
                {...register('address')}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                placeholder="123 Gourmet Lane, Bakery District"
              />
              {errors.address && (
                <p className="text-xs text-red-500 mt-1">{errors.address.message}</p>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </form>

      {/* CARD 4: Backup & Restore */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-3">
          <span className="text-xl">💾</span>
          <div>
            <h2 className="text-base font-bold text-slate-800">Backup & Restore</h2>
            <p className="text-xs text-slate-500">Export complete database records across all transactional collections</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
                <FileText className="w-4 h-4 text-emerald-600" />
                CSV Data Export
              </div>
              <p className="text-xs text-slate-500">
                Exports individual CSV files for Products, Suppliers, Sales, Purchase History, and Stock History.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCSVExport}
              disabled={isExportingCSV}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl transition shadow-2xs cursor-pointer active:scale-95"
            >
              <FileText className="w-4 h-4 text-emerald-600" />
              {isExportingCSV ? 'Exporting CSV...' : 'Export CSV'}
            </button>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center gap-2 font-bold text-slate-800 text-xs uppercase tracking-wider mb-1">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Excel Workbook Export
              </div>
              <p className="text-xs text-slate-500">
                Exports a unified Excel workbook (.xlsx) containing structured sheets for every collection.
              </p>
            </div>
            <button
              type="button"
              onClick={handleXLSExport}
              disabled={isExportingXLS}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {isExportingXLS ? 'Exporting XLS...' : 'Export XLS'}
            </button>
          </div>
        </div>
      </div>

      {/* CARD 4: Danger Zone */}
      <div className="bg-red-50/40 rounded-2xl border-2 border-red-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3 border-b border-red-100 pb-3">
          <span className="text-xl">🔴</span>
          <div>
            <h2 className="text-base font-bold text-red-900">Danger Zone</h2>
            <p className="text-xs text-red-700">Irreversible administrative system actions</p>
          </div>
        </div>

        <div className="bg-white border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Reset System Data</h3>
            <p className="text-xs text-slate-500 max-w-lg mt-0.5">
              Permanently delete all transactional data across Products, Suppliers, Sales, Purchase History, and Stock History. Store branding is retained.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setResetStep(1)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition shadow-xs shrink-0 cursor-pointer active:scale-95"
          >
            <AlertTriangle className="w-4 h-4" />
            ⚠ Reset System Data
          </button>
        </div>
      </div>

      {/* DANGER ZONE MODAL FLOW */}
      {resetStep > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            
            <button
              onClick={() => { setResetStep(0); setAdminPassword(''); setPasswordError(''); }}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            {/* STEP 1: Warning Dialog */}
            {resetStep === 1 && (
              <div className="space-y-4">
                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-bold text-slate-900">Reset System Data Warning</h3>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    This action will <strong>permanently delete all operational records</strong> including:
                  </p>
                  <ul className="text-xs text-slate-500 text-left mt-3 bg-slate-50 p-3 rounded-lg space-y-1 list-disc list-inside">
                    <li>All Products catalog records</li>
                    <li>All Supplier accounts & balances</li>
                    <li>All Sales history & receipts</li>
                    <li>All Purchase History invoices</li>
                    <li>All Stock History movement logs</li>
                  </ul>
                  <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg mt-3 border border-amber-200">
                    Note: Store branding and contact settings will stay intact.
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => setResetStep(0)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setResetStep(2)}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Continue to Verification
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Password Prompt */}
            {resetStep === 2 && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Lock className="w-6 h-6" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-bold text-slate-900">Admin Authorization Required</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Enter your admin password to proceed with data deletion.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Admin Password
                  </label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => { setAdminPassword(e.target.value); setPasswordError(''); }}
                    placeholder="Enter password (default: Admin)"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    autoFocus
                  />
                  {passwordError && (
                    <p className="text-xs text-red-600 mt-1">{passwordError}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetStep(1)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    Verify Password
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: Final Confirmation */}
            {resetStep === 3 && (
              <div className="space-y-4 text-center">
                <div className="w-12 h-12 bg-red-600 text-white rounded-full flex items-center justify-center mx-auto mb-2 shadow-lg shadow-red-500/30">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Are you absolutely sure?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  This is the final confirmation. Once initiated, all transactional data will be permanently wiped from the database.
                </p>

                <div className="flex items-center gap-3 pt-4">
                  <button
                    onClick={() => setResetStep(0)}
                    disabled={isResetting}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                  >
                    Cancel & Keep Data
                  </button>
                  <button
                    onClick={handleExecuteReset}
                    disabled={isResetting}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-red-600/20 cursor-pointer disabled:opacity-50"
                  >
                    {isResetting ? 'Wiping System...' : 'Yes, Delete Everything'}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};
