import { describe, expect, it } from "vitest";

import {
  normalizeModelPricing,
  normalizeModelPricingKey,
} from "./pricing.js";

describe("normalizeModelPricingKey", () => {
  it("trims provider and model values", () => {
    expect(
      normalizeModelPricingKey({
        provider: "  openai  ",
        model: "  gpt-4o-mini ",
      }),
    ).toEqual({
      provider: "openai",
      model: "gpt-4o-mini",
    });
  });

  it.each([
    { provider: "   ", model: "gpt-4o-mini" },
    { provider: "openai", model: "   " },
  ])("rejects blank key fields", (input) => {
    expect(() => normalizeModelPricingKey(input)).toThrow(
      "must be a non-empty string",
    );
  });
});

describe("normalizeModelPricing", () => {
  it("accepts non-negative finite pricing values", () => {
    expect(
      normalizeModelPricing({
        provider: "openai",
        model: "gpt-4o-mini",
        inputCostMicrosPer1M: 150_000,
        outputCostMicrosPer1M: 600_000,
        cachedInputCostMicrosPer1M: 75_000,
      }),
    ).toEqual({
      provider: "openai",
      model: "gpt-4o-mini",
      inputCostMicrosPer1M: 150_000,
      outputCostMicrosPer1M: 600_000,
      cachedInputCostMicrosPer1M: 75_000,
    });
  });

  it.each([
    ["inputCostMicrosPer1M", -1],
    ["outputCostMicrosPer1M", Number.NaN],
    ["cachedInputCostMicrosPer1M", Number.POSITIVE_INFINITY],
  ] as const)(
    "rejects invalid %s=%s",
    (field, value) => {
      expect(() =>
        normalizeModelPricing({
          provider: "openai",
          model: "gpt-4o-mini",
          inputCostMicrosPer1M: 150_000,
          outputCostMicrosPer1M: 600_000,
          [field]: value,
        }),
      ).toThrow("must be a non-negative finite number");
    },
  );
});
