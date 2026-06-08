import { openDB, type IDBPDatabase } from "idb";
import type { AuditEvent } from "./types";
import { AUDIT_DB_NAME, AUDIT_DB_VERSION, AUDIT_STORE_NAME } from "@/shared/constants";

export type AuditDB = IDBPDatabase<{ [AUDIT_STORE_NAME]: AuditEvent }>;

// Promise-based singleton: if two callers await getAuditDB() concurrently
// before the first resolves, both await the *same* Promise rather than each
// calling openDB() independently. This prevents a race where _db could be
// overwritten by the second openDB() result.
let _dbPromise: Promise<AuditDB> | null = null;

/** Opens (or returns the cached) audit IndexedDB connection. */
export function getAuditDB(): Promise<AuditDB> {
  if (!_dbPromise) {
    _dbPromise = openDB(AUDIT_DB_NAME, AUDIT_DB_VERSION, {
      upgrade(db, oldVersion) {
        // Version 1: initial schema.
        // When adding indexes or stores in future versions, add a new
        // `if (oldVersion < N)` branch here so existing users migrate safely.
        if (oldVersion < 1) {
          const store = db.createObjectStore(AUDIT_STORE_NAME, { keyPath: "id" });
          store.createIndex("timestamp", "timestamp");
          store.createIndex("hostname", "hostname");
          store.createIndex("action", "action");
          store.createIndex("userDecision", "userDecision");
        }
      },
    });
  }
  return _dbPromise;
}
