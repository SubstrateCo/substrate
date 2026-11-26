import type { CrmActivityCursor, CrmActivityPage } from "@substrate/contracts/crm/activity";
import type { ApiInput } from "@substrate/contracts/http-result";

import { api } from "../client";
import { readResult } from "../result";

export const getCrmActivity = ({
  data,
  signal,
}: ApiInput<{
  organizationId: string;
  entityId: string;
  before?: CrmActivityCursor | null;
}>): Promise<CrmActivityPage> =>
  readResult(
    api.crm.activity.$get(
      {
        query: {
          organizationId: data.organizationId,
          entityId: data.entityId,
          limit: "20",
          beforeCreatedAt: data.before?.createdAt,
          beforeId: data.before?.id,
        },
      },
      { init: { signal } },
    ),
  );
