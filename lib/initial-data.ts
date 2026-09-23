import type { AppData } from './data';
import { createInitialRules } from './rule-operations';

/** Empty, valid local state used until the first server snapshot arrives. */
export function createEmptyAppData(today: string): AppData {
  return {
    version: 8,
    schedule: { [today]: [] },
    backlog: [],
    monthPlanning: { rules: [], createdMonths: [] },
    rules: createInitialRules(),
    reviewTrackingStartedOn: today,
    goals: [],
    reviews: [],
    notes: [],
    history: [],
  };
}
