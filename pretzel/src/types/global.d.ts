/// <reference types="chrome" />

// Vite env
interface ImportMetaEnv {
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_API_BASE: string | undefined;
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_SENTRY_DSN_EXTENSION: string | undefined;
  /** Dev only: serve judge v2 shadow models from a local server instead of the GitHub Release. */
  readonly VITE_JUDGE_V2_MODEL_BASE: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Vite ?inline suffix: imports CSS file as a string
declare module "*.css?inline" {
  const css: string;
  export default css;
}
