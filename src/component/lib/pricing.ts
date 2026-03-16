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
