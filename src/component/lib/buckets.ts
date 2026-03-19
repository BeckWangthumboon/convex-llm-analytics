export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export type AggregateBucket = "hour" | "day";

export function getHourBucketStart(timestamp: number) {
  return Math.floor(timestamp / HOUR_MS) * HOUR_MS;
}

export function getDayBucketStart(timestamp: number) {
  return Math.floor(timestamp / DAY_MS) * DAY_MS;
}

export function getBucketSizeMs(bucket: AggregateBucket) {
  return bucket === "hour" ? HOUR_MS : DAY_MS;
}

export function isBucketAligned(timestamp: number, bucket: AggregateBucket) {
  return timestamp % getBucketSizeMs(bucket) === 0;
}
