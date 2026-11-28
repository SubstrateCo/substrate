import { id, page, pageInput, timestamp } from "./shared.ts";
import { z } from "zod";

/** Characters of text read_file returns per call. */
export const fileTextPage = 20_000;

/**
 * Where a file is attached. A file ID alone grants nothing: every read checks access to the
 * message or task the file is attached to.
 */
export const fileLocator = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("message_attachment"), messageId: id, attachmentId: id }).strict(),
    z.object({ type: z.literal("task_attachment"), taskId: id, attachmentId: id }).strict(),
  ])
  .describe("Where the file is attached. Copy it from a file in a tool result.");

/** A file attached to a message or task that the reader can open. */
const fileRef = z.object({
  file: fileLocator,
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int().describe("Bytes."),
});
export const fileRefs = z
  .array(fileRef)
  .describe("Attached files. Open one with read_file, or save it with download_file.");

const imageContent = z.object({
  kind: z.literal("image"),
  mimeType: z.literal("image/webp"),
  data: z.string().describe("Base64. The host shows it to you as an image."),
});
const textContent = z.object({
  kind: z.literal("text"),
  text: z.string(),
  offset: z.number().int(),
  nextOffset: z
    .number()
    .int()
    .nullable()
    .describe("Pass as offset to read the next part. Null at the end of the file."),
});
const unavailableContent = z.object({
  kind: z.literal("unavailable"),
  reason: z.string(),
});
const fileContent = z.discriminatedUnion("kind", [imageContent, textContent, unavailableContent]);

const mediaType = z
  .string()
  .trim()
  .min(1)
  .max(127)
  .describe('A media type or its start, such as "image/" or "application/pdf".');

export const fileTools = {
  list_files: {
    title: "List files",
    description:
      "List files attached to messages and tasks you can open, newest first. Filter by words in the filename, media type or where they are attached. The tools that read a message or a task already list its files.",
    readOnly: true,
    input: z
      .object({
        query: z.string().trim().min(1).max(200).optional().describe("Words in the filename."),
        mediaType: mediaType.optional(),
        attachedTo: z
          .enum(["message", "task"])
          .optional()
          .describe("Only files attached to messages, or only files attached to tasks."),
        ...pageInput,
      })
      .strict(),
    output: page(fileRef.extend({ attachedAt: timestamp })),
  },
  read_file: {
    title: "Read file",
    description:
      "Open a file you can access. An image (PNG, JPEG, WebP or GIF) returns a preview that you can see. A text file (plain text, Markdown, CSV, JSON, XML, YAML, code) returns its text in parts; pass nextOffset for the next part. Other files return unavailable: use download_file and your own tools for them.",
    readOnly: true,
    input: z
      .object({
        file: fileLocator,
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Text files only: the character to start at."),
      })
      .strict(),
    output: fileRef.extend({ content: fileContent }),
  },
  download_file: {
    title: "Download file",
    description:
      "Save the original bytes of a file you can access into your working folder, so your own tools can open it. Returns the saved path. Do not share the bytes with people who cannot open the file's message or task.",
    readOnly: true,
    input: z.object({ file: fileLocator }).strict(),
    output: fileRef.extend({ data: z.string().describe("Base64 of the original bytes.") }),
  },
} as const;
