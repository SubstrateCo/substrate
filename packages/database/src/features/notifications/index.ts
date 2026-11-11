export type FeedRepository = Awaited<
  ReturnType<ReturnType<typeof import("../../repositories").createRepositories>["forSession"]>
>["feed"];
