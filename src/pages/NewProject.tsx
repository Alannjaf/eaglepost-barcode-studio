import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProjectStore } from "@/store/useProjectStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Barcode, Sparkles } from "lucide-react";

export default function NewProject() {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const { setProject } = useProjectStore();
  const { resetProject, setBarcode, barcode } = useWorkspaceStore();

  const onCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    
    const { data, error } = await supabase
      .from("projects")
      .insert({ 
        name: name.trim(),
        notes: notes.trim() || null
      })
      .select()
      .maybeSingle();

    if (!error && data) {
      resetProject();
      setBarcode({ ...barcode, type: "code128" });
      setProject(data.id, data.name);
      navigate("/editor");
    }
    setCreating(false);
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-2xl">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/projects")}
          className="mb-6 -ml-2 gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </Button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Create New Project</h1>
          <p className="text-muted-foreground mt-1">Set up a new barcode overlay project</p>
        </div>

        {/* Form Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Barcode className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Project Details</CardTitle>
                <CardDescription>Give your project a name and optional description</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                placeholder="Enter project name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onCreate()}
                className="h-11"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any notes or description..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => navigate("/projects")}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={onCreate}
                disabled={creating || !name.trim()}
                className="flex-1 gap-2"
              >
                <Sparkles className="h-4 w-4" />
                {creating ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
