import { defineConfig } from "@playwright/test";
import path from "path";

export default defineConfig({
  testDir: path.join(__dirname),
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  use: {
    // Extension testing requires a headed browser with the extension loaded
    headless: false,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium-extension",
      use: {
        channel: "chromium",
        launchOptions: {
          args: [
            `--disable-extensions-except=${path.resolve(__dirname, "../../dist")}`,
            `--load-extension=${path.resolve(__dirname, "../../dist")}`,
          ],
        },
      },
    },
  ],
});
