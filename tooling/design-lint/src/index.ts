import { actionCopy } from "./rules/action-copy.ts";
import { backLink } from "./rules/back-link.ts";
import { canonicalIcons } from "./rules/canonical-icons.ts";
import { conversationLabel } from "./rules/conversation-label.ts";
import { destructiveLabel } from "./rules/destructive-label.ts";
import { dialogFooterOrder } from "./rules/dialog-footer-order.ts";
import { dialogStructure } from "./rules/dialog-structure.ts";
import { elevation } from "./rules/elevation.ts";
import { entityKindMap } from "./rules/entity-kind-map.ts";
import { formCopy } from "./rules/form-copy.ts";
import { guestCopy } from "./rules/guest-copy.ts";
import { iconButtonName, iconButtonTooltip } from "./rules/icon-buttons.ts";
import { motion } from "./rules/motion.ts";
import { noAdhocDateFormat } from "./rules/no-adhoc-date-format.ts";
import { noEllipsis } from "./rules/no-ellipsis.ts";
import { noNativeActionTitle } from "./rules/no-native-action-title.ts";
import { noNativeDateInput } from "./rules/no-native-date-input.ts";
import { noNativeDialogs } from "./rules/no-native-dialogs.ts";
import { noNativeElement } from "./rules/no-native-element.ts";
import { noOpacityTint } from "./rules/no-opacity-tint.ts";
import { noPressedOutline } from "./rules/no-pressed-outline.ts";
import { noRawErrorMessage } from "./rules/no-raw-error-message.ts";
import { noRawValidationText } from "./rules/no-raw-validation-text.ts";
import { noSolidDestructive } from "./rules/no-solid-destructive.ts";
import { noTooltipOnToggleItem } from "./rules/no-tooltip-on-toggle-item.ts";
import { noticePlacement } from "./rules/notice-placement.ts";
import { noticeTitle } from "./rules/notice-title.ts";
import { pageHeader } from "./rules/page-header.ts";
import { pageWidth } from "./rules/page-width.ts";
import { paneHeader } from "./rules/pane-header.ts";
import { pendingButton } from "./rules/pending-button.ts";
import { personAvatar } from "./rules/person-avatar.ts";
import { radiusScale } from "./rules/radius-scale.ts";
import { recordSectionAction } from "./rules/record-section-action.ts";
import { selectedChoice } from "./rules/selected-choice.ts";
import { sentenceCase } from "./rules/sentence-case.ts";
import { sheetHeaderTools } from "./rules/sheet-header-tools.ts";
import { typeScale } from "./rules/type-scale.ts";
import { typographicQuotes } from "./rules/typographic-quotes.ts";

/** Design-contract rules for the Substrate renderer. Messages point to apps/web/DESIGN.md. */
export default {
  meta: { name: "design" },
  rules: {
    "action-copy": actionCopy,
    "back-link": backLink,
    "canonical-icons": canonicalIcons,
    "conversation-label": conversationLabel,
    "destructive-label": destructiveLabel,
    "dialog-footer-order": dialogFooterOrder,
    "dialog-structure": dialogStructure,
    elevation,
    "entity-kind-map": entityKindMap,
    "form-copy": formCopy,
    "guest-copy": guestCopy,
    "icon-button-name": iconButtonName,
    "icon-button-tooltip": iconButtonTooltip,
    motion,
    "no-adhoc-date-format": noAdhocDateFormat,
    "no-ellipsis": noEllipsis,
    "no-native-action-title": noNativeActionTitle,
    "no-native-date-input": noNativeDateInput,
    "no-native-dialogs": noNativeDialogs,
    "no-native-element": noNativeElement,
    "no-opacity-tint": noOpacityTint,
    "no-pressed-outline": noPressedOutline,
    "no-raw-error-message": noRawErrorMessage,
    "no-raw-validation-text": noRawValidationText,
    "no-solid-destructive": noSolidDestructive,
    "no-tooltip-on-toggle-item": noTooltipOnToggleItem,
    "notice-placement": noticePlacement,
    "notice-title": noticeTitle,
    "page-header": pageHeader,
    "page-width": pageWidth,
    "pane-header": paneHeader,
    "pending-button": pendingButton,
    "person-avatar": personAvatar,
    "radius-scale": radiusScale,
    "record-section-action": recordSectionAction,
    "selected-choice": selectedChoice,
    "sentence-case": sentenceCase,
    "sheet-header-tools": sheetHeaderTools,
    "type-scale": typeScale,
    "typographic-quotes": typographicQuotes,
  },
};
