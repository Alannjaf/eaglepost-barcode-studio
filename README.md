# EaglePost Barcode Studio

A Windows desktop app for EaglePost staff to turn the branch barcode batches created in **Ondi** into print-ready sticker PDFs.

- **Sign in with Ondi.** The app opens on a sign-in screen. Only Ondi Admin accounts that can read institutions and branches get in.
- **Design stickers.** Upload a label design (PDF), place the barcodes, set size, multi-up layout and barcode type.
- **Pull barcodes from Ondi.** Pick institution → branch → batch(es); the codes come straight from Ondi.
- **Print and track.** Quick Print makes one PDF, opens the print window, and records which codes were printed, so nothing gets printed twice.
- **Data stays on the PC.** Designs, templates, folders and printed-code records are stored locally inside the app. Nothing is uploaded anywhere except the Ondi sign-in and barcode reads.
- **Backup.** Settings → Data Management → *Export backup* saves everything to one `.zip`. *Import backup* loads it on the same or another PC (add to existing data, or replace everything).

## Install

Download the latest `EaglePost-Barcode-Studio-Setup-x.y.z.exe` from [Releases](../../releases/latest) and run it.
The installer is not code-signed, so Windows may show "Windows protected your PC": click **More info → Run anyway**.

Downloaded PDFs and backups are saved to `Downloads\EaglePost Barcode Studio`.

## Updates

Every push to `main` builds a new installer on GitHub Actions and publishes it as a release (version `1.0.<build number>`).
The installed app checks for a new release when it starts (and every 4 hours) and asks **"Update now?"**. Local data is kept during updates.

## Develop

```sh
npm ci
npm run dev        # web version in the browser, http://localhost:8080
npm run desktop    # build and open the desktop app
npm run dist:win   # build the Windows installer into release/ (needs Windows, or Wine)
```

Stack: Vite + React + TypeScript, Tailwind + shadcn/ui, pdf-lib / pdf.js, JsBarcode, Electron, electron-builder, electron-updater.
Local storage is IndexedDB behind a small Supabase-compatible layer (`src/integrations/local/localdb.ts`), so the pages keep using `supabase.from(...)`.
