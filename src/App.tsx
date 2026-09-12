import { useConvexAuth } from "convex/react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppPage from "./pages/AppPage.tsx";
import LoginPage from "./pages/LoginPage.tsx";

export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <span className="bui-streaming-dot inline-block size-2 rounded-full bg-violet-600" />
          読み込み中…
        </div>
      </div>
    );
  }
  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/app" replace /> : <LoginPage />}
      />
      <Route
        path="/app"
        element={isAuthenticated ? <AppPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? "/app" : "/login"} replace />}
      />
    </Routes>
  );
}
