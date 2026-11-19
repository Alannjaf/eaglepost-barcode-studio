import React from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderOpen,
  Settings,
  HelpCircle,
  Barcode,
  Layers,
  Search,
  LayoutGrid,
  Printer,
  Warehouse,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: <LayoutDashboard className="h-5 w-5 shrink-0" /> },
  { label: "Quick Print", href: "/print", icon: <Printer className="h-5 w-5 shrink-0" /> },
  { label: "Projects", href: "/projects", icon: <FolderOpen className="h-5 w-5 shrink-0" /> },
  { label: "Multi Batch", href: "/multi-batch", icon: <Layers className="h-5 w-5 shrink-0" /> },
  { label: "Branch Stock", href: "/branches", icon: <Warehouse className="h-5 w-5 shrink-0" /> },
  { label: "Nesting", href: "/nesting", icon: <LayoutGrid className="h-5 w-5 shrink-0" /> },
  { label: "Barcode Search", href: "/barcode-search", icon: <Search className="h-5 w-5 shrink-0" /> },
];

const bottomItems: NavItem[] = [
  { label: "Settings", href: "/settings", icon: <Settings className="h-5 w-5 shrink-0" /> },
  { label: "Help", href: "/help", icon: <HelpCircle className="h-5 w-5 shrink-0" /> },
];

interface AppSidebarProps {
  open?: boolean;
  onClose?: () => void;
  /** desktop icon-only collapse */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AppSidebar({ open = false, onClose, collapsed = false, onToggleCollapse }: AppSidebarProps) {
  const location = useLocation();

  // collapse only applies on desktop (lg+); the mobile drawer is always full-width.
  const itemClass = (active: boolean) =>
    cn("sidebar-nav-item", active && "active", collapsed && "lg:justify-center lg:px-0");
  const labelClass = cn(collapsed && "lg:hidden");

  return (
    <aside className={cn("app-sidebar transition-[width] duration-300", open && "open", collapsed && "lg:w-20")}>
      {/* Logo */}
      <div className={cn("sidebar-logo", collapsed && "lg:px-3 lg:justify-center")}>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-amber-400 flex items-center justify-center shrink-0">
          <Barcode className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className={labelClass}>
          <h1 className="text-lg font-bold text-foreground">BarcodeGo</h1>
          <p className="text-[10px] text-muted-foreground">PDF Overlay Tool</p>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav flex-1 custom-scrollbar overflow-y-auto">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onClose}
                title={collapsed ? item.label : undefined}
                className={itemClass(isActive)}
              >
                {item.icon}
                <span className={labelClass}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="space-y-1">
          {/* Collapse toggle — desktop only */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn("sidebar-nav-item w-full hidden lg:flex", collapsed && "lg:justify-center lg:px-0")}
            >
              {collapsed ? <ChevronsRight className="h-5 w-5 shrink-0" /> : <ChevronsLeft className="h-5 w-5 shrink-0" />}
              <span className={labelClass}>Collapse</span>
            </button>
          )}

          {bottomItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={onClose}
              title={collapsed ? item.label : undefined}
              className={itemClass(false)}
            >
              {item.icon}
              <span className={labelClass}>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* User Profile */}
        <div className={cn("mt-4 p-3 rounded-xl bg-sidebar-accent flex items-center gap-3", collapsed && "lg:justify-center lg:p-2")}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-teal-400 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-accent-foreground">U</span>
          </div>
          <div className={cn("flex-1 min-w-0", labelClass)}>
            <p className="text-sm font-medium text-sidebar-accent-foreground truncate">User</p>
            <p className="text-[10px] text-muted-foreground">Free Plan</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
