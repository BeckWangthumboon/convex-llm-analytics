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
    usage: {
      recordUsage: FunctionReference<
        "mutation",
        "internal",
        {
          cachedInputTokens?: number;
          completionTokens?: number;
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
          latencyMs?: number;
          model: string;
          promptTokens?: number;
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
