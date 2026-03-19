import { describe, expect, it } from "vitest";

import { api } from "./_generated/api.js";
import { initConvexTest } from "./test.setup.js";

type TableName = "model_pricing";

const TEST_TABLE_READ_LIMIT = 1_000;

async function readTable(t: ReturnType<typeof initConvexTest>, table: TableName) {
  return t.run(async (ctx) => await ctx.db.query(table).take(TEST_TABLE_READ_LIMIT));
}

describe("pricing functions", () => {
  it("creates and reads model pricing rows", async () => {
    const t = initConvexTest();

    await expect(
      t.mutation(api.pricing.upsertModelPricing, {
        provider: "openai",
        model: "gpt-4o-mini",
        inputCostMicrosPer1M: 150_000,
        outputCostMicrosPer1M: 600_000,
        cachedInputCostMicrosPer1M: 75_000,
      }),
    ).resolves.toEqual({
      kind: "created",
      pricing: {
        provider: "openai",
        model: "gpt-4o-mini",
        inputCostMicrosPer1M: 150_000,
        outputCostMicrosPer1M: 600_000,
        cachedInputCostMicrosPer1M: 75_000,
      },
    });

    await expect(
      t.query(api.pricing.getModelPricing, {
        provider: "openai",
        model: "gpt-4o-mini",
      }),
    ).resolves.toEqual({
      provider: "openai",
      model: "gpt-4o-mini",
      inputCostMicrosPer1M: 150_000,
      outputCostMicrosPer1M: 600_000,
      cachedInputCostMicrosPer1M: 75_000,
    });
  });

  it("replaces an existing pricing row and clears omitted optional fields", async () => {
    const t = initConvexTest();

    await t.mutation(api.pricing.upsertModelPricing, {
      provider: "openai",
      model: "gpt-4o-mini",
      inputCostMicrosPer1M: 150_000,
      outputCostMicrosPer1M: 600_000,
      cachedInputCostMicrosPer1M: 75_000,
    });

    await expect(
      t.mutation(api.pricing.upsertModelPricing, {
        provider: " openai ",
        model: " gpt-4o-mini ",
        inputCostMicrosPer1M: 175_000,
        outputCostMicrosPer1M: 650_000,
      }),
    ).resolves.toEqual({
      kind: "updated",
      pricing: {
        provider: "openai",
        model: "gpt-4o-mini",
        inputCostMicrosPer1M: 175_000,
        outputCostMicrosPer1M: 650_000,
      },
    });

    const rows = await readTable(t, "model_pricing");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      inputCostMicrosPer1M: 175_000,
      outputCostMicrosPer1M: 650_000,
    });
    expect(rows[0]?.cachedInputCostMicrosPer1M).toBeUndefined();
  });

  it("lists pricing rows in provider/model order", async () => {
    const t = initConvexTest();

    await t.mutation(api.pricing.upsertModelPricing, {
      provider: "openai",
      model: "gpt-4o",
      inputCostMicrosPer1M: 1,
      outputCostMicrosPer1M: 2,
    });
    await t.mutation(api.pricing.upsertModelPricing, {
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      inputCostMicrosPer1M: 3,
      outputCostMicrosPer1M: 4,
    });
    await t.mutation(api.pricing.upsertModelPricing, {
      provider: "openai",
      model: "gpt-4o-mini",
      inputCostMicrosPer1M: 5,
      outputCostMicrosPer1M: 6,
    });

    await expect(t.query(api.pricing.listModelPricings, {})).resolves.toEqual([
      {
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        inputCostMicrosPer1M: 3,
        outputCostMicrosPer1M: 4,
      },
      {
        provider: "openai",
        model: "gpt-4o",
        inputCostMicrosPer1M: 1,
        outputCostMicrosPer1M: 2,
      },
      {
        provider: "openai",
        model: "gpt-4o-mini",
        inputCostMicrosPer1M: 5,
        outputCostMicrosPer1M: 6,
      },
    ]);
  });

  it("returns null for a missing pricing row", async () => {
    const t = initConvexTest();

    await expect(
      t.query(api.pricing.getModelPricing, {
        provider: "openai",
        model: "missing-model",
      }),
    ).resolves.toBeNull();
  });

  it("deletes an existing row and reports misses", async () => {
    const t = initConvexTest();

    await t.mutation(api.pricing.upsertModelPricing, {
      provider: "openai",
      model: "gpt-4o-mini",
      inputCostMicrosPer1M: 150_000,
      outputCostMicrosPer1M: 600_000,
    });

    await expect(
      t.mutation(api.pricing.deleteModelPricing, {
        provider: "openai",
        model: "gpt-4o-mini",
      }),
    ).resolves.toEqual({ deleted: true });

    await expect(
      t.mutation(api.pricing.deleteModelPricing, {
        provider: "openai",
        model: "gpt-4o-mini",
      }),
    ).resolves.toEqual({ deleted: false });

    expect(await readTable(t, "model_pricing")).toHaveLength(0);
  });

  it("rejects invalid pricing input without writing partial state", async () => {
    const t = initConvexTest();

    await expect(
      t.mutation(api.pricing.upsertModelPricing, {
        provider: "   ",
        model: "gpt-4o-mini",
        inputCostMicrosPer1M: 150_000,
        outputCostMicrosPer1M: 600_000,
      }),
    ).rejects.toThrow("provider must be a non-empty string");

    await expect(
      t.mutation(api.pricing.upsertModelPricing, {
        provider: "openai",
        model: "gpt-4o-mini",
        inputCostMicrosPer1M: -1,
        outputCostMicrosPer1M: 600_000,
      }),
    ).rejects.toThrow(
      "inputCostMicrosPer1M must be a non-negative finite number",
    );

    expect(await readTable(t, "model_pricing")).toHaveLength(0);
  });
});
