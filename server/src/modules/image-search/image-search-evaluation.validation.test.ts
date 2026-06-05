import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProjectRoot } from "../../lib/env";
import {
  validateImageSearchEvaluationCases,
  validateImageSearchEvaluationResults,
} from "./image-search-evaluation.validation";

describe("image-search evaluation validation", () => {
  it("validates the checked-in image-search evaluation artifacts", async () => {
    const projectRoot = resolveProjectRoot();
    const cases = validateImageSearchEvaluationCases(
      JSON.parse(
        await readFile(
          path.join(projectRoot, "data", "processed", "rag", "image-evaluation-cases.json"),
          "utf8",
        ),
      ),
    );
    const results = validateImageSearchEvaluationResults(
      (await readFile(
        path.join(projectRoot, "data", "processed", "rag", "image-evaluation-results.jsonl"),
        "utf8",
      ))
        .split(/\r?\n/u)
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as unknown),
      cases,
    );

    expect(cases).toHaveLength(8);
    expect(results).toHaveLength(8);
    expect(results.every((result) => result.runStatus === "needs_review")).toBe(true);
    expect(results.every((result) => result.humanScores === null)).toBe(true);
  });

  it("rejects duplicate case ids", () => {
    const evaluationCase = createCase();

    expect(() =>
      validateImageSearchEvaluationCases([
        evaluationCase,
        evaluationCase,
        createCase({ caseId: "image_case_3" }),
        createCase({ caseId: "image_case_4" }),
        createCase({ caseId: "image_case_5" }),
        createCase({ caseId: "image_case_6" }),
      ])
    ).toThrow(/Duplicate image evaluation caseId/u);
  });

  it("rejects sensitive image references", () => {
    expect(() =>
      validateImageSearchEvaluationCases([
        createCase(),
        createCase({
          caseId: "image_sensitive_ref",
          imageRef: "C:\\Users\\person\\private.jpg",
        }),
        createCase({ caseId: "image_case_3" }),
        createCase({ caseId: "image_case_4" }),
        createCase({ caseId: "image_case_5" }),
        createCase({ caseId: "image_case_6" }),
      ])
    ).toThrow(/imageRef/u);
  });

  it("rejects result records with base64 payloads", () => {
    const cases = [
      createCase(),
      createCase({ caseId: "image_case_2" }),
      createCase({ caseId: "image_case_3" }),
      createCase({ caseId: "image_case_4" }),
      createCase({ caseId: "image_case_5" }),
      createCase({ caseId: "image_case_6" }),
    ];

    expect(() =>
      validateImageSearchEvaluationResults(
        [
          {
            ...createNotRunResult(),
            notes: ["data:image/png;base64,AAAA"],
          },
        ],
        cases,
      )
    ).toThrow(/image data URL/u);
  });

  it("rejects executed runs without product ids or a refusal reason", () => {
    const cases = [
      createCase(),
      createCase({ caseId: "image_case_2" }),
      createCase({ caseId: "image_case_3" }),
      createCase({ caseId: "image_case_4" }),
      createCase({ caseId: "image_case_5" }),
      createCase({ caseId: "image_case_6" }),
    ];

    expect(() =>
      validateImageSearchEvaluationResults(
        [
          {
            ...createExecutedResult(),
            returnedProductIds: [],
          },
        ],
        cases,
      )
    ).toThrow(/returnedProductIds or refusalReason/u);

    expect(() =>
      validateImageSearchEvaluationResults(
        [
          {
            ...createExecutedResult(),
            runStatus: "needs_review",
            returnedProductIds: [],
            refusalReason: undefined,
            humanScores: null,
          },
        ],
        cases,
      )
    ).toThrow(/returnedProductIds or refusalReason/u);
  });

  it("allows live provider runs that still need manual scoring", () => {
    const cases = [
      createCase(),
      createCase({ caseId: "image_case_2" }),
      createCase({ caseId: "image_case_3" }),
      createCase({ caseId: "image_case_4" }),
      createCase({ caseId: "image_case_5" }),
      createCase({ caseId: "image_case_6" }),
    ];

    expect(
      validateImageSearchEvaluationResults(
        [
          {
            ...createExecutedResult(),
            runStatus: "needs_review",
            humanScores: null,
          },
        ],
        cases,
      )[0]?.runStatus,
    ).toBe("needs_review");
  });
});

function createCase(
  overrides: Partial<ReturnType<typeof baseCase>> = {},
): ReturnType<typeof baseCase> {
  return {
    ...baseCase(),
    ...overrides,
  };
}

function baseCase() {
  return {
    caseId: "image_earbuds_similar",
    imageRef: "demo:earbuds_main",
    imageDescription: "demo earbuds product image",
    userText: "find something similar",
    expectedOutcome: "recommendation",
    expectedBehavior: "recommend catalog electronics products.",
    expectedCategory: "数码电子",
    expectedProductIdPrefixes: ["p_digital_"],
    mustNot: ["hallucinated product"],
  };
}

function createNotRunResult() {
  return {
    caseId: "image_earbuds_similar",
    runAt: "2026-06-05T00:00:00.000Z",
    runStatus: "not_run",
    imageSearchMode: "vlm_first",
    visualIntent: null,
    chatMessage: null,
    filters: null,
    returnedProductIds: [],
    refusalReason: "not_run_provider_not_configured",
    timing: {
      imageInterpretMs: 0,
      chatTtftMs: 0,
      totalMs: 0,
    },
    humanScores: null,
    issues: [],
    notes: ["bootstrap record only"],
  };
}

function createExecutedResult() {
  return {
    ...createNotRunResult(),
    runStatus: "failed",
    visualIntent: {
      is_product_search: true,
      detected_category: "数码电子",
      detected_brand_text: null,
      visual_attributes: ["earbuds"],
      colors: ["black"],
      materials: [],
      use_case: "commute",
      constraints: [],
      search_query: "black earbuds",
      confidence: "medium",
      clarification_question: null,
    },
    returnedProductIds: ["p_digital_007"],
    refusalReason: undefined,
    humanScores: {
      visualUnderstanding: 4,
      catalogGrounding: 4,
      constraintFollowing: 4,
      factualAccuracy: 4,
      privacySafety: 5,
      latencyExperience: 3,
    },
    issues: ["catalog_miss"],
  };
}
