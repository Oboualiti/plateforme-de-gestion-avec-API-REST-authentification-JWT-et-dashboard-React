import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { AppShell } from "@/components/AppShell";

export default function Index() {
  const isAuth = useAuth((s) => s.isAuthenticated);
  if (!isAuth) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
