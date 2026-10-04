# ULTRON

> **Autonomous Cybernetic Web Intelligence & DOM Synthesizer**
> *Living directly in your browser's side panel.*

ULTRON is an autonomous AI browser companion with an **Ultron cybernetic HUD theme** featuring metallic obsidian styling, crimson neon glowing accents, tactical directive execution, live in-page code synthesis, and zero-token deterministic macros.

Compatible with **Brave**, **Google Chrome**, **Microsoft Edge**, and **Mozilla Firefox**.

---

## ⚡ What's New in the ULTRON Edition

* **Ultron Cybernetic Aesthetic**:
  * Dark metallic obsidian chassis (`#07080c`) with glowing crimson neon accents (`#ef4444`) and tactical arc-cyan telemetry highlights.
  * Custom metallic Ultron emblem icon and animated halo pulse indicator.
  * Status Beacon in header: `CORE ONLINE` (ready), `EXECUTING` (pulsing crimson radar during active directives), `OVERRIDE REQ` (tactical authorization needed).
* **Header Quick-Model Switcher**:
  * Seamlessly toggle active AI providers and models (Google Gemini, OpenAI, Claude, Ollama local, OpenRouter, Groq) directly from the top bar dropdown without needing to open Settings.
* **Autonomous Directive Progression**:
  * High-tech step execution cards in Act mode with live status beacons (`EXEC`, `DONE`, `FAIL`, `HALT`).
* **Live In-Page Code Synthesis & Injection**:
  * Real-time typewriter code generation in Dev mode.
  * Direct DOM styling (`Apply to page` with instant `Undo`) and script execution.
  * Native deep integration with online compilers & editors (**Ace / OnlineGDB**, **Monaco**, **CodeMirror**).
* **Zero-Token Autonomous Protocols**:
  * Save any multi-step browser sequence as a deterministic macro that replays instantly with **0 tokens and 0 AI latency**.

---

## Ready-to-Deploy Packages

The build creates store-ready distribution zips in `.output/`:

* **Brave / Chrome / Edge**: `.output/webpilot-0.1.0-chrome.zip` (Upload to Chrome Web Store or Edge Add-ons)
* **Firefox**: `.output/webpilot-0.1.0-firefox.zip` (Upload to Mozilla Add-ons / AMO)
* **Firefox Sources (required by AMO)**: `.output/webpilot-0.1.0-sources.zip`

---

## 📦 Quick Start & Installation

### 1. Clone & Build
```bash
git clone https://github.com/SujoyBehera/Ultron.git
cd Ultron
npm install

# Build for Brave / Google Chrome / Microsoft Edge:
npm run build

# Build for Mozilla Firefox:
npm run build:firefox
```

---

### 2. Load into Your Browser

#### Mozilla Firefox
1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select the `manifest.json` file located in the output folder:
   ```
   .output/firefox-mv3/manifest.json
   ```
4. Open `about:addons` → **ULTRON** → **Permissions**, and verify **"Access your data for all websites"** is toggled ON (required by Firefox MV3 for content scripts).
5. Click the ULTRON emblem in your toolbar or sidebar to open the cybernetic side panel.

#### Brave / Google Chrome / Microsoft Edge
1. Navigate to `brave://extensions` (or `chrome://extensions` / `edge://extensions`).
2. Toggle on **Developer mode** in the top right.
3. Click **Load unpacked**.
4. Select the build directory:
   ```
   .output/chrome-mv3
   ```
5. Click the ULTRON emblem in your extension toolbar to launch the side panel.

---

## Operational Modes

| Mode | Tactical Function |
| :--- | :--- |
| **ASK (Intel)** | Analytical & read-only. Synthesize page summaries, extract key points, analyze tables, and export all HTML tables into clean CSV files. |
| **ACT (Operate)** | Autonomous cybernetic browser operator. Reads visible interactive elements, clicks buttons, fills inputs, operates online code compilers, and executes step-by-step tasks. |
| **DEV (Synthesize)** | Systems architect and front-end engineer. Inspects page DOM, network telemetry, and console errors; streams code live onto your screen with 1-click page injection. |

---

## Build & Test Commands

```powershell
# Build unpacked extensions
$env:Path = "C:\Program Files\nodejs;" + $env:Path; npx.cmd wxt build
$env:Path = "C:\Program Files\nodejs;" + $env:Path; npx.cmd wxt build -b firefox --mv3

# Package distribution ZIPs
$env:Path = "C:\Program Files\nodejs;" + $env:Path; npx.cmd wxt zip
$env:Path = "C:\Program Files\nodejs;" + $env:Path; npx.cmd wxt zip -b firefox --mv3

# Run Automated Playwright E2E Test Suite (16/16 verified)
$env:Path = "C:\Program Files\nodejs;" + $env:Path; node e2e/run.mjs
```
