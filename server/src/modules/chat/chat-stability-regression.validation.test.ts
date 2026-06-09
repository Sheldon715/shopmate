import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProjectRoot } from "../../lib/env";
import { ClarificationService } from "./clarification.service";
import {
  validateChatStabilityRegressionCases,
  type ChatStabilityRegressionFile,
} from "./chat-stability-regression.validation";

describe("chat stability regression cases", () => {
  it("validates the checked-in anti-overfit regression matrix", async () => {
    const regressionFile = await readRegressionFile();

    expect(regressionFile.cases.length).toBeGreaterThanOrEqual(10);
    expect(regressionFile.cases.some((item) =>
      item.variants.some((variant) => variant.split === "holdout")
    )).toBe(true);
  });

  it("requires p0 and p1 cases to include seed, paraphrase, and holdout variants", async () => {
    const payload = await readRawRegressionPayload();
    const firstCase = payload.cases[0];

    if (!firstCase) {
      throw new Error("expected at least one regression case.");
    }

    firstCase.variants = firstCase.variants.filter(
      (variant) => variant.split !== "holdout",
    );

    expect(() =>
      validateChatStabilityRegressionCases(payload as unknown)
    ).toThrow(/holdout variant/u);
  });

  it("keeps broad clarification behavior stable across paraphrases and holdouts", async () => {
    const regressionFile = await readRegressionFile();
    const service = new ClarificationService();
    const clarificationCases = regressionFile.cases.filter(
      (item) => item.automatedCheck === "clarification_candidate",
    );

    expect(clarificationCases.length).toBeGreaterThan(0);

    for (const regressionCase of clarificationCases) {
      for (const variant of regressionCase.variants) {
        const decision = service.decide({ question: variant.text });

        expect(
          decision.needsClarification,
          `${regressionCase.caseId}/${variant.id} should clarify: ${variant.text}`,
        ).toBe(true);
        expect(decision.missingSlots.length).toBeGreaterThan(0);
      }
    }
  });
});

async function readRegressionFile(): Promise<ChatStabilityRegressionFile> {
  return validateChatStabilityRegressionCases(
    await readRawRegressionPayload() as unknown,
  );
}

async function readRawRegressionPayload(): Promise<{
  cases: Array<{
    variants: Array<{ split: string }>;
  }>;
}> {
  const projectRoot = resolveProjectRoot();
  const fileText = await readFile(
    path.join(
      projectRoot,
      "data",
      "processed",
      "rag",
      "chat-stability-regression-cases.json",
    ),
    "utf8",
  );

  return JSON.parse(fileText) as {
    cases: Array<{
      variants: Array<{ split: string }>;
    }>;
  };
}
