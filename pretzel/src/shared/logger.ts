/** Structured logger that is silenced in production builds. */
import { IS_DEV } from "../env";

const prefix = "[ciyo]";

export const logger = {
  debug: (...args: unknown[]) => {
    if (IS_DEV) console.debug(prefix, ...args);
  },
  info: (...args: unknown[]) => {
    if (IS_DEV) console.info(prefix, ...args);
  },
  warn: (...args: unknown[]) => {
    // Warnings surface in all builds so operators can see issues.
    console.warn(prefix, ...args);
  },
  error: (...args: unknown[]) => {
    console.error(prefix, ...args);
  },
};
