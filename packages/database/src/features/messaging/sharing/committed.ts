import { committedWrite } from "../../../core/effects";
import * as connections from "./connections";
import * as mail from "./mail";

export const claimSharingMail = committedWrite(mail.claimSharingMail);
export const finishSharingMail = committedWrite(mail.finishSharingMail);
export const clearMembershipSharing = committedWrite(connections.clearMembershipSharing);
