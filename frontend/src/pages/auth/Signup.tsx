import { useState, FormEvent, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { friendlyAuthErrorMessage } from "@/lib/auth/errors";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && session) navigate("/dashboard", { replace: true });
  }, [session, loading, navigate]);

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) {
      setSubmitting(false);
      toast.error(friendlyAuthErrorMessage(error, "signup"));
      return;
    }
    if (data.session) {
      setSubmitting(false);
      navigate("/dashboard", { replace: true });
      return;
    }
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (loginError) {
      toast.error(friendlyAuthErrorMessage(loginError, "signup"));
      return;
    }
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-[420px] rounded-lg border border-border bg-surface p-8 shadow-level-2">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[24px] text-accent-primary"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            bolt
          </span>
          <span className="text-h3 text-foreground">EnerGenius</span>
        </div>
        <h1 className="text-h2 text-foreground mt-6">Create your account</h1>
        <p className="text-body-sm text-muted-foreground mt-2">
          Use an email as your username, then a password. Demo only.
        </p>

        <form onSubmit={handleSignup} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="text-body-sm font-medium text-foreground block mb-1.5">
              Username
            </label>
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-body-sm font-medium text-foreground block mb-1.5">
              Password
            </label>
            <Input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full mt-2">
            {submitting ? "Creating account…" : "Sign up"}
          </Button>
        </form>

        <p className="text-body-sm text-muted-foreground mt-6 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-foreground font-medium underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
