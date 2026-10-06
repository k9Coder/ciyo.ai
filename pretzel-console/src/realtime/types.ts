export interface IRealtimeSubscriber {
  /**
   * Open an SSE connection. Calls onUpdate on each server push.
   * Calls onDegraded once if the connection gives up after repeated
   * consecutive failures (e.g. server unreachable) — callers should surface
   * this to the user rather than retry forever silently.
   * Returns an unsubscribe function — call it on component unmount.
   */
  subscribe(getToken: () => Promise<string>, onUpdate: () => void, onDegraded?: () => void): () => void
}
