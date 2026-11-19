import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Plus,
  FolderOpen,
  Clock,
  Barcode,
  TrendingUp,
  FileText,
  ArrowRight,
  Sparkles,
  Printer,
} from "lucide-react";
import { format } from "date-fns";

interface ProjectRow {
  id: string;
  name: string;
  next_code: string;
  updated_at: string;
}

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Dashboard | BarcodeGo";
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("projects")
      .select("id, name, next_code, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5);
    if (data) setProjects(data);
    setLoading(false);
  };

  // Stats
  const totalProjects = projects.length;
  const recentCount = projects.filter(p => {
    const updated = new Date(p.updated_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return updated > weekAgo;
  }).length;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welcome to BarcodeGo</h1>
            <p className="text-muted-foreground mt-1">Create and manage barcode overlays for your PDFs</p>
          </div>
          <Button
            onClick={() => navigate("/projects")}
            className="w-fit gap-2"
          >
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="stat-icon bg-primary/20">
              <FolderOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="stat-value">{totalProjects}</p>
              <p className="stat-label">Total Projects</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon bg-accent/20">
              <Clock className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="stat-value">{recentCount}</p>
              <p className="stat-label">Active This Week</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon bg-success/20">
              <Barcode className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="stat-value">Code128</p>
              <p className="stat-label">Default Format</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon bg-purple-500/20">
              <TrendingUp className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <p className="stat-value">PDF</p>
              <p className="stat-label">Export Format</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Projects */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <h2 className="dashboard-card-title">Recent Projects</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/projects")}
                className="text-xs gap-1"
              >
                View All
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>

            {loading ? (
              <div className="py-8 text-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : projects.length === 0 ? (
              <div className="py-8 text-center">
                <FolderOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No projects yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate("/editor")}
                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/60 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Updated {format(new Date(p.updated_at), "MMM d")}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Start */}
          <div className="dashboard-card">
            <div className="dashboard-card-header">
              <h2 className="dashboard-card-title">Quick Start</h2>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => navigate("/print")}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 hover:from-primary/20 hover:to-primary/10 transition-all text-left border border-primary/20"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Printer className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Quick Print</p>
                  <p className="text-xs text-muted-foreground">Pick a branch's batch and print — no setup</p>
                </div>
              </button>

              <button
                onClick={() => navigate("/projects")}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-secondary/30 hover:bg-secondary/60 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Plus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Create New Project</p>
                  <p className="text-xs text-muted-foreground">Start a new barcode overlay project</p>
                </div>
              </button>

              <button
                onClick={() => navigate("/help")}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-secondary/30 hover:bg-secondary/60 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium text-foreground">View Tutorial</p>
                  <p className="text-xs text-muted-foreground">Learn how to use BarcodeGo</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
