import type { AiAppId, DiscoveredApp, InstalledProgram, ShortcutRecord } from "./types";
import { AI_APP_IDS } from "./types";

export interface AiAppPattern {
  id: AiAppId;
  label: string;
  /** Tested against shortcut names, target file names, and uninstall display names. */
  pattern: RegExp;
}

/**
 * Word-boundary matches so "Chat" does not hit ChatGPT's slot and "Elm Studio"
 * does not hit LM Studio. Patterns are the whole discovery rule set.
 */
export const AI_APP_PATTERNS: readonly AiAppPattern[] = [
  { id: "chatgpt", label: "ChatGPT", pattern: /\bchat\s*gpt\b/i },
  { id: "claude", label: "Claude", pattern: /\bclaude\b/i },
  { id: "cursor", label: "Cursor", pattern: /\bcursor\b/i },
  { id: "grok", label: "Grok", pattern: /\bgrok\b/i },
  { id: "copilot", label: "Copilot", pattern: /\bcopilot\b/i },
  { id: "perplexity", label: "Perplexity", pattern: /\bperplexity\b/i },
  { id: "ollama", label: "Ollama", pattern: /\bollama\b/i },
  { id: "lm-studio", label: "LM Studio", pattern: /\blm[\s-]?studio\b/i },
];

const PATTERN_BY_ID = new Map(AI_APP_PATTERNS.map((pattern) => [pattern.id, pattern]));

export function matches(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function fileBaseName(filePath: string): string {
  const trimmed = filePath.replace(/[\\/]+$/, "");
  const slash = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  const base = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  return base.replace(/\.(exe|lnk)$/i, "");
}

interface Candidate {
  pattern: AiAppPattern;
  label: string;
  source: DiscoveredApp["source"];
  launchPath: string;
  launchKind: DiscoveredApp["launchKind"];
  /** Lower is better. Exact canonical name beats a longer shortcut, which beats the registry. */
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

/**
 * Pick at most one launchable app per known AI name.
 * A Start Menu shortcut wins over an uninstall entry. Display names that
 * match but have no shortcut and no exe path are ignored — those entries
 * are often uninstallers or bare install folders.
 */
export function matchAiApps(input: {
  shortcuts: readonly ShortcutRecord[];
  programs: readonly InstalledProgram[];
}): DiscoveredApp[] {
  const candidates: Candidate[] = [];

  for (const shortcut of input.shortcuts) {
    const targetName = shortcut.target ? fileBaseName(shortcut.target) : "";
    const haystacks = [shortcut.name, targetName].filter((value) => value.length > 0);
    for (const pattern of AI_APP_PATTERNS) {
      if (!haystacks.some((value) => matches(pattern.pattern, value))) continue;
      consider(candidates, pattern, {
        label: pattern.label,
        source: "shortcut",
        launchPath: shortcut.lnkPath,
        launchKind: "shortcut",
        rank: rankShortcut(shortcut.name, pattern.label),
      });
    }
  }

  for (const program of input.programs) {
    if (!program.exePath) continue;
    if (/unins|uninstall/i.test(program.exePath)) continue;
    const haystacks = [program.name, fileBaseName(program.exePath)];
    for (const pattern of AI_APP_PATTERNS) {
      if (!haystacks.some((value) => matches(pattern.pattern, value))) continue;
      consider(candidates, pattern, {
        label: pattern.label,
        source: "uninstall",
        launchPath: program.exePath,
        launchKind: "exe",
        rank: 10,
      });
    }
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
