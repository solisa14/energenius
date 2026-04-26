import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useCalendarSync } from "@/hooks/useCalendarSync";
import { useAvailabilityActionReply } from "@/hooks/useAvailabilityActionReply";
import { ApiError } from "@/lib/api/client";
import type {
  AvailabilityClarification,
  AvailabilityResolution,
} from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const DRAFT_KEY = "energenius.onboarding.draft";
const TOTAL_STEPS = 5;
const OAUTH_QUERY_VALUE = "oauth";

type PriorityKey = "cost" | "emissions" | "comfort";

interface ApplianceDraft {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  durationSlots: number;
  powerKw: number;
  requiresPresence: boolean;
}

interface DraftState {
  step: number;
  fullName: string;
  homeZip: string;
  comfortRange: [number, number];
  priorities: PriorityKey[];
  appliances: ApplianceDraft[];
  calendarDone: boolean;
  clarifications: AvailabilityClarification[];
  clarificationIndex: number;
  calendarSummary: string;
}

type ApiDetail = {
  code?: string;
  message?: string;
};

const DEFAULT_APPLIANCES: ApplianceDraft[] = [
  {
    id: "dishwasher",
    label: "Dishwasher",
    icon: "dishwasher_gen",
    enabled: true,
    durationSlots: 4,
    powerKw: 1.3,
    requiresPresence: true,
  },
  {
    id: "washing_machine",
    label: "Washing machine",
    icon: "local_laundry_service",
    enabled: true,
    durationSlots: 3,
    powerKw: 0.9,
    requiresPresence: true,
  },
  {
    id: "dryer",
    label: "Dryer",
    icon: "mode_fan",
    enabled: true,
    durationSlots: 2,
    powerKw: 2.4,
    requiresPresence: true,
  },
  {
    id: "ev_charger",
    label: "EV charger",
    icon: "electric_car",
    enabled: true,
    durationSlots: 8,
    powerKw: 1.9,
    requiresPresence: false,
  },
  {
    id: "water_heater_boost",
    label: "Water heater boost",
    icon: "water_heater",
    enabled: true,
    durationSlots: 4,
    powerKw: 2.0,
    requiresPresence: false,
  },
];

const PRIORITY_LABELS: Record<PriorityKey, { title: string; detail: string; icon: string }> = {
  cost: {
    title: "Save money",
    detail: "Favor cheaper time windows first.",
    icon: "payments",
  },
  emissions: {
    title: "Reduce emissions",
    detail: "Shift load toward cleaner grid hours.",
    icon: "eco",
  },
  comfort: {
    title: "Stay convenient",
    detail: "Keep suggestions aligned with when you are around.",
    icon: "home",
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function parseApiDetail(detail: unknown): ApiDetail {
  if (detail && typeof detail === "object") {
    return detail as ApiDetail;
  }
  if (typeof detail === "string") {
    return { message: detail };
  }
  return {};
}

function isMigrationErrorMessage(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("0002_gemma_availability_assistant") ||
    normalized.includes("timezone") ||
    normalized.includes("requires_presence") ||
    normalized.includes("availability_assistant_actions") ||
    normalized.includes("column") ||
    normalized.includes("relation") ||
    normalized.includes("does not exist")
  );
}

function describeSaveError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = parseApiDetail(error.detail);
    if (detail.code === "setup_migration_missing") {
      return "Latest Supabase setup is missing. Apply `supabase/migrations/0002_gemma_availability_assistant.sql`, then reload onboarding.";
    }
    return detail.message || error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const postgrest = error as PostgrestError;
    const message = String(postgrest.message || "");
    if (isMigrationErrorMessage(message)) {
      return "Latest Supabase setup is missing. Apply `supabase/migrations/0002_gemma_availability_assistant.sql`, then reload onboarding.";
    }
    if (message.toLowerCase().includes("jwt") || message.toLowerCase().includes("auth")) {
      return "Your session is no longer valid. Sign in again, then retry onboarding.";
    }
    if (message.toLowerCase().includes("row-level security")) {
      return "Supabase rejected the write with row-level security. Verify you are signed in and the project policies are up to date.";
    }
    return message;
  }
  return "Could not save onboarding.";
}

function describeCalendarError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = parseApiDetail(error.detail);
    if (detail.code === "setup_migration_missing") {
      return "Latest Supabase setup is missing. Apply `supabase/migrations/0002_gemma_availability_assistant.sql` before using Google Calendar.";
    }
    if (detail.code === "google_calendar_scope_missing") {
      return detail.message || "Google Calendar rejected the provider token. Verify the Google provider, redirect URL, and calendar.readonly scope in Supabase.";
    }
    if (detail.code === "google_calendar_unavailable") {
      return detail.message || "Google Calendar sync failed while contacting the backend.";
    }
    if (error.status === 401) {
      return "The backend rejected your Supabase session. Check `SUPABASE_JWT_SECRET` in the backend and sign in again.";
    }
    return detail.message || error.message;
  }
  if (error instanceof Error) {
    if (error.message.includes("Failed to fetch")) {
      return "Calendar sync could not reach the FastAPI backend. Start the backend at `VITE_API_URL` and retry.";
    }
    return error.message;
  }
  return "Calendar sync failed.";
}

async function waitForProviderToken(session: Session | null): Promise<string> {
  const direct = providerToken(session);
  if (direct) return direct;

  const deadline = Date.now() + 8000;
  let sawSession = false;
  while (Date.now() < deadline) {
    const {
      data: { session: freshSession },
    } = await supabase.auth.getSession();
    if (freshSession) {
      sawSession = true;
      const token = providerToken(freshSession);
      if (token) return token;
    }
    await sleep(250);
  }

  if (sawSession) {
    throw new Error(
      "Google sign-in completed, but Supabase did not return a provider token. Verify the Google provider, redirect URL, and calendar.readonly scope.",
    );
  }
  throw new Error(
    "Google sign-in returned to onboarding, but the Supabase session was not restored. Sign in again and retry calendar connect.",
  );
}

async function assertOnboardingSchemaReady(userId: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Your session expired. Sign in again, then retry onboarding.");
  }

  const profileCheck = await supabase
    .from("profiles")
    .select("id,timezone")
    .eq("id", userId)
    .maybeSingle();
  if (profileCheck.error) {
    throw profileCheck.error;
  }
  if (!profileCheck.data) {
    throw new Error(
      "Your `profiles` row is missing. Verify the new-user trigger created it, or sign out and back in before onboarding.",
    );
  }

  const applianceSchemaCheck = await supabase
    .from("appliances")
    .select("id,requires_presence")
    .limit(1);
  if (applianceSchemaCheck.error) {
    throw applianceSchemaCheck.error;
  }
}

function PrioritySortableCard({
  id,
  index,
}: {
  id: PriorityKey;
  index: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-4 rounded-3xl border bg-white p-4 shadow-sm transition-shadow ${
        isDragging ? "border-slate-900 shadow-lg" : "border-slate-200"
      }`}
    >
      <button
        type="button"
        aria-label={`Drag ${PRIORITY_LABELS[id].title}`}
        className="flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-700 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <span className="material-symbols-outlined text-[20px]">drag_indicator</span>
      </button>
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
        <span className="material-symbols-outlined text-[20px]">
          {PRIORITY_LABELS[id].icon}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{PRIORITY_LABELS[id].title}</p>
        <p className="text-sm text-slate-500">{PRIORITY_LABELS[id].detail}</p>
      </div>
      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
        #{index + 1}
      </div>
    </div>
  );
}

function makeDefaultDraft(): DraftState {
  return {
    step: 0,
    fullName: "",
    homeZip: "",
    comfortRange: [68, 76],
    priorities: ["cost", "emissions", "comfort"],
    appliances: DEFAULT_APPLIANCES,
    calendarDone: false,
    clarifications: [],
    clarificationIndex: 0,
    calendarSummary: "",
  };
}

function readDraft(): DraftState {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return makeDefaultDraft();
    const parsed = JSON.parse(raw) as Partial<DraftState>;
    return {
      ...makeDefaultDraft(),
      ...parsed,
      comfortRange: Array.isArray(parsed.comfortRange) && parsed.comfortRange.length === 2
        ? [Number(parsed.comfortRange[0]), Number(parsed.comfortRange[1])]
        : [68, 76],
      priorities: Array.isArray(parsed.priorities) && parsed.priorities.length === 3
        ? (parsed.priorities as PriorityKey[])
        : ["cost", "emissions", "comfort"],
      appliances: Array.isArray(parsed.appliances) && parsed.appliances.length > 0
        ? parsed.appliances as ApplianceDraft[]
        : DEFAULT_APPLIANCES,
      clarifications: Array.isArray(parsed.clarifications)
        ? parsed.clarifications as AvailabilityClarification[]
        : [],
      clarificationIndex: Number.isFinite(parsed.clarificationIndex)
        ? Number(parsed.clarificationIndex)
        : 0,
    };
  } catch {
    return makeDefaultDraft();
  }
}

function stepCanAdvance(draft: DraftState): boolean {
  if (draft.step === 0) {
    return draft.fullName.trim().length >= 2 && /^\d{5}$/.test(draft.homeZip.trim());
  }
  if (draft.step === 2) {
    return draft.appliances.some((appliance) => appliance.enabled);
  }
  if (draft.step === 4) {
    return draft.calendarDone && draft.clarificationIndex >= draft.clarifications.length;
  }
  return true;
}

function slotLabel(slot: number): string {
  const normalized = slot % 48;
  const hour = Math.floor(normalized / 2);
  const minute = slot % 2 === 0 ? "00" : "30";
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${minute} ${suffix}`;
}

function slotRangeLabel(clarification: AvailabilityClarification): string {
  return `${slotLabel(clarification.start_slot)} - ${slotLabel(clarification.end_slot)}`;
}

function providerToken(session: Session | null): string | null {
  return ((session as Session & { provider_token?: string | null } | null)?.provider_token ?? null);
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user, session, loading } = useAuth();
  const { syncAsync, isLoading: syncLoading } = useCalendarSync();
  const { replyAsync, isLoading: replyLoading } = useAvailabilityActionReply();

  const [draft, setDraft] = useState<DraftState>(() => readDraft());
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [reviewInput, setReviewInput] = useState("");

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  const activeClarification = draft.clarifications[draft.clarificationIndex] ?? null;
  const canAdvance = stepCanAdvance(draft);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    if (searchParams.get("calendar") !== OAUTH_QUERY_VALUE) return;
    if (draft.step < 4) {
      setDraft((current) => ({ ...current, step: 4 }));
    }
  }, [draft.step, searchParams]);

  useEffect(() => {
    const oauthError = searchParams.get("error_description") || searchParams.get("error");
    if (oauthError) {
      setDraft((current) => ({ ...current, step: 4 }));
      setCalendarError(oauthError);
    }
  }, [searchParams]);

  useEffect(() => {
    const shouldAutoSync = searchParams.get("calendar") === OAUTH_QUERY_VALUE;
    if (!shouldAutoSync || draft.calendarDone || syncLoading || loading) return;
    void (async () => {
      try {
        const token = await waitForProviderToken(session);
        const result = await syncAsync({ provider_token: token, timezone });
        setDraft((current) => ({
          ...current,
          step: 4,
          calendarDone: true,
          clarifications: result.clarifications,
          clarificationIndex: 0,
          calendarSummary: result.summary,
        }));
        setCalendarError(null);
        const next = new URLSearchParams(searchParams);
        next.delete("calendar");
        next.delete("error");
        next.delete("error_description");
        setSearchParams(next, { replace: true });
      } catch (error) {
        setCalendarError(describeCalendarError(error));
      }
    })();
  }, [draft.calendarDone, loading, searchParams, session, setSearchParams, syncAsync, syncLoading, timezone]);

  const setStep = (step: number) => {
    setDraft((current) => ({ ...current, step }));
  };

  const updateAppliance = (id: string, patch: Partial<ApplianceDraft>) => {
    setDraft((current) => ({
      ...current,
      appliances: current.appliances.map((appliance) =>
        appliance.id === id ? { ...appliance, ...patch } : appliance,
      ),
    }));
  };

  const weights = useMemo(() => {
    const values = [0.5, 0.3, 0.2] as const;
    return draft.priorities.reduce<Record<PriorityKey, number>>((acc, key, index) => {
      acc[key] = values[index];
      return acc;
    }, { cost: 0.2, emissions: 0.3, comfort: 0.5 });
  }, [draft.priorities]);

  const handleNext = () => {
    if (!canAdvance) return;
    setStep(Math.min(draft.step + 1, TOTAL_STEPS - 1));
  };

  const handleBack = () => {
    setStep(Math.max(draft.step - 1, 0));
  };

  const handlePriorityDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = draft.priorities.indexOf(active.id as PriorityKey);
    const toIndex = draft.priorities.indexOf(over.id as PriorityKey);
    if (fromIndex < 0 || toIndex < 0) return;
    setDraft((current) => ({
      ...current,
      priorities: arrayMove(current.priorities, fromIndex, toIndex),
    }));
  };

  const persistProfileAndAppliances = async () => {
    if (!user) throw new Error("No signed-in user.");
    await assertOnboardingSchemaReady(user.id);
    const profilePatch = {
      full_name: draft.fullName.trim(),
      home_zip: draft.homeZip.trim(),
      t_min_f: draft.comfortRange[0],
      t_max_f: draft.comfortRange[1],
      cost_weight: weights.cost,
      carbon_weight: weights.emissions,
      comfort_weight: weights.comfort,
      timezone,
    };
    const { error: profileError } = await supabase
      .from("profiles")
      .update(profilePatch)
      .eq("id", user.id);
    if (profileError) throw profileError;

    const { error: deleteError } = await supabase
      .from("appliances")
      .delete()
      .eq("user_id", user.id);
    if (deleteError) throw deleteError;

    const applianceRows: TablesInsert<"appliances">[] = draft.appliances
      .filter((appliance) => appliance.enabled)
      .map((appliance) => ({
        user_id: user.id,
        name: appliance.id,
        enabled: true,
        duration_hours: appliance.durationSlots / 2,
        power_kw: appliance.powerKw,
        requires_presence: appliance.requiresPresence,
      }));
    if (applianceRows.length > 0) {
      const { error: insertError } = await supabase.from("appliances").insert(applianceRows);
      if (insertError) throw insertError;
    }
  };

  const handleSubmit = async () => {
    if (!canAdvance || submitting) return;
    setSubmitting(true);
    setSaveError(null);
    try {
      await persistProfileAndAppliances();
      await queryClient.invalidateQueries({ queryKey: ["profile", user?.id ?? "anon"] });
      window.localStorage.removeItem(DRAFT_KEY);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const message = describeSaveError(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const startCalendarSync = async (token: string | null) => {
    setCalendarError(null);
    if (!token) {
      setDraft((current) => ({
        ...current,
        calendarDone: true,
        clarifications: [],
        clarificationIndex: 0,
        calendarSummary:
          "Using the default workweek schedule for now: weekdays 9 AM to 5 PM away, weekends at home.",
      }));
      toast.success("Default availability applied.");
      return;
    }
    try {
      const result = await syncAsync({ provider_token: token, timezone });
      setDraft((current) => ({
        ...current,
        calendarDone: true,
        clarifications: result.clarifications,
        clarificationIndex: 0,
        calendarSummary: result.summary,
      }));
      toast.success("Availability imported.");
    } catch (error) {
      setCalendarError(describeCalendarError(error));
    }
  };

  const handleConnectCalendar = async () => {
    const {
      data: { session: freshSession },
    } = await supabase.auth.getSession();
    const token = providerToken(session) ?? providerToken(freshSession);
    if (token) {
      await startCalendarSync(token);
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/calendar.readonly",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
        redirectTo: `${window.location.origin}/onboarding?calendar=${OAUTH_QUERY_VALUE}`,
      },
    });
    if (error) {
      setCalendarError(describeCalendarError(error));
    }
  };

  const handleSkipCalendar = async () => {
    await startCalendarSync(null);
  };

  const handleClarificationResolution = async (
    resolution: AvailabilityResolution,
    clarification: AvailabilityClarification,
  ) => {
    try {
      const response = await replyAsync({
        actionId: clarification.action_id,
        body: { resolution },
      });
      if (response.clarification) {
        setDraft((current) => {
          const next = [...current.clarifications];
          next[current.clarificationIndex] = response.clarification!;
          return { ...current, clarifications: next };
        });
        return;
      }
      setDraft((current) => ({
        ...current,
        clarificationIndex: Math.min(
          current.clarificationIndex + 1,
          current.clarifications.length,
        ),
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not apply that answer.");
    }
  };

  const handleClarificationMessage = async () => {
    if (!activeClarification || !reviewInput.trim()) return;
    try {
      const response = await replyAsync({
        actionId: activeClarification.action_id,
        body: { message: reviewInput.trim() },
      });
      if (response.clarification) {
        setDraft((current) => {
          const next = [...current.clarifications];
          next[current.clarificationIndex] = response.clarification!;
          return { ...current, clarifications: next };
        });
        setReviewInput("");
        return;
      }
      setReviewInput("");
      setDraft((current) => ({
        ...current,
        clarificationIndex: Math.min(
          current.clarificationIndex + 1,
          current.clarifications.length,
        ),
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send that answer.");
    }
  };

  const heroCopy = [
    {
      title: "Hi! Let's set up your home.",
      subtitle: "We’ll use this to anchor your prices, grid mix, and presence-aware automation.",
    },
    {
      title: "What’s your comfort range?",
      subtitle: "We only recommend heating and cooling outside this range.",
    },
    {
      title: "Which appliances should we schedule?",
      subtitle: "Turn on the devices you care about and keep the rest out of the optimization.",
    },
    {
      title: "What matters most?",
      subtitle: "Set the order once. The optimizer and Gemma both use the same priorities.",
    },
    {
      title: "Connect your calendar",
      subtitle: "Gemma can reason over your real schedule, ask questions when it’s unsure, and keep availability honest.",
    },
  ] as const;

  const currentHero = heroCopy[draft.step];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,254,86,0.14),transparent_32%),linear-gradient(180deg,#0b111a_0%,#101822_100%)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-between rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur sm:p-8">
          <div>
            <div className="flex items-center gap-2 text-sm uppercase tracking-[0.28em] text-white/60">
              <span
                className="material-symbols-outlined text-[22px] text-[#FFFE56]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                bolt
              </span>
              EnerGenius Setup
            </div>
            <div className="mt-8 max-w-xl">
              <p className="text-sm uppercase tracking-[0.2em] text-[#FFFE56]">
                Step {draft.step + 1} of {TOTAL_STEPS}
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight text-white sm:text-5xl">
                {currentHero.title}
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-white/70 sm:text-lg">
                {currentHero.subtitle}
              </p>
            </div>
          </div>

          <div className="mt-10 space-y-4">
            <Progress
              value={((draft.step + 1) / TOTAL_STEPS) * 100}
              className="h-2 rounded-full bg-white/10"
            />
            <div className="grid gap-3 text-sm text-white/60 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-white">48-slot availability</p>
                <p className="mt-1">Gemma updates the same boolean grid the optimizer uses.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-white">Clarify, don’t guess</p>
                <p className="mt-1">Ambiguous events stay pending until you answer them.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-white">Schedule-aware</p>
                <p className="mt-1">Home-required appliances now avoid away windows automatically.</p>
              </div>
            </div>
          </div>
        </section>

        <Card className="flex flex-col justify-between rounded-[32px] border-white/10 bg-[#F5F7FB] p-0 text-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <div className="border-b border-slate-200 px-6 py-5 sm:px-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Home Profile</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">EnerGenius onboarding</p>
              </div>
              <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
                {draft.step + 1}/{TOTAL_STEPS}
              </div>
            </div>
          </div>

          <div className="flex-1 px-6 py-6 sm:px-8">
            {draft.step === 0 && (
              <div className="space-y-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Your name</label>
                  <div className="relative">
                    <Input
                      value={draft.fullName}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, fullName: event.target.value }))
                      }
                      placeholder="Albert"
                      className="h-14 rounded-2xl border-slate-300 bg-white pr-11 text-base text-slate-950 placeholder:text-slate-400"
                    />
                    {draft.fullName.trim().length >= 2 && (
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                        check_circle
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Home zip code</label>
                  <div className="relative">
                    <Input
                      inputMode="numeric"
                      value={draft.homeZip}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          homeZip: event.target.value.replace(/[^\d]/g, "").slice(0, 5),
                        }))
                      }
                      placeholder="85718"
                      className="h-14 rounded-2xl border-slate-300 bg-white pr-11 text-base text-slate-950 placeholder:text-slate-400"
                    />
                    {/^\d{5}$/.test(draft.homeZip) && (
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                        check_circle
                      </span>
                    )}
                  </div>
                  {draft.homeZip.length > 0 && !/^\d{5}$/.test(draft.homeZip) && (
                    <p className="mt-2 text-sm text-rose-600">
                      That doesn&apos;t look like a valid zip. Use five digits.
                    </p>
                  )}
                </div>
              </div>
            )}

            {draft.step === 1 && (
              <div className="space-y-8">
                <div className="rounded-3xl bg-slate-950 px-5 py-4 text-white">
                  <p className="text-sm uppercase tracking-[0.18em] text-white/60">Comfort window</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {draft.comfortRange[0]}°F - {draft.comfortRange[1]}°F
                  </p>
                </div>
                <div className="px-1">
                  <Slider
                    value={draft.comfortRange}
                    min={60}
                    max={85}
                    step={1}
                    onValueChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        comfortRange: [value[0] ?? 68, value[1] ?? 76],
                      }))
                    }
                    trackClassName="bg-[#FFFE56]"
                    rangeClassName="bg-slate-950"
                    thumbClassName="border-slate-950 bg-slate-950"
                  />
                  <div className="mt-3 flex justify-between text-sm text-slate-500">
                    <span>60°F</span>
                    <span>85°F</span>
                  </div>
                </div>
              </div>
            )}

            {draft.step === 2 && (
              <div className="space-y-3">
                {draft.appliances.map((appliance) => (
                  <div
                    key={appliance.id}
                    className={`rounded-3xl border p-4 transition-colors ${
                      appliance.enabled
                        ? "border-slate-200 bg-white"
                        : "border-slate-200 bg-slate-100/80 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <Switch
                        checked={appliance.enabled}
                        onCheckedChange={(checked) =>
                          updateAppliance(appliance.id, { enabled: checked })
                        }
                      />
                      <span className="material-symbols-outlined text-[24px] text-slate-800">
                        {appliance.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{appliance.label}</p>
                        <p className="text-sm text-slate-500">
                          {appliance.requiresPresence ? "Needs someone home" : "Can run while away"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="text-sm text-slate-600">
                        <span className="mb-1 block">Duration (slots)</span>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={appliance.durationSlots}
                          disabled={!appliance.enabled}
                          onChange={(event) =>
                            updateAppliance(appliance.id, {
                              durationSlots: Math.max(1, Number(event.target.value) || 1),
                            })
                          }
                          className="h-12 rounded-2xl border-slate-300 bg-white text-slate-950"
                        />
                      </label>
                      <label className="text-sm text-slate-600">
                        <span className="mb-1 block">Power (kW)</span>
                        <Input
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={appliance.powerKw}
                          disabled={!appliance.enabled}
                          onChange={(event) =>
                            updateAppliance(appliance.id, {
                              powerKw: Math.max(0.1, Number(event.target.value) || 0.1),
                            })
                          }
                          className="h-12 rounded-2xl border-slate-300 bg-white text-slate-950"
                        />
                      </label>
                    </div>
                  </div>
                ))}
                {!draft.appliances.some((appliance) => appliance.enabled) && (
                  <p className="text-sm text-rose-600">Enable at least one appliance to continue.</p>
                )}
              </div>
            )}

            {draft.step === 3 && (
              <div className="space-y-3">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handlePriorityDragEnd}
                >
                  <SortableContext
                    items={draft.priorities}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {draft.priorities.map((key, index) => (
                        <PrioritySortableCard key={key} id={key} index={index} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                <div className="rounded-3xl bg-slate-900 p-4 text-sm text-white/80">
                  Top priority gets 0.5 weight, middle gets 0.3, bottom gets 0.2.
                </div>
              </div>
            )}

            {draft.step === 4 && (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    onClick={handleConnectCalendar}
                    disabled={syncLoading}
                    className="h-14 rounded-2xl bg-slate-950 text-white hover:bg-slate-800"
                  >
                    {syncLoading ? "Analyzing…" : "Connect Google Calendar"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSkipCalendar}
                    disabled={syncLoading}
                    className="h-14 rounded-2xl border-slate-300 bg-white text-slate-950 hover:bg-slate-100"
                  >
                    Skip for now
                  </Button>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <p className="text-sm uppercase tracking-[0.16em] text-slate-500">Availability summary</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {draft.calendarSummary || "No calendar data yet. You can connect Google Calendar or use the default workweek schedule."}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    Browser timezone: <span className="font-medium text-slate-700">{timezone}</span>
                  </p>
                  {calendarError && (
                    <p className="mt-3 text-sm text-rose-600">{calendarError}</p>
                  )}
                </div>

                {activeClarification ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Clarification {draft.clarificationIndex + 1} of {draft.clarifications.length}
                    </p>
                    <div className="mt-4 flex gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                        <span className="material-symbols-outlined text-[20px]">smart_toy</span>
                      </div>
                      <div className="min-w-0 flex-1 rounded-[24px] bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-800">
                        <p>{activeClarification.question_text}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                          {activeClarification.date} · {slotRangeLabel(activeClarification)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={replyLoading}
                        className="border-slate-300 bg-white text-slate-950 hover:bg-slate-100"
                        onClick={() => void handleClarificationResolution("home", activeClarification)}
                      >
                        Home
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={replyLoading}
                        className="border-slate-300 bg-white text-slate-950 hover:bg-slate-100"
                        onClick={() => void handleClarificationResolution("away", activeClarification)}
                      >
                        Away
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={replyLoading}
                        className="text-slate-950 hover:bg-slate-100"
                        onClick={() => void handleClarificationResolution("skip", activeClarification)}
                      >
                        Skip
                      </Button>
                    </div>
                    <div className="mt-4 space-y-3">
                      <Textarea
                        value={reviewInput}
                        onChange={(event) => setReviewInput(event.target.value)}
                        placeholder="Or answer in plain English, like: I’ll be home."
                        className="min-h-[110px] rounded-2xl border-slate-300 bg-white text-slate-950 placeholder:text-slate-400"
                      />
                      <Button
                        type="button"
                        onClick={() => void handleClarificationMessage()}
                        disabled={replyLoading || reviewInput.trim().length === 0}
                        className="rounded-2xl bg-slate-950 text-white hover:bg-slate-800"
                      >
                        Send answer
                      </Button>
                    </div>
                  </div>
                ) : draft.calendarDone ? (
                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="material-symbols-outlined text-[20px]">check_circle</span>
                      Schedule review complete
                    </div>
                    <p className="mt-2">
                      Gemma has everything it needs for your initial availability profile.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-5 sm:px-8">
            <Button
              type="button"
              variant="ghost"
              onClick={handleBack}
              disabled={draft.step === 0 || submitting || syncLoading || replyLoading}
              className="text-slate-950 hover:bg-slate-100"
            >
              Back
            </Button>
            {draft.step < TOTAL_STEPS - 1 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={!canAdvance}
                className="min-w-[180px] rounded-full bg-slate-950 text-white hover:bg-slate-800"
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!canAdvance || submitting}
                className="min-w-[180px] rounded-full bg-slate-950 text-white hover:bg-slate-800"
              >
                {submitting ? "Saving…" : "Get Started"}
              </Button>
            )}
          </div>
          {saveError && (
            <div className="border-t border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700 sm:px-8">
              {saveError}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
