import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Building2, GitBranch, Barcode, AlertCircle, RefreshCw, Check } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { useOndiStore } from "@/store/useOndiStore";
import { ondiDisconnect } from "@/integrations/ondi/client";
import {
  clearOndiCache,
  listInstitutions,
  listBranches,
  listBatches,
  listBatchBarcodes,
  type OndiInstitution,
  type OndiBranch,
  type OndiBatch,
} from "@/integrations/ondi/api";
import { getPulledBatchIds, type PulledBatchInfo } from "@/integrations/supabase/tracking";
import { notifyError } from "@/lib/notify";
import OndiConnectForm from "./OndiConnectForm";

export interface PickedBatch {
  name: string; // suggested file/batch name (the prefix)
  values: string[];
  ondiBatchId?: string;
  institutionName?: string;
  branchName?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** allow selecting several batches at once (Multi Batch) vs a single batch (editor import) */
  multi?: boolean;
  onPick: (batches: PickedBatch[]) => void;
}

export default function OndiBatchPicker({ isOpen, onClose, multi = false, onPick }: Props) {
  const session = useOndiStore((s) => s.session);
  const connected = !!session;

  const [institutions, setInstitutions] = useState<OndiInstitution[]>([]);
  const [branches, setBranches] = useState<OndiBranch[]>([]);
  const [batches, setBatches] = useState<OndiBatch[]>([]);

  const [instUserId, setInstUserId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [loadingInst, setLoadingInst] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // which listed batches we've already pulled (ondiBatchId → project name + cached usage)
  const [pulled, setPulled] = useState<Record<string, PulledBatchInfo>>({});

  const loadInstitutions = useCallback(async (force = false) => {
    setLoadingInst(true);
    setError(null);
    try {
      setInstitutions(await listInstitutions({ force }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load institutions");
    } finally {
      setLoadingInst(false);
    }
  }, []);

  // load institutions whenever the dialog opens while connected
  useEffect(() => {
    if (isOpen && connected) loadInstitutions();
    if (!isOpen) {
      // reset selections on close
      setBranches([]);
      setBatches([]);
      setInstUserId("");
      setBranchId("");
      setSelected(new Set());
      setPulled({});
      setError(null);
    }
  }, [isOpen, connected, loadInstitutions]);

  const onSelectInstitution = async (id: string) => {
    setInstUserId(id);
    setBranchId("");
    setBranches([]);
    setBatches([]);
    setSelected(new Set());
    setPulled({});
    setLoadingBranches(true);
    setError(null);
    try {
      setBranches(await listBranches(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load branches");
    } finally {
      setLoadingBranches(false);
    }
  };

  // load (or refresh) batches for a branch. `force` busts the Ondi list cache.
  const loadBatches = async (id: string, force = false) => {
    setBranchId(id);
    setBatches([]);
    setPulled({});
    setSelected(new Set());
    setLoadingBatches(true);
    setError(null);
    try {
      const next = await listBatches(instUserId, id, { force });
      setBatches(next);
      // SMARTER: after batches load, do ONE batched lookup of which we already pulled
      try {
        setPulled(await getPulledBatchIds(next.map((b) => b.id)));
      } catch (e) {
        notifyError("Couldn't check pulled-before history", e);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load barcode batches");
    } finally {
      setLoadingBatches(false);
    }
  };

  const onSelectBranch = (id: string) => loadBatches(id);

  // explicit refresh control: bust the cache so the user gets a guaranteed-fresh list
  const refreshBatches = () => {
    clearOndiCache();
    if (branchId) loadBatches(branchId, true);
  };

  /**
   * Newest batch on top. Prefer the real created date (createdAt, from raw.created_at ||
   * raw.inserted_at). FALLBACK when no date field is present: sort by endSequence then
   * startSequence descending — a higher sequence number means a more recently created batch.
   */
  const sortedBatches = useMemo(() => {
    return [...batches].sort((a, b) => {
      if (a.createdAt && b.createdAt) return b.createdAt.localeCompare(a.createdAt);
      if (a.createdAt) return -1; // dated batches sort above undated ones
      if (b.createdAt) return 1;
      return (b.endSequence ?? 0) - (a.endSequence ?? 0) || (b.startSequence ?? 0) - (a.startSequence ?? 0);
    });
  }, [batches]);

  const toggle = (batchId: string) => {
    setSelected((prev) => {
      const next = new Set(multi ? prev : []);
      if (prev.has(batchId) && (multi || next.has(batchId))) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const handleUse = async () => {
    if (selected.size === 0) return;
    setPulling(true);
    setError(null);
    try {
      const chosen = batches.filter((b) => selected.has(b.id));
      const institutionName = institutions.find((i) => i.userId === instUserId)?.name;
      const branch = branches.find((b) => b.id === branchId);
      const branchName = branch ? `${branch.code} — ${branch.name}` : undefined;
      const picked: PickedBatch[] = [];
      for (const b of chosen) {
        const values = await listBatchBarcodes(b.id);
        if (values.length)
          picked.push({
            name: b.prefix,
            values,
            ondiBatchId: b.id,
            institutionName,
            branchName,
          });
      }
      if (picked.length === 0) {
        setError("These batches have no barcodes to pull.");
        return;
      }
      onPick(picked);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to pull barcodes");
    } finally {
      setPulling(false);
    }
  };

  const totalSelectedCodes = batches
    .filter((b) => selected.has(b.id))
    .reduce((n, b) => n + (b.quantity || 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Barcode className="h-5 w-5" />
            Pull barcode batches from Ondi
          </DialogTitle>
          <DialogDescription>
            {connected
              ? "Choose an institution and branch, then pick the barcode batch(es) to print."
              : "Connect your Ondi account to load barcode batches."}
          </DialogDescription>
        </DialogHeader>

        {!connected ? (
          <OndiConnectForm onConnected={loadInstitutions} />
        ) : (
          <div className="space-y-4 min-w-0">
            {/* connected as + disconnect */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Connected as {session?.email}</span>
              <button
                className="underline hover:text-foreground"
                onClick={() => {
                  ondiDisconnect();
                  setInstitutions([]);
                }}
              >
                Disconnect
              </button>
            </div>

            {/* Institution */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Institution
              </Label>
              <Select value={instUserId} onValueChange={onSelectInstitution} disabled={loadingInst}>
                <SelectTrigger className="min-w-0 [&>span]:truncate [&>span]:text-start">
                  <SelectValue placeholder={loadingInst ? "Loading…" : "Select institution"} />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((i) => (
                    <SelectItem key={i.userId} value={i.userId}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Branch */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" /> Branch
              </Label>
              <Select
                value={branchId}
                onValueChange={onSelectBranch}
                disabled={!instUserId || loadingBranches}
              >
                <SelectTrigger className="min-w-0 [&>span]:truncate [&>span]:text-start">
                  <SelectValue
                    placeholder={
                      loadingBranches ? "Loading…" : !instUserId ? "Select institution first" : "Select branch"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.code} — {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Batches */}
            {branchId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Barcode batches {multi ? "(pick one or more)" : ""}</Label>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    onClick={refreshBatches}
                  >
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </button>
                </div>

                {loadingBatches ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : sortedBatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No barcode batches for this branch yet.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {sortedBatches.map((b) => {
                      const isSel = selected.has(b.id);
                      const pulledInfo = pulled[b.id];
                      // AGE: prefer a real created date ("created Nd ago"); else show the
                      // sequence range as the secondary line.
                      const ageOrRange = b.createdAt
                        ? `created ${formatDistanceToNowStrict(new Date(b.createdAt))} ago`
                        : b.startSequence != null && b.endSequence != null
                          ? `#${b.startSequence}–${b.endSequence}`
                          : null;
                      return (
                        <div
                          key={b.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSel ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"
                          }`}
                          onClick={() => toggle(b.id)}
                        >
                          {/* visual only — the row's onClick owns toggling (avoids double-fire) */}
                          <Checkbox checked={isSel} className="pointer-events-none" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium font-mono truncate">{b.prefix}</p>
                              {/* STATUS chip — cheap, already in the data (no per-batch call) */}
                              {b.status && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                                  {b.status}
                                </Badge>
                              )}
                              {/* PULLED-BEFORE badge — project name in subtext, % used if synced */}
                              {pulledInfo && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 gap-0.5 border-primary/40 text-primary"
                                  title={`Already pulled into "${pulledInfo.projectName}"`}
                                >
                                  <Check className="h-2.5 w-2.5" /> Pulled
                                  {pulledInfo.cachedUsedPct != null ? ` · ${pulledInfo.cachedUsedPct}% used` : ""}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {b.quantity} codes
                              {ageOrRange ? ` · ${ageOrRange}` : ""}
                            </p>
                            {pulledInfo && (
                              <p className="text-xs text-muted-foreground truncate" title={pulledInfo.projectName}>
                                Pulled into: <bdi>{pulledInfo.projectName}</bdi>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose} disabled={pulling}>
                Cancel
              </Button>
              <Button onClick={handleUse} disabled={selected.size === 0 || pulling}>
                {pulling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Pulling…
                  </>
                ) : (
                  `Use ${selected.size || ""} ${multi ? "batch(es)" : "batch"}`.trim() +
                  (totalSelectedCodes ? ` · ${totalSelectedCodes} codes` : "")
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
