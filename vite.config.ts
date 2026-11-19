import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Split heavy vendor libs into their own cacheable chunks. Routes are also
    // lazy-loaded (see App.tsx), so pages only pull the chunks they actually use.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("pdfjs-dist")) return "pdfjs";
          if (id.includes("pdf-lib")) return "pdf-lib";
          if (id.includes("jszip")) return "jszip";
          if (id.includes("jsbarcode") || id.includes("qrcode")) return "barcode-gen";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@radix-ui")) return "radix";
          // Keep React + router + scheduler together to avoid init-order issues.
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)
          ) {
            return "react-vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
}));
