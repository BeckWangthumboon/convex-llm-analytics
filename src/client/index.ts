import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";

import type { ComponentApi } from "../component/_generated/component.js";

type RecordUsageReference = ComponentApi["usage"]["recordUsage"];
type GetSummaryReference = ComponentApi["summary"]["getSummary"];
type GetTimeseriesReference = ComponentApi["summary"]["getTimeseries"];
type GetTopModelsReference = ComponentApi["summary"]["getTopModels"];

export type RecordUsageArgs = FunctionArgs<RecordUsageReference>;
export type RecordUsageResult = FunctionReturnType<RecordUsageReference>;
export type RecordUsageInput = Omit<RecordUsageArgs, "eventId"> & {
  eventId?: string;
};
export type GetSummaryArgs = FunctionArgs<GetSummaryReference>;
export type GetSummaryResult = FunctionReturnType<GetSummaryReference>;
export type GetTimeseriesArgs = FunctionArgs<GetTimeseriesReference>;
export type GetTimeseriesResult = FunctionReturnType<GetTimeseriesReference>;
export type GetTopModelsArgs = FunctionArgs<GetTopModelsReference>;
export type GetTopModelsResult = FunctionReturnType<GetTopModelsReference>;

export type MutationRunner = <
  Mutation extends FunctionReference<"mutation", "public" | "internal">,
>(
  mutation: Mutation,
  args: FunctionArgs<Mutation>,
) => Promise<FunctionReturnType<Mutation>>;

export type QueryRunner = <
  Query extends FunctionReference<"query", "public" | "internal">,
>(
  query: Query,
  args: FunctionArgs<Query>,
) => Promise<FunctionReturnType<Query>>;

export class LlmAnalytics {
  constructor(readonly component: ComponentApi) {}

  async recordUsage(runMutation: MutationRunner, input: RecordUsageInput) {
    return runMutation(this.component.usage.recordUsage, input);
  }

  async getSummary(runQuery: QueryRunner, args: GetSummaryArgs) {
    return runQuery(this.component.summary.getSummary, args);
  }

  async getTimeseries(runQuery: QueryRunner, args: GetTimeseriesArgs) {
    return runQuery(this.component.summary.getTimeseries, args);
  }

  async getTopModels(runQuery: QueryRunner, args: GetTopModelsArgs) {
    return runQuery(this.component.summary.getTopModels, args);
  }
}

export function createLlmAnalytics(component: ComponentApi) {
  return new LlmAnalytics(component);
}
