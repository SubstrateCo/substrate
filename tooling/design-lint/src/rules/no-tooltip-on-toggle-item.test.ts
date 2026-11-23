import { ruleTester } from "../test-support.ts";
import { noTooltipOnToggleItem } from "./no-tooltip-on-toggle-item.ts";

ruleTester.run("no-tooltip-on-toggle-item", noTooltipOnToggleItem, {
  valid: [
    '<Tooltip><TooltipTrigger asChild><span><ToggleGroupItem value="a" /></span></TooltipTrigger></Tooltip>',
    '<Tooltip><TooltipTrigger asChild><Button aria-label="Close" /></TooltipTrigger></Tooltip>',
  ],
  invalid: [
    {
      code: '<Tooltip><TooltipTrigger asChild><ToggleGroupItem value="a">A</ToggleGroupItem></TooltipTrigger></Tooltip>',
      errors: [
        {
          message:
            '<TooltipTrigger asChild> around <ToggleGroupItem> overwrites the item\'s data-state with "closed", so the chosen option loses its selected look. Put the tooltip trigger on a wrapping <span>, or use <SegmentedControl> from "@/components/forms/segmented-control" for a choice among 2–4 options.',
        },
      ],
    },
  ],
});
