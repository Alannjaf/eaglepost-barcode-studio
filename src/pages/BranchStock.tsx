import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Building2,
  Warehouse,
  RotateCw,
  Loader2,
  ArrowRight,
  AlertTriangle,
  PackagePlus,
} from "lucide-react";
import { format } from "date-fns";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  getUsageByProject,
  bulkSyncUsageFromOndi,
  stockStatus,
  type UsageCounts,
  type StockStatus,
} from "@/integrations/supabase/tracking";

interface ProjectRow {
  id: string;
  name: string;
  branch_name: string | null;
  institution_name: string | null;
  ondi_batch_id: string | null;
  printed_at: string | null;
}

type Status = StockStatus;

interface Branch {
  key: string;
  branchName: string;
  institutionName: string | null;
  projects: ProjectRow[];
  /** the project we navigate to when the branch is clicked */
  primaryProjectId: string;
  total: number;
  used: number;
  unused: number;
  /** % of codes used (0–100) */
  usedPct: number;
  /** % of codes still unused (0–100) */
  unusedPct: number;
  /** whether ANY of this branch's batches has synced usage at least once */
  synced: boolean;
  lastSyncedAt: string | null;
  status: Status;
}

const STATUS_ORDER: Record<Status, number> = { critical: 0, low: 1, ok: 2 };

const statusStyles: Record<
  Status,
  { label: string; badge: string; bar: string; ring: string }
> = {
  critical: {
    label: "Prepare new batch",
    badge: "bg-destructive/15 text-destructive border-destructive/30",
    bar: "[&>div]:bg-destructive",
    ring: "border-destructive/40",
  },
  low: {
    label: "Running low",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    bar: "[&>div]:bg-amber-500",
    ring: "border-amber-500/30",
  },
  ok: {
    label: "In stock",
    badge: "bg-success/15 text-success border-success/30",
    bar: "[&>div]:bg-success",
    ring: "border-border",
  },
};

export default function BranchStock() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [usage, setUsage] = useState<Record<string, UsageCounts>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    document.title = "Branch Stock | BarcodeGo";
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data, error }, usageByProject] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, branch_name, institution_name, ondi_batch_id, printed_at")
          .order("branch_name", { ascending: true }),
        getUsageByProject(),
      ]);
      if (error) throw error;
      setProjects((data as ProjectRow[]) ?? []);
      setUsage(usageByProject);
    } catch (e) {
      notifyError("Couldn't load branch stock", e);
    } finally {
      setLoading(false);
    }
  };

  const branches = useMemo<Branch[]>(() => {
    // Only Ondi branch batches have a branch_name; skip the rest.
    const byBranch = new Map<string, ProjectRow[]>();
    for (const p of projects) {
      const name = p.branch_name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const list = byBranch.get(key) ?? [];
      list.push(p);
      byBranch.set(key, list);
    }

    const out: Branch[] = [];
    for (const [key, list] of byBranch) {
      let total = 0;
      let used = 0;
      let synced = false;
      let lastSyncedAt: string | null = null;
      for (const p of list) {
        const u = usage[p.id];
        if (u) {
          total += u.total;
          used += u.used;
          synced = true;
          if (!lastSyncedAt || u.syncedAt > lastSyncedAt) lastSyncedAt = u.syncedAt;
        }
      }
      const unused = total - used;
      const usedPct = total > 0 ? Math.round((used / total) * 100) : 0;
      const unusedPct = total > 0 ? (unused / total) * 100 : 100;

      // Representative project: prefer one that actually has tracked codes, else the first.
      const primary = list.find((p) => usage[p.id]?.total) ?? list[0];

      out.push({
        key,
        branchName: list[0].branch_name as string,
        institutionName: list.find((p) => p.institution_name)?.institution_name ?? null,
        projects: list,
        primaryProjectId: primary.id,
        total,
        used,
        unused,
        usedPct,
        unusedPct,
        synced,
        lastSyncedAt,
        status: stockStatus({ total, used, unused, syncedAt: lastSyncedAt ?? "" }, synced),
      });
    }

    // Most-critical first; within a status, lowest remaining stock first.
    out.sort((a, b) => {
      const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (s !== 0) return s;
      if (a.unusedPct !== b.unusedPct) return a.unusedPct - b.unusedPct;
      return a.branchName.localeCompare(b.branchName);
    });
    return out;
  }, [projects, usage]);

  const summary = useMemo(() => {
    let critical = 0;
    let low = 0;
    for (const b of branches) {
      if (b.status === "critical") critical += 1;
      else if (b.status === "low") low += 1;
    }
    return { branches: branches.length, critical, low };
  }, [branches]);

  const handleRefresh = async () => {
    // every branch batch that came from Ondi
    const targets = projects
      .filter((p) => p.branch_name?.trim() && p.ondi_batch_id)
      .map((p) => ({ projectId: p.id, ondiBatchId: p.ondi_batch_id as string }));

    if (!targets.length) {
      notifyError("No Ondi branch batches to refresh yet.");
      return;
    }

    setRefreshing(true);
    let done = 0;
    const toastId = toast.loading(`Syncing usage from Ondi… 0/${targets.length}`);
    try {
      const res = await bulkSyncUsageFromOndi(targets, {
        concurrency: 5,
        onResult: () => {
          done += 1;
          toast.loading(`Syncing usage from Ondi… ${done}/${targets.length}`, { id: toastId });
        },
      });
      toast.dismiss(toastId);
      await load();
      if (res.failed) {
        notifySuccess(
          "Branch stock refreshed",
          `${res.ok} synced, ${res.failed} failed — check the failed batches.`
        );
      } else {
        notifySuccess("Branch stock refreshed", `${res.ok} batch${res.ok !== 1 ? "es" : ""} synced from Ondi.`);
      }
    } catch (e) {
      toast.dismiss(toastId);
      notifyError("Couldn't refresh from Ondi", e);
    } finally {
      setRefreshing(false);
    }
  };

  const showEmpty = !loading && branches.length === 0;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 max-w-[1100px]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Warehouse className="h-6 w-6 text-primary shrink-0" />
              Branch Stock
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Code usage per branch — spot which branches are low and need a fresh batch printed.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={handleRefresh}
            disabled={refreshing || loading}
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
            Refresh from Ondi
          </Button>
        </div>

        {/* Summary */}
        {!showEmpty && (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-lg border border-border bg-card">
              <p className="text-2xl font-bold text-foreground">{loading ? "—" : summary.branches}</p>
              <p className="text-xs text-muted-foreground">Branches tracked</p>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card">
              <p className="text-2xl font-bold text-destructive">{loading ? "—" : summary.critical}</p>
              <p className="text-xs text-muted-foreground">Need a new batch</p>
            </div>
            <div className="p-4 rounded-lg border border-border bg-card">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{loading ? "—" : summary.low}</p>
              <p className="text-xs text-muted-foreground">Running low</p>
            </div>
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground mt-3">Loading branch stock…</p>
          </div>
        ) : showEmpty ? (
          <div className="py-16 text-center border border-dashed border-border rounded-lg bg-card">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-foreground font-medium">No branch batches yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Pull a batch from Ondi to start tracking how many codes each branch has used.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button size="sm" className="gap-1.5" onClick={() => navigate("/print")}>
                <PackagePlus className="h-3.5 w-3.5" />
                Quick Print
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate("/multi-batch")}>
                Multi Batch
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {branches.map((b) => {
              const s = statusStyles[b.status];
              return (
                <button
                  key={b.key}
                  onClick={() => navigate(`/projects/${b.primaryProjectId}/codes`)}
                  className={`w-full text-left rounded-lg border bg-card p-4 sm:p-5 transition-colors hover:bg-muted/40 ${s.ring}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary shrink-0" />
                        <span className="truncate">{b.branchName}</span>
                      </p>
                      {b.institutionName && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{b.institutionName}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${s.badge}`}
                    >
                      {b.status !== "ok" && <AlertTriangle className="h-3 w-3" />}
                      {s.label}
                    </span>
                  </div>

                  {b.synced ? (
                    <>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                          <span className="text-muted-foreground">
                            <span className="font-semibold text-foreground">{b.total.toLocaleString()}</span> total
                          </span>
                          <span className="text-muted-foreground">
                            <span className="font-semibold text-foreground">{b.used.toLocaleString()}</span> used
                          </span>
                          <span className="text-muted-foreground">
                            <span className="font-semibold text-foreground">{b.unused.toLocaleString()}</span> unused
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-foreground shrink-0">{b.usedPct}%</span>
                      </div>
                      <Progress value={b.usedPct} className={`mt-2 h-2.5 ${s.bar}`} />
                      <p className="text-[11px] text-muted-foreground mt-2">
                        {b.projects.length > 1 ? `${b.projects.length} batches · ` : ""}
                        {b.lastSyncedAt
                          ? `usage synced ${format(new Date(b.lastSyncedAt), "MMM d, HH:mm")}`
                          : "not synced yet"}
                      </p>
                    </>
                  ) : (
                    <p className="text-[13px] text-muted-foreground mt-3">
                      {b.projects.length > 1 ? `${b.projects.length} batches · ` : ""}
                      Usage not synced yet — hit “Refresh from Ondi”.
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
