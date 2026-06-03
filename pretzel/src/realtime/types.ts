export interface ILastUpdatesChecker {
  /** Returns epoch ms of last policy publish, or null on error/unauthenticated. */
  getLastUpdatedAt(): Promise<number | null>
}
