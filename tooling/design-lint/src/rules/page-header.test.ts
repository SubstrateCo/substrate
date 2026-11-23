import { ruleTester } from "../test-support.ts";
import { pageHeader } from "./page-header.ts";

const heading = 'import { Heading } from "@/components/ui/heading";';

ruleTester.run("page-header", pageHeader, {
  valid: [
    'export const a = <PageHeader title="Needs you" />;',
    `${heading} export const a = <Heading level={2}>Activity</Heading>;`,
    // A record's own name in its sheet is content, not a page header.
    `${heading} export const a = <Heading level={2} variant="record">{task.title}</Heading>;`,
    'import { Heading } from "another-library"; export const a = <Heading level={1} />;',
    `${heading} function View(Heading) { return <Heading level={1} variant="page" />; }`,
  ],
  invalid: [
    {
      code: `${heading} export const a = <Heading level={1} variant="page">Needs you</Heading>;`,
      errors: [{ messageId: "pageTitle" }],
    },
    {
      // An h1 is the page's title whatever it looks like.
      code: `${heading} export const a = <Heading level={1}>Needs you</Heading>;`,
      errors: [{ messageId: "pageTitle" }],
    },
    {
      code: 'import * as Type from "../ui/heading"; export const a = <Type.Heading level={2} variant="page" />;',
      errors: [{ messageId: "pageTitle" }],
    },
    {
      code: `${heading} export const a = <Heading level={2} variant="section">General</Heading>;`,
      errors: [{ messageId: "sectionTitle" }],
    },
  ],
});
