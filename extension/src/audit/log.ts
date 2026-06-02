import { getAuditDB } from "./db";
import type { AuditEvent } from "./types";
import { AUDIT_STORE_NAME } from "@/shared/constants";
import { logger } from "@/shared/logger";

/** Append a new event to the audit log. */
export async function appendAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const db = await getAuditDB();
    await db.add(AUDIT_STORE_NAME, event);
  } catch (err) {
    logger.error("Failed to write audit event:", err);
  }
}

export interface QueryOptions {
  hostname?: string;
  limit?: number;
  offset?: number;
  /** ISO timestamp lower bound */
  since?: number;
}

/** Query recent audit events, newest first. */
export async function queryAuditEvents(opts: QueryOptions = {}): Promise<AuditEvent[]> {
  const db = await getAuditDB();
  const tx = db.transaction(AUDIT_STORE_NAME, "readonly");
  const store = tx.objectStore(AUDIT_STORE_NAME);
  const index = store.index("timestamp");

  const all: AuditEvent[] = [];
  let cursor = await index.openCursor(null, "prev"); // newest first

  while (cursor) {
    const ev = cursor.value;
    if (opts.since !== undefined && ev.timestamp < opts.since) break;
    if (!opts.hostname || ev.hostname === opts.hostname) {
      all.push(ev);
    }
    cursor = await cursor.continue();
  }

  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 50;
  return all.slice(offset, offset + limit);
}

/** Remove audit events older than retentionDays. */
export async function pruneAuditEvents(retentionDays: number): Promise<number> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const db = await getAuditDB();
  const tx = db.transaction(AUDIT_STORE_NAME, "readwrite");
  const store = tx.objectStore(AUDIT_STORE_NAME);
  const index = store.index("timestamp");

  let removed = 0;
  let cursor = await index.openCursor();
  while (cursor) {
    if (cursor.value.timestamp < cutoff) {
      await cursor.delete();
      removed++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return removed;
}

/** Export all events as a CSV string. */
export async function exportAuditCSV(): Promise<string> {
  const db = await getAuditDB();
  const events = await db.getAll(AUDIT_STORE_NAME);

  const header = [
    "id",
    "timestamp",
    "hostname",
    "action",
    "userDecision",
    "reason",
    "findingCount",
    "promptLengthChars",
    "promptHash",
  ].join(",");

  const rows = events.map((e) =>
    [
      e.id,
      new Date(e.timestamp).toISOString(),
      e.hostname,
      e.action,
      e.userDecision,
      e.reason ? `"${e.reason.replace(/"/g, '""')}"` : "",
      e.findings.length,
      e.promptLengthChars,
      e.promptHash,
    ].join(",")
  );

  return [header, ...rows].join("\n");
}
