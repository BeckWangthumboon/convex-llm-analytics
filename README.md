# Convex LLM Analytics

Bare scaffold for a publishable Convex component package.

This repo intentionally keeps only the minimum pieces needed to define and
build a component:

- `src/component/convex.config.ts`: the component entrypoint
- `src/component/schema.ts`: the component schema placeholder
- `src/client/index.ts`: app-side TypeScript wrapper placeholder
- `src/component/_generated/*`: Convex-generated component types

Removed from the stock template:

- `example/`: demo app, not needed yet
- `src/react/`: optional frontend helpers, not needed yet
- `convex.json`: only useful when this repo also contains an app/backend
- `renovate.json`: dependency bot config
- `.github/workflows/*`: CI workflow
- lint/test/release extras: useful later, not required for a clean initial scaffold

## Build

```sh
npm install
npm run build
```

When you are ready to regenerate Convex types, first connect this repo to a
Convex deployment and then run:

```sh
npm run codegen
```

## Install In An App

```ts
import { defineApp } from "convex/server";
import llmAnalytics from "convex-llm-analytics/convex.config.js";

const app = defineApp();
app.use(llmAnalytics);

export default app;
```
