import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";

import type { ComponentApi } from "../component/_generated/component.js";

type RecordUsageReference = ComponentApi["usage"]["recordUsage"];

export type RecordUsageArgs = FunctionArgs<RecordUsageReference>;
export type RecordUsageResult = FunctionReturnType<RecordUsageReference>;
export type RecordUsageInput = Omit<RecordUsageArgs, "eventId"> & {
  eventId?: string;
};

export type MutationRunner = <
  Mutation extends FunctionReference<"mutation", "public" | "internal">,
>(
  mutation: Mutation,
  args: FunctionArgs<Mutation>,
) => Promise<FunctionReturnType<Mutation>>;

export class LlmAnalytics {
  constructor(readonly component: ComponentApi) {}

  async(runMutation: MutationRunner, input: RecordUsageInput) {
    return runMutation(this.component.usage.recordUsage, input);
  }
}

export function createLlmAnalytics(component: ComponentApi) {
  return new LlmAnalytics(component);
}
