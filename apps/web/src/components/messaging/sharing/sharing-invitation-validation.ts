import { z } from "zod";

export const sharingInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter an email address.")
    .pipe(z.email("Enter a complete email address.")),
  confirmed: z
    .boolean()
    .refine((confirmed) => confirmed, "Confirm that invited people can read all earlier messages."),
});
