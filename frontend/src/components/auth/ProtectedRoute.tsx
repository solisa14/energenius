import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AuthRouteLoading } from "@/components/auth/AuthRouteLoading";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return <AuthRouteLoading />;
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
