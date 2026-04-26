# Google Calendar (frontend contract)

The repo’s React/Vite app is not in this tree yet. When you add it, wire calendar sync as follows (Supabase default helpers only — no custom JWT handling).

## OAuth

1. On “Connect Google Calendar”, call `supabase.auth.signInWithOAuth` with Google, Calendar read-only scope, and the usual `offline` + `consent` query params for refreshable provider tokens (see [Supabase Google auth](https://supabase.com/docs/guides/auth/social-login/auth-google)):

```ts
await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    scopes: "https://www.googleapis.com/auth/calendar.readonly",
    queryParams: {
      access_type: "offline",
      prompt: "consent",
    },
  },
});
```

2. After session is established, read the Google access token: `const { data: { session } } = await supabase.auth.getSession();` and use `session?.provider_token`.

## API

`POST` `${API_BASE}/api/calendar-sync` with headers `Authorization: Bearer <supabase access token>` and `Content-Type: application/json`, body:

```json
{ "provider_token": "<session.provider_token or null>" }
```

- If `provider_token` is omitted or `null`, the backend uses the default 7-day work-week / weekend availability.
- If set, the backend calls Google Calendar for the next 7 days and upserts `availability` rows.

Mirror `CalendarSyncRequest` in your typed client (`provider_token: string | null`).
