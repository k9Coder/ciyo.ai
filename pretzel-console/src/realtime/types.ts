export interface IRealtimeSubscriber {
  /**
   * Open an SSE connection. Calls onUpdate on each server push.
   * Returns an unsubscribe function — call it on component unmount.
   */
  subscribe(getToken: () => Promise<string>, onUpdate: () => void): () => void
}
