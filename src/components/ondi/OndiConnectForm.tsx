import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Link2, AlertCircle } from "lucide-react";
import { ondiLogin } from "@/integrations/ondi/client";

interface Props {
  onConnected?: () => void;
}

/** Inline Ondi login form. Each user signs in with their own Ondi/Eagle Post credentials —
 *  the same email + password they use on lmd.eaglepost.com. Nothing is shared or hard-coded. */
export default function OndiConnectForm({ onConnected }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await ondiLogin(email.trim(), password);
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect. Check your email and password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link2 className="h-4 w-4" />
        Sign in with your Ondi / Eagle Post account (same as lmd.eaglepost.com).
      </div>
      <div className="space-y-2">
        <Label htmlFor="ondi-email">Email</Label>
        <Input
          id="ondi-email"
          type="email"
          autoComplete="username"
          placeholder="you@eaglepost.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ondi-password">Password</Label>
        <Input
          id="ondi-password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error && (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={loading || !email || !password}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Connecting…
          </>
        ) : (
          "Connect to Ondi"
        )}
      </Button>
    </form>
  );
}
