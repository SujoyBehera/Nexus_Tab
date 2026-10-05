# Nexus Tab

> **Autonomous Cybernetic Web Intelligence & DOM Synthesizer**
> *Living directly in your browser's side panel.*

Nexus Tab is an autonomous AI browser companion featuring an **electric crystalline cybernetic HUD theme**, deep obsidian styling, glowing cyan accents, tactical directive execution, live in-page code synthesis, and zero-token deterministic macros.

Compatible with **Brave**, **Google Chrome**, **Microsoft Edge**, and **Mozilla Firefox**.

---

## ⚡ What's New in the Nexus Tab Edition

* **Crystalline Cybernetic Aesthetic**:
  * Deep midnight sapphire chassis (`#070a13`) with electric cyan glowing accents (`#0ea5e9`, `#38bdf8`) and tactical telemetry highlights.
  * Custom crystalline circuit emblem icon and animated halo pulse indicator.
  * Status Beacon in header: `CORE ONLINE` (ready), `EXECUTING` (pulsing cyan radar during active directives), `OVERRIDE REQ` (tactical authorization needed).
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

## 🚀 Direct Download & 1-Click Install

Download ready-to-run packages directly from [**Releases**](https://github.com/SujoyBehera/Ultron/releases):

| Browser | Package | Installation (30 Seconds) |
| :--- | :--- | :--- |
| **🦊 Mozilla Firefox** | [**`nexus-tab-0.1.0-firefox-signed.xpi`**](https://github.com/SujoyBehera/Ultron/releases/download/v0.1.0/nexus-tab-0.1.0-firefox-signed.xpi) | Officially signed by Mozilla! Drag & drop the `.xpi` file directly into any Firefox window and click **Add**. |
| **🌐 Chrome / Brave / Edge** | [**`nexus-tab-0.1.0-chrome.zip`**](https://github.com/SujoyBehera/Ultron/releases/download/v0.1.0/nexus-tab-0.1.0-chrome.zip) | Extract zip ➔ open `chrome://extensions` ➔ toggle **Developer mode** ➔ click **Load unpacked** ➔ select folder. |

---

## 📦 Quick Start & Installation

### Option A: Direct Install (Recommended for End Users)

#### 🦊 Mozilla Firefox (Permanent Signed Install)
1. Download [**`nexus-tab-0.1.0-firefox-signed.xpi`**](https://github.com/SujoyBehera/Ultron/releases/download/v0.1.0/nexus-tab-0.1.0-firefox-signed.xpi).
2. Drag and drop the downloaded `.xpi` file into Firefox (or open `about:addons` ➔ ⚙️ ➔ **Install Add-on From File...**).
3. Click **Add** when prompted.
4. Go to `about:addons` → **Nexus Tab** → **Permissions**, and verify **"Access your data for all websites"** is toggled **ON** (required by Firefox MV3 for sidebar and page interaction).
5. Done! Nexus Tab stays permanently installed across all sessions and restarts.

#### 🌐 Google Chrome / Brave / Microsoft Edge
1. Download [**`nexus-tab-0.1.0-chrome.zip`**](https://github.com/SujoyBehera/Ultron/releases/download/v0.1.0/nexus-tab-0.1.0-chrome.zip).
2. Unzip the file into a folder on your computer.
3. In your browser, navigate to `chrome://extensions` (or `brave://extensions` / `edge://extensions`).
4. Toggle on **Developer mode** in the top right.
5. Click **Load unpacked** in the top left and select the unzipped folder.
6. Click the Nexus Tab emblem in your extension toolbar to launch the cybernetic side panel.

---

### Option B: Build from Source (Developers)

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
