import type { CalendarInput, ManualMeeting, MeetingListInput } from "@substrate/contracts/meetings";
import { hexFileLimit } from "@substrate/contracts/meetings/input";

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope-types";
import { ServiceError, serviceResult } from "../../shared/service-result";
import { readHexMarkdown } from "./hex-markdown";
import { createHash } from "node:crypto";

export function createMeetingService(publish: CommittedPublisher) {
  return {
    list: (s: WorkspaceScope, q: MeetingListInput) =>
      serviceResult(() => s.repositories.meetings.list(q)),
    calendar: (s: WorkspaceScope, q: CalendarInput) =>
      serviceResult(() => s.repositories.meetings.calendar(q)),
    detail: (s: WorkspaceScope, id: string, zone?: string) =>
      serviceResult(() => s.repositories.meetings.detail(id, zone)),
    original: (s: WorkspaceScope, id: string) =>
      serviceResult(() => s.repositories.meetings.original(id)),
    reviews: (s: WorkspaceScope, zone?: string) =>
      serviceResult(() => s.repositories.meetings.reviews(zone)),
    sources: (s: WorkspaceScope) => serviceResult(() => s.repositories.meetings.sources()),
    create: (s: WorkspaceScope, meeting: ManualMeeting, requestId: string) =>
      serviceResult(async () => publish(await s.repositories.meetings.create(meeting, requestId))),
    decide: (s: WorkspaceScope, id: string, candidateId: string, combine: boolean) =>
      serviceResult(async () =>
        publish(await s.repositories.meetings.decide(id, candidateId, combine)),
      ),
    importHex: (s: WorkspaceScope, raw: string) =>
      serviceResult(async () => {
        if (Buffer.byteLength(raw) > hexFileLimit)
          throw new ServiceError("PAYLOAD_TOO_LARGE", "Choose a Markdown file of 16 MiB or less.");
        let record;
        try {
          record = readHexMarkdown(
            raw,
            `markdown:${createHash("sha256").update(raw).digest("hex")}`,
          );
        } catch {
          throw new ServiceError("INVALID_INPUT", "Choose a complete Hex meeting Markdown export.");
        }
        return publish(await s.repositories.meetings.importHex(record));
      }),
  };
}
export type MeetingService = ReturnType<typeof createMeetingService>;
