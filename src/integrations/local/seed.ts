// First-run seeding: if this PC has no data yet, load the starter templates that ship with
// the app (public/seed/starter-templates.zip, a normal backup file). Runs once per PC.
import { importBackup, isEmpty } from "./localdb";

const FLAG = "barcode-seeded-v1";

export async function seedStarterTemplatesOnce(): Promise<void> {
  try {
    if (localStorage.getItem(FLAG)) return;
  } catch {
    /* ignore */
  }
  if (!(await isEmpty())) {
    markDone();
    return;
  }
  const res = await fetch(new URL("seed/starter-templates.zip", document.baseURI).toString()).catch(() => null);
  if (res && res.ok) {
    const blob = await res.blob();
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    // Only a real zip ("PK"); a missing file may come back as the app's index.html.
    if (head[0] === 0x50 && head[1] === 0x4b) await importBackup(blob, "merge");
  }
  markDone();
}

function markDone() {
  try {
    localStorage.setItem(FLAG, new Date().toISOString());
  } catch {
    /* ignore */
  }
}
