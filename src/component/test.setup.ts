/// <reference types="vite/client" />

import { convexTest } from "convex-test";

import schema from "./schema.js";

const modules = import.meta.glob([
  "./**/*.ts",
  "!./**/*.test.ts",
  "!./test.setup.ts",
]);

export function initConvexTest() {
  return convexTest(schema, modules);
}
