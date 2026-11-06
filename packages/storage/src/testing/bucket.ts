import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { storageEnvironment } from "../environment";

export async function createTestBucket(origins: string[]) {
  const config = storageEnvironment();
  const bucket = `startup-os-test-${crypto.randomUUID()}`;
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: true,
  });
  const close = async () => {
    try {
      for (;;) {
        const objects = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
        if (!objects.Contents?.length) break;
        const deleted = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects.Contents.map(({ Key }) => ({ Key: Key! })) },
          }),
        );
        if (deleted.Errors?.length)
          throw new Error("Could not remove temporary test-bucket objects.");
      }
      await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    } finally {
      client.destroy();
    }
  };
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  try {
    await client.send(
      new PutPublicAccessBlockCommand({
        Bucket: bucket,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      }),
    );
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: origins,
              AllowedMethods: ["PUT", "GET", "HEAD"],
              AllowedHeaders: ["content-type", "content-length", "x-amz-*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 600,
            },
          ],
        },
      }),
    );
  } catch (error) {
    await close();
    throw error;
  }
  return { bucket, close };
}
