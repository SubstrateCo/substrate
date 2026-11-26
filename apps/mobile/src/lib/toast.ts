import { toastDriver } from "./notifications/driver";
import { createToastSession } from "./notifications/session";

const session = createToastSession(toastDriver);

/** Capture before awaiting work, so late results cannot cross a private reset. */
export const captureToast = session.capture;
export const resetToasts = session.reset;
export const mountToasts = session.mount;
