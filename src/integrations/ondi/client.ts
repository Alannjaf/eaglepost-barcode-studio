// Browser-side Ondi client. Talks directly to Ondi's Supabase backend (gotrue auth + edge
// functions). CORS is open (`Access-Control-Allow-Origin: *`) and the anon key is public, so no
// backend/proxy is needed. Each user authenticates with their OWN Ondi credentials; the session
// (JWT + refresh token) is persisted in localStorage via useOndiStore.

import { ONDI } from "./config";
import { useOndiStore, type OndiSession } from "@/store/useOndiStore";

export class OndiNotConnectedError extends Error {
  constructor() {
    super("Not connected to Ondi");
    this.name = "OndiNotConnectedError";
  }
}

interface GotrueTokenResponse {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number;
  expires_in?: number;
}

function toSession(json: GotrueTokenResponse, email: string): OndiSession {
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_at ?? Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
    email,
  };
}

/** Log in to Ondi with the user's own email/password (gotrue password grant). */
export async function ondiLogin(email: string, password: string): Promise<void> {
  const res = await fetch(`${ONDI.authBase}/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ONDI.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, gotrue_meta_security: {} }),
  });
  if (!res.ok) {
    let msg = `Login failed (${res.status})`;
    try {
      const j = await res.json();
      msg = j.error_description || j.msg || j.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const json = await res.json();
  useOndiStore.getState().setSession(toSession(json, email));
}

/** Refresh the access token using the stored refresh token. */
async function refresh(session: OndiSession): Promise<string> {
  if (!session.refreshToken) throw new OndiNotConnectedError();
  const res = await fetch(`${ONDI.authBase}/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: ONDI.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  if (!res.ok) {
    useOndiStore.getState().clearSession();
    throw new OndiNotConnectedError();
  }
  const json = await res.json();
  const next = toSession(json, session.email);
  useOndiStore.getState().setSession(next);
  return next.accessToken;
}

/** Return a valid access token, refreshing if it is near expiry. */
async function ensureToken(): Promise<string> {
  const session = useOndiStore.getState().session;
  if (!session) throw new OndiNotConnectedError();
  if (session.expiresAt > Math.floor(Date.now() / 1000) + 60) return session.accessToken;
  return refresh(session);
}

/** Authenticated GET against an Ondi /functions/v1 path. Adds tenant_id + language. */
export async function ondiGet<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  const token = await ensureToken();
  const qs = new URLSearchParams({ tenant_id: ONDI.tenantId, language: "en" });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const res = await fetch(`${ONDI.functionsBase}${path}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ONDI.anonKey },
  });
  if (res.status === 401) {
    useOndiStore.getState().clearSession();
    throw new OndiNotConnectedError();
  }
  if (!res.ok) throw new Error(`Ondi request failed (${res.status}) on ${path}`);
  return res.json();
}

export function ondiDisconnect() {
  useOndiStore.getState().clearSession();
}

/** Normalize Ondi list responses ({data}|{items}|array) to a plain array. */
export function ondiRows<T = unknown>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  if (json && typeof json === "object") {
    const obj = json as { data?: T[]; items?: T[] };
    return obj.data ?? obj.items ?? [];
  }
  return [];
}
