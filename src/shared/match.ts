import type { AiAppId, DiscoveredApp, InstalledProgram, ShortcutRecord } from "./types";
import { AI_APP_IDS } from "./types";
import { isStoreAppId, type StoreApp } from "./start-apps";

export interface AiAppPattern {
  id: AiAppId;
  label: string;
  /** Tested against shortcut names, target file names, and uninstall display names. */
  pattern: RegExp;
}

/**
 * Cursor and Copilot are anchored to the product name so "Mouse Cursor" and
 * "GitHub Copilot" do not take those tiles. Other names still use a word boundary.
 */
export const AI_APP_PATTERNS: readonly AiAppPattern[] = [
  { id: "chatgpt", label: "ChatGPT", pattern: /\bchat\s*gpt\b/i },
  { id: "claude", label: "Claude", pattern: /\bclaude\b/i },
  { id: "cursor", label: "Cursor", pattern: /^cursor(?:\s*\([^)]*\))?$/i },
  { id: "grok", label: "Grok", pattern: /\bgrok\b/i },
  { id: "copilot", label: "Copilot", pattern: /^(?:microsoft\s+)?copilot(?:\s*\([^)]*\))?$/i },
  { id: "perplexity", label: "Perplexity", pattern: /\bperplexity\b/i },
  { id: "ollama", label: "Ollama", pattern: /\bollama\b/i },
  { id: "lm-studio", label: "LM Studio", pattern: /\blm[\s-]?studio\b/i },
];

const PATTERN_BY_ID = new Map(AI_APP_PATTERNS.map((pattern) => [pattern.id, pattern]));

function fileBaseName(filePath: string): string {
  const trimmed = filePath.replace(/[\\/]+$/, "");
  const slash = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  const base = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  return base.replace(/\.(exe|lnk)$/i, "");
}

function isUninstaller(name: string, target?: string): boolean {
  if (/unins|uninstall/i.test(name)) return true;
  if (target && /unins|uninstall/i.test(target)) return true;
  return false;
}

interface Candidate {
  pattern: AiAppPattern;
  label: string;
  source: DiscoveredApp["source"];
  launchPath: string;
  launchKind: DiscoveredApp["launchKind"];
  /** Lower is better. Exact canonical name beats a longer shortcut, then a Store app, then the registry. */
  rank: number;
}

function consider(
  candidates: Candidate[],
  pattern: AiAppPattern,
  candidate: Omit<Candidate, "pattern">,
): void {
  candidates.push({ pattern, ...candidate });
}

function rankShortcut(name: string, canonical: string): number {
  if (name.trim().toLowerCase() === canonical.toLowerCase()) return 0;
  return 1 + Math.min(name.length, 500) / 1000;
}

function considerName(
  candidates: Candidate[],
  haystacks: string[],
  candidate: Omit<Candidate, "pattern" | "label" | "rank">,
  rankFor: (pattern: AiAppPattern) => number,
): void {
  for (const pattern of AI_APP_PATTERNS) {
    if (!haystacks.some((value) => pattern.pattern.test(value))) continue;
    consider(candidates, pattern, { label: pattern.label, rank: rankFor(pattern), ...candidate });
  }
}

/**
 * Pick at most one launchable app per known AI name.
 * A Start Menu shortcut wins over a Store app, which wins over an uninstall entry.
 * Uninstallers are ignored in every source.
 */
export function matchAiApps(input: {
  shortcuts: readonly ShortcutRecord[];
  programs: readonly InstalledProgram[];
  storeApps?: readonly StoreApp[];
}): DiscoveredApp[] {
  const candidates: Candidate[] = [];

  for (const shortcut of input.shortcuts) {
    if (isUninstaller(shortcut.name, shortcut.target)) continue;
    const targetName = shortcut.target ? fileBaseName(shortcut.target) : "";
    const haystacks = [shortcut.name, targetName].filter((value) => value.length > 0);
    considerName(
      candidates,
      haystacks,
      {
        source: "shortcut",
        launchPath: shortcut.lnkPath,
        launchKind: "shortcut",
      },
      (pattern) => rankShortcut(shortcut.name, pattern.label),
    );
  }

  for (const app of input.storeApps ?? []) {
    if (isUninstaller(app.name) || !isStoreAppId(app.appId)) continue;
    considerName(candidates, [app.name], { source: "store", launchPath: app.appId, launchKind: "store" }, () => 5);
  }

  for (const program of input.programs) {
    if (!program.exePath || isUninstaller(program.name, program.exePath)) continue;
    considerName(
      candidates,
      [program.name, fileBaseName(program.exePath)],
      { source: "uninstall", launchPath: program.exePath, launchKind: "exe" },
      () => 10,
    );
  }

  const best = new Map<AiAppId, Candidate>();
  for (const candidate of candidates) {
    const current = best.get(candidate.pattern.id);
    if (!current || candidate.rank < current.rank) best.set(candidate.pattern.id, candidate);
  }

  const found: DiscoveredApp[] = [];
  for (const id of AI_APP_IDS) {
    const winner = best.get(id);
    const pattern = PATTERN_BY_ID.get(id);
    if (!winner || !pattern) continue;
    found.push({
      id,
      label: pattern.label,
      source: winner.source,
      launchPath: winner.launchPath,
      launchKind: winner.launchKind,
    });
  }
  return found;
}
