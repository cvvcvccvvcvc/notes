import { UNSORTED_GROUP_ID } from './backlog';
import type { AppData } from './data';
import { createInitialRules } from './rule-operations';

/** Empty, valid local state used until the first server snapshot arrives. */
export function createEmptyAppData(today: string): AppData {
  return {
    version: 6,
    schedule: { [today]: [] },
    backlog: [{ id: UNSORTED_GROUP_ID, title: 'Не разобрано', tasks: [] }],
    monthPlanning: { rules: [], createdMonths: [] },
    rules: createInitialRules(),
    reviewTrackingStartedOn: today,
    goals: [],
    reviews: [],
    notes: [],
    history: [],
  };
}
