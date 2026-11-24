import { organizationId, userWorkspace } from "../workspace.ts";
import { archiveTimeZone, calendarInput, listInput, manualMeeting } from "./model.ts";
import { z } from "zod";

// An expectation prevents a late file picker or form submission from crossing account switches.
// The server still derives identity, organization, and actor from the authenticated session.
export const workspace = z.object({ organizationId, expectedUserId: userWorkspace.shape.userId });
export const datedWorkspace = workspace.extend({ timeZone: archiveTimeZone.optional() });
export const recordId = z.object({ id: z.uuid() });
export const archiveList = workspace.extend({ query: listInput });
export const archiveCalendar = workspace.extend({ query: calendarInput });
export const createMeeting = workspace.extend({ meeting: manualMeeting, requestId: z.uuid() });
export const reviewDecision = workspace.extend({ candidateId: z.uuid(), combine: z.boolean() });
export const hexFileLimit = 16 * 1024 * 1024;
export const importMarkdown = z.object({ raw: z.string().min(1).max(hexFileLimit) });
