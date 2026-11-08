export function storageEnvironment(env: Record<string, string | undefined> = process.env) {
  const production = env.NODE_ENV === "production";
  const required = (key: string, fallback: string) => {
    const value = env[key] ?? (production ? undefined : fallback);
    if (!value) throw new Error(`${key} is required.`);
    return value;
  };
  return {
    endpoint: required("S3_ENDPOINT", "http://localhost:4566"),
    region: required("S3_REGION", "us-east-1"),
    bucket: required("S3_BUCKET", "startup-os-private"),
    accessKeyId: required("S3_ACCESS_KEY_ID", "startup_os"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY", "startup_os_storage"),
  };
}
