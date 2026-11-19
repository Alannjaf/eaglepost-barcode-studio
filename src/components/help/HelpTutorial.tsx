import React, { useState, useMemo } from "react";
import { 
  FileUp, 
  Settings2, 
  Barcode, 
  Grid3X3, 
  Download,
  Sparkles,
  Target,
  RotateCw,
  Type,
  Table2,
  BookOpen,
  FileStack,
  Receipt,
  Keyboard,
  MousePointer2,
  Package,
  Ticket,
  Truck,
  QrCode,
  ArrowRight,
  Layers,
  Upload,
  Check,
  Search,
  FolderPlus,
  FileText,
  Move,
  ZoomIn,
  Ruler,
  Hash,
  PlusCircle,
  ChevronDown,
  ChevronRight,
  Play,
  LayoutGrid,
  FileSpreadsheet,
  Archive
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Table of Contents data
const tocSections = [
  { id: "quick-start", label: "Quick Start", icon: Play },
  { id: "new-project", label: "Creating a Project", icon: FolderPlus },
  { id: "editor", label: "Editor Overview", icon: LayoutGrid },
  { id: "barcodes", label: "Barcode Types", icon: Barcode },
  { id: "positioning", label: "Positioning & Sizing", icon: Target },
  { id: "multi-up", label: "Multi-Up Layouts", icon: Grid3X3 },
  { id: "csv-import", label: "CSV Import", icon: FileSpreadsheet },
  { id: "sequencing", label: "Sequencing", icon: Hash },
  { id: "multi-batch", label: "Multi Batch Export", icon: Archive },
  { id: "invoice-mode", label: "Invoice Mode", icon: Receipt },
  { id: "shortcuts", label: "Keyboard & Mouse", icon: Keyboard },
];

// Section wrapper with anchor
function Section({ id, title, icon: Icon, children }: { 
  id: string; 
  title: string; 
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 pb-8 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// Visual step component
function Step({ number, title, description, icon: Icon }: {
  number: number;
  title: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border/50">
      <div className="relative shrink-0">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
          {number}
        </div>
      </div>
      <div>
        <h4 className="font-semibold mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

// Collapsible info card
function InfoCard({ title, icon: Icon, defaultOpen = false, children }: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger className="w-full">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between cursor-pointer hover:bg-secondary/30 transition-colors">
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{title}</CardTitle>
            </div>
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// Barcode type visual
function BarcodeType({ name, description, visual }: { name: string; description: string; visual: string }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/30 border border-border/30 text-center">
      <div className="h-8 flex items-center justify-center font-mono text-xs text-muted-foreground mb-2 tracking-widest">
        {visual}
      </div>
      <p className="font-medium text-sm">{name}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

// Shortcut row
function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <span className="text-sm text-muted-foreground">{action}</span>
      <kbd className="px-2.5 py-1 rounded-md bg-secondary text-xs font-mono">{keys}</kbd>
    </div>
  );
}

// Editor layout diagram
function EditorDiagram() {
  return (
    <div className="p-4 rounded-xl bg-secondary/20 border border-border/50">
      <div className="flex gap-2 h-40">
        {/* Left sidebar */}
        <div className="w-20 bg-sidebar rounded-lg flex flex-col p-2 border border-border/30">
          <div className="text-[9px] font-medium text-sidebar-foreground/70 mb-1.5">Settings</div>
          <div className="flex-1 space-y-1">
            {["Page Setup", "Barcode", "Position", "Multi-Up"].map((item) => (
              <div key={item} className="h-4 bg-sidebar-accent/50 rounded text-[7px] px-1.5 flex items-center text-sidebar-foreground/80">
                {item}
              </div>
            ))}
          </div>
        </div>
        
        {/* Canvas */}
        <div className="flex-1 bg-background rounded-lg flex items-center justify-center relative border border-border/50">
          <div className="w-16 h-24 bg-card rounded border border-border shadow-sm flex flex-col items-center justify-center gap-1">
            <Barcode className="h-6 w-6 text-muted-foreground/40" />
            <span className="text-[7px] text-muted-foreground">Preview</span>
          </div>
          <div className="absolute bottom-1.5 right-2 text-[8px] text-muted-foreground/60">Canvas</div>
        </div>
        
        {/* Right panel */}
        <div className="w-16 bg-card rounded-lg border border-border/50 p-2">
          <div className="text-[9px] font-medium mb-1.5">History</div>
          <div className="space-y-1">
            {[1, 2].map((i) => (
              <div key={i} className="h-5 bg-secondary/50 rounded text-[7px] px-1 flex items-center text-muted-foreground">
                Export {i}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-between mt-3 text-[10px] text-muted-foreground">
        <span>← Settings Panel</span>
        <span>Live Preview</span>
        <span>Export History →</span>
      </div>
    </div>
  );
}

// Multi-up diagram
function MultiUpDiagram() {
  return (
    <div className="p-4 rounded-xl bg-secondary/20 border border-border/50">
      <div className="flex justify-center">
        <div className="relative">
          {/* Page representation */}
          <div className="w-32 h-44 bg-background border-2 border-dashed border-border/60 rounded-lg p-2">
            {/* Margin labels */}
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground flex items-center gap-1">
              <span>↓ margin</span>
            </div>
            
            {/* Grid */}
            <div className="grid grid-cols-2 gap-1.5 h-full">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div 
                  key={i} 
                  className={cn(
                    "rounded border flex items-center justify-center",
                    i === 0 
                      ? "border-primary border-2 bg-primary/10" 
                      : "border-border/60 bg-card"
                  )}
                >
                  <Barcode className="h-3.5 w-3.5 text-muted-foreground/50" />
                </div>
              ))}
            </div>
          </div>
          
          {/* Legend */}
          <div className="absolute -right-20 top-1/2 -translate-y-1/2 text-[9px] space-y-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 border-2 border-primary bg-primary/10 rounded" />
              <span className="text-muted-foreground">Master</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 border border-border bg-card rounded" />
              <span className="text-muted-foreground">Copies</span>
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-3">
        Position your barcode in the <span className="text-primary font-medium">master cell</span> — it copies to all others.
      </p>
    </div>
  );
}

// CSV to labels diagram
function CsvDiagram() {
  return (
    <div className="p-4 rounded-xl bg-secondary/20 border border-border/50">
      <div className="flex items-center justify-center gap-4">
        {/* CSV representation */}
        <div className="text-center">
          <div className="w-24 bg-card rounded-lg p-2 font-mono text-[9px] text-left border border-border/50">
            <div className="text-muted-foreground mb-0.5"># data.csv</div>
            <div className="text-foreground/70">code</div>
            <div className="text-primary">SKU-001</div>
            <div className="text-primary">SKU-002</div>
            <div className="text-primary">SKU-003</div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">Your CSV file</p>
        </div>
        
        <ArrowRight className="h-5 w-5 text-primary shrink-0" />
        
        {/* Output labels */}
        <div className="text-center">
          <div className="flex gap-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-9 h-12 bg-card border border-border/50 rounded flex items-center justify-center">
                <Barcode className="h-5 w-5 text-muted-foreground/60" />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">Generated labels</p>
        </div>
      </div>
    </div>
  );
}

// Sequencing diagram
function SequenceDiagram() {
  return (
    <div className="p-4 rounded-xl bg-secondary/20 border border-border/50">
      <div className="flex items-center justify-center gap-2">
        <div className="text-center">
          <div className="px-3 py-2 bg-card rounded-lg border border-border/50 font-mono text-sm">
            ABC<span className="text-primary">001</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Start</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="px-3 py-2 bg-card rounded-lg border border-border/50 font-mono text-sm">
          ABC<span className="text-primary">002</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="px-3 py-2 bg-card rounded-lg border border-border/50 font-mono text-sm">
          ABC<span className="text-primary">003</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="text-muted-foreground">...</div>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-3">
        Numeric suffix auto-increments. Prefix is preserved.
      </p>
    </div>
  );
}

// Multi Batch diagram
function MultiBatchDiagram() {
  return (
    <div className="p-4 rounded-xl bg-secondary/20 border border-border/50">
      <div className="flex items-center justify-center gap-3">
        {/* Multiple CSVs */}
        <div className="flex flex-col gap-1">
          {["orders.csv", "products.csv", "batch3.csv"].map((name) => (
            <div key={name} className="px-2 py-1 bg-card rounded border border-border/50 text-[9px] font-mono flex items-center gap-1.5">
              <FileSpreadsheet className="h-3 w-3 text-primary" />
              {name}
            </div>
          ))}
        </div>
        
        <div className="flex flex-col items-center gap-1">
          <ArrowRight className="h-4 w-4 text-primary" />
          <span className="text-[8px] text-muted-foreground">process</span>
        </div>
        
        {/* ZIP output */}
        <div className="px-3 py-3 bg-card rounded-lg border border-border/50 flex flex-col items-center gap-1">
          <Archive className="h-6 w-6 text-primary" />
          <span className="text-[9px] font-mono">export.zip</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-3">
        Upload multiple CSVs → get one ZIP with all PDFs.
      </p>
    </div>
  );
}

export function HelpTutorial() {
  const [searchQuery, setSearchQuery] = useState("");
  
  // Filter sections based on search
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return tocSections;
    const q = searchQuery.toLowerCase();
    return tocSections.filter(s => 
      s.label.toLowerCase().includes(q) || 
      s.id.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex max-w-6xl mx-auto">
        
        {/* Left Sidebar - Table of Contents */}
        <aside className="hidden lg:block w-56 shrink-0 border-r border-border/50 sticky top-0 h-screen">
          <ScrollArea className="h-full py-6 px-4">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Help Guide</h2>
            </div>
            
            <nav className="space-y-1">
              {tocSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors text-left"
                >
                  <section.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{section.label}</span>
                </button>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <div className="p-6 lg:p-8 space-y-8">
            
            {/* Header with Search */}
            <header className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center">
                  <BookOpen className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Help Center</h1>
                  <p className="text-muted-foreground text-sm">Learn how to create professional barcode labels</p>
                </div>
              </div>
              
              {/* Search */}
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </header>

            {/* Content Sections */}
            <div className="space-y-8">
              
              {/* Quick Start */}
              <Section id="quick-start" title="Quick Start" icon={Play}>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Step number={1} title="Upload" description="Add your PDF template (optional)" icon={Upload} />
                  <Step number={2} title="Configure" description="Choose barcode type & value" icon={Barcode} />
                  <Step number={3} title="Position" description="Drag or enter coordinates" icon={Target} />
                  <Step number={4} title="Export" description="Download your PDF" icon={Download} />
                </div>
              </Section>

              {/* Creating a Project */}
              <Section id="new-project" title="Creating a Project" icon={FolderPlus}>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Step number={1} title="Go to Projects" description="Click 'New Project' on the dashboard" icon={PlusCircle} />
                    <Step number={2} title="Name Your Project" description="Give it a descriptive name" icon={FileText} />
                    <Step number={3} title="Open Editor" description="Click the project to start designing" icon={LayoutGrid} />
                  </div>
                  <InfoCard title="Pro Tips" icon={Sparkles} defaultOpen>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Organize projects into folders</li>
                      <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Add tags for easy filtering</li>
                      <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Use notes to document settings</li>
                      <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Export history auto-saves every export</li>
                    </ul>
                  </InfoCard>
                </div>
              </Section>

              {/* Editor Overview */}
              <Section id="editor" title="Editor Overview" icon={LayoutGrid}>
                <div className="grid md:grid-cols-2 gap-4">
                  <EditorDiagram />
                  <div className="space-y-3">
                    <InfoCard title="Settings Panel (Left)" icon={Settings2} defaultOpen>
                      <p className="text-sm text-muted-foreground">
                        Configure page size, barcode type, position, rotation, and multi-up grid settings.
                      </p>
                    </InfoCard>
                    <InfoCard title="Canvas (Center)" icon={Layers}>
                      <p className="text-sm text-muted-foreground">
                        Live preview of your design. Drag barcodes to position, scroll to zoom, Space+drag to pan.
                      </p>
                    </InfoCard>
                    <InfoCard title="History Panel (Right)" icon={FileStack}>
                      <p className="text-sm text-muted-foreground">
                        Every export is saved. Click to restore or re-download previous versions.
                      </p>
                    </InfoCard>
                  </div>
                </div>
              </Section>

              {/* Barcode Types */}
              <Section id="barcodes" title="Barcode Types" icon={Barcode}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <BarcodeType name="Code128" description="Alphanumeric" visual="|||||||||||" />
                  <BarcodeType name="EAN-13" description="13-digit retail" visual="| ||| || |||" />
                  <BarcodeType name="EAN-8" description="8-digit" visual="|| ||| ||" />
                  <BarcodeType name="UPC-A" description="12-digit US" visual="| || ||| ||" />
                  <BarcodeType name="QR Code" description="2D data" visual="▄▄▄ ▄▄▄" />
                  <BarcodeType name="Code39" description="Industrial" visual="| || | ||" />
                  <BarcodeType name="ITF-14" description="Shipping" visual="|||| ||||" />
                  <BarcodeType name="Codabar" description="Libraries" visual="|| | | ||" />
                </div>
                <InfoCard title="Barcode Options" icon={Type} defaultOpen>
                  <ul className="text-sm text-muted-foreground space-y-1.5">
                    <li>• Show/hide text below barcode</li>
                    <li>• Custom font family & size</li>
                    <li>• Text color & position (top/bottom)</li>
                    <li>• Quiet zone (scanner margin)</li>
                    <li>• Prefix, suffix, separators</li>
                  </ul>
                </InfoCard>
              </Section>

              {/* Positioning & Sizing */}
              <Section id="positioning" title="Positioning & Sizing" icon={Target}>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <Card className="p-4 text-center">
                    <Move className="h-8 w-8 text-primary mx-auto mb-2" />
                    <p className="font-medium text-sm">X/Y Position</p>
                    <p className="text-xs text-muted-foreground">Drag or enter mm values</p>
                  </Card>
                  <Card className="p-4 text-center">
                    <Ruler className="h-8 w-8 text-primary mx-auto mb-2" />
                    <p className="font-medium text-sm">Width/Height</p>
                    <p className="text-xs text-muted-foreground">Set exact dimensions</p>
                  </Card>
                  <Card className="p-4 text-center">
                    <RotateCw className="h-8 w-8 text-primary mx-auto mb-2" />
                    <p className="font-medium text-sm">Rotation</p>
                    <p className="text-xs text-muted-foreground">0°, 90°, 180°, 270°</p>
                  </Card>
                  <Card className="p-4 text-center">
                    <ZoomIn className="h-8 w-8 text-primary mx-auto mb-2" />
                    <p className="font-medium text-sm">Zoom</p>
                    <p className="text-xs text-muted-foreground">Scroll or use buttons</p>
                  </Card>
                </div>
              </Section>

              {/* Multi-Up Layouts */}
              <Section id="multi-up" title="Multi-Up Layouts" icon={Grid3X3}>
                <div className="grid md:grid-cols-2 gap-4">
                  <MultiUpDiagram />
                  <div className="space-y-3">
                    <InfoCard title="How It Works" icon={Grid3X3} defaultOpen>
                      <ul className="text-sm text-muted-foreground space-y-1.5">
                        <li>1. Set your label cell dimensions (width × height)</li>
                        <li>2. Configure page margins and gaps between cells</li>
                        <li>3. Grid auto-calculates based on page size</li>
                        <li>4. Position barcode in the <span className="text-primary font-medium">first cell</span> — it copies to all others</li>
                      </ul>
                    </InfoCard>
                    <InfoCard title="Settings" icon={Settings2}>
                      <ul className="text-sm text-muted-foreground space-y-1.5">
                        <li>• Design Width/Height (per label)</li>
                        <li>• Top/Bottom/Left/Right margins</li>
                        <li>• Horizontal/Vertical gaps</li>
                        <li>• All values support 0 for edge-to-edge</li>
                      </ul>
                    </InfoCard>
                  </div>
                </div>
              </Section>

              {/* CSV Import */}
              <Section id="csv-import" title="CSV Import" icon={FileSpreadsheet}>
                <div className="grid md:grid-cols-2 gap-4">
                  <CsvDiagram />
                  <div className="space-y-3">
                    <InfoCard title="How to Import" icon={Upload} defaultOpen>
                      <ul className="text-sm text-muted-foreground space-y-1.5">
                        <li>1. Click "Import CSV" in the editor</li>
                        <li>2. Select your CSV file</li>
                        <li>3. Choose the column containing barcode values</li>
                        <li>4. One label is generated per row</li>
                      </ul>
                    </InfoCard>
                    <InfoCard title="Notes" icon={Sparkles}>
                      <ul className="text-sm text-muted-foreground space-y-1.5">
                        <li>• CSV data overrides manual "Start number"</li>
                        <li>• Supports alphanumeric values</li>
                        <li>• Export quantity matches row count</li>
                        <li>• Data is saved with the project</li>
                      </ul>
                    </InfoCard>
                  </div>
                </div>
              </Section>

              {/* Sequencing */}
              <Section id="sequencing" title="Sequencing" icon={Hash}>
                <div className="grid md:grid-cols-2 gap-4">
                  <SequenceDiagram />
                  <InfoCard title="How Sequencing Works" icon={Hash} defaultOpen>
                    <ul className="text-sm text-muted-foreground space-y-1.5">
                      <li>• Enter a "Start number" like <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">ABC001</code></li>
                      <li>• The numeric suffix auto-increments: 001 → 002 → 003...</li>
                      <li>• Prefix letters are preserved</li>
                      <li>• Use "Digits" to control zero-padding (e.g., 001 vs 1)</li>
                      <li>• EAN-13 is strictly numeric (13 digits)</li>
                    </ul>
                  </InfoCard>
                </div>
              </Section>

              {/* Multi Batch Export */}
              <Section id="multi-batch" title="Multi Batch Export" icon={Archive}>
                <div className="grid md:grid-cols-2 gap-4">
                  <MultiBatchDiagram />
                  <div className="space-y-3">
                    <InfoCard title="What It Does" icon={Archive} defaultOpen>
                      <p className="text-sm text-muted-foreground">
                        Generate PDFs from multiple CSV files at once. Uses an existing project as a style template.
                        All PDFs are bundled into a single ZIP file for download.
                      </p>
                    </InfoCard>
                    <InfoCard title="Workflow" icon={Play}>
                      <ul className="text-sm text-muted-foreground space-y-1.5">
                        <li>1. Go to Multi Batch page</li>
                        <li>2. Select a project as your template</li>
                        <li>3. Upload multiple CSV files</li>
                        <li>4. Map columns for each file</li>
                        <li>5. Download the ZIP with all PDFs</li>
                      </ul>
                    </InfoCard>
                  </div>
                </div>
              </Section>

              {/* Invoice Mode */}
              <Section id="invoice-mode" title="Invoice Mode" icon={Receipt}>
                <InfoCard title="Page Numbering" icon={Receipt} defaultOpen>
                  <p className="text-sm text-muted-foreground mb-3">
                    Add sequential page numbers to multi-page PDF exports. Perfect for invoices and documents.
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1.5">
                    <li>• Custom X/Y position (draggable on canvas)</li>
                    <li>• Font family, size, bold/italic styling</li>
                    <li>• Custom start number (supports 0)</li>
                    <li>• Zero-padding via "Digits" (e.g., 001, 002)</li>
                    <li>• Prefix/Suffix text (e.g., "Page 1 of 10")</li>
                    <li>• Text alignment (left, center, right)</li>
                    <li>• Custom text color</li>
                  </ul>
                </InfoCard>
              </Section>

              {/* Keyboard & Mouse */}
              <Section id="shortcuts" title="Keyboard & Mouse" icon={Keyboard}>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Keyboard className="h-5 w-5 text-primary" />
                        Keyboard
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ShortcutRow keys="Space + Drag" action="Pan canvas" />
                      <ShortcutRow keys="Scroll" action="Zoom in/out" />
                      <ShortcutRow keys="0" action="Reset zoom to fit" />
                      <ShortcutRow keys="Shift + Drag" action="Constrain movement" />
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MousePointer2 className="h-5 w-5 text-primary" />
                        Mouse
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ShortcutRow keys="Click + Drag" action="Move barcode" />
                      <ShortcutRow keys="Corner Drag" action="Resize barcode" />
                      <ShortcutRow keys="Middle Button" action="Pan canvas" />
                      <ShortcutRow keys="Scroll Wheel" action="Zoom" />
                    </CardContent>
                  </Card>
                </div>
              </Section>

            </div>

            {/* Footer */}
            <footer className="text-center pt-4 pb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm">
                <Sparkles className="h-4 w-4" />
                <span>Your work is auto-saved. Check History to restore any export.</span>
              </div>
            </footer>

          </div>
        </main>
      </div>
    </div>
  );
}
