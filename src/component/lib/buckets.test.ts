import { describe, expect, it } from "vitest";

import { getDayBucketStart, getHourBucketStart } from "./buckets.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe("bucket helpers", () => {
  it("preserves exact hour boundaries", () => {
    const timestamp = 1_710_000_000_000;

    expect(getHourBucketStart(timestamp)).toBe(timestamp);
  });

  it("floors timestamps to the start of the containing hour", () => {
    const hourStart = 1_710_000_000_000;

    expect(getHourBucketStart(hourStart + 1)).toBe(hourStart);
    expect(getHourBucketStart(hourStart + HOUR_MS - 1)).toBe(hourStart);
  });

  it("preserves exact day boundaries", () => {
    const timestamp = 1_710_028_800_000;

    expect(getDayBucketStart(timestamp)).toBe(timestamp);
  });

  it("floors timestamps to the start of the containing day", () => {
    const dayStart = 1_710_028_800_000;

    expect(getDayBucketStart(dayStart + 1)).toBe(dayStart);
    expect(getDayBucketStart(dayStart + DAY_MS - 1)).toBe(dayStart);
  });
});
