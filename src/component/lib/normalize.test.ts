import { describe, expect, it } from "vitest";

import {
  normalizeUsageEvent,
  toAggregateIncrement,
  type UsageEventInput,
} from "./normalize.js";

const baseEvent: UsageEventInput = {
  timestamp: 1_710_000_000_000,
  identifier: "assistant",
  provider: "openai",
  model: "gpt-4o-mini",
  status: "success",
};

describe("normalizeUsageEvent", () => {
  it("generates an eventId and derives totalTokens when omitted", () => {
    const normalized = normalizeUsageEvent({
      ...baseEvent,
      inputTokens: 7,
      outputTokens: 5,
    });

    expect(normalized.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(normalized.totalTokens).toBe(12);
  });

  it("preserves explicit eventId and totalTokens overrides", () => {
    const normalized = normalizeUsageEvent({
      ...baseEvent,
      eventId: "evt-123",
      inputTokens: 7,
      outputTokens: 5,
      totalTokens: 99,
    });

    expect(normalized.eventId).toBe("evt-123");
    expect(normalized.totalTokens).toBe(99);
  });

  it("does not derive totalTokens when only one token field is present", () => {
    expect(
      normalizeUsageEvent({
        ...baseEvent,
        inputTokens: 7,
      }).totalTokens,
    ).toBeUndefined();

    expect(
      normalizeUsageEvent({
        ...baseEvent,
        outputTokens: 5,
      }).totalTokens,
    ).toBeUndefined();
  });

  it.each([
    ["eventId", { ...baseEvent, eventId: "   " }],
    ["identifier", { ...baseEvent, identifier: "   " }],
    ["provider", { ...baseEvent, provider: "   " }],
    ["model", { ...baseEvent, model: "   " }],
    ["providerResponseId", { ...baseEvent, providerResponseId: "   " }],
  ] as const)("rejects blank %s values", (_field, event) => {
    expect(() => normalizeUsageEvent(event)).toThrow("must be a non-empty string");
  });

  it.each([
    ["timestamp", -1],
    ["timestamp", 1.5],
    ["timestamp", Number.MAX_SAFE_INTEGER + 1],
    ["inputTokens", -1],
    ["outputTokens", 2.5],
    ["totalTokens", Number.MAX_SAFE_INTEGER + 1],
    ["reasoningTokens", -1],
    ["cachedInputTokens", 0.25],
    ["costMicrosUsd", -10],
  ] as const)("rejects invalid integer field %s=%s", (field, value) => {
    expect(() =>
      normalizeUsageEvent({
        ...baseEvent,
        [field]: value,
      } as UsageEventInput),
    ).toThrow("must be a non-negative safe integer");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY] as const)(
    "rejects invalid latencyMs=%s",
    (latencyMs) => {
      expect(() =>
        normalizeUsageEvent({
          ...baseEvent,
          latencyMs,
        }),
      ).toThrow("must be a non-negative finite number");
    },
  );

  it("accepts zero and fractional latency values", () => {
    expect(
      normalizeUsageEvent({
        ...baseEvent,
        latencyMs: 0,
      }).latencyMs,
    ).toBe(0);

    expect(
      normalizeUsageEvent({
        ...baseEvent,
        latencyMs: 12.75,
      }).latencyMs,
    ).toBe(12.75);
  });
});

describe("toAggregateIncrement", () => {
  it("zeros all optional metrics when they are absent", () => {
    const increment = toAggregateIncrement(normalizeUsageEvent(baseEvent));

    expect(increment).toEqual({
      requestCount: 1,
      successCount: 1,
      errorCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalLatencyMs: 0,
      latencySampleCount: 0,
      totalCostMicrosUsd: 0,
    });
  });

  it("tracks error status, provided totals, and latency sample count", () => {
    const increment = toAggregateIncrement(
      normalizeUsageEvent({
        ...baseEvent,
        status: "error",
        inputTokens: 8,
        outputTokens: 3,
        reasoningTokens: 2,
        cachedInputTokens: 1,
        latencyMs: 42.5,
        costMicrosUsd: 123,
      }),
    );

    expect(increment).toEqual({
      requestCount: 1,
      successCount: 0,
      errorCount: 1,
      inputTokens: 8,
      outputTokens: 3,
      totalTokens: 11,
      reasoningTokens: 2,
      cachedInputTokens: 1,
      totalLatencyMs: 42.5,
      latencySampleCount: 1,
      totalCostMicrosUsd: 123,
    });
  });
});
