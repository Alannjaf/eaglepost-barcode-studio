import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useProjectStore } from "@/store/useProjectStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  SlidersHorizontal,
  X,
  Barcode,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Filter,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

interface BarcodeEntry {
  value: string;
  projectId: string;
  projectName: string;
  barcodeType: string;
  source: "csv" | "sequence"; // whether from imported CSV or the next_code sequence
}

// Row shape returned by the get_barcode_search_data RPC.
interface BarcodeSearchRow {
  project_id: string;
  project_name: string;
  barcode_type: string;
  next_code: string | null;
  imported_count: number;
}

const BARCODE_TYPES = [
  { value: "all", label: "All Types" },
  { value: "code128", label: "Code 128" },
  { value: "ean13", label: "EAN-13" },
  { value: "ean8", label: "EAN-8" },
  { value: "upca", label: "UPC-A" },
  { value: "code39", label: "Code 39" },
  { value: "itf", label: "ITF" },
  { value: "codabar", label: "Codabar" },
  { value: "qr", label: "QR Code" },
];

type SortField = "value" | "project" | "type" | "source";
type SortDir = "asc" | "desc";

export default function BarcodeSearch() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<BarcodeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [duplicateFilter, setDuplicateFilter] = useState<"all" | "duplicates" | "unique" | "cross-project">("all");
  const duplicatesOnly = duplicateFilter !== "all";
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>("value");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Copy feedback
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  // Pagination
  const PAGE_SIZE = 100;
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    document.title = "Barcode Search | BarcodeGo";
    loadData();
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter, projectFilter, sourceFilter, duplicatesOnly]);

  const loadData = async () => {
    setLoading(true);

    // Step 1: Get lightweight project metadata (no large JSON arrays)
    const { data: projectMeta, error: metaError } = await supabase.rpc("get_barcode_search_data");

    if (metaError || !projectMeta) {
      console.error(metaError);
      setLoading(false);
      return;
    }

    const allEntries: BarcodeEntry[] = [];
    const typedMeta = projectMeta as BarcodeSearchRow[];

    // Add next_code entries from metadata (always fast)
    for (const p of typedMeta) {
      if (p.next_code && p.next_code.trim()) {
        allEntries.push({
          value: p.next_code.trim(),
          projectId: p.project_id,
          projectName: p.project_name,
          barcodeType: p.barcode_type,
          source: "sequence",
        });
      }
    }

    // Step 2: For projects with imported numbers, fetch in parallel batches
    const projectsWithImports = typedMeta.filter((p) => p.imported_count > 0);
    const BATCH = 5;
    for (let i = 0; i < projectsWithImports.length; i += BATCH) {
      const batch = projectsWithImports.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map((p) =>
          supabase.from("projects").select("id, settings").eq("id", p.project_id).maybeSingle()
        )
      );

      for (let j = 0; j < results.length; j++) {
        const { data: proj } = results[j];
        if (!proj) continue;
        const meta = batch[j];
        const settings = (proj.settings ?? {}) as { importedNumbers?: string[] };
        const imported: string[] = settings.importedNumbers || [];
        for (const val of imported) {
          if (val && val.trim()) {
            allEntries.push({
              value: val.trim(),
              projectId: meta.project_id,
              projectName: meta.project_name,
              barcodeType: meta.barcode_type,
              source: "csv",
            });
          }
        }
        // Remove sequence entry if it duplicates an imported value
        const seqIdx = allEntries.findIndex(
          (e) => e.projectId === meta.project_id && e.source === "sequence" && imported.some((v) => v.trim() === e.value)
        );
        if (seqIdx !== -1) allEntries.splice(seqIdx, 1);
      }
    }

    setEntries(allEntries);
    setLoading(false);
  };

  const projectNames = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((e) => map.set(e.projectId, e.projectName));
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== "all") count++;
    if (projectFilter !== "all") count++;
    if (sourceFilter !== "all") count++;
    if (duplicatesOnly) count++;
    return count;
  }, [typeFilter, projectFilter, sourceFilter, duplicatesOnly]);

  // Build a set of duplicate values and a map of value -> all projects that have it
  const { duplicateValues, duplicateProjectsMap } = useMemo(() => {
    const byValue = new Map<string, { projectId: string; projectName: string; nextCode: string }[]>();
    entries.forEach((e) => {
      const key = e.value.toLowerCase();
      if (!byValue.has(key)) byValue.set(key, []);
      const list = byValue.get(key)!;
      // Avoid duplicate project entries for the same value
      if (!list.some((x) => x.projectId === e.projectId)) {
        list.push({ projectId: e.projectId, projectName: e.projectName, nextCode: e.value });
      }
    });
    const dupes = new Set<string>();
    byValue.forEach((list, key) => {
      if (list.length > 1) dupes.add(key);
    });
    return { duplicateValues: dupes, duplicateProjectsMap: byValue };
  }, [entries]);

  const duplicateCount = duplicateValues.size;

  const filtered = useMemo(() => {
    let items = [...entries];

    // Text search — exact or partial match on value
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (e) =>
          e.value.toLowerCase().includes(q) ||
          e.projectName.toLowerCase().includes(q)
      );
    }

    if (typeFilter !== "all") {
      items = items.filter((e) => e.barcodeType === typeFilter);
    }

    if (projectFilter !== "all") {
      items = items.filter((e) => e.projectId === projectFilter);
    }

    if (sourceFilter !== "all") {
      items = items.filter((e) => e.source === sourceFilter);
    }

    if (duplicateFilter === "duplicates") {
      items = items.filter((e) => duplicateValues.has(e.value.toLowerCase()));
    } else if (duplicateFilter === "unique") {
      items = items.filter((e) => !duplicateValues.has(e.value.toLowerCase()));
    } else if (duplicateFilter === "cross-project") {
      items = items.filter((e) => {
        const list = duplicateProjectsMap.get(e.value.toLowerCase()) || [];
        return list.length > 1;
      });
    }

    // Sort
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "value":
          cmp = a.value.localeCompare(b.value);
          break;
        case "project":
          cmp = a.projectName.localeCompare(b.projectName);
          break;
        case "type":
          cmp = a.barcodeType.localeCompare(b.barcodeType);
          break;
        case "source":
          cmp = a.source.localeCompare(b.source);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return items;
  }, [entries, searchQuery, typeFilter, projectFilter, sourceFilter, duplicatesOnly, sortField, sortDir, duplicateValues]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const { setProject, setPendingCsvData } = useProjectStore();
  const { resetProject } = useWorkspaceStore();

  const openProject = (projectId: string, projectName: string) => {
    resetProject();
    setPendingCsvData(null);
    setProject(projectId, projectName, null);
    navigate("/editor");
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setProjectFilter("all");
    setSourceFilter("all");
    setDuplicateFilter("all");
  };

  const copyValue = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedValue(val);
    setTimeout(() => setCopiedValue(null), 2000);
  };

  const typeLabel = (t: string) =>
    BARCODE_TYPES.find((bt) => bt.value === t)?.label || t;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Search className="h-6 w-6 text-primary" />
              Barcode Search
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Search across all barcode values stored in your projects
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5">
            <RotateCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {/* Search Bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by barcode value or project name…"
              className="pl-9 h-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            variant={filtersOpen || activeFilterCount > 0 ? "default" : "outline"}
            size="sm"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="gap-1.5 h-10 px-4"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Advanced Filters */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleContent>
            <div className="p-4 bg-muted/30 rounded-lg border border-border space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Filter className="h-4 w-4" />
                  Advanced Filters
                </h3>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs gap-1">
                    <X className="h-3 w-3" />
                    Clear all
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Barcode Type */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Barcode Type</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BARCODE_TYPES.map((bt) => (
                        <SelectItem key={bt.value} value={bt.value} className="text-xs">
                          {bt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Project */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Project</Label>
                  <Select value={projectFilter} onValueChange={setProjectFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All Projects</SelectItem>
                      {projectNames.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Source */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Source</Label>
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All Sources</SelectItem>
                      <SelectItem value="csv" className="text-xs">CSV Import</SelectItem>
                      <SelectItem value="sequence" className="text-xs">Sequence</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Duplicates */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Duplicates ({duplicateCount})
                  </Label>
                  <Select value={duplicateFilter} onValueChange={(v) => setDuplicateFilter(v as typeof duplicateFilter)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All values</SelectItem>
                      <SelectItem value="duplicates" className="text-xs">Duplicates only</SelectItem>
                      <SelectItem value="cross-project" className="text-xs">Cross-project duplicates</SelectItem>
                      <SelectItem value="unique" className="text-xs">Unique only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loading ? (
              "Loading…"
            ) : (
              <>
                <span className="font-medium text-foreground">{filtered.length}</span>
                {" "}barcode{filtered.length !== 1 ? "s" : ""}
                {searchQuery || activeFilterCount > 0 ? " (filtered)" : ""}
                {" · "}
                <span>{entries.length} total across all projects</span>
              </>
            )}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Prev
              </Button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>

        {/* Results Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("value")}>
                  <span className="flex items-center gap-1 text-xs">
                    Barcode Value <SortIcon field="value" />
                  </span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("type")}>
                  <span className="flex items-center gap-1 text-xs">
                    Type <SortIcon field="type" />
                  </span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("project")}>
                  <span className="flex items-center gap-1 text-xs">
                    Project <SortIcon field="project" />
                  </span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("source")}>
                  <span className="flex items-center gap-1 text-xs">
                    Source <SortIcon field="source" />
                  </span>
                </TableHead>
                <TableHead className="text-xs w-[60px]">Copy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    Loading barcodes…
                  </TableCell>
                </TableRow>
              ) : paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <div className="space-y-2">
                      <Barcode className="h-10 w-10 mx-auto text-muted-foreground/40" />
                      <p className="text-muted-foreground">No barcodes found</p>
                      {(searchQuery || activeFilterCount > 0) && (
                        <Button variant="outline" size="sm" onClick={clearFilters} className="text-xs">
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((e, i) => {
                  const isDupe = duplicateValues.has(e.value.toLowerCase());
                  return (
                  <TableRow
                    key={`${e.projectId}-${e.value}-${i}`}
                    className={`group cursor-pointer ${isDupe ? "bg-destructive/5" : ""}`}
                    onClick={() => openProject(e.projectId, e.projectName)}
                  >
                    <TableCell className="font-mono text-xs max-w-[280px]">
                      <span className="truncate flex items-center gap-1.5" title={e.value}>
                        {isDupe && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                        {searchQuery.trim() ? highlightMatch(e.value, searchQuery) : e.value}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono whitespace-nowrap">
                        {typeLabel(e.barcodeType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[260px]">
                      {isDupe ? (
                        <div className="flex flex-wrap gap-1">
                          {(duplicateProjectsMap.get(e.value.toLowerCase()) || []).map((p) => (
                            <Badge
                              key={p.projectId}
                              variant={p.projectId === e.projectId ? "default" : "secondary"}
                              className="text-[10px] cursor-pointer hover:opacity-80"
                              onClick={(ev) => { ev.stopPropagation(); openProject(p.projectId, p.projectName); }}
                            >
                              {p.projectName}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-primary truncate block text-left" title={e.projectName}>
                          {e.projectName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={e.source === "csv" ? "default" : "secondary"}
                        className="text-[10px] whitespace-nowrap"
                      >
                        {e.source === "csv" ? "CSV" : "Sequence"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => copyValue(e.value)}
                      >
                        {copiedValue === e.value ? (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Bottom Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground flex items-center px-3">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

/** Highlight matching substring in the value */
function highlightMatch(text: string, query: string) {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase().trim());
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.trim().length);
  const after = text.slice(idx + query.trim().length);
  return (
    <>
      {before}
      <span className="bg-primary/20 text-primary font-semibold rounded px-0.5">{match}</span>
      {after}
    </>
  );
}
