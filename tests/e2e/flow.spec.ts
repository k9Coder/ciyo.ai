import { test, expect, chromium } from "@playwright/test";
import path from "path";

/**
 * End-to-end smoke test for the main block/warn flow.
 *
 * Loads the extension into a real Chromium instance, navigates to the
 * static ChatGPT mock page, types a prompt that triggers a detection,
 * and asserts the modal appears and reacts correctly to user decisions.
 */

const EXTENSION_PATH = path.resolve(__dirname, "../../dist");
const MOCK_PAGE = path.resolve(__dirname, "fixtures/chatgpt-mock.html");

// NOTE: Playwright's extension testing requires a persistent context.
// These tests are intentionally written as standalone fixtures because
// chrome.storage is unavailable in the ISOLATED world without the background sw.
// The e2e suite is meant to be run after `pnpm build`.

test.describe("SafeInput E2E", () => {
  test("modal appears when API key is typed and send is clicked", async () => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    const page = await context.newPage();
    await page.goto(`file://${MOCK_PAGE}`);

    const textarea = page.locator("#prompt-textarea");
    await textarea.fill("My key is sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmno");

    const sendBtn = page.locator("#send-button");
    await sendBtn.click();

    // The shadow-DOM modal should appear. We look for the heading text.
    // NOTE: Shadow DOM requires a piercing locator in Playwright.
    await expect(
      page.locator("pierce/#ps-react-root").getByText("Sensitive content detected")
    ).toBeVisible({ timeout: 5_000 });

    // Click "Cancel" — no message should be sent
    await page.locator("pierce/#ps-react-root").getByRole("button", { name: "Cancel" }).click();

    // Verify the mock page output did NOT change (message was not sent)
    await expect(page.locator("#output")).toHaveText("No message sent yet.");

    await context.close();
  });

  test("send anyway with reason path logs and sends", async () => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    const page = await context.newPage();
    await page.goto(`file://${MOCK_PAGE}`);

    const textarea = page.locator("#prompt-textarea");
    await textarea.fill("My key is sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmno");
    await page.locator("#send-button").click();

    // Modal should appear
    const modal = page.locator("pierce/#ps-react-root");
    await expect(modal.getByText("Sensitive content detected")).toBeVisible({ timeout: 5_000 });

    // Click "Send anyway…"
    await modal.getByRole("button", { name: /Send anyway/i }).click();

    // Reason field should appear — enter a reason
    const reasonField = modal.locator("#ps-reason");
    await reasonField.fill("This is a test key for development purposes only.");

    // Confirm
    await modal.getByRole("button", { name: /Confirm send/i }).click();

    // The message should have been sent
    await expect(page.locator("#output")).toContainText("SENT:");

    await context.close();
  });
});
