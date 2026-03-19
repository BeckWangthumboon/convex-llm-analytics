/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    pricing: {
      deleteModelPricing: FunctionReference<
        "mutation",
        "internal",
        { model: string; provider: string },
        { deleted: boolean },
        Name
      >;
      getModelPricing: FunctionReference<
        "query",
        "internal",
        { model: string; provider: string },
        {
          cachedInputCostMicrosPer1M?: number;
          inputCostMicrosPer1M: number;
          model: string;
          outputCostMicrosPer1M: number;
          provider: string;
        } | null,
        Name
      >;
      listModelPricings: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          cachedInputCostMicrosPer1M?: number;
          inputCostMicrosPer1M: number;
          model: string;
          outputCostMicrosPer1M: number;
          provider: string;
        }>,
        Name
      >;
      upsertModelPricing: FunctionReference<
        "mutation",
        "internal",
        {
          cachedInputCostMicrosPer1M?: number;
          inputCostMicrosPer1M: number;
          model: string;
          outputCostMicrosPer1M: number;
          provider: string;
        },
        | {
            kind: "created";
            pricing: {
              cachedInputCostMicrosPer1M?: number;
              inputCostMicrosPer1M: number;
              model: string;
              outputCostMicrosPer1M: number;
              provider: string;
            };
          }
        | {
            kind: "updated";
            pricing: {
              cachedInputCostMicrosPer1M?: number;
              inputCostMicrosPer1M: number;
              model: string;
              outputCostMicrosPer1M: number;
              provider: string;
            };
          },
        Name
      >;
    };
    summary: {
      getSummary: FunctionReference<
        "query",
        "internal",
        {
          bucket: "hour" | "day";
          end: number;
          identifier?: string;
          start: number;
        },
        {
          averageLatencyMs: number | null;
          cachedInputTokens: number;
          errors: number;
          inputTokens: number;
          outputTokens: number;
          reasoningTokens: number;
          requests: number;
          totalCostMicrosUsd: number;
          totalTokens: number;
        },
        Name
      >;
      getTimeseries: FunctionReference<
        "query",
        "internal",
        {
          bucket: "hour" | "day";
          end: number;
          identifier?: string;
          model?: string;
          start: number;
        },
        Array<{
          averageLatencyMs: number | null;
          bucketStart: number;
          cachedInputTokens: number;
          errors: number;
          inputTokens: number;
          outputTokens: number;
          reasoningTokens: number;
          requests: number;
          totalCostMicrosUsd: number;
          totalTokens: number;
        }>,
        Name
      >;
      getTopModels: FunctionReference<
        "query",
        "internal",
        {
          bucket: "hour" | "day";
          end: number;
          identifier?: string;
          start: number;
        },
        Array<{
          averageLatencyMs: number | null;
          cachedInputTokens: number;
          errors: number;
          inputTokens: number;
          model: string;
          outputTokens: number;
          provider: string;
          reasoningTokens: number;
          requests: number;
          totalCostMicrosUsd: number;
          totalTokens: number;
        }>,
        Name
      >;
    };
    usage: {
      recordUsage: FunctionReference<
        "mutation",
        "internal",
        {
          cachedInputTokens?: number;
          costMicrosUsd?: number;
          eventId?: string;
          finishReason?:
            | "stop"
            | "length"
            | "content-filter"
            | "tool-calls"
            | "error"
            | "other";
          identifier: string;
          inputTokens?: number;
          latencyMs?: number;
          model: string;
          outputTokens?: number;
          provider: string;
          providerResponseId?: string;
          reasoningTokens?: number;
          status: "success" | "error";
          timestamp: number;
          totalTokens?: number;
        },
        | { eventId: string; kind: "inserted" }
        | { eventId: string; kind: "duplicate" },
        Name
      >;
    };
  };
