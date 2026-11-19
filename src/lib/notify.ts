import { toast } from "sonner";

/** Extract a human-readable detail string from any thrown error / Supabase error object. */
function detailOf(err?: unknown): string | undefined {
  if (!err) return undefined;
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return undefined;
}

/** Show an error toast (and log the underlying error to the console). */
export function notifyError(message: string, err?: unknown): void {
  if (err !== undefined) console.error(message, err);
  const description = detailOf(err);
  toast.error(message, description ? { description } : undefined);
}

export function notifySuccess(message: string, description?: string): void {
  toast.success(message, description ? { description } : undefined);
}

export function notifyInfo(message: string, description?: string): void {
  toast(message, description ? { description } : undefined);
}
