import type { ComponentApi } from "../component/_generated/component.js";

export class LlmAnalytics {
  constructor(readonly component: ComponentApi) {}
}

export function createLlmAnalytics(component: ComponentApi) {
  return new LlmAnalytics(component);
}
