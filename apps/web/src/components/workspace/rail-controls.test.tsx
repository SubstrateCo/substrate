import { expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { SignOutButton } from "@/components/auth/sign-out-button";

function renderControl(control: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>{control}</QueryClientProvider>,
  );
}

test("compact workspace switcher keeps its full accessible name while showing initials", () => {
  const compact = renderControl(
    <OrganizationSwitcher organizationId="organization" name="Launch Team" compact />,
  );
  expect(compact).toContain('aria-label="Launch Team ▾"');
  expect(compact.replace(/<[^>]*>/g, "")).toBe("LT");
  const standard = renderControl(
    <OrganizationSwitcher organizationId="organization" name="Launch Team" />,
  );
  expect(standard.replace(/<[^>]*>/g, "")).toBe("Launch Team ▾");
});

test("icon-only sign out retains its accessible name without changing the standard control", () => {
  const compact = renderControl(<SignOutButton compact />);
  expect(compact).toContain('aria-label="Sign out"');
  expect(compact.replace(/<[^>]*>/g, "")).toBe("");
  expect(renderControl(<SignOutButton />).replace(/<[^>]*>/g, "")).toBe("Sign out");
});
