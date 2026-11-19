import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Printer,
  Barcode,
  Loader2,
  Trash2,
  FileText,
  Package,
  Building2,
  CheckCircle2,
} from "lucide-react";
import OndiBatchPicker, { type PickedBatch } from "@/components/ondi/OndiBatchPicker";
import { notifyError, notifySuccess } from "@/lib/notify";
import { flagPrintedBatches, type PrintedFlag } from "@/integrations/supabase/tracking";
import DuplicateWarningDialog from "@/components/DuplicateWarningDialog";
import {
  generatePrintPdf,
  createPrintedProjects,
  downloadPdf,
  openAndPrint,
  branchCodeName,
} from "@/utils/printJob";

interface TemplateRow {
  id: string;
  name: string;
  current_design_file_id: string | null;
}

export default function QuickPrint() {
  const navigate = useNavigate();
  const defaultPrintTemplateId = useSettingsStore((s) => s.defaultPrintTemplateId);
  const setDefaultPrintTemplateId = useSettingsStore((s) => s.setDefaultPrintTemplateId);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templateId, setTemplateId] = useState<string>("");

  const [showOndi, setShowOndi] = useState(false);
  const [picked, setPicked] = useState<PickedBatch[]>([]);

  const [busy, setBusy] = useState(false);

  // Already-printed warning: batch name + when/where it was printed.
  const [printedWarn, setPrintedWarn] = useState<PrintedFlag[] | null>(null);

  useEffect(() => {
    document.title = "Quick Print | BarcodeGo";
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, current_design_file_id")
      .not("current_design_file_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) {
      notifyError("Couldn't load templates", error);
    } else if (data) {
      setTemplates(data);
      // Restore last-used template if it still exists, else fall back to the first.
      const remembered = data.find((t) => t.id === defaultPrintTemplateId);
      setTemplateId(remembered?.id ?? data[0]?.id ?? "");
    }
    setLoadingTemplates(false);
  };

  const handlePick = (batches: PickedBatch[]) => {
    // Replace rather than append — Quick Print is a one-shot "this branch's batches".
    setPicked(batches);
  };

  const removeBatch = (ondiBatchId?: string, idx?: number) => {
    setPicked((prev) => prev.filter((b, i) => (ondiBatchId ? b.ondiBatchId !== ondiBatchId : i !== idx)));
  };

  const totalCodes = picked.reduce((n, b) => n + b.values.length, 0);
  const origin = picked.find((b) => b.institutionName || b.branchName);

  const canPrint = !!templateId && picked.length > 0 && totalCodes > 0 && !busy;

  // Guard: warn loudly if any picked batch was already printed before, then generate.
  const handleGenerate = async () => {
    if (!canPrint) return;
    let flagged: PrintedFlag[];
    try {
      flagged = await flagPrintedBatches(picked);
    } catch (e) {
      notifyError("Couldn't check if these batches were already printed", e);
      return;
    }
    if (flagged.length) {
      setPrintedWarn(flagged);
      return;
    }
    void runGenerate();
  };

  const runGenerate = async () => {
    if (!canPrint) return;
    setBusy(true);
    try {
      const pdf = await generatePrintPdf(
        templateId,
        picked.map((b) => ({ name: b.name, values: b.values }))
      );

      // Remember this template for next time → true one-click after the first run.
      setDefaultPrintTemplateId(templateId);

      // Print + keep a copy.
      openAndPrint(pdf);
      const fileBase = branchCodeName(
        origin?.branchName || origin?.institutionName,
        picked.map((b) => b.name),
        picked.reduce((n, b) => n + b.values.length, 0)
      );
      downloadPdf(pdf, `${fileBase}.pdf`);

      // Save tracked project(s) marked printed (the PDF is already delivered).
      // Be honest about the save outcome: only claim "saved" when a project was actually
      // created — otherwise the codes won't show under Projects or count toward branch usage,
      // and the user needs to know (don't mask a save failure as a plain "Printed" success).
      let created = 0;
      let saveFailed = false;
      try {
        created = await createPrintedProjects(
          templateId,
          picked.map((b) => ({
            name: b.name,
            values: b.values,
            ondiBatchId: b.ondiBatchId,
            institutionName: b.institutionName,
            branchName: b.branchName,
          }))
        );
      } catch (e) {
        saveFailed = true;
        console.warn("Quick Print: tracked-project save failed", e);
      }

      if (created > 0) {
        notifySuccess(
          "Printed & saved ✓",
          `${totalCodes} codes printed · saved ${created} project${created !== 1 ? "s" : ""} (marked printed)`
        );
      } else {
        // Print succeeded but nothing was saved (insert failed / returned 0). Surface it.
        notifyError(
          "Printed — but NOT saved",
          "The PDF printed, but saving it to Projects failed, so it won't show in tracking or count toward branch usage. Check your connection and run Quick Print again."
        );
      }
    } catch (e) {
      notifyError("Couldn't generate the print file", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <Printer className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Quick Print</h1>
          </div>
          <p className="text-muted-foreground">
            Pick a branch's barcode batch and print it — no setup. Uses your saved label template.
          </p>
        </div>

        {/* Step 1: template (remembered) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Label template
            </CardTitle>
            <CardDescription>The sticker style to print onto. We remember your last choice.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTemplates ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
              </div>
            ) : templates.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No templates with a design file yet.{" "}
                <Button variant="link" className="px-1 h-auto" onClick={() => navigate("/projects/new")}>
                  Create one
                </Button>
              </div>
            ) : (
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {/* Step 2: branch + batch */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Barcode className="h-4 w-4" />
              Barcodes to print
            </CardTitle>
            <CardDescription>Pull a branch's barcode batch(es) straight from Ondi.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="default" className="w-full gap-2" onClick={() => setShowOndi(true)} disabled={busy}>
              <Building2 className="h-4 w-4" />
              {picked.length > 0 ? "Change branch / batches" : "Choose branch & batches"}
            </Button>

            {picked.length > 0 && (
              <>
                {origin && (origin.institutionName || origin.branchName) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="h-3 w-3" />
                    {[origin.institutionName, origin.branchName].filter(Boolean).join(" · ")}
                  </p>
                )}
                <div className="space-y-2">
                  {picked.map((b, i) => (
                    <div
                      key={b.ondiBatchId ?? `${b.name}-${i}`}
                      className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
                    >
                      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium font-mono truncate">{b.name}</p>
                        <p className="text-xs text-muted-foreground">{b.values.length} codes</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeBatch(b.ondiBatchId, i)}
                        disabled={busy}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Print */}
        <Button size="lg" className="w-full gap-2 h-14 text-base" onClick={handleGenerate} disabled={!canPrint}>
          {busy ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Printer className="h-5 w-5" />
              Generate &amp; Print{totalCodes > 0 ? ` (${totalCodes} codes)` : ""}
            </>
          )}
        </Button>
        <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1.5">
          <CheckCircle2 className="h-3 w-3" />
          Opens the print dialog, downloads a copy, and saves it under Projects (marked printed).
        </p>
      </div>

      {/* Single-flow Ondi picker (multi-select within one branch) */}
      <OndiBatchPicker isOpen={showOndi} onClose={() => setShowOndi(false)} multi onPick={handlePick} />

      {/* Already-printed warning before printing again */}
      <DuplicateWarningDialog
        open={!!printedWarn}
        summary={null}
        printedBatches={printedWarn ?? []}
        proceedLabel="Print anyway"
        onProceed={() => {
          setPrintedWarn(null);
          void runGenerate();
        }}
        onCancel={() => setPrintedWarn(null)}
      />
    </DashboardLayout>
  );
}
