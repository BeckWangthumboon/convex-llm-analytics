import { describe, expect, it } from "vitest";

import { api } from "./_generated/api.js";
import { getDayBucketStart, getHourBucketStart } from "./lib/buckets.js";
import { initConvexTest } from "./test.setup.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const baseArgs = {
  timestamp: 1_710_000_000_000,
  identifier: "assistant",
  provider: "openai",
  model: "gpt-4o-mini",
  status: "success" as const,
};

type TableName =
  | "usage_events"
  | "usage_aggregates_hourly"
  | "usage_aggregates_daily";

async function readTable(t: ReturnType<typeof initConvexTest>, table: TableName) {
  return t.run(async (ctx) => await ctx.db.query(table).collect());
}

describe("recordUsage", () => {
  it("inserts a raw event and matching hourly and daily aggregates", async () => {
    const t = initConvexTest();

    await expect(
      t.mutation(api.usage.recordUsage, {
        ...baseArgs,
        eventId: "evt-inserted",
        promptTokens: 7,
        completionTokens: 5,
        reasoningTokens: 2,
        cachedInputTokens: 1,
        latencyMs: 42.5,
        costMicrosUsd: 99,
      }),
    ).resolves.toEqual({
      kind: "inserted",
      eventId: "evt-inserted",
    });

    const events = await readTable(t, "usage_events");
    const hourly = await readTable(t, "usage_aggregates_hourly");
    const daily = await readTable(t, "usage_aggregates_daily");

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventId: "evt-inserted",
      totalTokens: 12,
      promptTokens: 7,
      completionTokens: 5,
      reasoningTokens: 2,
      cachedInputTokens: 1,
      latencyMs: 42.5,
      costMicrosUsd: 99,
    });

    expect(hourly).toEqual([
      expect.objectContaining({
        bucketStart: getHourBucketStart(baseArgs.timestamp),
        identifier: "assistant",
        provider: "openai",
        model: "gpt-4o-mini",
        requestCount: 1,
        successCount: 1,
        errorCount: 0,
        promptTokens: 7,
        completionTokens: 5,
        totalTokens: 12,
        reasoningTokens: 2,
        cachedInputTokens: 1,
        totalLatencyMs: 42.5,
        latencySampleCount: 1,
        totalCostMicrosUsd: 99,
      }),
    ]);
    expect(daily).toEqual([
      expect.objectContaining({
        bucketStart: getDayBucketStart(baseArgs.timestamp),
        requestCount: 1,
        totalTokens: 12,
      }),
    ]);
  });

  it("generates a fresh eventId when one is omitted", async () => {
    const t = initConvexTest();

    const result = await t.mutation(api.usage.recordUsage, baseArgs);

    expect(result.kind).toBe("inserted");
    expect(result.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const events = await readTable(t, "usage_events");

    expect(events).toHaveLength(1);
    expect(events[0]?.eventId).toBe(result.eventId);
  });

  it("does not double count a duplicate explicit eventId", async () => {
    const t = initConvexTest();

    await t.mutation(api.usage.recordUsage, {
      ...baseArgs,
      eventId: "evt-duplicate",
      promptTokens: 2,
      completionTokens: 3,
    });

    await expect(
      t.mutation(api.usage.recordUsage, {
        ...baseArgs,
        eventId: "evt-duplicate",
        promptTokens: 100,
        completionTokens: 200,
      }),
    ).resolves.toEqual({
      kind: "duplicate",
      eventId: "evt-duplicate",
    });

    const events = await readTable(t, "usage_events");
    const hourly = await readTable(t, "usage_aggregates_hourly");
    const daily = await readTable(t, "usage_aggregates_daily");

    expect(events).toHaveLength(1);
    expect(hourly).toHaveLength(1);
    expect(daily).toHaveLength(1);
    expect(hourly[0]).toMatchObject({
      requestCount: 1,
      promptTokens: 2,
      completionTokens: 3,
      totalTokens: 5,
    });
    expect(daily[0]).toMatchObject({
      requestCount: 1,
      totalTokens: 5,
    });
  });

  it("does not dedupe repeated writes when eventId is omitted", async () => {
    const t = initConvexTest();

    const first = await t.mutation(api.usage.recordUsage, baseArgs);
    const second = await t.mutation(api.usage.recordUsage, baseArgs);

    expect(first.kind).toBe("inserted");
    expect(second.kind).toBe("inserted");
    expect(first.eventId).not.toBe(second.eventId);

    const events = await readTable(t, "usage_events");
    const hourly = await readTable(t, "usage_aggregates_hourly");

    expect(events).toHaveLength(2);
    expect(hourly).toHaveLength(1);
    expect(hourly[0]).toMatchObject({
      requestCount: 2,
      successCount: 2,
      errorCount: 0,
    });
  });

  it("stores zeroed aggregate metrics when optional fields are absent", async () => {
    const t = initConvexTest();

    await t.mutation(api.usage.recordUsage, {
      ...baseArgs,
      eventId: "evt-sparse",
    });

    const hourly = await readTable(t, "usage_aggregates_hourly");

    expect(hourly[0]).toMatchObject({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalLatencyMs: 0,
      latencySampleCount: 0,
      totalCostMicrosUsd: 0,
    });
  });

  it("preserves explicit totalTokens instead of recomputing it", async () => {
    const t = initConvexTest();

    await t.mutation(api.usage.recordUsage, {
      ...baseArgs,
      eventId: "evt-total-override",
      promptTokens: 7,
      completionTokens: 5,
      totalTokens: 50,
    });

    const events = await readTable(t, "usage_events");
    const hourly = await readTable(t, "usage_aggregates_hourly");

    expect(events[0]).toMatchObject({ totalTokens: 50 });
    expect(hourly[0]).toMatchObject({ totalTokens: 50 });
  });

  it("keeps aggregates separate by provider, model, and identifier", async () => {
    const t = initConvexTest();

    await t.mutation(api.usage.recordUsage, {
      ...baseArgs,
      eventId: "evt-provider-a",
      model: "shared-model",
    });
    await t.mutation(api.usage.recordUsage, {
      ...baseArgs,
      eventId: "evt-provider-b",
      provider: "anthropic",
      model: "shared-model",
    });
    await t.mutation(api.usage.recordUsage, {
      ...baseArgs,
      eventId: "evt-identifier-b",
      identifier: "summaries",
      model: "shared-model",
    });

    const hourly = await readTable(t, "usage_aggregates_hourly");

    const aggregateKeys = hourly
      .map((row) => `${row.identifier}:${row.provider}:${row.model}`)
      .sort();

    expect(aggregateKeys).toEqual([
      "assistant:anthropic:shared-model",
      "assistant:openai:shared-model",
      "summaries:openai:shared-model",
    ]);
  });

  it("creates a new hourly aggregate when writes cross an hour boundary", async () => {
    const t = initConvexTest();
    const hourStart = 1_710_000_000_000;

    await t.mutation(api.usage.recordUsage, {
      ...baseArgs,
      eventId: "evt-hour-a",
      timestamp: hourStart + 1,
    });
    await t.mutation(api.usage.recordUsage, {
      ...baseArgs,
      eventId: "evt-hour-b",
      timestamp: hourStart + HOUR_MS,
    });

    const hourly = await readTable(t, "usage_aggregates_hourly");
    const daily = await readTable(t, "usage_aggregates_daily");

    expect(hourly.map((row) => row.bucketStart).sort()).toEqual([
      hourStart,
      hourStart + HOUR_MS,
    ]);
    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({ requestCount: 2 });
  });

  it("creates a new daily aggregate when writes cross a day boundary", async () => {
    const t = initConvexTest();
    const dayStart = 1_710_028_800_000;

    await t.mutation(api.usage.recordUsage, {
      ...baseArgs,
      eventId: "evt-day-a",
      timestamp: dayStart + DAY_MS - 1,
    });
    await t.mutation(api.usage.recordUsage, {
      ...baseArgs,
      eventId: "evt-day-b",
      timestamp: dayStart + DAY_MS,
    });

    const daily = await readTable(t, "usage_aggregates_daily");

    expect(daily.map((row) => row.bucketStart).sort()).toEqual([
      dayStart,
      dayStart + DAY_MS,
    ]);
  });

  it("increments latencySampleCount only when latency is present", async () => {
    const t = initConvexTest();

    await t.mutation(api.usage.recordUsage, {
      ...baseArgs,
      eventId: "evt-latency-a",
      latencyMs: 10,
    });
    await t.mutation(api.usage.recordUsage, {
      ...baseArgs,
      eventId: "evt-latency-b",
    });

    const hourly = await readTable(t, "usage_aggregates_hourly");

    expect(hourly[0]).toMatchObject({
      requestCount: 2,
      totalLatencyMs: 10,
      latencySampleCount: 1,
    });
  });

  it("rejects invalid event input without writing partial state", async () => {
    const t = initConvexTest();

    await expect(
      t.mutation(api.usage.recordUsage, {
        ...baseArgs,
        eventId: "   ",
      }),
    ).rejects.toThrow("eventId must be a non-empty string");

    await expect(
      t.mutation(api.usage.recordUsage, {
        ...baseArgs,
        eventId: "evt-invalid-timestamp",
        timestamp: -1,
      }),
    ).rejects.toThrow("timestamp must be a non-negative safe integer");

    expect(await readTable(t, "usage_events")).toHaveLength(0);
    expect(await readTable(t, "usage_aggregates_hourly")).toHaveLength(0);
    expect(await readTable(t, "usage_aggregates_daily")).toHaveLength(0);
  });
});
