import { z } from "zod";

const senderURL = z.object({ url: z.url() });
export function trustedSender(
  event: { sender: unknown; senderFrame: unknown },
  contents: { mainFrame: unknown } | undefined,
  rendererURL: string,
): boolean {
  if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame)
    return false;
  const frame = senderURL.safeParse(event.senderFrame);
  return frame.success && new URL(frame.data.url).origin === new URL(rendererURL).origin;
}
