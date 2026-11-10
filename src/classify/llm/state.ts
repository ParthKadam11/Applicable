import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../../config.js";
import type { ProviderName } from "./provider.js";

export interface ProviderStateEntry {
  exhaustedUntil: string | null;
  callsToday: number;
  dayKey: string;
}

export interface LlmStateFile {
  providers: Partial<Record<ProviderName, ProviderStateEntry>>;
}

function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function emptyEntry(): ProviderStateEntry {
  return { exhaustedUntil: null, callsToday: 0, dayKey: todayKey() };
}

function statePath(): string {
  return resolve(process.cwd(), config.LLM_STATE_PATH);
}

export function loadLlmState(): LlmStateFile {
  const path = statePath();
  if (!existsSync(path)) return { providers: {} };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as LlmStateFile;
    return { providers: raw.providers ?? {} };
  } catch {
    return { providers: {} };
  }
}

export function saveLlmState(state: LlmStateFile): void {
  writeFileSync(statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function getProviderState(
  state: LlmStateFile,
  name: ProviderName,
): ProviderStateEntry {
  const entry = state.providers[name] ?? emptyEntry();
  const day = todayKey();
  if (entry.dayKey !== day) {
    return { exhaustedUntil: null, callsToday: 0, dayKey: day };
  }
  return entry;
}

export function markCall(name: ProviderName): void {
  const state = loadLlmState();
  const entry = getProviderState(state, name);
  entry.callsToday += 1;
  entry.dayKey = todayKey();
  state.providers[name] = entry;
  saveLlmState(state);
}

export function markExhausted(name: ProviderName, untilMs: number): void {
  const state = loadLlmState();
  const entry = getProviderState(state, name);
  entry.exhaustedUntil = new Date(untilMs).toISOString();
  entry.dayKey = todayKey();
  state.providers[name] = entry;
  saveLlmState(state);
}

export function clearExhaustedIfPast(name: ProviderName): boolean {
  const state = loadLlmState();
  const entry = getProviderState(state, name);
  if (!entry.exhaustedUntil) return true;
  if (Date.parse(entry.exhaustedUntil) <= Date.now()) {
    entry.exhaustedUntil = null;
    state.providers[name] = entry;
    saveLlmState(state);
    return true;
  }
  return false;
}

export function isExhausted(name: ProviderName): boolean {
  return !clearExhaustedIfPast(name);
}

export function exhaustedUntilMs(name: ProviderName): number | null {
  const entry = getProviderState(loadLlmState(), name);
  if (!entry.exhaustedUntil) return null;
  const t = Date.parse(entry.exhaustedUntil);
  return Number.isFinite(t) && t > Date.now() ? t : null;
}

export function earliestResetMs(names: ProviderName[]): number | null {
  let earliest: number | null = null;
  for (const name of names) {
    const t = exhaustedUntilMs(name);
    if (t == null) continue;
    if (earliest == null || t < earliest) earliest = t;
  }
  return earliest;
}
