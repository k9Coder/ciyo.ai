import React from "react";
import { createRoot } from "react-dom/client";
import { Popup } from "./Popup";
import "../options/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");
createRoot(root).render(<Popup />);
