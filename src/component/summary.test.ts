import { describe, expect, it } from "vitest";

import { api } from "./_generated/api.js";
import { DAY_MS, HOUR_MS, getDayBucketStart } from "./lib/buckets.js";
import { initConvexTest } from "./test.setup.js";

const baseTimestamp = 1_710_000_000_000;
const dayStart = getDayBucketStart(baseTimestamp);
const hourStart = dayStart + 5 * HOUR_MS;

async function seedReadQueryFixtures(t: ReturnType<typeof initConvexTest>) {
  await t.mutation(api.usage.recordUsage, {
    eventId: "evt-openai-shared-a",
    timestamp: hourStart,
    identifier: "assistant",
    provider: "openai",
    model: "shared-model",
    status: "success",
    inputTokens: 10,
    outputTokens: 5,
    reasoningTokens: 2,
    cachedInputTokens: 1,
    latencyMs: 100,
    costMicrosUsd: 50,
  });

  await t.mutation(api.usage.recordUsage, {
    eventId: "evt-openai-shared-b",
    timestamp: hourStart,
    identifier: "assistant",
    provider: "openai",
    model: "shared-model",
    status: "success",
    inputTokens: 3,
    outputTokens: 2,
    latencyMs: 300,
    costMicrosUsd: 25,
  });

  await t.mutation(api.usage.recordUsage, {
    eventId: "evt-anthropic-shared",
    timestamp: hourStart + HOUR_MS,
    identifier: "assistant",
    provider: "anthropic",
    model: "shared-model",
    status: "error",
    inputTokens: 4,
    outputTokens: 6,
    totalTokens: 20,
    cachedInputTokens: 2,
    costMicrosUsd: 75,
  });

  await t.mutation(api.usage.recordUsage, {
    eventId: "evt-openai-other",
    timestamp: hourStart + 2 * HOUR_MS,
    identifier: "assistant",
    provider: "openai",
    model: "other-model",
    status: "success",
    inputTokens: 8,
    outputTokens: 7,
    latencyMs: 50,
    costMicrosUsd: 40,
  });

  await t.mutation(api.usage.recordUsage, {
    eventId: "evt-other-identifier",
    timestamp: hourStart + HOUR_MS,
    identifier: "summaries",
    provider: "openai",
    model: "shared-model",
    status: "success",
    inputTokens: 9,
    outputTokens: 1,
    latencyMs: 500,
    costMicrosUsd: 60,
  });

  await t.mutation(api.usage.recordUsage, {
    eventId: "evt-next-day",
    timestamp: dayStart + DAY_MS,
    identifier: "assistant",
    provider: "openai",
    model: "shared-model",
    status: "success",
    inputTokens: 11,
    outputTokens: 9,
    latencyMs: 200,
    costMicrosUsd: 80,
  });
}

describe("summary queries", () => {
  it("returns summary totals for a bucket-aligned range", async () => {
    const t = initConvexTest();
    await seedReadQueryFixtures(t);

    await expect(
      t.query(api.summary.getSummary, {
        start: hourStart,
        end: hourStart + 3 * HOUR_MS,
        bucket: "hour",
        identifier: "assistant",
      }),
    ).resolves.toEqual({
      requests: 4,
      errors: 1,
      inputTokens: 25,
      outputTokens: 20,
      totalTokens: 55,
      reasoningTokens: 2,
      cachedInputTokens: 3,
      averageLatencyMs: 150,
      totalCostMicrosUsd: 190,
    });
  });

  it("returns zeroed summary metrics when no aggregate rows match", async () => {
    const t = initConvexTest();
    await seedReadQueryFixtures(t);

    await expect(
      t.query(api.summary.getSummary, {
        start: dayStart + 3 * DAY_MS,
        end: dayStart + 4 * DAY_MS,
        bucket: "day",
      }),
    ).resolves.toEqual({
      requests: 0,
      errors: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      averageLatencyMs: null,
      totalCostMicrosUsd: 0,
    });
  });

  it("returns zero-filled timeseries buckets and supports model filtering", async () => {
    const t = initConvexTest();
    await seedReadQueryFixtures(t);

    await expect(
      t.query(api.summary.getTimeseries, {
        start: hourStart,
        end: hourStart + 4 * HOUR_MS,
        bucket: "hour",
        identifier: "assistant",
        model: "shared-model",
      }),
    ).resolves.toEqual([
      {
        bucketStart: hourStart,
        requests: 2,
        errors: 0,
        inputTokens: 13,
        outputTokens: 7,
        totalTokens: 20,
        reasoningTokens: 2,
        cachedInputTokens: 1,
        averageLatencyMs: 200,
        totalCostMicrosUsd: 75,
      },
      {
        bucketStart: hourStart + HOUR_MS,
        requests: 1,
        errors: 1,
        inputTokens: 4,
        outputTokens: 6,
        totalTokens: 20,
        reasoningTokens: 0,
        cachedInputTokens: 2,
        averageLatencyMs: null,
        totalCostMicrosUsd: 75,
      },
      {
        bucketStart: hourStart + 2 * HOUR_MS,
        requests: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        averageLatencyMs: null,
        totalCostMicrosUsd: 0,
      },
      {
        bucketStart: hourStart + 3 * HOUR_MS,
        requests: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        averageLatencyMs: null,
        totalCostMicrosUsd: 0,
      },
    ]);
  });

  it("supports model-filtered timeseries queries without an identifier", async () => {
    const t = initConvexTest();
    await seedReadQueryFixtures(t);

    await expect(
      t.query(api.summary.getTimeseries, {
        start: hourStart,
        end: hourStart + 4 * HOUR_MS,
        bucket: "hour",
        model: "shared-model",
      }),
    ).resolves.toEqual([
      {
        bucketStart: hourStart,
        requests: 2,
        errors: 0,
        inputTokens: 13,
        outputTokens: 7,
        totalTokens: 20,
        reasoningTokens: 2,
        cachedInputTokens: 1,
        averageLatencyMs: 200,
        totalCostMicrosUsd: 75,
      },
      {
        bucketStart: hourStart + HOUR_MS,
        requests: 2,
        errors: 1,
        inputTokens: 13,
        outputTokens: 7,
        totalTokens: 30,
        reasoningTokens: 0,
        cachedInputTokens: 2,
        averageLatencyMs: 500,
        totalCostMicrosUsd: 135,
      },
      {
        bucketStart: hourStart + 2 * HOUR_MS,
        requests: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        averageLatencyMs: null,
        totalCostMicrosUsd: 0,
      },
      {
        bucketStart: hourStart + 3 * HOUR_MS,
        requests: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        averageLatencyMs: null,
        totalCostMicrosUsd: 0,
      },
    ]);
  });

  it("aggregates top models by provider and model and sorts by request count", async () => {
    const t = initConvexTest();
    await seedReadQueryFixtures(t);

    await expect(
      t.query(api.summary.getTopModels, {
        start: hourStart,
        end: hourStart + 3 * HOUR_MS,
        bucket: "hour",
        identifier: "assistant",
      }),
    ).resolves.toEqual([
      {
        provider: "openai",
        model: "shared-model",
        requests: 2,
        errors: 0,
        inputTokens: 13,
        outputTokens: 7,
        totalTokens: 20,
        reasoningTokens: 2,
        cachedInputTokens: 1,
        averageLatencyMs: 200,
        totalCostMicrosUsd: 75,
      },
      {
        provider: "anthropic",
        model: "shared-model",
        requests: 1,
        errors: 1,
        inputTokens: 4,
        outputTokens: 6,
        totalTokens: 20,
        reasoningTokens: 0,
        cachedInputTokens: 2,
        averageLatencyMs: null,
        totalCostMicrosUsd: 75,
      },
      {
        provider: "openai",
        model: "other-model",
        requests: 1,
        errors: 0,
        inputTokens: 8,
        outputTokens: 7,
        totalTokens: 15,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        averageLatencyMs: 50,
        totalCostMicrosUsd: 40,
      },
    ]);
  });

  it("rejects invalid read ranges", async () => {
    const t = initConvexTest();

    await expect(
      t.query(api.summary.getSummary, {
        start: hourStart + 1,
        end: hourStart + HOUR_MS,
        bucket: "hour",
      }),
    ).rejects.toThrow("start must align to the hour bucket");

    await expect(
      t.query(api.summary.getTimeseries, {
        start: hourStart,
        end: hourStart,
        bucket: "hour",
      }),
    ).rejects.toThrow("start must be less than end");

    await expect(
      t.query(api.summary.getTopModels, {
        start: dayStart,
        end: dayStart + HOUR_MS,
        bucket: "day",
      }),
    ).rejects.toThrow("end must align to the day bucket");
  });

  it("rejects ranges that exceed the bucket-specific max window", async () => {
    const t = initConvexTest();

    await expect(
      t.query(api.summary.getSummary, {
        start: dayStart,
        end: dayStart + 8 * DAY_MS,
        bucket: "hour",
      }),
    ).rejects.toThrow("range must be at most 7 days for the hour bucket");

    await expect(
      t.query(api.summary.getSummary, {
        start: dayStart,
        end: dayStart + 366 * DAY_MS,
        bucket: "day",
      }),
    ).rejects.toThrow("range must be at most 365 days for the day bucket");
  });
});
