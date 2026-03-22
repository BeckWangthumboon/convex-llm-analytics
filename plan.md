# Convex LLM Analytics Implementation Plan

## Current State

Done:

- schema is defined in `src/component/schema.ts`
- package uses Bun as the primary package manager
- package scripts exist for generate, build, format, lint, typecheck, test,
  and check
- ESLint flat config and Prettier are configured for local quality checks
- generated component types are in place
- write-path helpers are implemented in `src/component/lib/normalize.ts` and
  `src/component/lib/buckets.ts`
- `recordUsage` is implemented in `src/component/usage.ts`
- pricing CRUD is implemented in `src/component/pricing.ts`
- read queries are implemented in `src/component/summary.ts`
- pricing normalization helpers are implemented in `src/component/lib/pricing.ts`
- verification coverage exists for normalization helpers, write-path behavior,
  pricing CRUD, and query math

Remaining:

- expand the thin client helper beyond `recordUsage` to cover the public read
  queries
- add the AI SDK helper layer

Recently completed on the current branch:

- add the public read queries with `start` / `end` ranges
- add index-backed filtering for `identifier` and `model`
- add backend-side streamed aggregate reads for summary math
- add verification coverage for query math
- switch analytics reads to derived-cost-only totals from aggregate token counts
  plus `model_pricing`
- remove stored aggregate cost from the schema and write path
- add verification coverage for derived-cost read behavior
- migrate repo tooling from npm to Bun
- add Bun-first developer commands in the README
- add the local `format`, `lint`, and `check` workflow

This means the remaining work is now concentrated in client DX and AI SDK
integration, not in cost semantics, schema, or basic analytics-query design.

The project is now straightforward, but not trivial. The main correctness
risks are:

- optional dedupe behavior in `recordUsage`
- aggregate upserts for hourly and daily buckets
- hot-row write conflicts if one aggregate bucket gets heavy traffic
- optional metric handling for latency, cost, token usage, and cached tokens
- query math for averages, filtered scans, and derived cost math

## Goal

Ship a minimal but correct v1 component that:

1. records normalized usage events
2. maintains hourly and daily aggregates
3. supports manual model pricing for aggregate-derived cost estimation
4. exposes a small dashboard query surface
5. offers a thin client helper
6. adds a narrow AI SDK helper for normalization

## Design Decisions

These decisions should be treated as locked for v1:

- keep hourly and daily aggregate updates inside the `recordUsage` mutation
- do not introduce a trigger-like async aggregate pipeline in v1
- rely on Convex mutation transactions and automatic retries for the
  read-check-insert flow
- treat `eventId` as an optional idempotency key, not a required field
- treat token and latency fields as best-effort analytics inputs
- allow cost to be caller-supplied at write time for raw event storage while
  deriving analytics cost from manual model pricing at read time
- do not add pricing lookup to `recordUsage` in v1
- if cached input pricing is missing, cached input tokens contribute zero
  derived cost
- derive read-time cost from aggregate token totals by provider and model
- round derived row cost to the nearest micro
- keep the write itself all-or-nothing

Rationale:

- reads should be fresh immediately after a successful write
- the correctness model stays simple because raw event insert and aggregate
  updates commit together
- model pricing is expected to change rarely enough that read-time derivation is
  acceptable for v1
- v1 request volumes should fit this model well

Revisit only if:

- aggregate updates become expensive enough to slow writes
- one `(bucketStart, identifier, provider, model)` aggregate row becomes hot and
  starts causing repeated write conflicts

If that happens, first choice is sharded aggregates. Second choice is moving
aggregate maintenance to a scheduled internal mutation after the raw event write.

## Phase 1: Shape The Component Modules

Objective:

- create a stable file layout before adding logic

Suggested files:

- `src/component/usage.ts`
- `src/component/pricing.ts`
- `src/component/summary.ts`
- `src/component/lib/normalize.ts`
- `src/component/lib/buckets.ts`

Tasks:

1. Add the public Convex function files.
2. Add shared validators and helper types.
3. Keep internal normalization helpers out of the public API surface.

Deliverable:

- compileable component module structure, even if some functions remain stubbed

## Phase 2: Implement Write-Path Helpers

Objective:

- isolate the non-trivial math and normalization before writing the mutation

Tasks:

1. Add bucket helpers for hour and day boundaries.
2. Add numeric normalization helpers for optional fields.
3. Add aggregate increment helpers for aggregate updates.
4. Add pricing helpers for looking up and deriving model cost on the read path.
5. Decide and encode field validation boundaries:
   - `eventId`
   - `identifier`
   - `timestamp`
   - token and latency values
   - pricing values
6. Define the `recordUsage` return shape.

Recommended return shape:

```ts
type RecordUsageResult =
  | { kind: "inserted"; eventId: string }
  | { kind: "duplicate"; eventId: string };
```

Recommendation:

- return the small union above
- do not return aggregate rows or bucket details from the write path
- do not make the mutation "best effort" at the write level; if the mutation
  cannot fully commit, it should throw

Why keep a return value at all:

- callers can distinguish first-write from duplicate-write
- callers can inspect the server-generated `eventId` when they omit one
- the result is small, stable, and easy to preserve in client helpers
- it leaves room for future operational logging without exposing storage
  internals

Deliverable:

- small helper layer that makes the mutation easy to read

## Phase 3: Implement `recordUsage`

Status:

- complete

Current implementation:

- dedupe by explicit `eventId` is implemented
- server-generated `eventId` support is implemented
- raw event insertion is implemented
- hourly and daily aggregate upserts are implemented
- caller-supplied cost is stored when present
- aggregate cost is no longer stored on write

Objective:

- make the write path correct, transactional, and optionally idempotent

Tasks:

1. If `eventId` is provided, query `usage_events` by `eventId`.
2. Return early on duplicate.
3. If `eventId` is missing, generate one server-side.
4. Insert the raw event.
5. Compute hourly and daily bucket starts.
6. Upsert the matching hourly aggregate row.
7. Upsert the matching daily aggregate row.
8. Increment:
   - request counts
   - success or error counts
   - token totals
   - cached input tokens
   - total latency
   - latency sample count

Implementation notes:

- reject empty strings for provided `eventId`
- only increment optional aggregates when the raw value is present
- only increment `latencySampleCount` when `latencyMs` exists
- keep provider in the aggregate identity to avoid model-name collisions
- `recordUsage` should not depend on pricing rows in v1
- explicit `costMicrosUsd` should be preserved unchanged when provided
- keep raw event insert and aggregate updates in one mutation
- if writes ever conflict heavily on one aggregate row, shard the aggregate before
  introducing async maintenance

Deliverable:

- working `recordUsage` mutation with immediate aggregate consistency for usage
  metrics

Verification checklist:

- provided duplicate `eventId` values do not double count
- omitted `eventId` values always insert new events
- success and error counters are correct
- optional values can be missing without breaking writes
- aggregates are created on first write and incremented on later writes
- explicit cost is preserved when provided
- missing pricing rows are irrelevant to write success

## Phase 4: Implement Pricing Functions

Status:

- complete

Objective:

- support manual pricing configuration without hardcoded model maps

Functions:

1. `upsertModelPricing`
2. `getModelPricing`
3. `listModelPricings`
4. `deleteModelPricing`

Tasks:

- add a `model_pricing` table keyed by `(provider, model)`
- validate pricing values as non-negative finite numbers
- make upsert idempotent for repeated writes to the same pair
- keep pricing CRUD separate from usage event ingestion

Deliverable:

- small admin-facing API for pricing configuration

## Phase 5: Implement Read Queries

Status:

- complete

Current implementation:

- aggregate-backed summary, timeseries, and top-model queries are implemented
- range validation and index-backed filtering are implemented
- total cost is derived from aggregate token totals plus current model pricing

Objective:

- expose the minimum useful analytics API

Order:

1. `getSummary`
2. `getTimeseries`
3. `getTopModels`

### `getSummary`

Tasks:

- require `bucket: "hour" | "day"`
- require bucket-aligned `[start, end)` ranges
- enforce max windows:
  - hour: 7 days
  - day: 365 days
- scan the selected aggregate table for the requested range
- aggregate rows on the backend with streamed query iteration
- support optional `identifier`
- return totals for:
  - requests
  - errors
  - input tokens
  - output tokens
  - total tokens
  - reasoning tokens
  - cached input tokens
  - average latency
  - total cost
- derive total cost from aggregate token totals and current pricing on read

Average latency rule:

- `averageLatencyMs = totalLatencyMs / latencySampleCount`
- if `latencySampleCount === 0`, return `null`

### `getTimeseries`

Tasks:

- support `bucket: "hour" | "day"`
- require bucket-aligned `[start, end)` ranges
- enforce max windows:
  - hour: 7 days
  - day: 365 days
- support optional `identifier`
- support optional `model`
- use index-backed query paths for `identifier` and `model`
- return chart-friendly bucket rows
- derive total cost from aggregate token totals and current pricing on read

### `getTopModels`

Tasks:

- require `bucket: "hour" | "day"`
- require bucket-aligned `[start, end)` ranges
- enforce max windows:
  - hour: 7 days
  - day: 365 days
- aggregate the selected aggregate rows by provider and model
- aggregate rows on the backend with streamed query iteration
- rank by request count by default
- return token and cost totals alongside counts
- derive total cost from aggregate token totals and current pricing on read

Implementation notes for read-time cost:

- use current `model_pricing` rows when deriving cost on read
- derive from aggregate `inputTokens`, `outputTokens`, and `cachedInputTokens`
- compute billable input tokens as `max(inputTokens - cachedInputTokens, 0)`
- if `cachedInputCostMicrosPer1M` is missing, cached input tokens contribute
  zero derived cost
- round each aggregate row's derived cost to the nearest integer micro before
  summing into query results
- because derivation happens on read, editing a pricing row can change
  historical derived cost

Deliverable:

- stable v1 analytics query surface

## Phase 6: Add Thin Client Helper

Status:

- partially complete

Objective:

- make the component easy to consume from an app without hiding the server API

Tasks:

1. Expand `src/client/index.ts`.
2. Add small typed helpers for the public queries and mutation.
3. Keep the client wrapper intentionally thin.

Deliverable:

- lightweight app-side helper surface

## Phase 7: Add AI SDK Helper Layer

Status:

- not started

Objective:

- normalize AI SDK results into the component event contract

Recommended v1 support:

- `generateText`
- `streamText`

Tasks:

1. Accept AI SDK result objects or normalized input.
2. Extract:
   - provider
   - model
   - finish reason
   - token usage
   - cached input tokens
   - response id
3. Accept or generate `eventId`.
4. Measure latency externally where needed.
5. Call `recordUsage`.

Non-goals for this helper:

- storing raw provider metadata
- storing prompts or responses
- supporting every AI SDK result type in v1

Deliverable:

- narrow helper API for common AI SDK usage paths

## Phase 8: Verification

Status:

- partially complete

Objective:

- prove the write path and analytics math are correct

Minimum test matrix:

- success event
- error event
- duplicate event
- omitted `eventId`
- empty-string `eventId`
- missing optional metrics
- latency present on only some events
- derived cost from pricing row during reads
- missing pricing row during reads
- cached tokens with missing cached pricing contribute zero derived cost
- mixed providers for the same model name
- multiple identifiers
- hourly bucket boundary
- daily bucket boundary

High-priority assertions:

- provided dedupe keys do not double count
- omitted `eventId` values do not accidentally dedupe
- aggregates match raw writes
- average latency uses `latencySampleCount`
- top-model aggregation keeps provider and model distinct
- derived cost uses the matching provider and model row during reads
- changing model pricing can change historical derived cost
- repeated writes to the same bucket do not produce correctness regressions

Deliverable:

- confidence that v1 analytics are directionally correct and consistent

## Recommended Remaining Build Order

From the current codebase state, the remaining work should happen in this order:

1. expand the thin client helper to cover the public read queries
2. add the AI SDK helper layer

## Short Answer

Yes, this is much more straightforward now that the schema and read query layer
are done.

What remains is mostly disciplined implementation around developer experience:

- expand the app-facing helper surface without hiding the server API
- add the narrow AI SDK normalization layer
- keep the cost semantics documented as best-effort derived analytics

The next concrete task should be:

1. expand the thin client helper to cover read queries
2. add the AI SDK helper layer
