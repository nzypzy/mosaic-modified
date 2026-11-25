export type CodexModelRecord = {
  id?: unknown;
  model?: unknown;
  displayName?: unknown;
  hidden?: unknown;
};

export type CodexModelOption = { value: string; label: string };

export function normalizeCodexModels(value: unknown): CodexModelOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry): CodexModelOption[] => {
    if (!entry || typeof entry !== "object") return [];
    const model = entry as CodexModelRecord;
    const value = typeof model.model === "string" && model.model.trim()
      ? model.model.trim()
      : typeof model.id === "string" ? model.id.trim() : "";
    if (!value || model.hidden === true || seen.has(value)) return [];
    seen.add(value);
    const label = typeof model.displayName === "string" && model.displayName.trim()
      ? model.displayName.trim()
      : value;
    return [{ value, label }];
  });
}

/** Ask Echo defaults to Claude Sonnet, then to the first model Claude Code offers. */
export function findDefaultModel(models: CodexModelOption[]): string | null {
  return models.find((model) => model.value === "sonnet")?.value || models[0]?.value || null;
}

/** Claude model aliases for Mosaic's one-shot AI features. */
export type ClaudeModelAlias = "haiku" | "sonnet" | "opus";
