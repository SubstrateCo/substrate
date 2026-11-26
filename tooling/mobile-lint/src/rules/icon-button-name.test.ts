import { ruleTester } from "../test-support.ts";
import { iconButtonName } from "./icon-button-name.ts";

const button = (jsx: string) => `import { Button } from "@/components/ui/button"; ${jsx};`;

ruleTester.run("icon-button-name", iconButtonName, {
  valid: [
    button('<Button size="icon" accessibilityLabel="Close"><X /></Button>'),
    button('<Button size="icon" accessibilityLabel={label}><X /></Button>'),
    button('<Button size="icon" accessibilityLabelledBy="close-label" />'),
    button('<Button size="icon" aria-label="Close" />'),
    button('<Button size="icon" aria-labelledby="close-label" />'),
    button('<Button size="icon" {...props} />'),
    button('<Button size="icon" asChild><Link href="/" /></Button>'),
    button('<Button size="default"><Text>Save</Text></Button>'),
    'import { Button } from "./unrelated"; <Button size="icon" />;',
    'import { Button } from "@/components/ui/button"; function A(Button) { return <Button size="icon" />; }',
  ],
  invalid: [
    ...[
      button('<Button size="icon"><X /></Button>'),
      button('<Button size="icon-sm" accessibilityLabel="" />'),
      button('<Button size="icon" accessibilityLabel={"  "} />'),
      button('<Button size="icon" accessibilityLabel={null} />'),
      button('<Button size="icon" accessibilityLabel={false} />'),
      button('<Button size="icon" accessibilityLabel={undefined} />'),
      button('<Button size="icon" title="Close" accessibilityHint="Close" />'),
      'import { Button as Action } from "@/components/ui/button"; <Action size="icon" />;',
      'import * as Buttons from "../ui/button"; <Buttons.Button size="icon" />;',
      'import { IconButton } from "@/components/ui/icon-button"; <IconButton />;',
    ].map((code) => ({ code, errors: [{ messageId: "missing" }] })),
  ],
});
