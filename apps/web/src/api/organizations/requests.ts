import type { organizationWorkspace } from "@substrate/contracts/organizations/input";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

type Input = ApiInput<z.input<typeof organizationWorkspace>>;

export const getCurrentOrganization = ({ data, signal }: Input) =>
  readResult(api.organizations.current.$get({ query: data }, { init: { signal } }));
export const getOrganizationPeople = ({ data, signal }: Input) =>
  readResult(api.organizations.people.$get({ query: data }, { init: { signal } }));
export const getInvitationLink = ({
  data: { organizationId, invitationId },
  signal,
}: ApiInput<z.input<typeof organizationWorkspace> & { invitationId: string }>) =>
  readResult(
    api.organizations.invitations[":invitationId"].link.$get(
      { param: { invitationId }, query: { organizationId } },
      { init: { signal } },
    ),
  );
