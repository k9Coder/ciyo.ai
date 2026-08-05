import { useEffect, useState } from "react";
import { useAuth } from "@clerk/chrome-extension";
import { queryAuditEvents, exportAuditCSV } from "@/audit/log";
import type { AuditEvent } from "@/audit/types";
import { InlineLoader, PageLoader } from "../components/loading";

const PAGE_SIZE = 50;

const SEVERITY_COLORS: Record<string, string> = {
  log: "bg-gray-100 text-gray-600",
  warn: "bg-yellow-100 text-yellow-800",
  require_confirmation: "bg-orange-100 text-orange-800",
  block: "bg-red-100 text-red-800",
};

const DECISION_LABELS: Record<string, string> = {
  sent: "Sent",
  edited: "Edited",
  cancelled: "Cancelled",
  sent_with_reason: "Sent w/ reason",
};

export function AuditPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [page, setPage] = useState(0);
  const [hostnameFilter, setHostnameFilter] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(pageNum: number) {
    setLoading(true);
    try {
      const data = await queryAuditEvents({
        hostname: hostnameFilter || undefined,
        limit: PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
      });
      setEvents(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(0);
    load(0);
  }, [hostnameFilter]);

  useEffect(() => {
    load(page);
  }, [page]);

  async function handleExportCSV() {
    const csv = await exportAuditCSV();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mykka-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!isLoaded) return <PageLoader label="Authenticating" />;

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-sm text-[var(--text-primary)] font-medium">Sign in to view your audit log</p>
        <p className="text-sm text-[var(--text-muted)]">Switch to the Account tab to sign in.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Audit Log</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">Showing latest {PAGE_SIZE} events per page.</p>
        </div>
        <button
          onClick={handleExportCSV}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          value={hostnameFilter}
          onChange={(e) => setHostnameFilter(e.target.value)}
          placeholder="Filter by hostname…"
          className="flex-1 max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      {loading ? (
        <InlineLoader size="sm" />
      ) : events.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No audit events found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Site</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Decision</th>
                <th className="px-4 py-3 text-left">Findings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {new Date(ev.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-800">{ev.hostname}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[ev.action] ?? ""}`}>
                      {ev.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {DECISION_LABELS[ev.userDecision] ?? ev.userDecision}
                    {ev.reason && (
                      <span className="ml-1 text-xs text-gray-400" title={ev.reason}>
                        (reason)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{ev.findings.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex gap-3 items-center">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-sm text-gray-600">Page {page + 1}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={events.length < PAGE_SIZE}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
