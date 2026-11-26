import type { MailBody } from "@substrate/contracts/mail";

import { Newsletter, type ReadPicture } from "./newsletter";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { TextLink } from "@/components/ui/text-link";
import { mailHref, meetingDetails } from "@/lib/mail/body-text";
import { CalendarDays, ChevronRight, Video } from "lucide-react";

function plainLinks(text: string) {
  return text.split(/(https?:\/\/[^\s<>"']+)/gi).map((part, index) => {
    const trimmed = part
      .replace(/[.,;!?]+$/, "")
      .replace(/\)$/, (m) => (part.includes("(") ? m : ""));
    const href = mailHref(trimmed);
    return href ? (
      <span key={index}>
        <TextLink href={href}>{trimmed}</TextLink>
        {part.slice(trimmed.length)}
      </span>
    ) : (
      part
    );
  });
}
function plainContent(text: string) {
  return text
    .trim()
    .split(/(?:\r?\n[ \t]*){2,}/)
    .map((paragraph, i) => (
      <p className="whitespace-pre-line" key={i}>
        {plainLinks(paragraph)}
      </p>
    ));
}

export function MailBodyContent({
  body,
  id,
  readPicture,
}: {
  body: MailBody;
  id: string;
  readPicture: ReadPicture;
}) {
  const detail = meetingDetails(body.format === "plain" ? body.text : (body.plainText ?? ""));
  const content =
    body.format === "html" ? (
      <Newsletter html={body.text} id={id} readPicture={readPicture} />
    ) : (
      <div className="max-w-prose space-y-3">{plainContent(body.text)}</div>
    );
  return (
    <div className="min-w-0 space-y-3 text-sm/6 wrap-anywhere">
      {detail ? (
        <>
          <section
            aria-label="Meeting details"
            className="space-y-3 rounded-lg border bg-background p-4"
          >
            <div className="flex items-start gap-2">
              <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">{detail.when}</p>
                {detail.zone && <p className="text-xs text-muted-foreground">{detail.zone}</p>}
                {detail.changed && (
                  <p className="mt-1 text-xs text-muted-foreground">{detail.changed}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="sm">
                <a href={detail.meet} target="_blank" rel="noopener noreferrer">
                  <Video aria-hidden />
                  Join Google Meet
                </a>
              </Button>
              {detail.reschedule && <TextLink href={detail.reschedule}>Reschedule</TextLink>}
              {detail.cancel && <TextLink href={detail.cancel}>Cancel meeting</TextLink>}
            </div>
          </section>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="disclosure" size="sm" className="group">
                <ChevronRight aria-hidden className="group-aria-expanded:rotate-90" />
                Full invitation
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-2 pt-2">{content}</div>
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : (
        content
      )}
    </div>
  );
}
