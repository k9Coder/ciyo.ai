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
import { Logo } from "@/shared/Logo";
import { formatRelativeTime } from "@/shared/relative-time";
import { Spinner } from "../options/components/loading";

const POPUP_WIDTH = 340;

const shell: React.CSSProperties = {
  background: "var(--bg-base)",
  width: POPUP_WIDTH,
  boxSizing: "border-box",
  fontFamily: "var(--font)",
  color: "var(--text-primary)",
};

function Wordmark() {
  return (
    <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--text-primary)" }}>
      mykka
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
      color: "var(--text-muted)", padding: 4, fontSize: 14, lineHeight: 1,
    }} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
      {theme === "dark" ? "☀" : "🌙"}
    </button>
  );
}

function Header({ org }: { org?: string }) {
  return (
    <div style={{
      padding: "14px 16px", display: "flex", alignItems: "center", gap: 10,
      borderBottom: "1px solid var(--border)",
    }}>
      <button onClick={() => chrome.runtime.openOptionsPage()} style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "none", border: "none", cursor: "pointer", padding: 0,
        fontFamily: "inherit",
      }}>
        <Logo size={24} />
        <Wordmark />
      </button>
      <span style={{ flex: 1 }} />
      {org && <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{org}</span>}
      <ThemeToggle />
    </div>
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
    <div style={shell}>
      <Header />
      <div style={{ padding: "22px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.3 }}>
          Sign in to turn on protection
        </div>
        <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.45 }}>
          Use your work account. Your company's rules load automatically.
        </div>
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
              display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
              padding: 11, background: "var(--bg-surface)", color: "var(--text-primary)",
              border: "1px solid var(--border)", borderRadius: "var(--r-btn)", fontSize: 15,
              fontWeight: 500, fontFamily: "inherit",
              cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1,
            }}
          >
            <GoogleIcon />
            {pending ? "Signing in…" : "Continue with Google"}
          </button>
        )}
        {error && (
          <p style={{ fontSize: 13, color: "var(--status-danger)", textAlign: "center", margin: 0 }}>{error}</p>
        )}
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          style={{
            padding: 11, background: "var(--btn-bg)", color: "var(--btn-fg)",
            border: "none", borderRadius: "var(--r-btn)", fontSize: 15,
            fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          Sign in with email
        </button>
        <span style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>
          Until you sign in, only Pretzel's built-in rules apply, not your company's.
        </span>
      </div>
    </div>
  );
}

function eventBadge(action: AuditEvent["action"]) {
  if (action === "block") return { label: "Blocked", bg: "var(--block-fill)", fg: "var(--status-danger)" };
  if (action === "warn") return { label: "Warned", bg: "var(--warn-fill)", fg: "var(--status-warn)" };
  return { label: "Detected", bg: "var(--fill)", fg: "var(--text-muted)" };
}

interface PolicyStatus { version: number | null; checkedAt: number | null }

function usePolicyStatus(): PolicyStatus {
  const [status, setStatus] = useState<PolicyStatus>({ version: null, checkedAt: null });
  useEffect(() => {
    const read = async () => {
      const stored = await chrome.storage.local.get(["cachedPolicyVersion", "lastCheckedAt", "syncedAt"]) as Record<string, unknown>;
      const num = (v: unknown) => (typeof v === "number" ? v : null);
      setStatus({
        version: num(stored["cachedPolicyVersion"]),
        checkedAt: num(stored["lastCheckedAt"]) ?? num(stored["syncedAt"]),
      });
    };
    void read();
    const onChanged = (_c: unknown, area: string) => { if (area === "local") void read(); };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);
  return status;
}

function SignedInView() {
  const { user } = useUser();
  const [hostname, setHostname] = useState<string>("");
  const [siteEnabled, setSiteEnabled] = useState(true);
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Persist the Clerk JWT so the background worker can authenticate policy sync.
  usePersistSessionToken();
  const policy = usePolicyStatus();

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
      <div style={{ ...shell, padding: 24, display: "flex", justifyContent: "center" }}>
        <Spinner size="md" />
      </div>
    );
  }

  const org = user?.organizationMemberships?.[0]?.organization?.name;

  return (
    <div style={shell}>
      <Header org={org ?? "mykka"} />

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Status */}
        <div style={{
          background: siteEnabled ? "var(--brand-soft)" : "var(--warn-fill)",
          borderRadius: "var(--r-sm)", padding: 14,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 600 }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: siteEnabled ? "var(--status-safe)" : "var(--status-warn)",
            }} />
            {siteEnabled ? "Protected on this site" : "Paused on this site"}
          </span>
          <span style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.4 }}>
            {siteEnabled
              ? "Prompts are checked on this device before they are sent."
              : "Your IT team can see that checks are paused here."}
          </span>
        </div>

        {/* Site toggle */}
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)", padding: "12px 14px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{hostname || "No active tab"}</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {siteEnabled ? "Checking prompts" : "Paused"}
            </div>
          </div>
          <button
            role="switch"
            aria-checked={siteEnabled}
            aria-label={siteEnabled ? "Pause checks on this site" : "Resume checks on this site"}
            onClick={toggleSite}
            style={{
              width: 38, height: 22, borderRadius: 999, border: "none", padding: 0,
              position: "relative", flexShrink: 0, cursor: "pointer",
              background: siteEnabled ? "var(--brand-primary)" : "var(--fill-strong)",
            }}
          >
            <span style={{
              position: "absolute", top: 3, left: siteEnabled ? 19 : 3,
              width: 16, height: 16, borderRadius: "50%", background: "#fff",
              transition: "left 0.15s",
            }} />
          </button>
        </div>

        {/* Recent events */}
        {recentEvents.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {recentEvents.slice(0, 3).map((ev) => {
              const badge = eventBadge(ev.action);
              return (
                <div key={ev.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 2px", borderBottom: "1px solid var(--border)", fontSize: 14,
                }}>
                  <span>{ev.findings[0]?.ruleName ?? "Detection"}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 500, padding: "2px 8px",
                      borderRadius: "var(--r-btn)", background: badge.bg, color: badge.fg,
                    }}>
                      {badge.label}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "10px 16px", borderTop: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
        fontSize: 13, color: "var(--text-muted)",
      }}>
        <span>
          {policy.version !== null
            ? `Policy v${policy.version}${policy.checkedAt ? ` · synced ${formatRelativeTime(policy.checkedAt)}` : ""}`
            : "Policy not synced yet"}
        </span>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: 0,
            fontFamily: "inherit", fontSize: 13, fontWeight: 500, color: "var(--brand-primary)",
          }}
        >
          Settings
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
      <div style={{ ...shell, padding: 24, display: "flex", justifyContent: "center" }}>
        <Spinner size="md" />
      </div>
    );
  }
  if (!isSignedIn) return <SignedOutView />;
  return <SignedInView />;
}
