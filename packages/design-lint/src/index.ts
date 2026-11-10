import { canonicalIcons } from "./rules/canonical-icons.ts";
import { conversationLabel } from "./rules/conversation-label.ts";
import { dialogFooterOrder } from "./rules/dialog-footer-order.ts";
import { dialogStructure } from "./rules/dialog-structure.ts";
import { iconButtonName, iconButtonTooltip } from "./rules/icon-buttons.ts";
import { motion } from "./rules/motion.ts";
import { noAdhocDateFormat } from "./rules/no-adhoc-date-format.ts";
import { noNativeDialogs } from "./rules/no-native-dialogs.ts";
import { noPressedOutline } from "./rules/no-pressed-outline.ts";
import { noRawErrorMessage } from "./rules/no-raw-error-message.ts";
import { noRawValidationText } from "./rules/no-raw-validation-text.ts";
import { noSolidDestructive } from "./rules/no-solid-destructive.ts";
import { noTooltipOnToggleItem } from "./rules/no-tooltip-on-toggle-item.ts";
import { pageHeader } from "./rules/page-header.ts";
import { sentenceCase } from "./rules/sentence-case.ts";
import { typographicQuotes } from "./rules/typographic-quotes.ts";

/** Design-contract rules for the Startup OS renderer. Messages point to apps/web/DESIGN.md. */
export default {
  meta: { name: "design" },
  rules: {
    "canonical-icons": canonicalIcons,
    "conversation-label": conversationLabel,
    "dialog-footer-order": dialogFooterOrder,
    "dialog-structure": dialogStructure,
    "icon-button-name": iconButtonName,
    "icon-button-tooltip": iconButtonTooltip,
    motion,
    "no-adhoc-date-format": noAdhocDateFormat,
    "no-native-dialogs": noNativeDialogs,
    "no-pressed-outline": noPressedOutline,
    "no-raw-error-message": noRawErrorMessage,
    "no-raw-validation-text": noRawValidationText,
    "no-solid-destructive": noSolidDestructive,
    "no-tooltip-on-toggle-item": noTooltipOnToggleItem,
    "page-header": pageHeader,
    "sentence-case": sentenceCase,
    "typographic-quotes": typographicQuotes,
  },
};
