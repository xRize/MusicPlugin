# 🎵 Pengu Media Plugin

A sleek, native-powered media widget for the League of Legends client. 

Built with **TypeScript** and **C#**, this plugin seamlessly integrates your Windows media sessions directly into your LoL experience.

---

### ✨ Features

- **🎯 Native Integration:** Reads Windows Media Sessions from Spotify, Chrome, YouTube, and more.
- **🎨 Dynamic UI:** Animated widget that automatically shows/hides based on playback.
- **🖱️ Drag-and-Drop:** Reposition the widget anywhere on your client with a simple click and drag.
- **⚡ Performance-First:** 
  - Zero polling. Uses event-based triggers.
  - Minimal DOM footprint.
  - Efficient WebSocket communication.
- **🛠️ Hands-Free:** Automatically detects and switches between active media sources.

---

### 🚀 How it Works

1. **The Companion (C#):** A lightweight background app that listens for Windows system media events and broadcasts them via a local WebSocket.
2. **The Plugin (TS):** A Pengu Loader plugin that connects to the companion and renders the UI in the League client.

---

### 🛠️ Tech Stack

- **Frontend:** TypeScript, Vite, CSS3 (Animations)
- **Backend:** C# (.NET 9), Windows Media APIs, WebSockets
- **Loader:** Pengu Loader

---

### 📸 Preview

*Stay tuned for screenshots!*

---

> Built with ❤️ for the League community.
