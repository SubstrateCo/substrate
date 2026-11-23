import { ruleTester } from "../test-support.ts";
import { noticePlacement } from "./notice-placement.ts";

ruleTester.run("notice-placement", noticePlacement, {
  valid: [
    '<PageContent><ContentNotice icon={Users} title="No members" /></PageContent>',
    '<li><ContentNotice variant="inline" title="No tasks" /></li>',
    '<SettingsCard><ContentNotice variant="compact" title="No invitations" /></SettingsCard>',
    '<div className="space-y-4">{error && <ErrorState variant="compact" />}</div>',
  ],
  invalid: [
    {
      code: '<Card><ContentNotice title="No deals" /></Card>',
      errors: [{ messageId: "frame", data: { notice: "ContentNotice", parent: "Card" } }],
    },
    {
      code: '<div className="flex h-full items-center justify-center"><ContentNotice title="No tasks" /></div>',
      errors: [
        { messageId: "wrapper", data: { notice: "ContentNotice", className: "justify-center" } },
      ],
    },
    {
      code: '<div className="rounded-lg border border-dashed p-6">{failed ? <ErrorState /> : null}</div>',
      errors: [{ messageId: "frame", data: { notice: "ErrorState", parent: "div" } }],
    },
  ],
});
