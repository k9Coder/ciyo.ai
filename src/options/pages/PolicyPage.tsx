import React, { useEffect, useRef, useState } from "react";
import { PolicySchema, type Policy } from "@/policy/schema";
import { DEFAULT_POLICY } from "@/policy/defaults";
import { STORAGE_POLICY_KEY } from "@/shared/constants";

type Status = { kind: "idle" } | { kind: "success"; msg: string } | { kind: "error"; msg: string };

export function PolicyPage() {
  const [json, setJson] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_POLICY_KEY, (data) => {
      const policy: Policy = data[STORAGE_POLICY_KEY] ?? DEFAULT_POLICY;
      setJson(JSON.stringify(policy, null, 2));
    });
  }, []);

  function saveJson(raw: string) {
    try {
      const parsed = JSON.parse(raw);
      const result = PolicySchema.safeParse(parsed);
      if (!result.success) {
        setStatus({
          kind: "error",
          msg: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"),
        });
        return;
      }
      chrome.storage.local.set({ [STORAGE_POLICY_KEY]: result.data }, () => {
        setStatus({ kind: "success", msg: "Policy saved." });
      });
    } catch (e) {
      setStatus({ kind: "error", msg: `JSON parse error: ${String(e)}` });
    }
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setJson(text);
      saveJson(text);
    };
    reader.readAsText(file);
    // reset input so same file can be re-imported
    e.target.value = "";
  }

  function handleExport() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "promptshield-policy.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleReset() {
    const defaultJson = JSON.stringify(DEFAULT_POLICY, null, 2);
    setJson(defaultJson);
    saveJson(defaultJson);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Detection Policy</h2>
        <p className="text-sm text-gray-500 mt-1">
          Edit your policy JSON directly, or import/export a file.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Import JSON
        </button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        <button
          onClick={handleExport}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Export JSON
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
        >
          Reset to defaults
        </button>
        <button
          onClick={() => saveJson(json)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          Save
        </button>
      </div>

      {/* Status banner */}
      {status.kind !== "idle" && (
        <div
          className={`rounded-lg p-3 text-sm whitespace-pre-wrap ${
            status.kind === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {status.msg}
        </div>
      )}

      {/* Editor */}
      <textarea
        value={json}
        onChange={(e) => { setJson(e.target.value); setStatus({ kind: "idle" }); }}
        spellCheck={false}
        className="w-full h-[60vh] font-mono text-xs border border-gray-300 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      />
    </div>
  );
}
