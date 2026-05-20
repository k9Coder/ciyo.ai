import { useState } from "react";
import { AccountPage } from "./pages/AccountPage";
import { AuditPage } from "./pages/AuditPage";
import { AboutPage } from "./pages/AboutPage";
import { getTheme, setTheme } from "@/shared/theme";

type Tab = "account" | "audit" | "about";

function ThemeToggleButton() {
  const [theme, setThemeState] = useState<"dark" | "light">(() => getTheme());
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }
  return (
    <button onClick={toggle} style={{
      padding: "6px 12px", borderRadius: 6, cursor: "pointer",
      background: "var(--bg-surface-raised)", border: "1px solid var(--border)",
      color: "var(--text-secondary)", fontSize: 12,
    }}>
      {theme === "dark" ? "☀ Light" : "🌙 Dark"}
    </button>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("account");

  const tabs: { id: Tab; label: string }[] = [
    { id: "account", label: "Account" },
    { id: "audit", label: "Audit Log" },
    { id: "about", label: "About" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 24px", borderBottom: "1px solid var(--border)",
        background: "var(--bg-surface)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg width="28" height="28" viewBox="0 0 80 80" fill="none">
            <rect x="8" y="24" width="64" height="32" rx="10"
                  fill="var(--bg-base)" stroke="var(--brand-primary)" strokeWidth="2"/>
            <rect x="17" y="36" width="26" height="2.5" rx="1.25"
                  fill="var(--brand-primary)" opacity="0.5"/>
            <circle cx="60" cy="40" r="11"
                    fill="var(--brand-primary)" opacity="0.12"/>
            <circle cx="60" cy="40" r="11"
                    stroke="var(--brand-primary)" strokeWidth="2"/>
            <path d="M55.5 40L59 43.5L65.5 37"
                  stroke="var(--brand-primary)" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.5px" }}>
              <span style={{ color: "var(--text-primary)" }}>safe</span>
              <span style={{ color: "var(--brand-primary)" }}>input</span>
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)",
                          letterSpacing: "2.5px", textTransform: "uppercase", marginTop: 2 }}>
              AI Prompt Protection
            </div>
          </div>
        </div>
        <ThemeToggleButton />
      </header>

      {/* Tabs */}
      <div style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex" }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "12px 24px", fontSize: 13, fontWeight: 500,
                background: "none", cursor: "pointer",
                borderBottom: activeTab === tab.id
                  ? "2px solid var(--brand-primary)"
                  : "2px solid transparent",
                color: activeTab === tab.id ? "var(--brand-primary)" : "var(--text-muted)",
                border: "none",
                borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: activeTab === tab.id ? "var(--brand-primary)" : "transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
        {activeTab === "account" && <AccountPage />}
        {activeTab === "audit" && <AuditPage />}
        {activeTab === "about" && <AboutPage />}
      </main>
    </div>
  );
}
