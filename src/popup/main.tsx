import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/chrome-extension";
import { CLERK_PUBLISHABLE_KEY } from "@/shared/constants";
import { Popup } from "./Popup";
import "../options/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");

createRoot(root).render(
  <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
    <Popup />
  </ClerkProvider>
);
