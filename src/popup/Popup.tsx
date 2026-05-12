import React, { useEffect, useState } from "react";
import { sendMessage } from "@/shared/messages";
import { queryAuditEvents } from "@/audit/log";
import type { AuditEvent } from "@/audit/types";
import { EXTENSION_NAME } from "@/shared/constants";

export function Popup() {
  const [hostname, setHostname] = useState<string>("");
  const [siteEnabled, setSiteEnabled] = useState(true);
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) { setLoading(false); return; }

      try {
        const url = new URL(tab.url);
        const host = url.hostname;
        setHostname(host);

        const [statusResult, events] = await Promise.all([
          sendMessage<{ enabled: boolean }>({
            type: "GET_SITE_STATUS",
            payload: { hostname: host },
          }),
          queryAuditEvents({ hostname: host, limit: 5 }),
        ]);

        setSiteEnabled(statusResult.enabled);
        setRecentEvents(events);
      } catch {
        // ignore errors — we don't want the popup to show an error state
      } finally {
        setLoading(false);
      }
    });
  }, []);

  async function toggleSite() {
    const next = !siteEnabled;
    setSiteEnabled(next);
    await sendMessage({
      type: "TOGGLE_SITE",
      payload: { hostname, enabled: next },
    });
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  if (loading) {
    return (
      <div className="p-4 text-sm text-gray-500">Loading…</div>
    );
  }

  return (
    <div className="bg-white text-gray-900 font-sans">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <div className="w-6 h-6 bg-red-600 rounded flex items-center justify-center text-white text-xs font-bold">
          PS
        </div>
        <span className="font-semibold text-sm">{EXTENSION_NAME}</span>
      </div>

      {/* Site toggle */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <div>
          <p className="text-sm font-medium">
            {siteEnabled ? "Active" : "Paused"} on this site
          </p>
          {hostname && (
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[180px]">{hostname}</p>
          )}
        </div>
        <button
          onClick={toggleSite}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            siteEnabled ? "bg-blue-600" : "bg-gray-200"
          }`}
          role="switch"
          aria-checked={siteEnabled}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              siteEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Recent events */}
      <div className="px-4 py-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Recent events
        </p>
        {recentEvents.length === 0 ? (
          <p className="text-xs text-gray-400">No events yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentEvents.map((ev) => (
              <li key={ev.id} className="flex items-center gap-2 text-xs">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    ev.action === "block"
                      ? "bg-red-100 text-red-700"
                      : ev.action === "warn"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {ev.action}
                </span>
                <span className="text-gray-600 truncate">
                  {ev.userDecision} — {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100">
        <button
          onClick={openOptions}
          className="w-full text-sm text-blue-600 hover:text-blue-800 text-center py-1"
        >
          Open settings →
        </button>
      </div>
    </div>
  );
}
