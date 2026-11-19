import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FolderOpen, Package } from "lucide-react";
import { format } from "date-fns";
import type { DuplicateSummary, PrintedFlag } from "@/integrations/supabase/tracking";

interface Props {
  open: boolean;
  summary: DuplicateSummary | null;
  /** batches already printed before — shown in an amber section above the duplicate section */
  printedBatches?: PrintedFlag[];
  /** label for the action that proceeds anyway (e.g. "Generate anyway", "Import anyway") */
  proceedLabel?: string;
  onProceed: () => void;
  onCancel: () => void;
  /** open the existing project so the user can see where the codes already live */
  onOpenProject?: (projectId: string, projectName: string) => void;
}

export default function DuplicateWarningDialog({
  open,
  summary,
  printedBatches = [],
  proceedLabel = "Generate anyway",
  onProceed,
  onCancel,
  onOpenProject,
}: Props) {
  const sampleCodes = summary?.matches.slice(0, 6).map((m) => m.code) ?? [];
  const firstDate = summary?.matches[0]?.created_at;
  const hasPrinted = printedBatches.length > 0;
  const hasDup = !!summary;

  const title =
    hasPrinted && hasDup
      ? "Already printed & generated"
      : hasPrinted
      ? "⚠️ Already printed"
      : "Already generated before";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {hasPrinted && (
              <>
                {printedBatches.length === 1
                  ? "1 of these batches was already printed before"
                  : `${printedBatches.length} of these batches were already printed before`}
                {hasDup ? ", and " : ". The printhouse may have already produced it."}
              </>
            )}
            {hasDup && (
              <>
                {summary?.total ?? 0} of these codes were already generated
                {firstDate ? ` (first on ${format(new Date(firstDate), "MMM d, yyyy")})` : ""}.
              </>
            )}{" "}
            Check below so you don't print duplicates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-72 overflow-y-auto">
          {/* Already-printed batches */}
          {hasPrinted && (
            <div className="space-y-2">
              {printedBatches.map((b, i) => (
                <div
                  key={b.name + i}
                  className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/5"
                >
                  <Package className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium font-mono truncate">{b.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Printed {format(new Date(b.printedAt), "MMM d, yyyy")} · {b.projectName}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Existing projects the codes already live in */}
          {(summary?.projects ?? []).map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border"
            >
              <FolderOpen className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.count} matching code(s)</p>
              </div>
              {onOpenProject && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onOpenProject(p.id, p.name)}
                >
                  Open
                </Button>
              )}
            </div>
          ))}

          {/* A few sample duplicate codes */}
          {sampleCodes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sampleCodes.map((c) => (
                <span key={c} className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                  {c}
                </span>
              ))}
              {(summary?.total ?? 0) > sampleCodes.length && (
                <span className="text-xs text-muted-foreground px-2 py-0.5">
                  +{(summary?.total ?? 0) - sampleCodes.length} more
                </span>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="bg-amber-500 text-white hover:bg-amber-600"
            onClick={onProceed}
          >
            {proceedLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
