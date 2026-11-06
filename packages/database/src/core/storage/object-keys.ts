export interface UploadObjectKeyInput {
  id: string;
  purpose: string;
  ownerUserId: string | null;
  organizationId: string | null;
}

function uploadObjectPath(upload: UploadObjectKeyInput): string {
  const personal = upload.purpose === "avatar";
  const owner = personal ? upload.ownerUserId : upload.organizationId;
  if (!owner) throw new Error("Upload owner is required to generate an object key.");
  return `${personal ? "users" : "organizations"}/${encodeURIComponent(owner)}/${encodeURIComponent(upload.purpose)}/${encodeURIComponent(upload.id)}`;
}

export function temporaryObjectKey(upload: UploadObjectKeyInput): string {
  return `temporary/${uploadObjectPath(upload)}`;
}

export function finalObjectKey(upload: UploadObjectKeyInput, sha256: string): string {
  return `objects/${uploadObjectPath(upload)}/${sha256}${upload.purpose === "file" ? "" : ".webp"}`;
}
