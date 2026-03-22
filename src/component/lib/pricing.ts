export type ModelPricingKeyInput = {
  provider: string;
  model: string;
};

export type ModelPricingInput = ModelPricingKeyInput & {
  inputCostMicrosPer1M: number;
  outputCostMicrosPer1M: number;
  cachedInputCostMicrosPer1M?: number;
};

export type NormalizedModelPricingKey = ModelPricingKeyInput;

export type NormalizedModelPricing = ModelPricingInput;

export type AggregateCostInput = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

export function normalizeModelPricingKey(
  value: ModelPricingKeyInput,
): NormalizedModelPricingKey {
  return {
    provider: normalizeRequiredString(value.provider, "provider"),
    model: normalizeRequiredString(value.model, "model"),
  };
}

export function normalizeModelPricing(
  value: ModelPricingInput,
): NormalizedModelPricing {
  const key = normalizeModelPricingKey(value);

  validateNonNegativeFiniteNumber(
    value.inputCostMicrosPer1M,
    "inputCostMicrosPer1M",
  );
  validateNonNegativeFiniteNumber(
    value.outputCostMicrosPer1M,
    "outputCostMicrosPer1M",
  );

  if (value.cachedInputCostMicrosPer1M !== undefined) {
    validateNonNegativeFiniteNumber(
      value.cachedInputCostMicrosPer1M,
      "cachedInputCostMicrosPer1M",
    );
  }

  return {
    ...key,
    inputCostMicrosPer1M: value.inputCostMicrosPer1M,
    outputCostMicrosPer1M: value.outputCostMicrosPer1M,
    cachedInputCostMicrosPer1M: value.cachedInputCostMicrosPer1M,
  };
}

export function deriveAggregateCostMicrosUsd(
  aggregate: AggregateCostInput,
  pricing: NormalizedModelPricing | null,
) {
  if (pricing === null) {
    return 0;
  }

  const cachedTokens = aggregate.cachedInputTokens;
  const billableInputTokens = Math.max(aggregate.inputTokens - cachedTokens, 0);
  const outputTokens = aggregate.outputTokens;

  const inputCostMicros =
    (billableInputTokens * pricing.inputCostMicrosPer1M) / 1_000_000;
  const cachedInputCostMicros =
    pricing.cachedInputCostMicrosPer1M === undefined
      ? 0
      : (cachedTokens * pricing.cachedInputCostMicrosPer1M) / 1_000_000;
  const outputCostMicros =
    (outputTokens * pricing.outputCostMicrosPer1M) / 1_000_000;

  return Math.round(
    inputCostMicros + cachedInputCostMicros + outputCostMicros,
  );
}

function normalizeRequiredString(value: string, field: string) {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return normalized;
}

function validateNonNegativeFiniteNumber(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number`);
  }
}
