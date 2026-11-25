import { describe, expect, it } from "vitest";
import { findDefaultModel, normalizeCodexModels } from "./models";

describe("Claude model catalog", () => {
  it("keeps visible models and uses the model alias as the value", () => {
    expect(normalizeCodexModels([
      { model: "sonnet", displayName: "Claude Sonnet (default)" },
      { model: "hidden-model", displayName: "Hidden", hidden: true },
      { model: "sonnet", displayName: "Duplicate" },
    ])).toEqual([{ value: "sonnet", label: "Claude Sonnet (default)" }]);
  });

  it("defaults to Sonnet, then to the first available model", () => {
    expect(findDefaultModel(normalizeCodexModels([{ model: "opus" }, { model: "sonnet" }]))).toBe("sonnet");
    expect(findDefaultModel(normalizeCodexModels([{ model: "haiku" }]))).toBe("haiku");
    expect(findDefaultModel([])).toBeNull();
  });
});
