import { environment, type ServerEnvironment } from "../environment";
import { ObjectNotFoundError, type ObjectStorage } from "./types";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function createS3Storage(
  config: ServerEnvironment["storage"] = environment.storage,
): ObjectStorage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    requestHandler: { requestTimeout: 30_000, connectionTimeout: 5_000 },
  });
  const Bucket = config.bucket;
  return {
    async signUpload(key, contentType, size) {
      const command = new PutObjectCommand({
        Bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
      });
      const url = await getSignedUrl(client, command, {
        expiresIn: 600,
        signableHeaders: new Set(["content-type", "content-length"]),
      });
      return { url, headers: { "Content-Type": contentType } };
    },
    async read(key, maxBytes) {
      let object: GetObjectCommandOutput;
      try {
        object = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      } catch (error) {
        if (error instanceof Error && ["NoSuchKey", "NotFound"].includes(error.name))
          throw new ObjectNotFoundError("Object not found.", { cause: error });
        throw error;
      }
      if (!object.Body) throw new Error("Object has no body.");
      if (object.ContentLength !== undefined && object.ContentLength > maxBytes) {
        await object.Body.transformToWebStream().cancel();
        throw new RangeError("Object exceeds size limit.");
      }
      const reader = object.Body.transformToWebStream().getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const result = await reader.read();
          if (result.done) break;
          length += result.value.length;
          if (length > maxBytes) throw new RangeError("Object exceeds size limit.");
          chunks.push(result.value);
        }
      } finally {
        await reader.cancel();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return bytes;
    },
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          CacheControl: "private, no-store",
        }),
      );
    },
    async putImmutable(key, bytes, contentType) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket,
            Key: key,
            Body: bytes,
            ContentType: contentType,
            IfNoneMatch: "*",
          }),
        );
      } catch (error) {
        // The key contains the verified content hash. A previous identical completion may own it.
        if (!(error instanceof Error && "name" in error && error.name === "PreconditionFailed"))
          throw error;
      }
    },
    signDownload(key, disposition) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseContentDisposition: disposition,
          ResponseContentType: disposition.startsWith("attachment;")
            ? "application/octet-stream"
            : undefined,
          ResponseCacheControl: "private, no-store",
        }),
        { expiresIn: 60 },
      );
    },
    async removeMany(keys) {
      if (!keys.length) return [];
      const result = await client.send(
        new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }),
      );
      const requested = new Set(keys);
      return (result.Deleted ?? []).flatMap(({ Key }) => (Key && requested.has(Key) ? [Key] : []));
    },
  };
}
