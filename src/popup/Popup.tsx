import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/chrome-extension";
import { sendMessage } from "@/shared/messages";
import { queryAuditEvents } from "@/audit/log";
import type { AuditEvent } from "@/audit/types";
import { EXTENSION_NAME } from "@/shared/constants";

function SignedOutView() {
  return (
    <div className="p-6 flex flex-col items-center gap-4">
      <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
        PS
      </div>
      <p className="text-sm text-gray-600 text-center">
        Sign in to enable policy enforcement for your organization.
      </p>
      <button
        onClick={() => chrome.runtime.openOptionsPage()}
        className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
      >
        Sign in via Settings
      </button>
    </div>
  );
}

function SignedInView() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [hostname, setHostname] = useState<string>("");
  const [siteEnabled, setSiteEnabled] = useState(true);
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Persist session token so service worker can use it for API calls
  useEffect(() => {
    getToken().then((token) => {
      if (token) void chrome.storage.local.set({ clerkSessionToken: token });
    });
  }, [getToken]);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.url) { setLoading(false); return; }
      try {
        const url = new URL(tab.url);
        const host = url.hostname;
        setHostname(host);
        const [statusResult, events] = await Promise.all([
          sendMessage<{ enabled: boolean }>({ type: "GET_SITE_STATUS", payload: { hostname: host } }),
          queryAuditEvents({ hostname: host, limit: 5 }),
        ]);
        setSiteEnabled(statusResult.enabled);
        setRecentEvents(events);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    });
  }, []);

  async function toggleSite() {
    const next = !siteEnabled;
    setSiteEnabled(next);
    await sendMessage({ type: "TOGGLE_SITE", payload: { hostname, enabled: next } });
  }

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading…</div>;

  return (
    <div className="bg-white text-gray-900 font-sans">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <div className="w-6 h-6 bg-red-600 rounded flex items-center justify-center text-white text-xs font-bold">
          PS
        </div>
        <span className="font-semibold text-sm">{EXTENSION_NAME}</span>
        {user?.primaryEmailAddress && (
          <span className="ml-auto text-xs text-gray-400 truncate max-w-[120px]">
            {user.primaryEmailAddress.emailAddress}
          </span>
        )}
      </div>

      {/* Site toggle */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <div>
          <p className="text-sm font-medium">{siteEnabled ? "Active" : "Paused"} on this site</p>
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
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100">
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="w-full text-sm text-blue-600 hover:text-blue-800 text-center py-1"
        >
          Open settings →
        </button>
      </div>
    </div>
  );
}

export function Popup() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  if (!isSignedIn) return <SignedOutView />;
  return <SignedInView />;
}
