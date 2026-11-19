import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface OndiSession {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // unix seconds
  email: string;
}

interface OndiState {
  session: OndiSession | null;
  setSession: (s: OndiSession) => void;
  clearSession: () => void;
}

export const useOndiStore = create<OndiState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      clearSession: () => set({ session: null }),
    }),
    { name: "ondi-session" }
  )
);

export const isOndiConnected = () => !!useOndiStore.getState().session;
