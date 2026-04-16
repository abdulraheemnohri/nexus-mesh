# 📦 NEXUS MESH
**Self-Hosted P2P Real-Time Collaboration Hub**
*Zero Backend • Browser-Native WebRTC • Modern Glassmorphism UI*

Nexus Mesh is a decentralized platform for real-time multi-user collaboration. It operates entirely peer-to-peer (P2P), meaning your data never touches a server. All synchronization happens directly between browsers using WebRTC.

---

## Architecture Overview
- **Signaling:** PeerJS (CDN) for initial handshakes.
- **Data Transport:** WebRTC Data Channels (reliable/ordered).
- **Topology:** Full Mesh (peers connect to everyone) with Host Relay fallback.
- **State Sync:** Delta broadcasting + Periodic Full Sync (Last-write-wins).
- **Persistence:** IndexedDB + LocalStorage for offline survival.
- **Rendering:** Vanilla JS (ES6+) + CSS Variables (No frameworks).

---

## Core Features

### 1. P2P Connection Engine
- **Unique Room IDs:** Generate 6-character codes for private sessions.
- **QR Code Sharing:** Instant join via mobile scan.
- **Topology Visualizer:** Real-time view of the active peer network.
- **Auto-Discovery:** Join via URL parameters.
- **Resilient Sync:** Automatic reconnection on network drop.

### 2. Collaborative Media Player
- **YouTube Integration:** Sync play/pause/seek across all peers.
- **Shared Queue:** Upvote/downvote videos to determine playback order.
- **Host Control Mode:** Optional mode where only the room creator controls the player.
- **Queue Logic:** Seamlessly transitions to the next video in the queue.

### 3. Live Polling System
- **Real-Time Voting:** Dynamic bar charts update instantly as peers vote.
- **Expiry Timers:** Set polls to auto-close after a configurable duration.
- **Anonymous Mode:** Toggle privacy for sensitive votes.
- **Multi-Option:** Support for 2–6 custom voting options.

### 4. Ephemeral Message Wall
- **Auto-Deletion:** Messages fade out and delete after a set time (10s–5m).
- **Visual Progress:** Life-bars on messages show exactly when they will expire.
- **Bottts Avatars:** Unique auto-generated avatars for every peer.
- **Profanity Filter:** Basic local filtering for safer communication.

### 5. Data & Portability
- **JSON Export/Import:** Save and load entire room states.
- **Persistent Storage:** Your room state survives browser refreshes.
- **Privacy First:** "Clear Local Data" button for instant cleanup.

---

## Modern UI/UX Design System
- **Style:** Glassmorphism + Neo-minimalism (Deep Dark & Light themes).
- **Responsive:** Mobile-first design with a dedicated Mobile Tab Navigation.
- **Micro-Interactions:** Smooth CSS transitions, connection pulse HUD, and life-bar animations.
- **Accessibility:** ARIA labels, focus rings, and font scaling support.

---

## Multi-Platform Support
Nexus Mesh is ready to be deployed as a web app or packaged for desktop/mobile:
- **Windows:** Electron-based Installer and Portable EXE.
- **Android:** Capacitor-based Debug APK.
- **Web:** Deployable to GitHub Pages, Vercel, or Netlify.

---

## CI/CD Workflow
This repository includes a GitHub Actions workflow that automatically generates:
- **Windows Portable & Setup EXE**
- **Android Debug APK**
On every push to the main branch.

---

## Technical Constraints
- **Zero Frameworks:** No React, Vue, or Svelte. Just pure Vanilla JS.
- **Unique:** No database or API needed beyond signaling and YouTube.
- **Self-Contained:** Designed to run anywhere with a modern browser.

---

## 🚀 Quick Start (Local Development)

1. **Clone & Install:**
   ```bash
   npm install
   ```

2. **Run Web App:**
   Open `www/index.html` directly in your browser or use a local server.

3. **Desktop (Electron):**
   ```bash
   npm run start:electron
   ```

4. **Build Binaries:**
   - **Windows:** `npm run build:win`
   - **Android:** `npx cap sync android` then build in Android Studio.
