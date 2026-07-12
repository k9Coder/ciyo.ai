import { z } from "zod";

const schema = z.object({
  VITE_API_BASE: z.string().default("https://api.ciyo.ai"),
  // Default '' (not required): this parse runs in the browser at bundle eval,
  // so a hard throw would brick the extension instead of failing the build.
  // Clerk init surfaces a missing key loudly at runtime.
  VITE_CLERK_PUBLISHABLE_KEY: z.string().default(""),
  VITE_SENTRY_DSN_EXTENSION: z.string().optional(),
});

// Vite statically replaces import.meta.env.* — reference each var literally.
export const env = schema.parse({
  VITE_API_BASE: import.meta.env.VITE_API_BASE,
  VITE_CLERK_PUBLISHABLE_KEY: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  VITE_SENTRY_DSN_EXTENSION: import.meta.env.VITE_SENTRY_DSN_EXTENSION,
});

export const IS_DEV = import.meta.env.DEV;
export const MODE = import.meta.env.MODE;
