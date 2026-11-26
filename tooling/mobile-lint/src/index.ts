import { iconButtonName } from "./rules/icon-button-name.ts";
import { nativeBoundaries } from "./rules/native-boundaries.ts";
import { noRawColors } from "./rules/no-raw-colors.ts";
import { usePrimitives } from "./rules/use-primitives.ts";

export default {
  meta: { name: "mobile" },
  rules: {
    "native-boundaries": nativeBoundaries,
    "no-raw-colors": noRawColors,
    "icon-button-name": iconButtonName,
    "use-primitives": usePrimitives,
  },
};
