import React, { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sun,
  Moon,
  Monitor,
  Palette,
  FileText,
  Download,
  Upload,
  Trash2,
  Bell,
  Shield,
  Info,
  Check,
  RotateCcw,
  Barcode,
} from "lucide-react";
import { useSettingsStore, Theme, PageSize, BarcodeType } from "@/store/useSettingsStore";
import { exportBackup, importBackup, wipeAll } from "@/integrations/local/localdb";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useOndiStore } from "@/store/useOndiStore";
import { ondiDisconnect } from "@/integrations/ondi/client";
import OndiConnectForm from "@/components/ondi/OndiConnectForm";

export default function Settings() {
  const {
    theme,
    defaultPageSize,
    defaultBarcodeType,
    autoSave,
    showNotifications,
    setTheme,
    setDefaultPageSize,
    setDefaultBarcodeType,
    setAutoSave,
    setShowNotifications,
    resetSettings,
  } = useSettingsStore();

  const ondiSession = useOndiStore((s) => s.session);

  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `barcode-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      notifySuccess("Backup saved", "Keep this file safe. Use Import backup to load it on any PC.");
    } catch (error) {
      notifyError("Export failed", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) setImportFile(f);
  };

  const runImport = async (mode: "replace" | "merge") => {
    if (!importFile) return;
    setIsImporting(true);
    try {
      const r = await importBackup(importFile, mode);
      setImportFile(null);
      notifySuccess(
        "Backup imported",
        `${r.projects} projects, ${r.folders} folders, ${r.codes} barcodes, ${r.files} files.`
      );
      setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      notifyError("Import failed", error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClearAllData = async () => {
    setIsClearing(true);
    try {
      await wipeAll();

      // Reset settings
      resetSettings();

      // Clear any local storage related to workspace
      localStorage.removeItem("workspace-store");
      localStorage.removeItem("project-store");

      setShowClearDialog(false);

      
    } catch (error) {
      console.error("Failed to clear data", error);
    } finally {
      setIsClearing(false);
    }
  };

  const handleResetSettings = () => {
    resetSettings();
    setShowResetDialog(false);
    
    
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    
  };

  const handlePageSizeChange = (size: string) => {
    setDefaultPageSize(size as PageSize);
    
  };

  const handleBarcodeTypeChange = (type: string) => {
    const typeMap: Record<string, BarcodeType> = {
      "CODE128": "code128",
      "EAN13": "ean13",
      "UPC": "upc",
      "QR": "qr",
    };
    setDefaultBarcodeType(typeMap[type] || "code128");
    
  };

  const barcodeTypeDisplay: Record<BarcodeType, string> = {
    "code128": "CODE128",
    "ean13": "EAN13",
    "upc": "UPC",
    "qr": "QR",
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground mt-1">Customize your BarcodeGo experience</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResetDialog(true)}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset All
          </Button>
        </div>

        <div className="grid gap-6 max-w-3xl">
          {/* Appearance */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Palette className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Appearance</CardTitle>
                  <CardDescription>Customize how BarcodeGo looks</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Theme</Label>
                <div className="grid grid-cols-3 gap-3">
                  {themeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleThemeChange(option.value as Theme)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all relative ${
                        theme === option.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      }`}
                    >
                      {theme === option.value && (
                        <div className="absolute top-2 right-2">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <option.icon className={`h-6 w-6 ${theme === option.value ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-sm font-medium ${theme === option.value ? "text-foreground" : "text-muted-foreground"}`}>
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ondi Connection */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Barcode className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Ondi Connection</CardTitle>
                  <CardDescription>Pull barcode batches directly from Eagle Post / Ondi</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {ondiSession ? (
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Connected</Label>
                    <p className="text-xs text-muted-foreground">{ondiSession.email}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => ondiDisconnect()}>
                    Disconnect
                  </Button>
                </div>
              ) : (
                <OndiConnectForm />
              )}
            </CardContent>
          </Card>

          {/* Default Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle>Default Settings</CardTitle>
                  <CardDescription>Set defaults for new projects</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="page-size">Default Page Size</Label>
                  <Select value={defaultPageSize} onValueChange={handlePageSizeChange}>
                    <SelectTrigger id="page-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A4">A4 (210 × 297 mm)</SelectItem>
                      <SelectItem value="Letter">Letter (8.5 × 11 in)</SelectItem>
                      <SelectItem value="Legal">Legal (8.5 × 14 in)</SelectItem>
                      <SelectItem value="A3">A3 (297 × 420 mm)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="barcode-type">Default Barcode Type</Label>
                  <Select value={barcodeTypeDisplay[defaultBarcodeType]} onValueChange={handleBarcodeTypeChange}>
                    <SelectTrigger id="barcode-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CODE128">Code 128</SelectItem>
                      <SelectItem value="EAN13">EAN-13</SelectItem>
                      <SelectItem value="UPC">UPC-A</SelectItem>
                      <SelectItem value="QR">QR Code</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-success" />
                </div>
                <div>
                  <CardTitle>Preferences</CardTitle>
                  <CardDescription>General application preferences</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Auto-save projects</Label>
                  <p className="text-xs text-muted-foreground">Automatically save changes as you work</p>
                </div>
                <Switch 
                  checked={autoSave} 
                  onCheckedChange={(checked) => {
                    setAutoSave(checked);
                    
                  }} 
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Show notifications</Label>
                  <p className="text-xs text-muted-foreground">Get notified about exports and updates</p>
                </div>
                <Switch 
                  checked={showNotifications} 
                  onCheckedChange={(checked) => {
                    setShowNotifications(checked);
                    
                  }} 
                />
              </div>
            </CardContent>
          </Card>

          {/* Data Management */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <CardTitle>Data Management</CardTitle>
                  <CardDescription>Manage your data and storage</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Export backup</Label>
                  <p className="text-xs text-muted-foreground">Save all designs, templates, folders and printed-barcode records to one .zip file</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2"
                  onClick={handleExportData}
                  disabled={isExporting}
                >
                  <Download className="h-4 w-4" />
                  {isExporting ? "Exporting..." : "Export"}
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Import backup</Label>
                  <p className="text-xs text-muted-foreground">Load a backup .zip made on this or another PC</p>
                </div>
                <input ref={importInputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={handleImportPicked} />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => importInputRef.current?.click()}
                  disabled={isImporting}
                >
                  <Upload className="h-4 w-4" />
                  {isImporting ? "Importing..." : "Import"}
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium text-destructive">Clear all data</Label>
                  <p className="text-xs text-muted-foreground">Delete all projects and reset settings</p>
                </div>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="gap-2"
                  onClick={() => setShowClearDialog(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* About */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                  <Info className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle>About</CardTitle>
                  <CardDescription>Application information</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span className="font-medium">1.0.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Build</span>
                  <span className="font-medium">2025.01</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Import Backup Dialog */}
      <AlertDialog open={!!importFile} onOpenChange={(o) => !o && !isImporting && setImportFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import backup</AlertDialogTitle>
            <AlertDialogDescription>
              {importFile?.name}: add it to the data already on this PC, or replace everything on this PC with the backup?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isImporting}>Cancel</AlertDialogCancel>
            <Button variant="outline" disabled={isImporting} onClick={() => runImport("merge")}>
              Add to my data
            </Button>
            <Button variant="destructive" disabled={isImporting} onClick={() => runImport("replace")}>
              Replace everything
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear All Data Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Data</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all your projects, export history, and reset all settings to defaults. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearAllData}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClearing ? "Clearing..." : "Clear All Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Settings Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Settings</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset all settings to their default values. Your projects and data will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetSettings}>
              Reset Settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
