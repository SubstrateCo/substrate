import { ruleTester } from "../test-support.ts";
import { recordSectionAction } from "./record-section-action.ts";

ruleTester.run("record-section-action", recordSectionAction, {
  valid: [
    '<RecordSection title="Contacts" actions={<RecordSectionAction label="Add contact"><Plus /></RecordSectionAction>} />',
    '<RecordSection title="Attachments" actions={<AttachFilesButton iconOnly />} />',
    '<RecordSection title="Scope" actions={<SegmentedControl value={scope} options={options} />} />',
    '<RecordSection title="Tools" actions={<Button variant="ghost" size="icon-sm" aria-label="Refresh"><RefreshCw /></Button>} />',
  ],
  invalid: [
    {
      code: '<RecordSection title="Contacts" actions={<Button variant="outline" size="sm"><Plus /> Add contact</Button>} />',
      errors: [{ messageId: "labelled", data: { component: "Button" } }],
    },
    {
      code: '<RecordSection title="Follow-ups" actions={canEdit && <Button onClick={add}>Add follow-up</Button>} />',
      errors: [{ messageId: "labelled", data: { component: "Button" } }],
    },
  ],
});
