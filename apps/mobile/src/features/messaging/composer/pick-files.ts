import type { UploadFile } from "@/api/files/uploads";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

/** Files from the document picker, as upload inputs. Returns nothing when canceled. */
export async function pickDocuments(): Promise<UploadFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? "application/octet-stream",
    size: asset.size ?? 0,
    file: asset.file,
  }));
}

/** Photos from the library. The system picker asks for access when it needs to. */
export async function pickPhotos(): Promise<UploadFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    quality: 0.8,
  });
  if (result.canceled) return [];
  return result.assets.map((asset, index) => ({
    uri: asset.uri,
    name: asset.fileName ?? `photo-${index + 1}.${asset.mimeType === "image/png" ? "png" : "jpg"}`,
    mimeType: asset.mimeType ?? "image/jpeg",
    size: asset.fileSize ?? 0,
    file: asset.file,
  }));
}
