import { openDB, type IDBPDatabase } from "idb";
import type { AuditEvent } from "./types";
import { AUDIT_DB_NAME, AUDIT_DB_VERSION, AUDIT_STORE_NAME } from "@/shared/constants";

export type AuditDB = IDBPDatabase<{ [AUDIT_STORE_NAME]: AuditEvent }>;

let _db: AuditDB | null = null;

/** Opens (or returns the cached) audit IndexedDB connection. */
export async function getAuditDB(): Promise<AuditDB> {
  if (_db) return _db;
  _db = await openDB(AUDIT_DB_NAME, AUDIT_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(AUDIT_STORE_NAME)) {
        const store = db.createObjectStore(AUDIT_STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp");
        store.createIndex("hostname", "hostname");
        store.createIndex("action", "action");
        store.createIndex("userDecision", "userDecision");
      }
    },
  });
  return _db;
}
