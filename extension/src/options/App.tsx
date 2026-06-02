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
          <svg width="28" height="28" viewBox="0 0 56 56" fill="none">
            <rect width="56" height="56" rx="14" fill="var(--bg-surface)"/>
            <path d="M20 14 L14 14 L14 42 L20 42"
                  stroke="var(--brand-primary)" strokeWidth="3"
                  strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="34" cy="28" r="5" fill="var(--brand-primary)"/>
            <path d="M30 18 L38 18 L38 24"
                  stroke="var(--brand-primary)" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
          </svg>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.5px" }}>
              <span style={{ color: "var(--text-primary)" }}>c</span>
              <span style={{ color: "var(--brand-primary)" }}>i</span>
              <span style={{ color: "var(--text-primary)" }}>yo</span>
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
