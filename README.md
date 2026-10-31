# Nexus Tab

> **Autonomous Cybernetic Web Intelligence & DOM Synthesizer**
> *Living directly in your browser's side panel.*

Nexus Tab is an autonomous AI browser companion featuring an **electric crystalline cybernetic HUD theme**, deep obsidian styling, glowing cyan accents, tactical directive execution, live in-page code synthesis, and zero-token deterministic macros.

Compatible with **Brave**, **Google Chrome**, **Microsoft Edge**, and **Mozilla Firefox**.

---

## ⚡ What's New in the Nexus Tab Edition

* **v0.2.1 Event Pipeline & Custom Component Grounding Engine**:
  * **Custom React / Vue Card Grounding**: Intelligently identifies styled `<div>` cards, custom radio groups, option tiles, and `cursor: pointer` interactive elements.
  * **Realistic Native Event Pipeline**: Dispatches spec-compliant pointer & mouse sequences (`pointerover` → `mouseover` → `pointerdown` → `mousedown` → `focus` → `pointerup` → `mouseup` → `click`) with accurate coordinates, pressure, and button state.
  * **Dual-Dispatch Control Synchronization**: Automatically detects and activates nested native `<input type="radio">` or `<input type="checkbox">` elements when clicking custom wrapper cards.
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

Download ready-to-run packages directly from [**Releases**](https://github.com/SujoyBehera/Nexus_Tab/releases):

| Browser | Package | Installation |
| :--- | :--- | :--- |
| **🌐 Chrome / Brave / Edge** | [**`nexus-tab-0.2.1-chrome.zip`**](https://github.com/SujoyBehera/Nexus_Tab/releases/download/v0.2.1/nexus-tab-0.2.1-chrome.zip) | Extract zip ➔ open `chrome://extensions` ➔ toggle **Developer mode** ➔ click **Load unpacked** ➔ select `.output/chrome-mv3`. |
| **🦊 Mozilla Firefox** | [**`nexus-tab-0.2.1-firefox.zip`**](https://github.com/SujoyBehera/Nexus_Tab/releases/download/v0.2.1/nexus-tab-0.2.1-firefox.zip) | Open `about:debugging#/runtime/this-firefox` ➔ click **Load Temporary Add-on...** ➔ select `manifest.json` or zip. *(See below for permanent install).* |

---

## 📦 Quick Start & Installation

### Option A: Direct Install

#### 🌐 Google Chrome / Brave / Microsoft Edge
1. Download [**`nexus-tab-0.2.1-chrome.zip`**](https://github.com/SujoyBehera/Nexus_Tab/releases/download/v0.2.1/nexus-tab-0.2.1-chrome.zip).
2. Unzip the file into a folder on your computer.
3. In your browser, navigate to `chrome://extensions` (or `brave://extensions` / `edge://extensions`).
4. Toggle on **Developer mode** in the top right.
5. Click **Load unpacked** in the top left and select the unzipped folder (or `.output/chrome-mv3`).
6. Click the Nexus Tab emblem in your extension toolbar to launch the cybernetic side panel.

#### 🦊 Mozilla Firefox

##### Method 1: Instant Load (Testing & Development)
1. In Firefox, navigate to `about:debugging#/runtime/this-firefox`.
2. Click **"Load Temporary Add-on..."**.
3. Select `manifest.json` from `.output/firefox-mv3/` (or select `nexus-tab-0.2.1-firefox.zip`).
4. Nexus Tab will load instantly into your browser.

##### Method 2: Permanent Install Across Restarts
Because standard Firefox enforces mandatory code signing:
* **Option 2A (Permanent via Free Mozilla AMO Self-Signing):**
  1. Open [**Mozilla Developer Hub**](https://addons.mozilla.org/developers/addon/submit/distribution).
  2. Choose **"On your own"** *(unlisted/self-distribution)*.
  3. Upload `nexus-tab-0.2.1-firefox.zip`.
  4. Mozilla's automated scanner signs it within 2 minutes and generates your permanent `.xpi` installer.
  5. Drag the signed `.xpi` into Firefox and click **Add**.
* **Option 2B (Firefox Developer Edition / Nightly / ESR):**
  1. Go to `about:config` and set `xpinstall.signatures.required` to `false`.
  2. Open `about:addons` ➔ ⚙️ ➔ **Install Add-on From File...** ➔ select the zip file.

---

### Option B: Build from Source (Developers)

```bash
git clone https://github.com/SujoyBehera/Nexus_Tab.git
cd Nexus_Tab
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

# Run Automated Playwright E2E Test Suite (18/18 verified)
$env:Path = "C:\Program Files\nodejs;" + $env:Path; node e2e/run.mjs
```


Co-authored-by: Anwesha Krishna <anwesha.k2906@gmail.com>
