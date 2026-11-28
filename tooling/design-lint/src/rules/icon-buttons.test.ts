import { ruleTester } from "../test-support.ts";
import { iconButtonName } from "./icon-buttons.ts";

const wrapped = (button: string) =>
  `export const a = <Tooltip><TooltipTrigger asChild>${button}</TooltipTrigger><TooltipContent>Delete agent</TooltipContent></Tooltip>;`;

ruleTester.run("icon-button-name", iconButtonName, {
  valid: [
    wrapped('<Button size="icon-sm" aria-label="Delete agent"><Trash2 /></Button>'),
    '<Button size="icon" aria-labelledby="title-id"><X /></Button>',
    '<Button size="icon-xs"><Plus /><span className="sr-only">New task</span></Button>',
    '<Button size="icon-sm"><Plus />{label}</Button>',
    '<Button size="sm"><Plus />New task</Button>',
    '<Button size="icon-sm" {...props}><X /></Button>',
    '<Button size="icon-sm" asChild><Link to="/" aria-label="Home"><House /></Link></Button>',
  ],
  invalid: [
    {
      code: '<Button variant="ghost" size="icon-sm"><Trash2 /></Button>',
      errors: [
        {
          message:
            'Icon-only <Button size="icon-sm"> has no accessible name, so screen readers announce only "button". Add aria-label with the action ("Delete agent", "New project"). See apps/web/DESIGN.md § 4 Icons, Action placement.',
        },
      ],
    },
    {
      code: wrapped('<PendingButton size="icon" pending={saving}><RefreshCw /></PendingButton>'),
      errors: [{ messageId: "missing", data: { component: "PendingButton", size: "icon" } }],
    },
  ],
});
