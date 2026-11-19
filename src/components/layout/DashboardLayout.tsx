import React, { useState } from "react";
import { Menu, Barcode } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppSidebar } from "./AppSidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("sidebarCollapsed") === "1"; } catch { return false; }
  });
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("sidebarCollapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar
        open={open}
        onClose={() => setOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />

      {/* mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className={cn("flex-1 min-w-0 transition-[margin] duration-300", collapsed ? "lg:ml-20" : "lg:ml-96")}>
        {/* mobile top bar with hamburger */}
        <div className="lg:hidden sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card/95 backdrop-blur-md px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="p-2 -ml-2 rounded-lg hover:bg-muted text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-amber-400 flex items-center justify-center">
              <Barcode className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">BarcodeGo</span>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
