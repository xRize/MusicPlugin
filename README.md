# 🎵 Pengu Media Plugin

A sleek, native-powered media widget for the League of Legends client. 

Built with **TypeScript** and **C#**, this plugin seamlessly integrates your Windows media sessions directly into your LoL experience.

---

### ✨ Features

- **🎯 Native Integration:** Reads Windows Media Sessions from Spotify, Chrome, YouTube, and more.
- **🎨 Dynamic UI:** Animated widget that automatically shows/hides based on playback.
- **🖱️ Drag-and-Drop:** Reposition the widget anywhere on your client with a simple click and drag.
- **⚡ Performance-First:**
	- Zero client-side polling. Uses event-based triggers from the companion.
	- Minimal DOM footprint.
	- Skips redundant DOM writes when the media state has not changed.
	- Efficient local WebSocket communication.
- **🛠️ Hands-Free:** Automatically reconnects to the companion and can attempt startup through available runtime integrations.

---

### 🚀 How it Works

1. **The Companion (C#):** A lightweight background app that listens for Windows system media events and broadcasts them via a local WebSocket on `ws://127.0.0.1:8181`.
2. **The Plugin (TS):** A Pengu Loader plugin that connects to the companion and renders the UI in the League client once the Pengu viewport is available.
3. **The Controls:** Play/pause and next commands are sent back through the companion to the active Windows media session.

---

### 📦 Installation Notes

- The deployed plugin folder needs **all three files together**: `MediaCompanion.exe`, `index.js`, and `index.css`.
- On first install, run `MediaCompanion.exe` once manually so it can register its startup entry and the `media-companion://` protocol.
- If your Pengu runtime does not expose native spawn APIs, that one-time manual launch is required.
- If you see `WebSocket error` in the League client console, verify that `MediaCompanion.exe` is running and listening on `127.0.0.1:8181`.

---

### 🛠️ Tech Stack

- **Frontend:** TypeScript, Vite, CSS3 (Animations)
- **Backend:** C# (.NET 9), Windows Media APIs, WebSockets
- **Loader:** Pengu Loader

---

### 🧪 Development

- **Plugin Build:** `pnpm.cmd build`
- **Companion Publish:** `dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ..\temp-companion`
- **Full Release Build:** `release.ps1`

---

### 📸 Preview

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/7f1dae67-6e42-4fb5-ac20-32cbc0166a21" />


---

> Built with ❤️ for the League community.
