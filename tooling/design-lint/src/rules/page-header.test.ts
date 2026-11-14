import { ruleTester } from "../test-support.ts";
import { pageHeader } from "./page-header.ts";

ruleTester.run("page-header", pageHeader, {
  valid: [
    'export const a = <PageHeader title="Needs you" />;',
    'export const a = <h2 className="text-sm font-semibold">Activity</h2>;',
    "export const a = <h2>{title}</h2>;",
    // A record's own title in its inspector is content, not a page header.
    'export const a = <h2 className="text-lg/snug font-semibold">{task.title}</h2>;',
  ],
  invalid: [
    {
      code: 'export const a = <h1 className="text-xl font-semibold tracking-tight">Needs you</h1>;',
      errors: [
        {
          message:
            'A raw <h1> builds a page title by hand, so the title size, inset, and action alignment drift between pages. Use <PageHeader title="…" description="…" actions={…}> from "@/components/layout/page-header" (variant="pane" for 48px pane headers), SettingsPanel from "@/components/layout/settings-page" for a settings section, or AuthFrame from "@/components/auth/auth-frame" for guest pages. See apps/web/DESIGN.md § 3 Pages and settings.',
        },
      ],
    },
    {
      code: 'export const a = <h2 className="mb-7 text-xl font-semibold tracking-tight">{title}</h2>;',
      errors: [{ messageId: "sectionTitle", data: { tag: "h2", size: "text-xl" } }],
    },
    {
      code: 'export const a = <h3 className={cn("font-semibold", "text-lg/snug")}>Project</h3>;',
      errors: [{ messageId: "sectionTitle", data: { tag: "h3", size: "text-lg/snug" } }],
    },
    {
      // A record field beside fixed text is still a hand-built heading.
      code: 'export const a = <h2 className="text-lg">Settings for {project.name}</h2>;',
      errors: [{ messageId: "sectionTitle", data: { tag: "h2", size: "text-lg" } }],
    },
  ],
});
