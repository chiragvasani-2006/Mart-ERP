import { create } from 'zustand';
import { NavItem } from '../types';

export interface ProductSearchProjection {
  id: string;
  name: string;
  nameLower: string;
  barcode: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  minStock: number;
  expiryDate?: string | null;
}

interface AppState {
  activeTab: NavItem;
  setActiveTab: (tab: NavItem) => void;
  isMobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
  
  // Product Search Projection Index for POS & fast search
  productSearchIndex: ProductSearchProjection[];
  barcodeMap: Map<string, ProductSearchProjection>;
  isProductIndexLoaded: boolean;
  setProductSearchIndex: (products: ProductSearchProjection[]) => void;
  lookupByBarcode: (barcode: string) => ProductSearchProjection | undefined;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'dashboard',
  setActiveTab: (tab: NavItem) => set({ activeTab: tab, isMobileSidebarOpen: false }),
  isMobileSidebarOpen: false,
  setMobileSidebarOpen: (open: boolean) => set({ isMobileSidebarOpen: open }),
  toggleMobileSidebar: () => set((state) => ({ isMobileSidebarOpen: !state.isMobileSidebarOpen })),

  productSearchIndex: [],
  barcodeMap: new Map(),
  isProductIndexLoaded: false,

  setProductSearchIndex: (products) => {
    const map = new Map<string, ProductSearchProjection>();
    for (const p of products) {
      if (p.barcode) {
        map.set(p.barcode.trim().toLowerCase(), p);
      }
    }
    set({
      productSearchIndex: products,
      barcodeMap: map,
      isProductIndexLoaded: true,
    });
  },

  lookupByBarcode: (barcode: string) => {
    if (!barcode) return undefined;
    const clean = barcode.trim().toLowerCase();
    const map = get().barcodeMap;

    // 1. Direct exact barcode match
    let match = map.get(clean);
    if (match) return match;

    // 2. Handle UPC-A (12 digits) <-> EAN-13 (13 digits with leading zero)
    if (clean.length === 12) {
      match = map.get('0' + clean);
      if (match) return match;
    } else if (clean.length === 13 && clean.startsWith('0')) {
      match = map.get(clean.substring(1));
      if (match) return match;
    }

    // 3. Handle leading zero stripping
    const stripped = clean.replace(/^0+/, '');
    if (stripped.length >= 6) {
      for (const [key, prod] of map.entries()) {
        if (key.replace(/^0+/, '') === stripped) {
          return prod;
        }
      }
    }

    return undefined;
  },
}));

