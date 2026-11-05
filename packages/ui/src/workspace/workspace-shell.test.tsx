import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceShell } from "./workspace-shell";

test("workspace navigation only exposes settings when the app grants it", () => {
  const render = (showSettings: boolean) =>
    renderToStaticMarkup(
      <WorkspaceShell
        name="Taylor Kim"
        view="messages"
        onViewChange={() => {}}
        showSettings={showSettings}
        switcher={<span>Workspace</span>}
        signOut={<span>Sign out</span>}
      >
        <p>Conversation content</p>
      </WorkspaceShell>,
    );
  expect(render(false)).not.toContain('aria-label="Settings"');
  const owner = render(true);
  expect(owner).toContain('aria-label="Settings"');
  expect(owner).toContain('aria-label="Signed in as Taylor Kim"');
  expect(owner).toContain("Conversation content");
});
