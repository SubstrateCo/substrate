import { ruleTester } from "../test-support.ts";
import { noticeTitle } from "./notice-title.ts";

ruleTester.run("notice-title", noticeTitle, {
  valid: [
    'import { ContentNotice } from "@/components/feedback/content-notice"; <ContentNotice title="No tasks" description="Create a task to begin." />;',
    'import { ErrorState } from "@/components/feedback/error-state"; <ErrorState title={errorTitle} />;',
    'import { ContentNotice } from "@/components/feedback/content-notice"; <ContentNotice title={`No ${kind}`} />;',
    'import { ContentNotice } from "another-library"; <ContentNotice title="No tasks." />;',
    'function ContentNotice() { return null; } <ContentNotice title="No tasks." />;',
    'import { ContentNotice } from "@/components/feedback/content-notice"; function View(ContentNotice) { return <ContentNotice title="No tasks." />; }',
    "<h2>No tasks.</h2>",
  ],
  invalid: [
    {
      code: 'import { ContentNotice } from "@/components/feedback/content-notice"; <ContentNotice title="No tasks." />;',
      errors: [{ messageId: "period" }],
    },
    {
      code: 'import { ErrorState as LoadError } from "../feedback/error-state"; <LoadError title={"Could not load tasks."} />;',
      errors: [{ messageId: "period" }],
    },
    {
      code: 'import * as Feedback from "@/components/feedback/content-notice"; <Feedback.ContentNotice title={`No tasks.`} />;',
      errors: [{ messageId: "period" }],
    },
    {
      code: 'import { ContentNotice } from "@/components/feedback/content-notice"; <ContentNotice title="No tasks. " />;',
      errors: [{ messageId: "period" }],
    },
  ],
});
