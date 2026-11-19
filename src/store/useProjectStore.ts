import { create } from "zustand";

interface ProjectState {
  selectedProjectId: string | null;
  selectedProjectName: string | null;
  selectedFolderId: string | null;
  pendingCsvData: string[] | null; // CSV data to apply when opening editor
  setProject: (id: string, name?: string | null, folderId?: string | null) => void;
  clearProject: () => void;
  setPendingCsvData: (data: string[] | null) => void;
  consumePendingCsvData: () => string[] | null;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  selectedProjectId: typeof window !== "undefined" ? localStorage.getItem("projectId") : null,
  selectedProjectName: typeof window !== "undefined" ? localStorage.getItem("projectName") : null,
  selectedFolderId: typeof window !== "undefined" ? localStorage.getItem("projectFolderId") : null,
  pendingCsvData: null,
  setProject: (id, name, folderId) => {
    try {
      localStorage.setItem("projectId", id);
      if (name != null) localStorage.setItem("projectName", name);
      if (folderId !== undefined) {
        if (folderId) {
          localStorage.setItem("projectFolderId", folderId);
        } else {
          localStorage.removeItem("projectFolderId");
        }
      }
    } catch { /* ignore localStorage write errors (e.g. private mode) */ }
    set({
      selectedProjectId: id,
      selectedProjectName: name ?? null,
      selectedFolderId: folderId !== undefined ? folderId : null,
    });
  },
  clearProject: () => {
    try {
      localStorage.removeItem("projectId");
      localStorage.removeItem("projectName");
      localStorage.removeItem("projectFolderId");
    } catch { /* ignore localStorage write errors (e.g. private mode) */ }
    set({ selectedProjectId: null, selectedProjectName: null, selectedFolderId: null, pendingCsvData: null });
  },
  setPendingCsvData: (data) => set({ pendingCsvData: data }),
  consumePendingCsvData: () => {
    const data = get().pendingCsvData;
    set({ pendingCsvData: null });
    return data;
  },
}));
