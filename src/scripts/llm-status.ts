import { parseLlmProviders } from "../config.js";
import {
  buildProvider,
  getProviderState,
  isExhausted,
  loadLlmState,
} from "../classify/llm/index.js";

async function main() {
  const order = parseLlmProviders();
  const state = loadLlmState();

  console.log("LLM provider status\n");
  console.log(
    `${"provider".padEnd(12)} ${"enabled".padEnd(8)} ${"exhausted".padEnd(28)} ${"calls_today".padEnd(12)} model`,
  );
  console.log("-".repeat(90));

  for (const name of order) {
    const p = buildProvider(name);
    const enabled = p.isConfigured();
    const entry = getProviderState(state, name);
    const exhausted = enabled && isExhausted(name);
    const until = exhausted
      ? (entry.exhaustedUntil ?? "yes")
      : "no";
    console.log(
      `${name.padEnd(12)} ${String(enabled).padEnd(8)} ${String(until).padEnd(28)} ${String(entry.callsToday).padEnd(12)} ${p.model}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
