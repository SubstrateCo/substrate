export const sidebarId = "conversation-sidebar";

export function focusConversationSidebar() {
  document
    .querySelector<HTMLElement>(`#${sidebarId} [aria-current="page"], #${sidebarId} button`)
    ?.focus();
}
