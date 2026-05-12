export interface SiteAdapter {
  hostname: string | RegExp;
  name: string;

  /** Returns the active composer element (textarea or contenteditable), or null. */
  findComposer(): HTMLElement | null;

  /** Returns the send button or equivalent, or null. */
  findSendButton(): HTMLElement | null;

  /** Reads the current prompt text from the composer. */
  readPromptText(composer: HTMLElement): string;

  /**
   * Writes text back into the composer.
   * Currently used for future redaction; must dispatch an input event so the
   * host site's React/Vue state picks up the change.
   */
  writePromptText(composer: HTMLElement, text: string): void;

  /**
   * Attaches send-intent listeners.
   *
   * The returned unsubscribe function removes all listeners.
   *
   * ⚠️ MV3 async limitation: click events cannot be truly blocked async.
   * The pattern used here:
   *   1. Capture the event and call preventDefault() + stopPropagation() immediately.
   *   2. Run detection async.
   *   3. If approved, programmatically re-fire the event with a sentinel attribute
   *      on the button so the listener knows to let it through.
   */
  onSendIntent(
    handler: (e: Event) => Promise<{ proceed: boolean }>
  ): () => void;

  /** Optional: observe messages that were sent without going through onSendIntent. */
  observeSentMessages?(handler: (text: string) => void): () => void;
}
