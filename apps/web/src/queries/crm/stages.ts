import { useQuery } from "@tanstack/react-query";

import { pipelineOptions } from "./options";
import { resourceState } from "@/lib/resource-state";

/** The pipeline query and its active (not retired) stages, as rows and as select options. */
export function useActiveStages(organizationId: string, enabled: boolean) {
  const pipeline = useQuery({ ...pipelineOptions(organizationId), enabled });
  const stages = (resourceState(pipeline).data ?? []).filter((stage) => !stage.retired);
  return {
    pipeline,
    stages,
    options: stages.map((stage) => ({ value: stage.id, label: stage.name })),
  };
}
