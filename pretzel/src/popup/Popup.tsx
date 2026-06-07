import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/chrome-extension";
import { sendMessage } from "@/shared/messages";
import { queryAuditEvents } from "@/audit/log";
import type { AuditEvent } from "@/audit/types";
import { getTheme, setTheme } from "@/shared/theme";
import { Spinner } from "../options/components/loading";

function LogoIcon({ danger = false, size = 24 }: { danger?: boolean; size?: number }) {
  const [theme, setThemeState] = useState<"dark" | "light">(() => getTheme());
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeState(getTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const src = theme === "light"
    ? chrome.runtime.getURL("logo-light.png")
    : chrome.runtime.getURL("logo-dark.png");
  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <img src={src} alt="Pretzel logo" style={{ display: "block", height: size, width: "auto" }} />
      {danger && (
        <span style={{
          position: "absolute", top: -2, right: -2,
          width: 7, height: 7, borderRadius: "50%",
          background: "var(--status-danger)",
          border: "1.5px solid var(--bg-surface)",
        }} />
      )}
    </span>
  );
}

function Wordmark({ danger = false }: { danger?: boolean }) {
  const accent = danger ? "var(--status-danger)" : "var(--brand-primary)";
  return (
    <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.5px" }}>
      <span style={{ color: "var(--text-primary)" }}>c</span>
      <span style={{ color: accent }}>i</span>
      <span style={{ color: "var(--text-primary)" }}>yo</span>
    </span>
  );
}

function ThemeToggle() {
  const [theme, setThemeState] = useState<"dark" | "light">(() => getTheme());
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }
  return (
    <button onClick={toggle} style={{
      background: "none", border: "none", cursor: "pointer",
      color: "var(--text-muted)", padding: 4,
    }} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
      {theme === "dark" ? "☀" : "🌙"}
    </button>
  );
}

function SignedOutView() {
  return (
    <div style={{ background: "var(--bg-base)", minWidth: 320 }}>
      <div style={{
        padding: "14px 16px", display: "flex", alignItems: "center",
        justifyContent: "space-between", borderBottom: "1px solid var(--border)",
      }}>
        <button onClick={() => chrome.runtime.openOptionsPage()} style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "none", border: "none", cursor: "pointer", padding: 0,
        }}>
          <LogoIcon size={36} />
          <Wordmark />
        </button>
        <ThemeToggle />
      </div>
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "center", margin: 0 }}>
          Sign in to enable policy enforcement for your organization.
        </p>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          style={{
            width: "100%", padding: "8px 16px",
            background: "var(--brand-primary)", color: "var(--bg-base)",
            border: "none", borderRadius: 6, fontSize: 13,
            fontWeight: 600, cursor: "pointer",
          }}
        >
          Sign in via Settings
        </button>
      </div>
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

  if (loading) {
    return (
      <div style={{ background: "var(--bg-base)", width: 320, padding: 24,
                    display: "flex", justifyContent: "center" }}>
        <Spinner size="md" />
      </div>
    );
  }

  const hasEvents = recentEvents.length > 0;

  return (
    <div style={{ background: "var(--bg-base)", width: 320, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px", display: "flex", alignItems: "center",
        justifyContent: "space-between", borderBottom: "1px solid var(--border)",
      }}>
        <button onClick={() => chrome.runtime.openOptionsPage()} style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "none", border: "none", cursor: "pointer", padding: 0,
        }}>
          <LogoIcon size={36} danger={hasEvents} />
          <Wordmark danger={hasEvents} />
        </button>
        <ThemeToggle />
      </div>

      {/* Status banner */}
      <div style={{
        margin: 12, borderRadius: 8, padding: "10px 14px",
        display: "flex", alignItems: "center", gap: 10,
        background: hasEvents ? "rgba(255,77,106,0.08)" : "rgba(0,204,136,0.08)",
        border: `1px solid ${hasEvents ? "rgba(255,77,106,0.25)" : "rgba(0,204,136,0.25)"}`,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: hasEvents ? "var(--status-danger)" : "var(--status-safe)",
        }}/>
        <div>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: hasEvents ? "var(--status-danger)" : "var(--status-safe)",
          }}>
            {hasEvents ? "Sensitive data detected" : "All clear"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            {hasEvents
              ? `${recentEvents.length} issue${recentEvents.length > 1 ? "s" : ""} found`
              : "No sensitive data detected"}
          </div>
        </div>
      </div>

      {/* Site info */}
      <div style={{
        margin: "0 12px", borderRadius: 8, padding: "9px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--bg-surface)",
      }}>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {hostname || "No active tab"}
        </span>
        <button
          onClick={toggleSite}
          style={{
            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
            background: siteEnabled ? "rgba(0,212,255,0.12)" : "rgba(58,80,96,0.3)",
            color: siteEnabled ? "var(--brand-primary)" : "var(--text-muted)",
            border: "none", cursor: "pointer",
          }}
        >
          {siteEnabled ? "ACTIVE" : "PAUSED"}
        </button>
      </div>

      {/* Recent events */}
      {hasEvents && (
        <div style={{ margin: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
          {recentEvents.slice(0, 3).map((ev, i) => (
            <div key={i} style={{
              background: "var(--bg-surface)", borderRadius: 8,
              padding: "9px 14px",
              borderLeft: `3px solid ${ev.action === "block" ? "var(--status-danger)" : "var(--status-warn)"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: ev.action === "block" ? "var(--status-danger)" : "var(--status-warn)",
                }}>
                  {ev.findings[0]?.ruleName ?? "Detection"}
                </span>
                <span style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: 4,
                  background: ev.action === "block" ? "rgba(255,77,106,0.15)" : "rgba(255,170,0,0.15)",
                  color: ev.action === "block" ? "var(--status-danger)" : "var(--status-warn)",
                }}>
                  {ev.action?.toUpperCase() ?? "DETECTED"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: "10px 16px", marginTop: 8,
        borderTop: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {user?.organizationMemberships?.[0]?.organization?.name ?? "ciyo"}
        </span>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 10, color: "var(--brand-primary)",
          }}
        >
          Settings →
        </button>
      </div>
    </div>
  );
}

export function Popup() {
  const { isLoaded, isSignedIn } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isLoaded) return;
    const id = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(id);
  }, [isLoaded]);

  if (!isLoaded && !timedOut) {
    return (
      <div style={{ background: "var(--bg-base)", width: 320, padding: 24,
                    display: "flex", justifyContent: "center" }}>
        <Spinner size="md" />
      </div>
    );
  }
  if (!isSignedIn) return <SignedOutView />;
  return <SignedInView />;
}
