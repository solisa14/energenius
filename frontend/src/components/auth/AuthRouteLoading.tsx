/** Layout-matching loading surface (shimmer) for auth and route bootstraps — no spinners. */
export function AuthRouteLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4 px-6">
      <div className="h-9 w-40 rounded-md bg-muted/90 animate-pulse" />
      <div className="h-3 w-56 max-w-full rounded-md bg-muted/60 animate-pulse" />
    </div>
  );
}
