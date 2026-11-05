import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AcceptInvitationScreen } from "./accept-invitation-screen";

test("unavailable invitations do not offer acceptance", () => {
  const render = (available: boolean) =>
    renderToStaticMarkup(
      <AcceptInvitationScreen
        invitation={{
          organizationName: "Launch Studio",
          email: "taylor@example.com",
          role: "member",
        }}
        available={available}
        onAccept={() => {}}
        signOut={null}
        workspacesHref="/organizations"
      />,
    );
  expect(render(true)).toContain("Accept invitation</button>");
  const unavailable = render(false);
  expect(unavailable).not.toContain("Accept invitation</button>");
  expect(unavailable).toContain("This invitation is no longer available.");
});
