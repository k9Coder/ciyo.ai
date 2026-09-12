import { useEffect, useState } from "react";
import { useUser } from "@clerk/chrome-extension";
import { sendMessage } from "@/shared/messages";
import { queryAuditEvents } from "@/audit/log";
import type { AuditEvent } from "@/audit/types";
import { getTheme, setTheme } from "@/shared/theme";
import { usePersistSessionToken } from "@/shared/usePersistSessionToken";
import { useExtensionAuth } from "@/shared/useExtensionAuth";
import { signInWithDeviceAuth } from "@/auth/deviceAuth";
import { CLERK_SYNC_HOST } from "@/shared/constants";
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
      <span style={{ color: "var(--text-primary)" }}>m</span>
      <span style={{ color: accent }}>y</span>
      <span style={{ color: "var(--text-primary)" }}>kka</span>
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

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.92c1.7-1.57 2.68-3.88 2.68-6.64z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function SignedOutView() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setError(null);
    setPending(true);
    try {
      const { token } = await signInWithDeviceAuth();
      await chrome.storage.local.set({ orgToken: token });
      await sendMessage({ type: "SYNC_NOW" });
      // No further action needed here: useExtensionAuth's storage.onChanged
      // listener picks up the new orgToken and flips this popup to
      // SignedInView on its own.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }

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
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "center", margin: 0 }}>
          Sign in to enable policy enforcement for your organization.
        </p>
        {/* Google OAuth can't complete inside a Chrome extension page directly
            (Google rejects chrome-extension:// as a redirect scheme) -- this
            runs the PKCE device-auth flow instead, see @/auth/deviceAuth.
            Only offered on the production (pk_live) Clerk setup, matching
            where the backend route actually exists for now. */}
        {CLERK_SYNC_HOST && (
          <button
            onClick={() => void handleGoogleSignIn()}
            disabled={pending}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "8px 16px", background: "var(--bg-surface)", color: "var(--text-primary)",
              border: "1px solid var(--border)", borderRadius: 6, fontSize: 13,
              fontWeight: 600, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1,
            }}
          >
            <GoogleIcon />
            {pending ? "Signing in…" : "Continue with Google"}
          </button>
        )}
        {error && (
          <p style={{ fontSize: 11, color: "var(--status-danger)", textAlign: "center", margin: 0 }}>{error}</p>
        )}
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
  const [hostname, setHostname] = useState<string>("");
  const [siteEnabled, setSiteEnabled] = useState(true);
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Persist the Clerk JWT so the background worker can authenticate policy sync.
  usePersistSessionToken();

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
          {user?.organizationMemberships?.[0]?.organization?.name ?? "mykka"}
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
  const { isLoaded, isSignedIn } = useExtensionAuth();
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
