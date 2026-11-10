import { ruleTester } from "../test-support.ts";
import { personAvatar } from "./person-avatar.ts";

ruleTester.run("person-avatar", personAvatar, {
  valid: [
    '<PersonAvatar name="Ada Lovelace" />',
    // Larger heads are Avatars.
    '<Avatar variant="message" className="size-9"><AvatarFallback>AL</AvatarFallback></Avatar>',
    '<Avatar size="sm"><AvatarImage src={url} /></Avatar>',
  ],
  invalid: [
    {
      code: '<Avatar size="sm" variant="user"><AvatarFallback>{initials(name)}</AvatarFallback></Avatar>',
      errors: [{ messageId: "handBuilt" }],
    },
  ],
});
