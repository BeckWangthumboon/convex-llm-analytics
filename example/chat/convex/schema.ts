import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  threads: defineTable({
    createdAt: v.number(),
  }),
  messages: defineTable({
    threadId: v.id("threads"),
    role: v.union(
      v.literal("system"),
      v.literal("user"),
      v.literal("assistant"),
    ),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_thread", ["threadId", "createdAt"]),
});
