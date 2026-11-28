import { iconButtonName } from "./rules/icon-buttons.ts";
import { noAdhocDateFormat } from "./rules/no-adhoc-date-format.ts";
import { noDecorativeClass } from "./rules/no-decorative-class.ts";
import { noDirectActorAvatar } from "./rules/no-direct-actor-avatar.ts";
import { noNativeDateInput } from "./rules/no-native-date-input.ts";
import { noNativeElement } from "./rules/no-native-element.ts";
import { noRawErrorMessage } from "./rules/no-raw-error-message.ts";
import { noTooltipOnToggleItem } from "./rules/no-tooltip-on-toggle-item.ts";

export default {
  meta: { name: "design" },
  rules: {
    "icon-button-name": iconButtonName,
    "no-adhoc-date-format": noAdhocDateFormat,
    "no-decorative-class": noDecorativeClass,
    "no-direct-actor-avatar": noDirectActorAvatar,
    "no-native-date-input": noNativeDateInput,
    "no-native-element": noNativeElement,
    "no-raw-error-message": noRawErrorMessage,
    "no-tooltip-on-toggle-item": noTooltipOnToggleItem,
  },
};
