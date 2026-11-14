import { ruleTester } from "../test-support.ts";
import { iconButtonName, iconButtonTooltip } from "./icon-buttons.ts";

const wrapped = (button: string) =>
  `export const a = <Tooltip><TooltipTrigger asChild>${button}</TooltipTrigger><TooltipContent>Delete agent</TooltipContent></Tooltip>;`;

ruleTester.run("icon-button-name", iconButtonName, {
  valid: [
    wrapped('<Button size="icon-sm" aria-label="Delete agent"><Trash2 /></Button>'),
    '<Button size="icon" aria-labelledby="title-id"><X /></Button>',
    '<Button size="icon-xs"><Plus /><span className="sr-only">New task</span></Button>',
    '<Button size="icon-sm"><Plus />{label}</Button>',
    // Labelled buttons are not icon-only.
    '<Button size="sm"><Plus />New task</Button>',
    // Props the file cannot see may carry the name.
    '<Button size="icon-sm" {...props}><X /></Button>',
    '<Button size="icon-sm" asChild><Link to="/" aria-label="Home"><House /></Link></Button>',
  ],
  invalid: [
    {
      code: '<Button variant="ghost" size="icon-sm"><Trash2 /></Button>',
      errors: [
        {
          message:
            'Icon-only <Button size="icon-sm"> has no accessible name, so screen readers announce only "button". Add aria-label with the action ("Delete agent", "New project"), and show the same words in <Tooltip><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent>same words as aria-label</TooltipContent></Tooltip> from "@/components/ui/tooltip". See apps/web/DESIGN.md § 4 Icons, Action placement.',
        },
      ],
    },
    {
      // An icon element alone is not a name, even inside a tooltip.
      code: wrapped('<PendingButton size="icon" pending={saving}><RefreshCw /></PendingButton>'),
      errors: [{ messageId: "missing", data: { component: "PendingButton", size: "icon" } }],
    },
  ],
});

ruleTester.run("icon-button-tooltip", iconButtonTooltip, {
  valid: [
    wrapped('<Button size="icon-sm" aria-label="Delete agent"><Trash2 /></Button>'),
    // A menu trigger inside the tooltip trigger.
    wrapped(
      '<DropdownMenuTrigger asChild><Button size="icon-sm" aria-label="More actions"><Ellipsis /></Button></DropdownMenuTrigger>',
    ),
    '<Button size="sm">Save</Button>',
    // A square button that shows text, such as a page number, explains itself.
    '<Button size="icon" aria-label={`Go to page ${page + 1}`}>{page + 1}</Button>',
    '<Button size="icon-sm" aria-label="Initials">AB</Button>',
    '<Button size="icon" aria-label={name}><span className="text-lg">{emoji}</span></Button>',
  ],
  invalid: [
    {
      code: '<Button variant="ghost" size="icon-sm" aria-label="Close task"><X /></Button>',
      errors: [
        {
          message:
            'Icon-only <Button> "Close task" has no tooltip, so sighted users have to guess what the icon does. Wrap it in <Tooltip><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent>same words as aria-label</TooltipContent></Tooltip> from "@/components/ui/tooltip". For a menu or popover trigger, put DropdownMenuTrigger asChild inside TooltipTrigger asChild. See apps/web/DESIGN.md § 4 Icons, Action placement.',
        },
      ],
    },
    {
      code: '<DropdownMenuTrigger asChild><Button size="icon-sm" aria-label="More actions"><Ellipsis /></Button></DropdownMenuTrigger>',
      errors: [{ messageId: "missing", data: { component: "Button", label: ' "More actions"' } }],
    },
    {
      // Screen-reader text is not visible, so the icon still needs a tooltip.
      code: '<Button size="icon-sm"><X /><span className="sr-only">Close</span></Button>',
      errors: [{ messageId: "missing", data: { component: "Button", label: "" } }],
    },
    {
      code: '<Button size="icon-sm" aria-label={label}><X /></Button>',
      errors: [{ messageId: "missing", data: { component: "Button", label: "" } }],
    },
  ],
});
