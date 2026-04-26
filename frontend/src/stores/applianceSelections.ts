import { create } from "zustand";
import type { Appliance, RecommendationLabel } from "@/lib/api/types";

type DateMap = Partial<Record<Appliance, RecommendationLabel>>;

interface ApplianceSelectionsState {
  selectionsByDate: Record<string, DateMap>;
  /** Bumped when user clicks a timeline block so RecommendationCardSet can react to repeat clicks. */
  timelineFocusNonce: number;
  /** Appliance to show in recommendation cards after a timeline block click (today’s data only). */
  timelineFocusAppliance: Appliance | null;
  setSelection: (date: string, appliance: Appliance, label: RecommendationLabel) => void;
  setTimelineFocus: (appliance: Appliance) => void;
}

export const useApplianceSelectionsStore = create<ApplianceSelectionsState>(
  (set) => ({
    selectionsByDate: {},
    timelineFocusNonce: 0,
    timelineFocusAppliance: null,
    setSelection: (date, appliance, label) =>
      set((state) => ({
        selectionsByDate: {
          ...state.selectionsByDate,
          [date]: {
            ...(state.selectionsByDate[date] ?? {}),
            [appliance]: label,
          },
        },
      })),
    setTimelineFocus: (appliance) =>
      set((state) => ({
        timelineFocusAppliance: appliance,
        timelineFocusNonce: state.timelineFocusNonce + 1,
      })),
  }),
);

export function useSelectionFor(
  date: string,
  appliance: Appliance,
): RecommendationLabel | undefined {
  return useApplianceSelectionsStore(
    (s) => s.selectionsByDate[date]?.[appliance],
  );
}
