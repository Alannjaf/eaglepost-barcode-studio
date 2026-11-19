import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";
import OndiConnectForm from "./OndiConnectForm";
import { useOndiStore } from "@/store/useOndiStore";
import { listInstitutions } from "@/integrations/ondi/api";
import { seedStarterTemplatesOnce } from "@/integrations/local/seed";

/**
 * Desktop front door: nothing in the app opens until the user signs in with an Ondi
 * account that can read institutions/branches (i.e. an Ondi Admin login).
 */
export default function LoginGate({ children }: { children: ReactNode }) {
  const session = useOndiStore((s) => s.session);
  const clearSession = useOndiStore((s) => s.clearSession);
  const [checking, setChecking] = useState(false);
  const [verifiedFor, setVerifiedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    seedStarterTemplatesOnce().catch((e) => console.error("Seeding templates failed", e));
  }, []);

  useEffect(() => {
    if (!session || verifiedFor === session.email) return;
    let cancelled = false;
    setChecking(true);
    listInstitutions({ force: true })
      .then(() => {
        if (!cancelled) setVerifiedFor(session.email);
      })
      .catch((e) => {
        if (cancelled) return;
        const offline = e instanceof TypeError; // fetch network failure
        if (offline) {
          // Allow working offline with an already-verified session (e.g. designing).
          setVerifiedFor(session.email);
          return;
        }
        clearSession();
        setError("This account can't open Ondi barcode batches. Please sign in with an Ondi Admin account.");
      })
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [session, verifiedFor, clearSession]);

  if (session && verifiedFor === session.email) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            EaglePost Barcode Studio
          </CardTitle>
          <CardDescription>Sign in with your Ondi Admin account to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          {checking || session ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your Ondi access…
            </div>
          ) : (
            <>
              {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
              <OndiConnectForm onConnected={() => setError(null)} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
