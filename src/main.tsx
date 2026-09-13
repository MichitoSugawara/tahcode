import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import App from "./App.tsx";

import "./index.css";
import { convex } from "./lib/convex.ts";
import { applyTheme, readStoredTheme } from "./lib/theme.ts";

/* paint in the stored theme (light by default) before React mounts */
applyTheme(readStoredTheme());

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ConvexAuthProvider client={convex}>
        <App />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--surface)",
              border: "none",
              borderRadius: "10px",
              boxShadow: "var(--shadow-overlay)",
              color: "var(--ink)",
              fontSize: "13px",
            },
          }}
        />
      </ConvexAuthProvider>
    </BrowserRouter>
  </StrictMode>
);
