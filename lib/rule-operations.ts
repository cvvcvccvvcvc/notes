import type { AppData, Rule } from './data';

const initialRuleValues: Rule[] = [
  { id: 'rule-priority', text: 'Приоритет — работа и учёба.' },
  {
    id: 'rule-deadlock',
    text: 'Deadlock — максимум 2 игры или 1,5 часа в день.',
  },
  {
    id: 'rule-code-review',
    text: 'Весь написанный агентом код просматривать и понимать.',
  },
];

export function createInitialRules(): Rule[] {
  return initialRuleValues.map((rule) => ({ ...rule }));
}

export function appendRule(data: AppData, rule: Rule): AppData {
  return { ...data, rules: [...(data.rules ?? []), rule] };
}

export function updateRule(
  data: AppData,
  id: string,
  change: (rule: Rule) => Rule,
): AppData {
  return {
    ...data,
    rules: (data.rules ?? []).map((rule) =>
      rule.id === id ? change(rule) : rule,
    ),
  };
}

export function moveRule(data: AppData, id: string, direction: -1 | 1) {
  const rules = [...(data.rules ?? [])];
  const from = rules.findIndex((rule) => rule.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= rules.length) return data;
  const [moved] = rules.splice(from, 1);
  rules.splice(to, 0, moved);
  return { ...data, rules };
}

export function moveRuleTo(data: AppData, sourceId: string, targetId: string) {
  const rules = [...(data.rules ?? [])];
  const from = rules.findIndex((rule) => rule.id === sourceId);
  const to = rules.findIndex((rule) => rule.id === targetId);
  if (from < 0 || to < 0 || from === to) return data;
  const [moved] = rules.splice(from, 1);
  rules.splice(to, 0, moved);
  return { ...data, rules };
}

export function removeRule(data: AppData, id: string): AppData {
  return {
    ...data,
    rules: (data.rules ?? []).filter((rule) => rule.id !== id),
  };
}

export function restoreRule(data: AppData, rule: Rule, index: number): AppData {
  if ((data.rules ?? []).some((candidate) => candidate.id === rule.id))
    return data;
  const rules = [...(data.rules ?? [])];
  rules.splice(Math.min(index, rules.length), 0, rule);
  return { ...data, rules };
}
