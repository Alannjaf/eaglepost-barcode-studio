import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);

// Web-app (browser) install: offline cache + ask the browser to keep local data permanently.
if (location.protocol === "https:" && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("Service worker failed", e));
}
navigator.storage?.persist?.().catch(() => {});
