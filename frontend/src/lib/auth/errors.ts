/** Map Supabase auth API messages to short demo copy (no custom auth logic). */

type AuthishError = { message?: string; status?: number } | null | undefined;

export function friendlyAuthErrorMessage(
  err: AuthishError,
  context: "signup" | "login",
): string {
  if (!err?.message) {
    return "Could not sign you in. Try again.";
  }
  const m = err.message.toLowerCase();
  const s = err.status;

  if (s === 429 || m.includes("rate") || m.includes("too many")) {
    return "Too many tries. Wait a bit and try again.";
  }
  if (
    m.includes("confirm") ||
    m.includes("verified") ||
    m.includes("unconfirmed")
  ) {
    return "Turn off email confirmation in the Supabase Auth settings for an instant demo, or use another account.";
  }
  if (
    m.includes("invalid") &&
    (m.includes("password") || m.includes("login") || m.includes("credentials"))
  ) {
    return context === "login"
      ? "Wrong username or password."
      : "Check your username and password.";
  }
  if (
    m.includes("registered") ||
    m.includes("already exists") ||
    m.includes("user already")
  ) {
    return "That account already exists. Sign in instead.";
  }
  if (m.includes("url") && m.includes("request")) {
    return "Check your Supabase URL in the app env. It should be the project URL, not the REST API path.";
  }
  return "Something went wrong. Try again.";
}
