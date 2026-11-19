import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "@/store/useProjectStore";
import Workspace from "@/components/workspace/Workspace";

const Index = () => {
  const navigate = useNavigate();
  const { selectedProjectId } = useProjectStore();

  useEffect(() => {
    document.title = "BARCODE-on-Design | PDF Barcode Overlay";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Place barcodes on your PDF designs with mm-precise control. Multi-page preview and print-ready export.");
  }, []);

  useEffect(() => {
    if (!selectedProjectId) navigate("/projects", { replace: true });
  }, [selectedProjectId, navigate]);

  return (
    <main className="min-h-screen bg-background">
      <h1 className="sr-only">BARCODE-on-Design: PDF Barcode Overlay Tool</h1>
      <Workspace />
    </main>
  );
};

export default Index;
