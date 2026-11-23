import { ruleTester } from "../test-support.ts";
import { sheetHeaderTools } from "./sheet-header-tools.ts";

ruleTester.run("sheet-header-tools", sheetHeaderTools, {
  valid: [
    '<PageSheetHeader title="Deal" />',
    '<PageSheetHeader title="Deal" actions={<><EditTool />{canCopy && <CopyLink link={link} />}<RecordActionsMenu /></>} />',
    // Tools built elsewhere are out of sight.
    '<PageSheetHeader title="Deal" actions={tools} />',
  ],
  invalid: [
    {
      code: '<PageSheetHeader title="Deal" actions={<><EditTool /><CopyLink link={link} /><OpenTool /><ShareTool /><RecordActionsMenu /></>} />',
      errors: [{ messageId: "tooMany", data: { count: "5" } }],
    },
  ],
});
