import { browser } from 'wxt/browser';
import type { Macro, MacroStep, ElementInfo } from './types';

const KEY = 'macros';

export async function loadMacros(): Promise<Macro[]> {
  const m = (await browser.storage.local.get(KEY))[KEY] as Macro[] | undefined;
  return Array.isArray(m) ? m : [];
}

export async function saveMacros(macros: Macro[]): Promise<void> {
  await browser.storage.local.set({ [KEY]: macros });
}

const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Re-finds a recorded element in a fresh snapshot. Prefers an exact
 * role+label match, then an exact label, then a partial label on the same role.
 */
export function findElement(elements: ElementInfo[], step: MacroStep): ElementInfo | undefined {
  const label = norm(step.label);
  const role = norm(step.role);
  if (!label) return elements.find((e) => norm(e.role) === role && !e.label);
  return (
    elements.find((e) => norm(e.role) === role && norm(e.label) === label) ??
    elements.find((e) => norm(e.label) === label) ??
    (label.length >= 3
      ? elements.find(
          (e) =>
            norm(e.role) === role &&
            (norm(e.label).includes(label) || label.includes(norm(e.label))) &&
            norm(e.label).length >= 3,
        )
      : undefined)
  );
}
