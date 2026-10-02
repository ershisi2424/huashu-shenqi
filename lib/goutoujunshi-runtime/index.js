import { RUNTIME_META, STAGES } from "./constants.js";
import { normalizeRuntimeInput } from "./input.js";
import { splitEvidence } from "./evidence.js";
import { buildIntake } from "./intake.js";
import { decide } from "./decision.js";
import { loadRuntimeReferences } from "./knowledge.js";
import { buildPromptContext, normalizeRuntimeResult } from "./contract.js";

function readMemory(memoryAdapter, input) {
  if (!memoryAdapter || typeof memoryAdapter !== "object") {
    return { status: "not_enabled", namespace: `${input.actor.userId}:${input.subject.brotherId}`, changes: [], reversible: true };
  }
  const status = typeof memoryAdapter.status === "function"
    ? memoryAdapter.status({ actor: input.actor, brotherId: input.subject.brotherId })
    : { consentEnabled: false, paused: false };
  return {
    status: status?.paused ? "paused" : status?.consentEnabled ? "enabled" : "not_enabled",
    namespace: status?.namespace || `${input.actor.userId}:${input.subject.brotherId}`,
    changes: [],
    reversible: true,
  };
}

export function analyzeGoutoujunshiRuntime(raw = {}) {
  const input = normalizeRuntimeInput(raw);
  const intake = buildIntake({ profile: input.profile, currentMessage: input.currentMessage, urgent: raw.urgent === true });
  const evidence = splitEvidence(input);
  const decision = decide({ message: input.currentMessage, history: input.history, evidence });
  const references = loadRuntimeReferences({
    message: input.currentMessage,
    risk: decision.risk,
    primaryGoal: decision.primaryGoal,
    selectedReferences: raw.selectedReferences,
  });
  const memory = readMemory(raw.memoryAdapter, input);
  const analysis = {
    ...decision,
    contradictions: evidence.contradictions,
    evidence: evidence.evidence,
    algorithmCore: {
      ...decision.algorithmCore,
      selectedReferences: references.items.map((item) => item.path),
    },
  };
  const rawResult = {
    runtime: {
      ...RUNTIME_META,
      stages: STAGES,
      loadedReferences: references.items,
    },
    intake,
    analysis,
    memory,
  };
  const normalized = normalizeRuntimeResult(rawResult);
  return {
    ...normalized,
    promptContext: buildPromptContext(normalized, references.items),
  };
}
