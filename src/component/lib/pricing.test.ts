import { describe, expect, it } from "vitest";

import {
  deriveAggregateCostMicrosUsd,
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

describe("deriveAggregateCostMicrosUsd", () => {
  const pricing = {
    provider: "openai",
    model: "gpt-4o-mini",
    inputCostMicrosPer1M: 100_000,
    outputCostMicrosPer1M: 200_000,
    cachedInputCostMicrosPer1M: 50_000,
  } as const;

  it("derives normal input, cached input, and output cost", () => {
    expect(
      deriveAggregateCostMicrosUsd(
        {
          inputTokens: 10,
          outputTokens: 5,
          cachedInputTokens: 1,
        },
        pricing,
      ),
    ).toBe(2);
  });

  it("treats cached input pricing as zero when omitted", () => {
    expect(
      deriveAggregateCostMicrosUsd(
        {
          inputTokens: 10,
          outputTokens: 5,
          cachedInputTokens: 1,
        },
        {
          ...pricing,
          cachedInputCostMicrosPer1M: undefined,
        },
      ),
    ).toBe(2);
  });

  it("returns zero when pricing is missing", () => {
    expect(
      deriveAggregateCostMicrosUsd(
        {
          inputTokens: 10,
          outputTokens: 5,
          cachedInputTokens: 1,
        },
        null,
      ),
    ).toBe(0);
  });

  it("clamps negative billable input tokens to zero", () => {
    expect(
      deriveAggregateCostMicrosUsd(
        {
          inputTokens: 1,
          outputTokens: 5,
          cachedInputTokens: 3,
        },
        pricing,
      ),
    ).toBe(1);
  });

  it("rounds the final derived total to the nearest micro", () => {
    expect(
      deriveAggregateCostMicrosUsd(
        {
          inputTokens: 3,
          outputTokens: 2,
          cachedInputTokens: 0,
        },
        pricing,
      ),
    ).toBe(1);
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
