export type UsageStatus = "success" | "error";

export type UsageFinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other";

export type UsageEventInput = {
  eventId?: string;
  timestamp: number;
  identifier: string;
  provider: string;
  model: string;
  status: UsageStatus;
  finishReason?: UsageFinishReason;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  latencyMs?: number;
  costMicrosUsd?: number;
  providerResponseId?: string;
};

export type NormalizedUsageEvent = Omit<UsageEventInput, "eventId"> & {
  eventId: string;
  totalTokens?: number;
};

export type RollupIncrement = {
  requestCount: number;
  successCount: number;
  errorCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  totalLatencyMs: number;
  latencySampleCount: number;
  totalCostMicrosUsd: number;
};

const INTEGER_FIELDS = [
  "timestamp",
  "promptTokens",
  "completionTokens",
  "totalTokens",
  "reasoningTokens",
  "cachedInputTokens",
  "costMicrosUsd",
] as const;

const NON_NEGATIVE_NUMBER_FIELDS = ["latencyMs"] as const;

export function normalizeUsageEvent(
  event: UsageEventInput,
): NormalizedUsageEvent {
  if (event.eventId !== undefined) {
    validateRequiredString(event.eventId, "eventId");
  }

  validateRequiredString(event.identifier, "identifier");
  validateRequiredString(event.provider, "provider");
  validateRequiredString(event.model, "model");

  validateInteger(event.timestamp, "timestamp");

  for (const field of INTEGER_FIELDS) {
    const value = event[field];
    if (value !== undefined) {
      validateInteger(value, field);
    }
  }

  for (const field of NON_NEGATIVE_NUMBER_FIELDS) {
    const value = event[field];
    if (value !== undefined) {
      validateNonNegativeNumber(value, field);
    }
  }

  if (event.providerResponseId !== undefined) {
    validateRequiredString(event.providerResponseId, "providerResponseId");
  }

  const totalTokens =
    event.totalTokens ??
    (event.promptTokens !== undefined && event.completionTokens !== undefined
      ? event.promptTokens + event.completionTokens
      : undefined);

  return {
    ...event,
    eventId: event.eventId ?? crypto.randomUUID(),
    totalTokens,
  };
}

export function toRollupIncrement(event: NormalizedUsageEvent): RollupIncrement {
  return {
    requestCount: 1,
    successCount: event.status === "success" ? 1 : 0,
    errorCount: event.status === "error" ? 1 : 0,
    promptTokens: event.promptTokens ?? 0,
    completionTokens: event.completionTokens ?? 0,
    totalTokens: event.totalTokens ?? 0,
    reasoningTokens: event.reasoningTokens ?? 0,
    cachedInputTokens: event.cachedInputTokens ?? 0,
    totalLatencyMs: event.latencyMs ?? 0,
    latencySampleCount: event.latencyMs !== undefined ? 1 : 0,
    totalCostMicrosUsd: event.costMicrosUsd ?? 0,
  };
}

function validateRequiredString(value: string, field: string) {
  if (value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function validateInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
}

function validateNonNegativeNumber(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number`);
  }
}
