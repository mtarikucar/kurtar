import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { injectDesignTokens } from "./styles/tokens";
import "./styles/global.css";

// Must run before any component renders — every .module.css file in this
// app reads colors/spacing/type as CSS custom properties this sets on
// :root, sourced from @kurtar/ui-tokens (see styles/tokens.ts).
injectDesignTokens();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root element not found in index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
