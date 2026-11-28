import { elementImport, type Rule } from "../ast.ts";

export const noDirectActorAvatar: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Show someone who may be an agent with ActorAvatar." },
    messages: {
      actor:
        'Use <ActorAvatar actor={...}> from "@/components/people/actor-avatar". It is the only place that picks AgentAvatarView or PersonAvatar; ActorKindTag and ActorKindSuffix name an agent. Build the actor with actorIdentity from "@/lib/actors/identity". AgentAvatarView is only for views that show nothing but agents.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const imported = elementImport(context, node);
        if (imported?.name !== "AgentAvatarView") return;
        if (!/^(?:@\/components\/|\.\.?\/)(?:.*\/)?agent-avatar(?:\.tsx?)?$/.test(imported.source))
          return;
        context.report({ node, messageId: "actor" });
      },
    };
  },
};
