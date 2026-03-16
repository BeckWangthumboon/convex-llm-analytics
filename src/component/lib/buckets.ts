const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function getHourBucketStart(timestamp: number) {
  return Math.floor(timestamp / HOUR_MS) * HOUR_MS;
}

export function getDayBucketStart(timestamp: number) {
  return Math.floor(timestamp / DAY_MS) * DAY_MS;
}
