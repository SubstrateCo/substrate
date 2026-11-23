import { ruleTester } from "../test-support.ts";
import { entityKindMap } from "./entity-kind-map.ts";

ruleTester.run("entity-kind-map", entityKindMap, {
  valid: [
    // Labels only, and fewer than three kinds.
    'const labels = { task: "Task", project: "Project", deal: "Deal" };',
    'import { ListTodo, FolderKanban } from "lucide-react";\nconst icons = { task: ListTodo, project: FolderKanban };',
    // Local components are not lucide icons.
    "const views = { task: TaskView, project: ProjectView, deal: DealView };",
  ],
  invalid: [
    {
      code: 'import { Bot, Handshake, ListTodo } from "lucide-react";\nconst icons = { task: ListTodo, deal: Handshake, agent: Bot };',
      errors: [{ messageId: "localMap", data: { kinds: "task, deal, agent" } }],
    },
    {
      code: 'import { Contact, Building2, Hash } from "lucide-react";\nconst kinds = { contact: { icon: Contact, label: "Contact" }, account: { icon: Building2, label: "Account" }, channel: { icon: Hash, label: "Channel" } };',
      errors: [{ messageId: "localMap", data: { kinds: "contact, account, channel" } }],
    },
  ],
});
