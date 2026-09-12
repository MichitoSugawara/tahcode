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
import { applyTheme } from "./lib/theme.ts";

/* paint in the stored theme (dark by default) before React mounts */
applyTheme(localStorage.getItem("bui-theme") === "light" ? "light" : "dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ConvexAuthProvider client={convex}>
        <App />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--surface)",
              color: "var(--ink)",
              border: "none",
              boxShadow: "var(--shadow-overlay)",
              borderRadius: "10px",
              fontSize: "13px",
            },
          }}
        />
      </ConvexAuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
