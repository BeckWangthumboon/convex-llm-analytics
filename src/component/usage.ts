import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel.js";
import { mutation, type MutationCtx } from "./_generated/server.js";
import { getDayBucketStart, getHourBucketStart } from "./lib/buckets.js";
import { normalizeUsageEvent, toRollupIncrement } from "./lib/normalize.js";

const statusValidator = v.union(v.literal("success"), v.literal("error"));

const finishReasonValidator = v.union(
  v.literal("stop"),
  v.literal("length"),
  v.literal("content-filter"),
  v.literal("tool-calls"),
  v.literal("error"),
  v.literal("other"),
);

const usageEventArgs = {
  eventId: v.optional(v.string()),
  timestamp: v.number(),
  identifier: v.string(),
  provider: v.string(),
  model: v.string(),
  status: statusValidator,
  finishReason: v.optional(finishReasonValidator),
  promptTokens: v.optional(v.number()),
  completionTokens: v.optional(v.number()),
  totalTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  cachedInputTokens: v.optional(v.number()),
  latencyMs: v.optional(v.number()),
  costMicrosUsd: v.optional(v.number()),
  providerResponseId: v.optional(v.string()),
};

export const recordUsage = mutation({
  args: usageEventArgs,
  returns: v.union(
    v.object({
      kind: v.literal("inserted"),
      eventId: v.string(),
    }),
    v.object({
      kind: v.literal("duplicate"),
      eventId: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.eventId !== undefined) {
      const eventId = args.eventId;
      const existingEvent = await ctx.db
        .query("usage_events")
        .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
        .unique();

      if (existingEvent !== null) {
        return {
          kind: "duplicate" as const,
          eventId,
        };
      }
    }

    const event = normalizeUsageEvent(args);
    const increment = toRollupIncrement(event);

    await ctx.db.insert("usage_events", event);

    await upsertRollup(ctx, "usage_rollups_hourly", {
      bucketStart: getHourBucketStart(event.timestamp),
      identifier: event.identifier,
      provider: event.provider,
      model: event.model,
      increment,
    });

    await upsertRollup(ctx, "usage_rollups_daily", {
      bucketStart: getDayBucketStart(event.timestamp),
      identifier: event.identifier,
      provider: event.provider,
      model: event.model,
      increment,
    });

    return {
      kind: "inserted" as const,
      eventId: event.eventId,
    };
  },
});

type RollupTableName = "usage_rollups_hourly" | "usage_rollups_daily";

type UpsertRollupArgs = {
  bucketStart: number;
  identifier: string;
  provider: string;
  model: string;
  increment: ReturnType<typeof toRollupIncrement>;
};

async function upsertRollup(
  ctx: MutationCtx,
  table: RollupTableName,
  args: UpsertRollupArgs,
) {
  const existing = await ctx.db
    .query(table)
    .withIndex("by_bucket_identifier_provider_model", (q) =>
      q
        .eq("bucketStart", args.bucketStart)
        .eq("identifier", args.identifier)
        .eq("provider", args.provider)
        .eq("model", args.model),
    )
    .unique();

  if (existing === null) {
    await ctx.db.insert(table, {
      bucketStart: args.bucketStart,
      identifier: args.identifier,
      provider: args.provider,
      model: args.model,
      ...args.increment,
    });
    return;
  }

  await patchRollup(ctx, table, existing._id, existing, args.increment);
}

async function patchRollup(
  ctx: MutationCtx,
  table: RollupTableName,
  id: Id<RollupTableName>,
  existing: Doc<RollupTableName>,
  increment: ReturnType<typeof toRollupIncrement>,
) {
  await ctx.db.patch(id, {
    requestCount: existing.requestCount + increment.requestCount,
    successCount: existing.successCount + increment.successCount,
    errorCount: existing.errorCount + increment.errorCount,
    promptTokens: existing.promptTokens + increment.promptTokens,
    completionTokens: existing.completionTokens + increment.completionTokens,
    totalTokens: existing.totalTokens + increment.totalTokens,
    reasoningTokens: existing.reasoningTokens + increment.reasoningTokens,
    cachedInputTokens: existing.cachedInputTokens + increment.cachedInputTokens,
    totalLatencyMs: existing.totalLatencyMs + increment.totalLatencyMs,
    latencySampleCount:
      existing.latencySampleCount + increment.latencySampleCount,
    totalCostMicrosUsd:
      existing.totalCostMicrosUsd + increment.totalCostMicrosUsd,
  });
}
