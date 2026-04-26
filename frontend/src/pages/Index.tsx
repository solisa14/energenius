import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AuthRouteLoading } from "@/components/auth/AuthRouteLoading";

export default function Index() {
  const { loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    navigate("/login", { replace: true });
  }, [loading, navigate]);
  if (loading) {
    return <AuthRouteLoading />;
  }
  return <AuthRouteLoading />;
}
