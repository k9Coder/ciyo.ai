import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/chrome-extension";
import { CLERK_PUBLISHABLE_KEY } from "@/shared/constants";
import { App } from "./App";
import "./styles.css";
import { initTheme } from "@/shared/theme";

initTheme();

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");

createRoot(root).render(
  <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
    <App />
  </ClerkProvider>
);
