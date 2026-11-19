import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";
export type PageSize = "A4" | "Letter" | "Legal" | "A3";
export type BarcodeType = "code128" | "ean13" | "upc" | "qr";

interface SettingsState {
  theme: Theme;
  defaultPageSize: PageSize;
  defaultBarcodeType: BarcodeType;
  autoSave: boolean;
  showNotifications: boolean;
  /** Quick Print remembers the last template used, so it's one-click after the first time. */
  defaultPrintTemplateId: string | null;

  setTheme: (theme: Theme) => void;
  setDefaultPageSize: (size: PageSize) => void;
  setDefaultBarcodeType: (type: BarcodeType) => void;
  setAutoSave: (enabled: boolean) => void;
  setShowNotifications: (enabled: boolean) => void;
  setDefaultPrintTemplateId: (id: string | null) => void;
  resetSettings: () => void;
}

const defaultSettings = {
  theme: "dark" as Theme,
  defaultPageSize: "A4" as PageSize,
  defaultBarcodeType: "code128" as BarcodeType,
  autoSave: true,
  showNotifications: true,
  defaultPrintTemplateId: null as string | null,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      
      setDefaultPageSize: (defaultPageSize) => set({ defaultPageSize }),
      
      setDefaultBarcodeType: (defaultBarcodeType) => set({ defaultBarcodeType }),
      
      setAutoSave: (autoSave) => set({ autoSave }),
      
      setShowNotifications: (showNotifications) => set({ showNotifications }),

      setDefaultPrintTemplateId: (defaultPrintTemplateId) => set({ defaultPrintTemplateId }),

      resetSettings: () => {
        set(defaultSettings);
        applyTheme(defaultSettings.theme);
      },
    }),
    {
      name: "barcodego-settings",
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          applyTheme(state.theme);
        }
      },
    }
  )
);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  
  if (theme === "system") {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", systemDark);
  } else {
    root.classList.toggle("dark", theme === "dark");
  }
}

// Listen for system theme changes when in "system" mode
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    const { theme } = useSettingsStore.getState();
    if (theme === "system") {
      document.documentElement.classList.toggle("dark", e.matches);
    }
  });
}
