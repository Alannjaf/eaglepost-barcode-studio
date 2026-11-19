import { useEffect, useMemo, useState } from "react";
import { safeFileName } from "@/utils/printJob";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Search,
  X,
  RotateCw,
  Copy,
  Check,
  Barcode,
  Loader2,
  Download,
  Building2,
} from "lucide-react";
import { format } from "date-fns";
import { notifyError, notifySuccess } from "@/lib/notify";
import { getProjectCodes, syncUsageFromOndi, type CodeRow } from "@/integrations/supabase/tracking";

interface ProjectMeta {
  id: string;
  name: string;
  ondi_batch_id: string | null;
  institution_name: string | null;
  branch_name: string | null;
  printed_at: string | null;
}

type StatusFilter = "all" | "used" | "unused";

export default function ProjectCodes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [copied, setCopied] = useState<string | null>(null);

  const PAGE_SIZE = 100;
  const [page, setPage] = useState(1);

  useEffect(() => {
    document.title = "Codes | BarcodeGo";
    if (id) void load(id);
  }, [id]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  const load = async (projectId: string) => {
    setLoading(true);
    try {
      const [{ data: meta, error: metaErr }, rows] = await Promise.all([
        supabase
          .from("projects")
          .select("id, name, ondi_batch_id, institution_name, branch_name, printed_at")
          .eq("id", projectId)
          .maybeSingle(),
        getProjectCodes(projectId),
      ]);
      if (metaErr) throw metaErr;
      setProject((meta as ProjectMeta) ?? null);
      setCodes(rows);
    } catch (e) {
      notifyError("Couldn't load codes", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!project?.id) return;
    if (!project.ondi_batch_id) {
      notifyError("This project wasn't pulled from Ondi, so there's no usage to sync.");
      return;
    }
    setSyncing(true);
    try {
      const counts = await syncUsageFromOndi({ projectId: project.id, ondiBatchId: project.ondi_batch_id });
      notifySuccess("Usage synced", `${counts.used} used / ${counts.unused} unused of ${counts.total}`);
      await load(project.id);
    } catch (e) {
      notifyError("Couldn't sync usage from Ondi", e);
    } finally {
      setSyncing(false);
    }
  };

  const counts = useMemo(() => {
    const used = codes.filter((c) => c.used).length;
    return { total: codes.length, used, unused: codes.length - used };
  }, [codes]);

  const lastSynced = useMemo(
    () => codes.find((c) => c.used_synced_at)?.used_synced_at ?? null,
    [codes]
  );

  const filtered = useMemo(() => {
    let items = codes;
    const q = query.trim().toLowerCase();
    if (q) items = items.filter((c) => c.code.toLowerCase().includes(q));
    if (statusFilter === "used") items = items.filter((c) => c.used);
    else if (statusFilter === "unused") items = items.filter((c) => !c.used);
    return items;
  }, [codes, query, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const copy = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopied(val);
    setTimeout(() => setCopied(null), 1500);
  };

  const exportCsv = () => {
    const header = "code,status,batch,last_synced\n";
    const body = filtered
      .map((c) =>
        [c.code, c.used ? "used" : "unused", c.batch_name ?? "", c.used_synced_at ?? ""]
          .map((f) => `"${String(f).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFileName(project?.name || "codes")} codes.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 max-w-[1100px]">
        {/* Header */}
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 h-8" onClick={() => navigate("/projects")}>
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Button>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Barcode className="h-6 w-6 text-primary shrink-0" />
                <span className="truncate">{project?.name ?? "Project codes"}</span>
              </h1>
              {project && (project.institution_name || project.branch_name) && (
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {[project.institution_name, project.branch_name].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={loading || !filtered.length}>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
              {project?.ondi_batch_id && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSync} disabled={syncing}>
                  {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                  Refresh from Ondi
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-lg border border-border bg-muted/20">
            <p className="text-2xl font-bold text-foreground">{counts.total}</p>
            <p className="text-xs text-muted-foreground">Total codes</p>
          </div>
          <div className="p-4 rounded-lg border border-border bg-muted/20">
            <p className="text-2xl font-bold text-primary">{counts.used}</p>
            <p className="text-xs text-muted-foreground">Used</p>
          </div>
          <div className="p-4 rounded-lg border border-border bg-muted/20">
            <p className="text-2xl font-bold text-foreground">{counts.unused}</p>
            <p className="text-xs text-muted-foreground">Unused</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-3">
          {lastSynced
            ? `Usage last synced ${format(new Date(lastSynced), "MMM d, HH:mm")}`
            : project?.ondi_batch_id
            ? "Usage not synced yet — hit Refresh from Ondi."
            : "This project wasn't pulled from Ondi — usage can't be synced."}
        </p>

        {/* Search + filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search code…"
              className="pl-9 h-10"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-36 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="used">Used</SelectItem>
              <SelectItem value="unused">Unused</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading…" : (
              <>
                <span className="font-medium text-foreground">{filtered.length}</span> code
                {filtered.length !== 1 ? "s" : ""}
                {query || statusFilter !== "all" ? " (filtered)" : ""}
              </>
            )}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Prev
              </Button>
              <span>Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-xs">Code</TableHead>
                <TableHead className="text-xs w-[110px]">Status</TableHead>
                <TableHead className="text-xs">Batch</TableHead>
                <TableHead className="text-xs w-[60px]">Copy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                    Loading codes…
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12">
                    <Barcode className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-muted-foreground">
                      {codes.length === 0 ? "No tracked codes for this project yet." : "No codes match the filter."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((c) => (
                  <TableRow key={c.id} className="group">
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell>
                      <Badge
                        variant={c.used ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {c.used ? "Used" : "Unused"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[260px]" title={c.batch_name ?? ""}>
                      {c.batch_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copy(c.code)}>
                        {copied === c.code ? (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
