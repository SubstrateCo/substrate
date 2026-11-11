export type ContextRepository = Awaited<
  ReturnType<ReturnType<typeof import("../../repositories").createRepositories>["forSession"]>
>["context"];
