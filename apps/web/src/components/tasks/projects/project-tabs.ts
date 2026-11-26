export const projectTabs = [
  { value: "tasks", label: "Tasks" },
  { value: "discussions", label: "Discussions" },
  { value: "settings", label: "Settings" },
] as const;

export type ProjectTab = (typeof projectTabs)[number]["value"];

export function isProjectTab(value: string): value is ProjectTab {
  return projectTabs.some((tab) => tab.value === value);
}
