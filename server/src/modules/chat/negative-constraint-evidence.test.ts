import { describe, expect, it } from "vitest";
import {
  evaluateNegativeConstraintEvidence,
  type NegativeConstraintProductFacts,
} from "./negative-constraint-evidence";

describe("evaluateNegativeConstraintEvidence", () => {
  it("does not treat explicit free-from alcohol evidence as a conflict", () => {
    const result = evaluateNegativeConstraintEvidence({
      term: "酒精",
      kind: "ingredient",
      matchPolicy: "exclude_if_product_facts_conflict",
      productFacts: createFacts({
        officialFaq: [
          {
            question: "敏感肌能用吗？",
            answer: "这款隔离露不含酒精、香精和 parabens 防腐剂。",
          },
        ],
      }),
    });

    expect(result.conflicts).toBe(false);
    expect(result.reason).toBe("explicit_safe_free_from");
    expect(result.evidence[0]).toContain("不含酒精");
  });

  it("treats avoidWhen alcohol sensitivity as a strict risk conflict", () => {
    const result = evaluateNegativeConstraintEvidence({
      term: "酒精",
      kind: "ingredient",
      matchPolicy: "exclude_if_product_facts_conflict",
      productFacts: createFacts({
        avoidWhen: ["酒精敏感人群慎用"],
      }),
    });

    expect(result.conflicts).toBe(true);
    expect(result.reason).toBe("strict_risk_fact");
    expect(result.evidence[0]).toContain("酒精敏感");
  });

  it("does not let free-from FAQ evidence mask a separate risk fact", () => {
    const result = evaluateNegativeConstraintEvidence({
      term: "酒精",
      kind: "ingredient",
      matchPolicy: "exclude_if_product_facts_conflict",
      productFacts: createFacts({
        avoidWhen: ["酒精敏感人群慎用"],
        officialFaq: [
          {
            question: "是否含酒精？",
            answer: "这款防晒不含酒精。",
          },
        ],
      }),
    });

    expect(result.conflicts).toBe(true);
    expect(result.reason).toBe("strict_risk_fact");
  });

  it("matches excluded brands after the LLM has selected exclude_brand", () => {
    const result = evaluateNegativeConstraintEvidence({
      term: "安热沙",
      kind: "brand",
      matchPolicy: "exclude_brand",
      productFacts: createFacts({
        brand: "安热沙",
        name: "安热沙金瓶防晒",
      }),
    });

    expect(result.conflicts).toBe(true);
    expect(result.reason).toBe("brand_match");
  });

  it("does not treat semi-in-ear as in-ear unless the constraint says semi-in-ear", () => {
    const inEarResult = evaluateNegativeConstraintEvidence({
      term: "入耳",
      kind: "feature",
      matchPolicy: "exclude_if_product_facts_conflict",
      productFacts: createFacts({
        attributes: {
          佩戴形态: ["半入耳式"],
        },
      }),
    });
    const semiInEarResult = evaluateNegativeConstraintEvidence({
      term: "半入耳",
      kind: "feature",
      matchPolicy: "exclude_if_product_facts_conflict",
      productFacts: createFacts({
        attributes: {
          佩戴形态: ["半入耳式"],
        },
      }),
    });

    expect(inEarResult.conflicts).toBe(false);
    expect(inEarResult.reason).toBe("no_conflict_evidence");
    expect(semiInEarResult.conflicts).toBe(true);
    expect(semiInEarResult.reason).toBe("structured_attribute_conflict");
  });

  it("returns no conflict evidence when product facts are insufficient", () => {
    const result = evaluateNegativeConstraintEvidence({
      term: "酒精",
      kind: "ingredient",
      matchPolicy: "exclude_if_product_facts_conflict",
      productFacts: createFacts(),
    });

    expect(result).toEqual({
      conflicts: false,
      reason: "no_conflict_evidence",
      evidence: [],
    });
  });
});

function createFacts(
  overrides: Partial<NegativeConstraintProductFacts> = {},
): NegativeConstraintProductFacts {
  return {
    id: "p_demo_001",
    name: "Demo Product",
    brand: "Demo Brand",
    category: "美妆护肤",
    subCategory: "防晒",
    tags: [],
    recommendWhen: [],
    avoidWhen: [],
    pros: [],
    cons: [],
    attributes: {},
    marketingDescription: "",
    knowledgeText: "",
    snippets: [],
    ...overrides,
  };
}
