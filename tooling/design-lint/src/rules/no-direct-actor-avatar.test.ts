import { ruleTester } from "../test-support.ts";
import { noDirectActorAvatar } from "./no-direct-actor-avatar.ts";

ruleTester.run("no-direct-actor-avatar", noDirectActorAvatar, {
  valid: [
    'import { ActorAvatar } from "@/components/people/actor-avatar"; <ActorAvatar actor={actor} />;',
    'import { PersonAvatar } from "@/components/people/person-avatar"; <PersonAvatar name="Ada" />;',
    'import { AgentAvatarView } from "another-library"; <AgentAvatarView avatar={code} />;',
    'import { AgentAvatarView } from "@/components/agents/agent-avatar"; function View(AgentAvatarView) { return <AgentAvatarView avatar={code} />; }',
  ],
  invalid: [
    {
      code: 'import { AgentAvatarView } from "@/components/agents/agent-avatar"; import { PersonAvatar } from "@/components/people/person-avatar"; agent ? <AgentAvatarView avatar={code} /> : <PersonAvatar name={name} />;',
      errors: [{ messageId: "actor" }],
    },
    {
      code: 'import { AgentAvatarView as Look } from "../agents/agent-avatar"; <Look avatar={code} />;',
      errors: [{ messageId: "actor" }],
    },
    {
      code: 'import * as Agents from "@/components/agents/agent-avatar"; <Agents.AgentAvatarView avatar={code} />;',
      errors: [{ messageId: "actor" }],
    },
  ],
});
