import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AuthRouteLoading } from "@/components/auth/AuthRouteLoading";

export default function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    navigate(session ? "/dashboard" : "/login", { replace: true });
  }, [session, loading, navigate]);
  if (loading) {
    return <AuthRouteLoading />;
  }
  return <AuthRouteLoading />;
}
