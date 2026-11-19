import { ruleTester } from "../test-support.ts";
import { noPressedOutline } from "./no-pressed-outline.ts";

ruleTester.run("no-pressed-outline", noPressedOutline, {
  valid: [
    '<SegmentedControl aria-label="Theme" value={theme} options={options} onValueChange={setTheme} />',
    // Ghost and reaction buttons style aria-pressed.
    '<Button variant="ghost" aria-pressed={bold}><Bold /></Button>',
    '<Button variant="reaction" aria-pressed={mine}>👍 2</Button>',
    '<Button variant="outline">Fit</Button>',
  ],
  invalid: [
    {
      code: '<Button variant="outline" aria-pressed={mode === "fit"} onClick={() => setMode("fit")}>Fit whole logo</Button>',
      errors: [
        {
          message:
            'An outline <Button> with aria-pressed has no selected look, so people cannot tell which option is on once focus moves away. For one choice among 2–4 short options use <SegmentedControl> from "@/components/forms/segmented-control"; for a single on/off control use Toggle from "@/components/ui/toggle-group". See apps/web/DESIGN.md § 1 Primitives.',
        },
      ],
    },
  ],
});
