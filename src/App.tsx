import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import LoadingState from "@/components/primitives/LoadingState";
import { DesktopUpdateHost } from "@/harness/desktop/DesktopUpdateHost";
import { useTheme } from "@/lib/theme";

import { api } from "../convex/_generated/api";
import ChatPage from "./pages/ChatPage.tsx";
import ConnectorsPage from "./pages/ConnectorsPage.tsx";
import HomePage from "./pages/HomePage.tsx";
import InvitePage from "./pages/InvitePage.tsx";
import LoginPage from "./pages/LoginPage.tsx";
import OrgLayout from "./pages/OrgLayout.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import WelcomePage from "./pages/WelcomePage.tsx";

function FullscreenLoader({ label }: { label: string }) {
  return (
    <div className="bg-canvas flex h-[100dvh] items-center justify-center">
      <LoadingState label={label} variant="Dots" />
    </div>
  );
}

/* "/" → first org, or first-run */
function RootRedirect() {
  const orgs = useQuery(api.orgs.listMine);
  if (orgs === undefined) {
    return <FullscreenLoader label="読み込んでいます" />;
  }
  const first = orgs[0];
  return <Navigate to={first ? `/o/${first.slug}` : "/welcome"} replace />;
}

/* Convex Auth stays in `isLoading` forever if the OAuth `?code=` exchange
 * throws (stale verifier, mismatched SITE_URL). Fall through to the routes
 * after a grace period so the user lands on /login instead of a spinner. */
const AUTH_LOADING_GRACE_MS = 12_000;

export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [theme, toggleTheme] = useTheme();
  const [loadingTooLong, setLoadingTooLong] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setLoadingTooLong(false);
      return;
    }
    const timer = setTimeout(
      () => setLoadingTooLong(true),
      AUTH_LOADING_GRACE_MS
    );
    return () => clearTimeout(timer);
  }, [isLoading]);

  if (isLoading && !loadingTooLong) {
    return <FullscreenLoader label="サインイン状態を確認しています" />;
  }

  const guard = (element: React.ReactElement) =>
    isAuthenticated ? element : <Navigate to="/login" replace />;

  return (
    <>
      <DesktopUpdateHost />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/welcome" element={guard(<WelcomePage />)} />
        <Route
          path="/o/:orgSlug"
          element={guard(
            <OrgLayout theme={theme} onToggleTheme={toggleTheme} />
          )}
        >
          <Route index element={<HomePage />} />
          <Route path="c/:chatId" element={<ChatPage />} />
          <Route path="connectors" element={<ConnectorsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="/" element={guard(<RootRedirect />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
