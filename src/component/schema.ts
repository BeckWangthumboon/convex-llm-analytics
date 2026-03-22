import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const status = v.union(v.literal("success"), v.literal("error"));

const finishReason = v.union(
  v.literal("stop"),
  v.literal("length"),
  v.literal("content-filter"),
  v.literal("tool-calls"),
  v.literal("error"),
  v.literal("other"),
);

const aggregateFields = {
  bucketStart: v.number(),
  identifier: v.string(),
  provider: v.string(),
  model: v.string(),

  requestCount: v.number(),
  successCount: v.number(),
  errorCount: v.number(),

  inputTokens: v.number(),
  outputTokens: v.number(),
  totalTokens: v.number(),
  reasoningTokens: v.number(),
  cachedInputTokens: v.number(),

  totalLatencyMs: v.number(),
  latencySampleCount: v.number(),
};

export default defineSchema({
  usage_events: defineTable({
    eventId: v.string(),
    timestamp: v.number(),

    identifier: v.string(),
    provider: v.string(),
    model: v.string(),

    status,
    finishReason: v.optional(finishReason),

    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    reasoningTokens: v.optional(v.number()),
    cachedInputTokens: v.optional(v.number()),

    latencyMs: v.optional(v.number()),
    costMicrosUsd: v.optional(v.number()),

    providerResponseId: v.optional(v.string()),
  })
    .index("by_event_id", ["eventId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_identifier_timestamp", ["identifier", "timestamp"]),

  usage_aggregates_hourly: defineTable(aggregateFields)
    .index("by_bucket_start", ["bucketStart"])
    .index("by_identifier_bucket", ["identifier", "bucketStart"])
    .index("by_model_bucket", ["model", "bucketStart"])
    .index("by_identifier_model_bucket", ["identifier", "model", "bucketStart"])
    .index("by_bucket_identifier_provider_model", [
      "bucketStart",
      "identifier",
      "provider",
      "model",
    ]),

  usage_aggregates_daily: defineTable(aggregateFields)
    .index("by_bucket_start", ["bucketStart"])
    .index("by_identifier_bucket", ["identifier", "bucketStart"])
    .index("by_model_bucket", ["model", "bucketStart"])
    .index("by_identifier_model_bucket", ["identifier", "model", "bucketStart"])
    .index("by_bucket_identifier_provider_model", [
      "bucketStart",
      "identifier",
      "provider",
      "model",
    ]),

  model_pricing: defineTable({
    provider: v.string(),
    model: v.string(),
    inputCostMicrosPer1M: v.number(),
    outputCostMicrosPer1M: v.number(),
    cachedInputCostMicrosPer1M: v.optional(v.number()),
  }).index("by_provider_model", ["provider", "model"]),
});
