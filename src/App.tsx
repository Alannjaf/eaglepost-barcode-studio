import { useEffect, lazy, Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import LoginGate from "./components/ondi/LoginGate";
import { Loader2 } from "lucide-react";
import { useSettingsStore } from "./store/useSettingsStore";

// Route-level code splitting: each page becomes its own chunk, so the heavy
// editor deps (pdfjs / pdf-lib) only load when their route is actually opened.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectCodes = lazy(() => import("./pages/ProjectCodes"));
const NewProject = lazy(() => import("./pages/NewProject"));
const Index = lazy(() => import("./pages/Index"));
const Settings = lazy(() => import("./pages/Settings"));
const Help = lazy(() => import("./pages/Help"));
const MultiBatch = lazy(() => import("./pages/MultiBatch"));
const QuickPrint = lazy(() => import("./pages/QuickPrint"));
const BarcodeSearch = lazy(() => import("./pages/BarcodeSearch"));
const BranchStock = lazy(() => import("./pages/BranchStock"));
const Nesting = lazy(() => import("./pages/Nesting"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Initialize theme on app load
const ThemeInitializer = () => {
  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", systemDark);
    } else {
      root.classList.toggle("dark", theme === "dark");
    }
  }, [theme]);

  return null;
};

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeInitializer />
      <Toaster richColors position="top-right" />
      <LoginGate>
      <HashRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/new" element={<NewProject />} />
            <Route path="/projects/:id/codes" element={<ProjectCodes />} />
            <Route path="/editor" element={<Index />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/help" element={<Help />} />
            <Route path="/multi-batch" element={<MultiBatch />} />
            <Route path="/print" element={<QuickPrint />} />
            <Route path="/barcode-search" element={<BarcodeSearch />} />
            <Route path="/branches" element={<BranchStock />} />
            <Route path="/nesting" element={<Nesting />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </HashRouter>
      </LoginGate>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
