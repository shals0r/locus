import { useAuthStore } from "./stores/authStore";
import { AppShell } from "./components/layout/AppShell";

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    // Login page will be implemented in Plan 05
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-primary-text">Locus</h1>
          <p className="mt-2 text-xs text-muted">Log in to continue.</p>
        </div>
      </div>
    );
  }

  return <AppShell />;
}

export default App;
