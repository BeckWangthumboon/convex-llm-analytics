import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel.js";
import { query, type QueryCtx } from "./_generated/server.js";
import {
  DAY_MS,
  getBucketSizeMs,
  HOUR_MS,
  isBucketAligned,
  type AggregateBucket,
} from "./lib/buckets.js";

const bucketValidator = v.union(v.literal("hour"), v.literal("day"));

const rangeArgs = {
  start: v.number(),
  end: v.number(),
  bucket: bucketValidator,
};

const MAX_HOURLY_RANGE_MS = 7 * DAY_MS;
const MAX_DAILY_RANGE_MS = 365 * DAY_MS;

const averageLatencyValidator = v.union(v.number(), v.null());

const summaryValue = v.object({
  requests: v.number(),
  errors: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  totalTokens: v.number(),
  reasoningTokens: v.number(),
  cachedInputTokens: v.number(),
  averageLatencyMs: averageLatencyValidator,
  totalCostMicrosUsd: v.number(),
});

const timeseriesRowValue = v.object({
  bucketStart: v.number(),
  requests: v.number(),
  errors: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  totalTokens: v.number(),
  reasoningTokens: v.number(),
  cachedInputTokens: v.number(),
  averageLatencyMs: averageLatencyValidator,
  totalCostMicrosUsd: v.number(),
});

const topModelValue = v.object({
  provider: v.string(),
  model: v.string(),
  requests: v.number(),
  errors: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  totalTokens: v.number(),
  reasoningTokens: v.number(),
  cachedInputTokens: v.number(),
  averageLatencyMs: averageLatencyValidator,
  totalCostMicrosUsd: v.number(),
});

export const getSummary = query({
  args: {
    ...rangeArgs,
    identifier: v.optional(v.string()),
  },
  returns: summaryValue,
  handler: async (ctx, args) => {
    const normalized = normalizeRangeArgs(args);
    const totals = createAccumulator();

    await forEachAggregateRow(ctx, normalized, (row) => {
      accumulate(totals, row);
    });

    return toPublicMetrics(totals);
  },
});

export const getTimeseries = query({
  args: {
    ...rangeArgs,
    identifier: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  returns: v.array(timeseriesRowValue),
  handler: async (ctx, args) => {
    const normalized = normalizeRangeArgs(args);
    const bucketSizeMs = getBucketSizeMs(normalized.bucket);
    const buckets = new Map<number, MetricsAccumulator>();

    for (
      let bucketStart = normalized.start;
      bucketStart < normalized.end;
      bucketStart += bucketSizeMs
    ) {
      buckets.set(bucketStart, createAccumulator());
    }

    await forEachAggregateRow(ctx, normalized, (row) => {
      const bucket = buckets.get(row.bucketStart);
      if (bucket !== undefined) {
        accumulate(bucket, row);
      }
    });

    return Array.from(buckets.entries())
      .sort(([left], [right]) => left - right)
      .map(([bucketStart, totals]) => ({
        bucketStart,
        ...toPublicMetrics(totals),
      }));
  },
});

export const getTopModels = query({
  args: {
    ...rangeArgs,
    identifier: v.optional(v.string()),
  },
  returns: v.array(topModelValue),
  handler: async (ctx, args) => {
    const normalized = normalizeRangeArgs(args);
    const models = new Map<string, TopModelAccumulator>();

    await forEachAggregateRow(ctx, normalized, (row) => {
      const key = `${row.provider}\u0000${row.model}`;
      const existing = models.get(key);
      if (existing === undefined) {
        models.set(key, {
          provider: row.provider,
          model: row.model,
          totals: accumulate(createAccumulator(), row),
        });
        return;
      }
      accumulate(existing.totals, row);
    });

    return Array.from(models.values())
      .map(({ provider, model, totals }) => ({
        provider,
        model,
        ...toPublicMetrics(totals),
      }))
      .sort((left, right) => {
        if (right.requests !== left.requests) {
          return right.requests - left.requests;
        }
        if (right.totalTokens !== left.totalTokens) {
          return right.totalTokens - left.totalTokens;
        }
        return left.provider === right.provider
          ? left.model.localeCompare(right.model)
          : left.provider.localeCompare(right.provider);
      });
  },
});

type RangeArgs = {
  start: number;
  end: number;
  bucket: AggregateBucket;
  identifier?: string;
  model?: string;
};

type AggregateTableName =
  | "usage_aggregates_hourly"
  | "usage_aggregates_daily";

type AggregateRow = Doc<"usage_aggregates_hourly"> | Doc<"usage_aggregates_daily">;

type MetricsAccumulator = {
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  totalLatencyMs: number;
  latencySampleCount: number;
  totalCostMicrosUsd: number;
};

type TopModelAccumulator = {
  provider: string;
  model: string;
  totals: MetricsAccumulator;
};

function normalizeRangeArgs<T extends RangeArgs>(args: T): T {
  validateTimestamp(args.start, "start");
  validateTimestamp(args.end, "end");

  if (args.start >= args.end) {
    throw new Error("start must be less than end");
  }

  if (!isBucketAligned(args.start, args.bucket)) {
    throw new Error(`start must align to the ${args.bucket} bucket`);
  }

  if (!isBucketAligned(args.end, args.bucket)) {
    throw new Error(`end must align to the ${args.bucket} bucket`);
  }

  if (args.end - args.start > getMaxRangeMs(args.bucket)) {
    throw new Error(
      `range must be at most ${getMaxRangeLabel(args.bucket)} for the ${args.bucket} bucket`,
    );
  }

  if (args.identifier !== undefined) {
    validateRequiredString(args.identifier, "identifier");
  }

  if (args.model !== undefined) {
    validateRequiredString(args.model, "model");
  }

  return args;
}

async function forEachAggregateRow(
  ctx: QueryCtx,
  args: RangeArgs,
  visit: (row: AggregateRow) => void | Promise<void>,
) {
  const table = getAggregateTableName(args.bucket);

  if (args.identifier !== undefined && args.model !== undefined) {
    const rows = ctx.db
      .query(table)
      .withIndex("by_identifier_model_bucket", (q) =>
        q
          .eq("identifier", args.identifier!)
          .eq("model", args.model!)
          .gte("bucketStart", args.start)
          .lt("bucketStart", args.end),
      );

    for await (const row of rows) {
      await visit(row);
    }
    return;
  }

  if (args.identifier !== undefined) {
    const rows = ctx.db
      .query(table)
      .withIndex("by_identifier_bucket", (q) =>
        q
          .eq("identifier", args.identifier!)
          .gte("bucketStart", args.start)
          .lt("bucketStart", args.end),
      );

    for await (const row of rows) {
      await visit(row);
    }
    return;
  }

  if (args.model !== undefined) {
    const rows = ctx.db
      .query(table)
      .withIndex("by_model_bucket", (q) =>
        q.eq("model", args.model!).gte("bucketStart", args.start).lt("bucketStart", args.end),
      );

    for await (const row of rows) {
      await visit(row);
    }
    return;
  }

  const rows = ctx.db
    .query(table)
    .withIndex("by_bucket_start", (q) =>
      q.gte("bucketStart", args.start).lt("bucketStart", args.end),
    );

  for await (const row of rows) {
    await visit(row);
  }
}

function getAggregateTableName(bucket: AggregateBucket): AggregateTableName {
  return bucket === "hour"
    ? "usage_aggregates_hourly"
    : "usage_aggregates_daily";
}

function getMaxRangeMs(bucket: AggregateBucket) {
  return bucket === "hour" ? MAX_HOURLY_RANGE_MS : MAX_DAILY_RANGE_MS;
}

function getMaxRangeLabel(bucket: AggregateBucket) {
  return bucket === "hour" ? "7 days" : "365 days";
}

function createAccumulator(): MetricsAccumulator {
  return {
    requests: 0,
    errors: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    totalLatencyMs: 0,
    latencySampleCount: 0,
    totalCostMicrosUsd: 0,
  };
}

function accumulate(accumulator: MetricsAccumulator, row: AggregateRow) {
  accumulator.requests += row.requestCount;
  accumulator.errors += row.errorCount;
  accumulator.inputTokens += row.inputTokens;
  accumulator.outputTokens += row.outputTokens;
  accumulator.totalTokens += row.totalTokens;
  accumulator.reasoningTokens += row.reasoningTokens;
  accumulator.cachedInputTokens += row.cachedInputTokens;
  accumulator.totalLatencyMs += row.totalLatencyMs;
  accumulator.latencySampleCount += row.latencySampleCount;
  accumulator.totalCostMicrosUsd += row.totalCostMicrosUsd;
  return accumulator;
}

function toPublicMetrics(totals: MetricsAccumulator) {
  return {
    requests: totals.requests,
    errors: totals.errors,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    totalTokens: totals.totalTokens,
    reasoningTokens: totals.reasoningTokens,
    cachedInputTokens: totals.cachedInputTokens,
    averageLatencyMs:
      totals.latencySampleCount === 0
        ? null
        : totals.totalLatencyMs / totals.latencySampleCount,
    totalCostMicrosUsd: totals.totalCostMicrosUsd,
  };
}

function validateTimestamp(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
}

function validateRequiredString(value: string, field: string) {
  if (value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}
