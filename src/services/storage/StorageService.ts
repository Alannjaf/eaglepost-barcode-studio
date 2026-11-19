import { get, set, del, keys } from "idb-keyval";

export interface StoredFile {
  id: string; // key
  name: string;
  mime: string;
  bytes: ArrayBuffer;
  createdAt: number;
}

export interface IStorageService {
  saveFile(file: Omit<StoredFile, "id" | "createdAt">): Promise<string>;
  getFile(id: string): Promise<StoredFile | undefined>;
  deleteFile(id: string): Promise<void>;
  listFileKeys(): Promise<string[]>;
}

const makeId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export const LocalStorageService: IStorageService = {
  async saveFile(file) {
    const id = makeId();
    const record: StoredFile = { id, createdAt: Date.now(), ...file } as StoredFile;
    await set(id, record);
    return id;
  },
  async getFile(id) {
    const record = (await get(id)) as StoredFile | undefined;
    return record;
  },
  async deleteFile(id) {
    await del(id);
  },
  async listFileKeys() {
    return (await keys()) as string[];
  },
};
