import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getTheme } from "@/shared/theme";
import "./loading.css";

interface LoadingState {
  isLoading: boolean;
  message: string;
}

interface LoadingContextValue extends LoadingState {
  showLoading: (message?: string) => void;
  hideLoading: () => void;
}

const LoadingContext = createContext<LoadingContextValue | null>(null);

export function useLoading(): LoadingContextValue {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error("useLoading must be used inside <LoadingProvider>");
  return ctx;
}

function CiyoLogo() {
  const [theme, setThemeState] = useState(() => getTheme());
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeState(getTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const src = chrome.runtime.getURL(theme === "light" ? "logo-light.png" : "logo-dark.png");
  return (
    <div className="ciyo-overlay-brand">
      <img src={src} alt="Pretzel" style={{ height: 28, width: "auto", display: "block" }} />
    </div>
  );
}

function OverlaySpinnerRings() {
  const primary = "var(--brand-primary, #00d4ff)";

  return (
    <div className="ciyo-ring-wrap">
      {/* Outer arc */}
      <div className="ciyo-ring-outer">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <circle cx="40" cy="40" r="37" stroke={primary} strokeOpacity="0.12" strokeWidth="2" />
          <circle
            cx="40" cy="40" r="37"
            fill="none"
            stroke={primary}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="175 58"
            style={{ filter: `drop-shadow(0 0 5px ${primary})` }}
            transform="rotate(-90 40 40)"
          />
        </svg>
      </div>

      {/* Inner counter-rotating arc */}
      <div className="ciyo-ring-inner">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <circle cx="28" cy="28" r="25" stroke={primary} strokeOpacity="0.08" strokeWidth="1.5" />
          <circle
            cx="28" cy="28" r="25"
            fill="none"
            stroke={primary}
            strokeOpacity="0.6"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="60 97"
            transform="rotate(-90 28 28)"
          />
        </svg>
      </div>

      {/* Center glowing dot */}
      <div className="ciyo-ring-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12" cy="12" r="5"
            fill={primary}
            style={{ filter: `drop-shadow(0 0 6px ${primary})` }}
          />
          <circle cx="12" cy="12" r="9" stroke={primary} strokeOpacity="0.2" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}

function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="ciyo-overlay" role="status" aria-live="polite" aria-label="Loading">
      <div className="ciyo-overlay-card">
        <OverlaySpinnerRings />
        <CiyoLogo />
        {message && (
          <div className="ciyo-label">{message}</div>
        )}
      </div>
    </div>
  );
}

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadingState>({ isLoading: false, message: "" });

  const showLoading = useCallback((message = "") => {
    setState({ isLoading: true, message });
  }, []);

  const hideLoading = useCallback(() => {
    setState({ isLoading: false, message: "" });
  }, []);

  return (
    <LoadingContext.Provider value={{ ...state, showLoading, hideLoading }}>
      {children}
      {state.isLoading && <LoadingOverlay message={state.message} />}
    </LoadingContext.Provider>
  );
}
