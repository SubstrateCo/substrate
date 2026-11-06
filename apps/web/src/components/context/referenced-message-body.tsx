import { useQuery } from "@tanstack/react-query";
import { MessageMarkdown } from "@startup-os/ui/messaging/message-markdown";
import { messageLinksOptions, messagePeopleOptions } from "@/queries/context/options";
import { workHref } from "@/lib/context-links";

export function ReferencedMessageBody({
  organizationId,
  messageId,
  body,
}: {
  organizationId: string;
  messageId: string;
  body: string;
}) {
  const links = useQuery(messageLinksOptions(organizationId, messageId));
  const people = useQuery({
    ...messagePeopleOptions(organizationId, messageId),
    enabled: body.includes("@[person:"),
  });
  const parts = body.split(/(@\[(?:task|project|person):[0-9a-f-]{36}\])/gi);
  return (
    <div className="flex flex-wrap items-baseline gap-x-1 text-sm">
      {parts.map((part, index) => {
        const match = /^@\[(task|project|person):([0-9a-f-]{36})\]$/i.exec(part);
        if (!match) return <MessageMarkdown key={index} body={part} />;
        const link = links.error
          ? undefined
          : links.data?.find((item) => item.entityId === match[2]);
        if (link)
          return (
            <a
              key={index}
              className="rounded bg-accent px-1 underline"
              href={workHref(
                organizationId,
                link.projectEntityId,
                link.entityType === "task" ? link.entityId : undefined,
              )}
            >
              {link.title}
              {link.statusName ? ` · ${link.statusName}` : ""}
            </a>
          );
        const person = people.error ? undefined : people.data?.find((item) => item.id === match[2]);
        return (
          <span key={index} className="text-muted-foreground">
            {person ? `@${person.name}` : "[Unavailable reference]"}
          </span>
        );
      })}
    </div>
  );
}
