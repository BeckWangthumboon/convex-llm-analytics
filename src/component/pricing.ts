import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel.js";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server.js";
import {
  normalizeModelPricing,
  normalizeModelPricingKey,
} from "./lib/pricing.js";

const modelPricingArgs = {
  provider: v.string(),
  model: v.string(),
  inputCostMicrosPer1M: v.number(),
  outputCostMicrosPer1M: v.number(),
  cachedInputCostMicrosPer1M: v.optional(v.number()),
};

const modelPricingKeyArgs = {
  provider: v.string(),
  model: v.string(),
};

const modelPricingValue = v.object({
  provider: v.string(),
  model: v.string(),
  inputCostMicrosPer1M: v.number(),
  outputCostMicrosPer1M: v.number(),
  cachedInputCostMicrosPer1M: v.optional(v.number()),
});

export const upsertModelPricing = mutation({
  args: modelPricingArgs,
  returns: v.union(
    v.object({
      kind: v.literal("created"),
      pricing: modelPricingValue,
    }),
    v.object({
      kind: v.literal("updated"),
      pricing: modelPricingValue,
    }),
  ),
  handler: async (ctx, args) => {
    const pricing = normalizeModelPricing(args);
    const existing = await findModelPricingDoc(ctx, pricing);

    if (existing === null) {
      await ctx.db.insert("model_pricing", pricing);
      return {
        kind: "created" as const,
        pricing,
      };
    }

    await ctx.db.replace(existing._id, pricing);

    return {
      kind: "updated" as const,
      pricing,
    };
  },
});

export const getModelPricing = query({
  args: modelPricingKeyArgs,
  returns: v.nullable(modelPricingValue),
  handler: async (ctx, args) => {
    const key = normalizeModelPricingKey(args);
    const pricing = await findModelPricingDoc(ctx, key);

    return pricing === null ? null : toPublicModelPricing(pricing);
  },
});

export const listModelPricings = query({
  args: {},
  returns: v.array(modelPricingValue),
  handler: async (ctx) => {
    const pricings = await ctx.db.query("model_pricing").collect();

    return pricings
      .map(toPublicModelPricing)
      .sort((a, b) =>
        a.provider === b.provider
          ? a.model.localeCompare(b.model)
          : a.provider.localeCompare(b.provider),
      );
  },
});

export const deleteModelPricing = mutation({
  args: modelPricingKeyArgs,
  returns: v.object({
    deleted: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const key = normalizeModelPricingKey(args);
    const existing = await findModelPricingDoc(ctx, key);

    if (existing === null) {
      return { deleted: false };
    }

    await ctx.db.delete(existing._id);
    return { deleted: true };
  },
});

async function findModelPricingDoc(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  key: {
    provider: string;
    model: string;
  },
) {
  return await ctx.db
    .query("model_pricing")
    .withIndex("by_provider_model", (q) =>
      q.eq("provider", key.provider).eq("model", key.model),
    )
    .unique();
}

function toPublicModelPricing(pricing: Doc<"model_pricing">) {
  return {
    provider: pricing.provider,
    model: pricing.model,
    inputCostMicrosPer1M: pricing.inputCostMicrosPer1M,
    outputCostMicrosPer1M: pricing.outputCostMicrosPer1M,
    cachedInputCostMicrosPer1M: pricing.cachedInputCostMicrosPer1M,
  };
}
