# Convex LLM Analytics v1 Spec

## Intent

Build a small, installable Convex component that tracks normalized LLM usage
metrics and exposes a simple query surface for local dashboards and app-level
analytics.

This package is for:

- indie hackers
- small SaaS apps
- internal tools
- early-stage teams

This package is not trying to be:

- enterprise observability
- generalized analytics infrastructure
- tracing infrastructure
- a data warehouse pipeline

The product promise for v1 is:

- easy install
- narrow data model
- useful aggregate charts
- simple aggregate analytics
- straightforward local development with Bun-based scripts

## Implementation Status

Implemented:

- raw usage event ingestion through `recordUsage`, including optional dedupe
  and server-generated ids
- hourly and daily aggregate maintenance on write
- manual model pricing CRUD through `upsertModelPricing`,
  `getModelPricing`, `listModelPricings`, and `deleteModelPricing`
- read APIs for dashboards and analytics through `getSummary`,
  `getTimeseries`, and `getTopModels`
- validation and helper logic for normalization, bucketing, and pricing input
- test coverage for normalization helpers, write-path behavior, pricing CRUD,
  and read-query math
- Bun as the primary package manager for local development
- local developer tooling through `generate`, `format`, `lint`, `typecheck`,
  `test`, `check`, and `build`

Partially implemented:

- thin client helper surface exists, but only wraps `recordUsage`

Not yet implemented:

- expanded client helper surface for the read queries
- AI SDK helper layer

## Non-Goals

V1 explicitly does not include:

- prompt or response storage
- traces, spans, or tool-call trees
- backfills or recomputation jobs
- external pricing APIs or automatic pricing sync
- multi-tenant workspace logic
- arbitrary tags or unbounded dimensions
- stream chunk tracking
- alerts or anomaly detection
- exports or warehouse pipelines
- enterprise-scale observability features

## Product Opinion

This component tracks usage analytics around one main grouping dimension:

- `identifier`

`identifier` is the app-defined thing being measured. It is intentionally a
single field, not an open-ended dimension system.

Examples:

- route
- feature
- agent
- project
- customer segment

This is a core opinion of the product, not just a default.

## V1 Scope

V1 includes six capabilities:

1. Ingest normalized usage events through one primary write API.
2. Store raw append-only events.
3. Maintain precomputed hourly and daily aggregates on write.
4. Store manual model pricing configuration for aggregate-derived read-time cost
   estimation.
5. Expose read APIs for dashboards and simple analytics.
6. Provide an AI SDK-first helper layer that normalizes AI SDK usage results
   before sending them into the component.

## Primary Write API

The main write entrypoint is:

- `recordUsage(event)`

Responsibilities:

- validate the input shape
- deduplicate by `eventId` when provided
- append the raw event once
- preserve caller-supplied cost when provided
- update hourly aggregates
- update daily aggregates

V1 implementation approach:

- one synchronous mutation
- no scheduled jobs
- no async aggregate pipeline

Rationale:

- simpler correctness model
- fresh reads immediately after write
- less retry and operational complexity

## Event Contract

Recommended v1 event shape:

```ts
export type UsageEvent = {
  eventId?: string;
  timestamp: number;

  provider: string;
  model: string;
  identifier: string;

  status: "success" | "error";
  finishReason?:
    | "stop"
    | "length"
    | "content-filter"
    | "tool-calls"
    | "error"
    | "other";

  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;

  latencyMs?: number;
  costMicrosUsd?: number;

  providerResponseId?: string;
};
```

Notes:

- `eventId` is optional.
- when provided, `eventId` is the dedupe key.
- when omitted, the component generates a fresh id and the write is treated as a
  new event.
- `timestamp` is event time in epoch milliseconds.
- `costMicrosUsd` is optional because some apps will not provide cost at write
  time.
- read queries derive best-effort cost from aggregate token totals and current
  model pricing.
- token, latency, and cost fields are best-effort analytics fields, not
  billing-grade guarantees
- `latencyMs` is optional and may be measured by the caller rather than
  provided by the SDK
- caller-supplied `costMicrosUsd` is retained on raw events for compatibility
  but is not used by analytics reads
- read-time derived cost may change if model pricing rows are edited later
- keep the event narrow and stable
- the component contract should not depend on raw AI SDK response shapes
- raw `providerMetadata` is intentionally not stored in v1

## Storage Model

### Table: `usage_events`

Purpose:

- raw append-only event log
- recent debugging/drilldown
- future recompute support if v2 ever adds it

Fields:

- `eventId`
- `timestamp`
- `provider`
- `model`
- `identifier`
- `status`
- `finishReason`
- `inputTokens`
- `outputTokens`
- `totalTokens`
- `reasoningTokens`
- `cachedInputTokens`
- `latencyMs`
- `costMicrosUsd`
- `providerResponseId`

Expected indexes in v1:

- by `eventId` for optional dedupe
- by `timestamp` for recent event queries
- by `identifier` + `timestamp` for filtered recent event queries

### Table: `usage_aggregates_hourly`

Bucket dimensions:

- hour bucket
- identifier
- provider
- model

Aggregates:

- `requestCount`
- `successCount`
- `errorCount`
- `inputTokens`
- `outputTokens`
- `totalTokens`
- `reasoningTokens`
- `cachedInputTokens`
- `totalLatencyMs`
- `latencySampleCount`

Expected uniqueness key:

- `(bucketStart, identifier, provider, model)`

### Table: `usage_aggregates_daily`

Same shape as hourly aggregates, but bucketed by day instead of hour.

Expected uniqueness key:

- `(bucketStart, identifier, provider, model)`

### Table: `model_pricing`

Purpose:

- store manual per-model pricing configuration
- support aggregate-derived read-time cost estimation
- avoid hardcoded in-memory pricing maps

Fields:

- `provider`
- `model`
- `inputCostMicrosPer1M`
- `outputCostMicrosPer1M`
- `cachedInputCostMicrosPer1M`

Expected uniqueness key:

- `(provider, model)`

## Write Path

`recordUsage(event)` flow:

1. If `eventId` is provided, check whether it already exists.
2. If it exists, no-op and return a dedupe-safe result.
3. Otherwise, generate or use the event id for this write.
4. Insert raw event into `usage_events`.
5. Upsert the matching row in `usage_aggregates_hourly`.
6. Upsert the matching row in `usage_aggregates_daily`.
7. Return a small write result.

Desired behavior:

- idempotent when `eventId` is provided
- omitting `eventId` should always create a new event
- cheap enough for small-app request volumes
- no background jobs required
- aggregate optional metrics only when present on the event
- compute average latency from `totalLatencyMs / latencySampleCount`
- writes should not depend on pricing rows existing
- explicit `costMicrosUsd` should be preserved when the caller provides it

## Pricing API Surface

V1 should expose the following pricing functions:

- `upsertModelPricing({ provider, model, inputCostMicrosPer1M, outputCostMicrosPer1M, cachedInputCostMicrosPer1M? })`
- `getModelPricing({ provider, model })`
- `listModelPricings()`
- `deleteModelPricing({ provider, model })`

Expected behavior:

- `upsertModelPricing` should create or replace the pricing row for a
  `(provider, model)` pair
- `getModelPricing` should return `null` when the pair does not exist
- `listModelPricings` should support simple admin/debugging usage
- `deleteModelPricing` should remove the row without affecting historical usage

## Read API Surface

V1 should expose the following queries:

- `getSummary({ start, end, bucket, identifier? })`
- `getTimeseries({ start, end, bucket, identifier?, model? })`
- `getTopModels({ start, end, bucket, identifier? })`

Range semantics for all read queries:

- treat ranges as `[start, end)`
- require `start < end`
- require `start` and `end` to align to the selected bucket
- reject partial-bucket ranges instead of approximating with aggregate rows
- enforce bucket-specific max windows:
  - hour: 7 days
  - day: 365 days
- execute aggregate scans on the backend and fold rows into results before
  returning to the client

### `getSummary`

Input:

- `start`
- `end`
- `bucket`: `"hour"` or `"day"`
- optional `identifier`

Returns totals for the selected window:

- requests
- errors
- input tokens
- output tokens
- total tokens
- reasoning tokens
- cached input tokens
- average latency
- total cost

### `getTimeseries`

Input:

- `start`
- `end`
- `bucket`: `"hour"` or `"day"`
- optional `identifier`
- optional `model`

Returns chartable bucketed rows.

Expected metrics:

- requests
- errors
- input tokens
- output tokens
- total tokens
- reasoning tokens
- cached input tokens
- average latency
- total cost

### `getTopModels`

Input:

- `start`
- `end`
- `bucket`: `"hour"` or `"day"`
- optional `identifier`

Returns usage aggregated by model for ranking and breakdown views.

Implementation notes for read queries:

- `identifier` and `model` filters should use index-backed query paths
- backend query handlers should aggregate results server-side rather than
  returning raw aggregate rows
- reads should derive cost from aggregate `inputTokens`, `outputTokens`, and
  `cachedInputTokens` plus current `model_pricing`
- billable input tokens should be computed as
  `max(inputTokens - cachedInputTokens, 0)`
- if `cachedInputCostMicrosPer1M` is missing, cached input tokens should
  contribute zero derived cost
- because pricing is applied at read time, editing model pricing can change
  historical derived cost
- each aggregate row's derived cost should round to the nearest integer micro

## AI SDK-First Helper

V1 includes a thin helper layer for DX.

Representative helper names:

- `trackResult(...)`
- `recordAiSdkUsage(...)`

Responsibilities:

- inspect AI SDK result objects
- extract usage metrics
- normalize into the component contract
- optionally create or forward `eventId`
- call the Convex write API

Constraints:

- helper package may understand AI SDK response shapes
- component storage contract must remain provider-agnostic
- helper should stay thin and optional

## Dashboard v1 Target

Dashboard scope is intentionally small.

Views:

- total requests
- total tokens
- total cost
- average latency
- token or cost timeseries
- model breakdown

The component query surface should support this dashboard cleanly, but the
dashboard implementation itself is out of scope for the current scaffold phase.

## Success Criteria

V1 is successful if a small app can:

1. install the component
2. send normalized usage events with one mutation
3. read useful aggregate metrics without custom SQL-like logic
4. optionally integrate via AI SDK helpers with minimal glue code

## Open Decisions

These still need product or implementation decisions before full build-out:

### 1. Package naming

Current local package name:

- `convex-llm-analytics`

Decision needed:

- keep unscoped package name
- move to scoped package, for example `@your-scope/convex-llm-analytics`

### 2. Query naming and export layout

Decision needed:

- keep a flat component API
- group public functions into modules like `usage.ts`, `summary.ts`, `events.ts`

### 3. Return shape for deduped writes

Decision needed:

- keep `{ kind: "inserted" | "duplicate", eventId }`
- or return a richer write result with bucket metadata

### 4. Cost handling policy

Locked for v1:

- app or helper may provide `costMicrosUsd` for raw event storage
- analytics reads ignore stored event cost and derive cost from aggregate token
  totals plus current `model_pricing`
- if cached input pricing is missing, cached input tokens contribute zero
  derived cost
- derived row cost rounds to the nearest integer micro

### 5. Timestamp trust policy

Decision needed:

- trust caller-provided timestamps fully
- clamp obviously invalid timestamps
- optionally default missing timestamp to `Date.now()`

### 6. Identifier constraints

Decision needed:

- max length
- allowed charset
- whether empty strings are rejected

### 7. Read range limits

Current implementation:

- hourly reads: max 7 days
- daily reads: max 365 days

### 8. Provider and model normalization

Decision needed:

- store raw provider/model strings only
- or normalize certain known aliases in helper code

## Future Extensions

Possible later work, intentionally excluded from v1:

- recompute jobs from raw events
- limited custom dimensions
- dashboard package and local CLI server
- exports
- alerting
- tenant or workspace support
