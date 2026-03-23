"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

declare const process: {
  env: Record<string, string | undefined>;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "minimax/minimax-m2.5:free";
const SYSTEM_PROMPT =
  "You are a concise, helpful assistant for a developer chat demo. Answer clearly and avoid unnecessary verbosity.";

export const sendMessage = action({
  args: {
    threadId: v.id("threads"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmedPrompt = args.prompt.trim();
    if (!trimmedPrompt) {
      throw new Error("Prompt cannot be empty.");
    }

    await ctx.runMutation(internal.chat.storeMessage, {
      threadId: args.threadId,
      role: "user",
      content: trimmedPrompt,
    });

    const threadMessages = await ctx.runQuery(internal.chat.getModelMessages, {
      threadId: args.threadId,
    });

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is not set.");
    }

    const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...threadMessages,
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter request failed: ${response.status} ${body}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const assistantMessage = payload.choices?.[0]?.message?.content?.trim();
    if (!assistantMessage) {
      throw new Error("OpenRouter returned an empty response.");
    }

    await ctx.runMutation(internal.chat.storeMessage, {
      threadId: args.threadId,
      role: "assistant",
      content: assistantMessage,
    });

    return { ok: true };
  },
});
