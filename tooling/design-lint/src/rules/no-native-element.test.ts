import { ruleTester } from "../test-support.ts";
import { noNativeElement } from "./no-native-element.ts";

ruleTester.run("no-native-element", noNativeElement, {
  valid: [
    'import { Button } from "@/components/ui/button"; <Button type="button">Save</Button>;',
    '<Heading level={2} variant="record">Launch plan</Heading>',
    '<input type="hidden" name="slug" value={slug} />',
    '<input type={"file"} hidden onChange={onFiles} />',
    "<section><p>Body</p></section>",
    '<a href="https://example.com">Docs</a>',
    "<a href={csv} download>Download CSV</a>",
    '<Button asChild size="sm"><a href={url} target="_blank" rel="noreferrer">Join</a></Button>',
    '<Item asChild size="xs"><button type="button">Helper</button></Item>',
  ],
  invalid: [
    { code: '<button type="button">Save</button>', errors: [{ messageId: "native" }] },
    { code: '<input type="text" name="title" />', errors: [{ messageId: "native" }] },
    { code: "<input type={kind} />", errors: [{ messageId: "native" }] },
    { code: "<input {...props} />", errors: [{ messageId: "native" }] },
    { code: '<label htmlFor="name">Name</label>', errors: [{ messageId: "native" }] },
    {
      code: '<h2 className="text-sm font-semibold">Members</h2>',
      errors: [{ messageId: "native" }],
    },
    { code: '<img src={src} alt="" />', errors: [{ messageId: "native" }] },
    {
      code: '<TooltipTrigger asChild><button type="button">Info</button></TooltipTrigger>',
      errors: [{ messageId: "native" }],
    },
    { code: "<select><option>One</option></select>", errors: [{ messageId: "native" }] },
    { code: "<pre>{output}</pre>", errors: [{ messageId: "native" }] },
    {
      code: '<a href={site} target="_blank" rel="noreferrer">{site}</a>',
      errors: [{ messageId: "native" }],
    },
    { code: '<progress aria-label="Uploading picture" />', errors: [{ messageId: "native" }] },
    {
      code: "<details><summary>Rules</summary>{rules}</details>",
      errors: [{ messageId: "native" }, { messageId: "native" }],
    },
    {
      code: "<table><tbody><tr><td>One</td></tr></tbody></table>",
      errors: [
        { messageId: "native" },
        { messageId: "native" },
        { messageId: "native" },
        { messageId: "native" },
      ],
    },
  ],
});
