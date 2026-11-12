import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { OrganizationMembers as OrganizationMembersView } from "./organization-members-view";
import { Button } from "@/components/ui/button";
import { memberActions, primaryRole } from "@/lib/organizations/member-policy";
import { resourceState } from "@/lib/resource-state";
import { sessionQueryOptions } from "@/queries/auth/session";
import { useOrganizationMutations } from "@/queries/organizations/mutations";
import {
  currentOrganizationQueryOptions,
  organizationQueryOptions,
} from "@/queries/organizations/options";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

const roleOrder = { owner: 0, admin: 1, member: 2 } as const;

export function OrganizationMembers({ organizationId }: { organizationId: string }) {
  const organization = useQuery(organizationQueryOptions(organizationId));
  const session = useQuery({ ...sessionQueryOptions(), staleTime: Infinity });
  const viewer = useQuery(currentOrganizationQueryOptions(organizationId));
  const { changeRole, removeMember } = useOrganizationMutations(organizationId);
  const viewerUserId = session.data?.user.id ?? "";
  const viewerRole = viewer.data?.role ?? "member";
  const resource = resourceState(organization);
  const members = resource.data?.members.map((member) => ({
    id: member.id,
    name: member.user.name,
    email: member.user.email,
    image: member.user.image,
    role: member.role,
    joinedAt: member.createdAt,
    self: member.userId === viewerUserId,
    ...memberActions({
      viewerRole,
      viewerUserId,
      memberRole: member.role,
      memberUserId: member.userId,
    }),
  }));
  members?.sort(
    (a, b) =>
      roleOrder[primaryRole(a.role)] - roleOrder[primaryRole(b.role)] ||
      a.name.localeCompare(b.name),
  );
  return (
    <OrganizationMembersView
      organizationName={resource.data?.name}
      state={resource.status}
      members={members}
      loading={organization.isPending}
      error={organization.error}
      onRetry={() => void organization.refetch()}
      inviteAction={
        primaryRole(viewerRole) === "owner" && (
          <Button asChild variant="outline">
            <Link to="/settings/organization/invitations">
              <UserPlus aria-hidden="true" />
              Invite people
            </Link>
          </Button>
        )
      }
      changing={changeRole.isPending || removeMember.isPending}
      changeError={changeRole.error ?? removeMember.error}
      onResetChange={() => {
        changeRole.reset();
        removeMember.reset();
      }}
      onChangeRole={(memberId, role, onDone) =>
        changeRole.mutate(
          { memberId, role },
          {
            onSuccess: () => {
              toast.success("Role changed");
              onDone();
            },
          },
        )
      }
      onRemove={(memberId, onDone) =>
        removeMember.mutate(memberId, {
          onSuccess: () => {
            toast.success("Member removed");
            onDone();
          },
        })
      }
    />
  );
}
