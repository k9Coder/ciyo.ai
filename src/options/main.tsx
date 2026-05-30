import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/chrome-extension";
import { CLERK_PUBLISHABLE_KEY } from "@/shared/constants";
import { App } from "./App";
import "./styles.css";
import { initTheme } from "@/shared/theme";
import { LoadingProvider } from "./components/loading";

initTheme();

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");

createRoot(root).render(
  <ClerkProvider
    publishableKey={CLERK_PUBLISHABLE_KEY}
    afterSignInUrl={window.location.href}
    afterSignUpUrl={window.location.href}
  >
    <LoadingProvider>
      <App />
    </LoadingProvider>
  </ClerkProvider>
);
