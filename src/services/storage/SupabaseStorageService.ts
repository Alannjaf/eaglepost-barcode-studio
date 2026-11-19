import { supabase } from "@/integrations/supabase/client";
import type { IStorageService, StoredFile } from "./StorageService";

function encodeId(bucket: string, path: string) {
  return `${bucket}:${path}`;
}
function decodeId(id: string): { bucket: string; path: string } {
  const [bucket, ...rest] = id.split(":");
  return { bucket, path: rest.join(":") };
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export const SupabaseStorageService: IStorageService = {
  async saveFile(file) {
    const isExport = /_barcode\.pdf$/i.test(file.name);
    const bucket = isExport ? "exports" : "designs";
    const sanitizedName = sanitizeName(file.name);
    const path = isExport ? sanitizedName : `${Date.now()}_${sanitizedName}`;

    const blob = new Blob([file.bytes], { type: file.mime });
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: isExport });
    if (error) throw error;

    return encodeId(bucket, path);
  },

  async getFile(id) {
    const { bucket, path } = decodeId(id);
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) return undefined;
    const bytes = await data.arrayBuffer();
    const name = path.includes("_") ? path.split("_").slice(1).join("_") : path;
    const record: StoredFile = {
      id,
      name,
      mime: data.type || "application/octet-stream",
      bytes,
      createdAt: Date.now(),
    };
    return record;
  },

  async deleteFile(id) {
    const { bucket, path } = decodeId(id);
    await supabase.storage.from(bucket).remove([path]);
  },

  async listFileKeys() {
    const lists = await Promise.all([
      supabase.storage.from("designs").list(undefined, { limit: 1000 }),
      supabase.storage.from("exports").list(undefined, { limit: 1000 }),
    ]);
    const keys: string[] = [];
    for (const [idx, res] of lists.entries()) {
      const bucket = idx === 0 ? "designs" : "exports";
      if (res.data) {
        for (const f of res.data) keys.push(encodeId(bucket, f.name));
      }
    }
    return keys;
  },
};
