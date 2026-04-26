import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AuthRouteLoading } from "@/components/auth/AuthRouteLoading";
import { useProfile } from "@/hooks/useProfile";

export function ProtectedRoute({
  children,
  requireOnboarded = true,
}: {
  children: ReactNode;
  requireOnboarded?: boolean;
}) {
  const { session, loading } = useAuth();
  const { profile, isLoading } = useProfile();
  const location = useLocation();

  if (loading || (session && isLoading)) {
    return <AuthRouteLoading />;
  }
  if (!session) return <Navigate to="/login" replace />;
  const hasCompletedOnboarding =
    profile === null ||
    Boolean(
      profile.home_zip ||
      profile.full_name ||
      profile.monthly_utility_bill_usd !== null,
    );
  if (requireOnboarded && !hasCompletedOnboarding) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />;
  }
  if (!requireOnboarded && hasCompletedOnboarding) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
