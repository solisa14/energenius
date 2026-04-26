// Typed client for the EnerGenius FastAPI backend.
// All requests carry the Supabase JWT as Authorization: Bearer <token>.

import { supabase } from "@/integrations/supabase/client";
import type {
  ChatResponse,
  DailyRecommendation,
  ExternalData,
  FeedbackEvent,
  FeedbackResponse,
} from "./types";
import { mockDailyRecommendation, mockExternalData } from "./mocks";

// Set VITE_USE_MOCKS="true" only for UI work without a running API.
const USE_MOCKS =
  (import.meta.env.VITE_USE_MOCKS as string | undefined) === "true";

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:8000";

async function getAuthHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function parseErrorBody(body: string): { message: string; detail?: unknown } {
  if (!body) {
    return { message: "" };
  }
  try {
    const parsed = JSON.parse(body) as { detail?: unknown; message?: unknown };
    const detail = parsed.detail ?? parsed.message ?? parsed;
    if (typeof detail === "string") {
      return { message: detail, detail };
    }
    if (
      detail &&
      typeof detail === "object" &&
      "message" in detail &&
      typeof (detail as { message?: unknown }).message === "string"
    ) {
      return {
        message: String((detail as { message: string }).message),
        detail,
      };
    }
    return { message: body, detail };
  } catch {
    return { message: body };
  }
}

async function handle<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (import.meta.env.DEV) {
      console.error(`[api] ${label} failed:`, res.status, body);
    }
    const parsed = parseErrorBody(body);
    throw new ApiError(
      res.status,
      parsed.message || `${label} failed: ${res.status}`,
      body,
      parsed.detail,
    );
  }
  return (await res.json()) as T;
}

export async function getRecommendations(
  date?: string,
): Promise<DailyRecommendation> {
  const target = date ?? new Date().toISOString().slice(0, 10);
  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 200));
    return { ...mockDailyRecommendation, date: target };
  }
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${API_BASE}/api/recommendations?date=${encodeURIComponent(target)}`,
    { headers },
  );
  return handle<DailyRecommendation>(res, "getRecommendations");
}

export async function postFeedback(
  event: FeedbackEvent,
): Promise<FeedbackResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/feedback`, {
    method: "POST",
    headers,
    body: JSON.stringify(event),
  });
  return handle<FeedbackResponse>(res, "postFeedback");
}

export async function postChat(
  message: string,
  threadId?: string,
): Promise<ChatResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message, thread_id: threadId }),
  });
  return handle<ChatResponse>(res, "postChat");
}

export async function getExternalData(
  zip: string,
  date: string,
): Promise<ExternalData> {
  if (USE_MOCKS) {
    await new Promise((r) => setTimeout(r, 200));
    return mockExternalData;
  }
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${API_BASE}/api/external-data?zip=${encodeURIComponent(zip)}&date=${encodeURIComponent(date)}`,
    { headers },
  );
  return handle<ExternalData>(res, "getExternalData");
}

export { ApiError };
