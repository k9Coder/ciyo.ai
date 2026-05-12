import React, { useState } from "react";
import { PolicyPage } from "./pages/PolicyPage";
import { AuditPage } from "./pages/AuditPage";
import { AboutPage } from "./pages/AboutPage";

type Tab = "policy" | "audit" | "about";

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("policy");

  const tabs: { id: Tab; label: string }[] = [
    { id: "policy", label: "Policy" },
    { id: "audit", label: "Audit Log" },
    { id: "about", label: "About" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            PS
          </div>
          <h1 className="text-xl font-semibold text-gray-900">PromptShield Settings</h1>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {activeTab === "policy" && <PolicyPage />}
        {activeTab === "audit" && <AuditPage />}
        {activeTab === "about" && <AboutPage />}
      </main>
    </div>
  );
}
