import { at, root, ruleTester } from "../test-support.ts";
import { ownedInserts } from "./owned-inserts.ts";

const options = [{ tables: { inbox: { files: ["store/enqueue.ts"], use: "`enqueue()`" } } }];
const importInbox = 'import { inbox } from "./schema";\n';

ruleTester.run("owned-inserts", ownedInserts(root), {
  valid: [
    {
      code: `${importInbox}db.insert(inbox).values(item);`,
      filename: at("store/enqueue.ts"),
      options,
    },
    { code: `${importInbox}db.update(inbox).set(item);`, filename: at("store/turns.ts"), options },
    {
      code: "const inbox = items();\nqueue.insert(inbox);",
      filename: at("store/turns.ts"),
      options,
    },
  ],
  invalid: [
    {
      code: `${importInbox}await db.insert(inbox).values(item);`,
      filename: at("store/turns.ts"),
      options,
      errors: [{ messageId: "owned", data: { table: "inbox", use: "`enqueue()`" } }],
    },
  ],
});
