import { ownOrganizationFirst, type ChannelOrganization } from "./channel-organizations";
import { Tag } from "@/components/feedback/tag";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ChevronDown, Globe } from "lucide-react";

export function ConversationOrganizations({
  organizations,
  members,
}: {
  organizations: ChannelOrganization[];
  members: { organizationId: string }[];
}) {
  const wide = useMediaQuery("(min-width: 768px)");
  const ordered = ownOrganizationFirst(organizations);
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="disclosure" size={wide ? "sm" : "icon-sm"} aria-label="Organizations">
              <Globe aria-hidden="true" />
              <span className="max-md:hidden">Organizations</span>
              <ChevronDown aria-hidden="true" data-icon="inline-end" className="max-md:hidden" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Organizations</TooltipContent>
      </Tooltip>
      <PopoverContent
        variant="reference"
        align="end"
        className="w-80"
        aria-label="Organizations in this channel"
      >
        <p className="px-4 pt-4 pb-1 text-xs font-medium text-muted-foreground">
          Organizations in this channel
        </p>
        <ul className="max-h-80 space-y-1 overflow-y-auto p-2">
          {ordered.map((org) => {
            const count = members.filter((member) => member.organizationId === org.id).length;
            return (
              <li key={org.id} className="px-2 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 font-medium wrap-break-word">{org.name}</span>
                  {org.host && <Tag>Host</Tag>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {org.own ? "Your organization" : "Connected organization"} · {count}{" "}
                  {count === 1 ? "member" : "members"}
                </p>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
