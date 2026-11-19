// Ondi (Eagle Post LMD) connection config.
// These are PUBLIC values — the same anon key + base URLs ship in Ondi's own web app bundle.
// They can be overridden at build time via VITE_ONDI_* env vars.

export const ONDI = {
  authBase: import.meta.env.VITE_ONDI_AUTH_BASE ?? "https://api-control.eaglepost.com/auth/v1",
  functionsBase:
    import.meta.env.VITE_ONDI_FUNCTIONS_BASE ?? "https://api-control.eaglepost.com/functions/v1",
  tenantId: import.meta.env.VITE_ONDI_TENANT_ID ?? "bfdf4ee6-13a2-499a-a588-ff62b6d424d6",
  anonKey:
    import.meta.env.VITE_ONDI_ANON_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvdmlsZ3F6aWFyenJja3FkaXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNDA5NDYsImV4cCI6MjA4ODgxNjk0Nn0.1VHO43ZsrvXkrhjljU9Q8yx4z92wXXvtHffYjk16pXQ",
} as const;
