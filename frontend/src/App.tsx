import { useEffect } from "react";
import { useAuthStore } from "./stores/authStore";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./components/auth/LoginPage";
import { SetupWizard } from "./components/auth/SetupWizard";
import { apiGet } from "./hooks/useApi";

function App() {
  const isSetup = useAuthStore((s) => s.isSetup);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setIsSetup = useAuthStore((s) => s.setIsSetup);

  useEffect(() => {
    apiGet<{ is_setup: boolean }>("/api/auth/status")
      .then((data) => setIsSetup(data.is_setup))
      .catch(() => setIsSetup(false));
  }, [setIsSetup]);

  // Loading state
  if (isSetup === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-dominant">
        <p className="text-sm text-muted">Loading...</p>
      </div>
    );
  }

  // First-run setup
  if (!isSetup) {
    return <SetupWizard />;
  }

  // Not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <AppShell />;
}

export default App;
