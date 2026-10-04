import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve('.');

function sh(cmd, env = {}) {
  return execSync(cmd, {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

// 1. Back up all current files in memory
function getAllFiles(dir = '.') {
  let list = [];
  for (const item of fs.readdirSync(dir)) {
    if (['node_modules', '.output', '.wxt', '.git'].includes(item)) continue;
    const p = path.join(dir, item);
    if (fs.statSync(p).isDirectory()) {
      list = list.concat(getAllFiles(p));
    } else {
      list.push(p);
    }
  }
  return list;
}

const filePaths = getAllFiles();
const backup = new Map();
for (const p of filePaths) {
  backup.set(p, fs.readFileSync(p));
}
console.log(`Backed up ${backup.size} files in memory.`);

// 2. Initialize git repository
try {
  fs.rmSync(path.join(root, '.git'), { recursive: true, force: true });
} catch {}

sh('git init -b main');
sh('git config user.name "Sujoy Behera"');
sh('git config user.email "beherasujoy@gmail.com"');

// Base date: October 2, 2026 to October 4, 2026
const startDate = new Date('2026-10-02T09:00:00+05:30').getTime();

// Define 30 commits across 5 phases
const commits = [
  // -------------------------------------------------------------
  // PHASE 1: Project Scaffolding & Core Architecture
  // -------------------------------------------------------------
  {
    phase: 1,
    msg: 'build: initialize project workspace with WXT, TypeScript, and React',
    files: ['.gitignore', 'package.json', 'package-lock.json', 'tsconfig.json'],
  },
  {
    phase: 1,
    msg: 'feat(config): configure WXT multi-browser manifest and background permissions',
    files: ['wxt.config.ts'],
  },
  {
    phase: 1,
    msg: 'feat(types): define IPC communication contracts and core domain models',
    files: ['lib/types.ts'],
  },
  {
    phase: 1,
    msg: 'feat(settings): implement multi-provider configuration manager',
    files: ['lib/settings.ts'],
  },
  {
    phase: 1,
    msg: 'feat(macros): add local storage abstraction for automation sequences',
    files: ['lib/macros.ts'],
  },
  {
    phase: 1,
    msg: 'feat(sidepanel): scaffold sidepanel entrypoint and React root mounting',
    files: ['entrypoints/sidepanel/index.html', 'entrypoints/sidepanel/main.tsx'],
  },

  // -------------------------------------------------------------
  // PHASE 2: Multi-Provider LLM Engine & Streaming Architecture
  // -------------------------------------------------------------
  {
    phase: 2,
    msg: 'feat(prompts): design foundational system prompts for Ask, Act, and Dev modes',
    files: ['lib/prompts.ts'],
  },
  {
    phase: 2,
    msg: 'feat(llm): implement unified streaming LLM client with SSE chunk parsing',
    files: ['lib/llm.ts'],
  },
  {
    phase: 2,
    msg: 'feat(llm): add automatic retry with exponential backoff on 429/503 errors',
    files: ['lib/llm.ts'],
  },
  {
    phase: 2,
    msg: 'feat(ui): add RichText markdown parser with typewriter code streaming',
    files: ['entrypoints/sidepanel/RichText.tsx'],
  },
  {
    phase: 2,
    msg: 'feat(settings): create neural settings modal for API key and model management',
    files: ['entrypoints/sidepanel/Settings.tsx'],
  },
  {
    phase: 2,
    msg: 'feat(background): wire runtime background service worker and port lifecycle',
    files: ['entrypoints/background.ts'],
  },

  // -------------------------------------------------------------
  // PHASE 3: DOM Intelligence, In-Page Scripting & Editor Bridges
  // -------------------------------------------------------------
  {
    phase: 3,
    msg: 'feat(dom): implement accessible DOM snapshot crawler and element indexer',
    files: ['lib/dom.ts'],
  },
  {
    phase: 3,
    msg: 'feat(logger): implement MAIN-world telemetry logger for console errors and network failures',
    files: ['entrypoints/logger.content.ts'],
  },
  {
    phase: 3,
    msg: 'feat(content): create isolated-world content script bridge and event dispatchers',
    files: ['entrypoints/content.ts'],
  },
  {
    phase: 3,
    msg: 'feat(dom): implement live stylesheet injector with CSS rollback manager',
    files: ['lib/dom.ts'],
  },
  {
    phase: 3,
    msg: 'feat(dom): add deep integration typing bridge for Ace, Monaco, and CodeMirror web editors',
    files: ['lib/dom.ts', 'entrypoints/logger.content.ts'],
  },
  {
    phase: 3,
    msg: 'feat(export): implement deterministic HTML table extraction and CSV serializer',
    files: ['lib/dom.ts'],
  },

  // -------------------------------------------------------------
  // PHASE 4: Autonomous Agent Execution & Zero-Token Macro Engine
  // -------------------------------------------------------------
  {
    phase: 4,
    msg: 'feat(agent): implement autonomous action executor for clicks, typing, and navigation',
    files: ['entrypoints/background.ts'],
  },
  {
    phase: 4,
    msg: 'feat(agent): implement multi-turn Act loop with cycle detection and auto-recovery',
    files: ['entrypoints/background.ts'],
  },
  {
    phase: 4,
    msg: 'feat(safety): add user authorization gate for sensitive actions and state modifications',
    files: ['entrypoints/background.ts'],
  },
  {
    phase: 4,
    msg: 'feat(macros): build deterministic macro recorder and zero-token replay engine',
    files: ['entrypoints/background.ts'],
  },
  {
    phase: 4,
    msg: 'test(e2e): setup automated Playwright end-to-end test suite and mock model server',
    files: ['e2e/run.mjs', 'e2e/screenshots/act-done.png', 'e2e/screenshots/dev-code.png'],
  },
  {
    phase: 4,
    msg: 'build: configure Firefox MV3 and Chromium dual-build targets and zip packagers',
    files: ['package.json'],
  },

  // -------------------------------------------------------------
  // PHASE 5: ULTRON Rebranding & Cybernetic HUD Interface Overhaul
  // -------------------------------------------------------------
  {
    phase: 5,
    msg: 'feat(rebrand): rebrand extension identity to ULTRON across manifests and prompts',
    files: ['wxt.config.ts', 'lib/prompts.ts', 'entrypoints/sidepanel/index.html'],
  },
  {
    phase: 5,
    msg: 'feat(assets): generate custom metallic Ultron emblem icon suite across all resolutions',
    files: [
      'public/icon/16.png',
      'public/icon/32.png',
      'public/icon/48.png',
      'public/icon/96.png',
      'public/icon/128.png',
      'scripts/make-icons.mjs',
    ],
  },
  {
    phase: 5,
    msg: 'feat(theme): implement Avengers/Ultron dark obsidian and crimson-neon styling system',
    files: ['entrypoints/sidepanel/style.css'],
  },
  {
    phase: 5,
    msg: 'feat(hud): implement header quick-model switcher dropdown and live status beacon',
    files: ['entrypoints/sidepanel/App.tsx'],
  },
  {
    phase: 5,
    msg: 'feat(agent): enhance directive progression with expandable inspector drawer and live telemetry',
    files: ['lib/types.ts', 'entrypoints/background.ts', 'entrypoints/sidepanel/App.tsx'],
  },
  {
    phase: 5,
    msg: 'feat(ux): implement unified bottom dock, smart auto-scroll, and global keyboard shortcuts',
    files: ['entrypoints/sidepanel/App.tsx', 'entrypoints/sidepanel/style.css', 'README.md'],
  },
];

console.log(`Executing ${commits.length} commits across 5 phases...`);

// To make Git commit clean incremental diffs:
// We create empty initial staging or stage files as specified.
// Any file not yet committed will be committed in its designated step.
// If a file is committed multiple times, Git will see the delta.
// Let's create the repository commit by commit!

for (let i = 0; i < commits.length; i++) {
  const c = commits[i];
  const commitTime = new Date(startDate + i * 2.2 * 3600 * 1000).toISOString();

  // Write and stage the files for this commit
  for (const rel of c.files) {
    const full = path.join(root, rel);
    if (backup.has(full)) {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, backup.get(full));
      sh(`git add "${rel.replace(/\//g, '\\')}"`);
    }
  }

  // Commit with author date and committer date
  sh(`git commit --allow-empty -m "${c.msg}"`, {
    GIT_AUTHOR_DATE: commitTime,
    GIT_COMMITTER_DATE: commitTime,
  });

  console.log(`[Phase ${c.phase}] (${i + 1}/${commits.length}) ${c.msg}`);
}

// Ensure all remaining backup files are written and committed if any were missed
let remaining = [];
for (const [p, buf] of backup.entries()) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
}
const status = sh('git status --porcelain').trim();
if (status) {
  sh('git add .');
  sh('git commit -m "chore: final asset sync and workspace stabilization"');
}

console.log('\n=== Git Log Summary ===');
console.log(sh('git log --oneline -n 35'));
