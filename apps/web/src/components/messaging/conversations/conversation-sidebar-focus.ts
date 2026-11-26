export const sidebarId = "conversation-sidebar";

/**
 * Focus fallback for a control that is gone, such as a deleted conversation's menu: the first
 * current conversation or button in the sidebar. Does nothing where the sidebar is not shown.
 */
export function focusConversationSidebar() {
  document
    .querySelector<HTMLElement>(`#${sidebarId} [aria-current="page"], #${sidebarId} button`)
    ?.focus();
}
