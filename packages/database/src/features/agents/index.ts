export type AgentRepository = Awaited<
  ReturnType<ReturnType<typeof import("../../repositories").createRepositories>["forOwnerSession"]>
>["agents"];
