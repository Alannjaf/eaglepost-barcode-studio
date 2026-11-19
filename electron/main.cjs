// Desktop shell for EaglePost Barcode Studio.
// Serves the built web app (dist/) from a private app:// origin so IndexedDB data persists
// in this PC's user profile, and opens a single window. No local server, no network ports.
const { app, BrowserWindow, protocol, net, shell, Menu, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const SCHEME = "app";
const HOST = "studio";
const DIST = path.join(__dirname, "..", "dist");

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "EaglePost Barcode Studio",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // PDFs opened for printing (blob:) get their own app window with the built-in PDF viewer.
    if (url.startsWith("blob:") || url.startsWith(`${SCHEME}://`)) {
      return { action: "allow", overrideBrowserWindowOptions: { width: 1000, height: 800, autoHideMenuBar: true } };
    }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(`${SCHEME}://`)) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  win.loadURL(`${SCHEME}://${HOST}/index.html`);
}


// ---------- updates: new versions are published as GitHub releases ----------
function setupUpdates() {
  if (!app.isPackaged) return; // only the installed app checks for updates
  autoUpdater.autoDownload = false;
  autoUpdater.on("update-available", async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      title: "Update available",
      message: `A new version (${info.version}) of EaglePost Barcode Studio is available.`,
      detail: `You have version ${app.getVersion()}. Update now? Your designs and data stay on this PC.`,
      buttons: ["Update now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.downloadUpdate();
  });
  autoUpdater.on("update-downloaded", async () => {
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      title: "Update ready",
      message: "The update is downloaded. Restart the app to finish updating?",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on("error", (e) => console.error("Update check failed:", e?.message ?? e));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 5000);
  setInterval(check, 4 * 60 * 60 * 1000); // and every 4 hours while open
}

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// Save downloads (sticker PDFs, backups, CSVs) straight to Downloads\EaglePost Barcode Studio,
// never overwriting an existing file, so staff always find them in one place.
function uniquePath(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let p = path.join(dir, name);
  for (let i = 1; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`);
  return p;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const { session } = require("electron");
  session.defaultSession.on("will-download", (_e, item) => {
    const dir = path.join(app.getPath("downloads"), "EaglePost Barcode Studio");
    fs.mkdirSync(dir, { recursive: true });
    const target = uniquePath(dir, item.getFilename());
    item.setSavePath(target);
  });
  protocol.handle(SCHEME, (req) => {
    const { pathname } = new URL(req.url);
    let rel = decodeURIComponent(pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response("Forbidden", { status: 403 });
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  setupUpdates();
});

app.on("window-all-closed", () => app.quit());
