import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  FileUpload,
  PictureUpload,
  UploadItem,
  type PictureUploadContext,
} from "@startup-os/ui/upload";

const meta = { title: "Components/Uploads", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function FilesScene({ disabled = false }: { disabled?: boolean }) {
  const [names, setNames] = useState<string[]>([]);
  return (
    <div className="mx-auto w-full max-w-80 space-y-3">
      <FileUpload
        accept=".txt,.pdf"
        maxSize={1024 * 1024}
        multiple
        disabled={disabled}
        description="Text or PDF files, up to 1 MB each."
        onFiles={(files) => setNames(files.map((file) => file.name))}
      />
      <ul aria-label="Selected files">
        {names.map((name, index) => (
          <li key={`${index}-${name}`}>{name}</li>
        ))}
      </ul>
    </div>
  );
}

function PictureScene({
  kind = "avatar",
  failOnce = false,
  disabled = false,
  existing = false,
  slow = false,
  commitDelay = false,
}: {
  kind?: "avatar" | "organization-logo";
  failOnce?: boolean;
  disabled?: boolean;
  existing?: boolean;
  slow?: boolean;
  commitDelay?: boolean;
}) {
  const [value, setValue] = useState<string | null>(
    existing
      ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=="
      : null,
  );
  const [saved, setSaved] = useState(false);
  const attempts = useRef(0);
  const objectUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  async function upload(file: File, { signal, onProgress, onCommit }: PictureUploadContext) {
    attempts.current += 1;
    if (failOnce && attempts.current === 1)
      throw new Error("Private storage failure must not be shown");
    if (slow)
      await new Promise<void>((resolve, reject) => {
        const progress = { value: 0 };
        const timer = setInterval(() => {
          progress.value += 10;
          onProgress(progress.value);
          if (progress.value >= 100) {
            clearInterval(timer);
            signal.removeEventListener("abort", abort);
            resolve();
          }
        }, 400);
        function abort() {
          clearInterval(timer);
          signal.removeEventListener("abort", abort);
          reject(new Error("aborted"));
        }
        signal.addEventListener("abort", abort, { once: true });
      });
    signal.throwIfAborted();
    onCommit();
    if (commitDelay) await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(file);
    setValue(objectUrl.current);
    setSaved(true);
  }
  return (
    <div className="mx-auto w-full max-w-80 space-y-3">
      <PictureUpload
        kind={kind}
        value={value}
        disabled={disabled}
        onUpload={upload}
        onRemove={async () => {
          setValue(null);
          setSaved(false);
        }}
      />
      {saved && <p role="status">Picture saved.</p>}
    </div>
  );
}

function ItemRecovery() {
  const [status, setStatus] = useState<"error" | "uploading" | "cancelled">("error");
  return (
    <div className="mx-auto w-full max-w-80">
      <UploadItem
        name="proposal.pdf"
        status={status}
        progress={42}
        onRetry={() => setStatus("uploading")}
        onCancel={() => setStatus("cancelled")}
      />
    </div>
  );
}

export const FileSelection: Story = { render: () => <FilesScene /> };
export const DisabledFiles: Story = { render: () => <FilesScene disabled /> };
export const Avatar: Story = { render: () => <PictureScene /> };
export const OrganizationLogo: Story = { render: () => <PictureScene kind="organization-logo" /> };
export const CurrentPicture: Story = { render: () => <PictureScene existing /> };
export const DisabledPicture: Story = { render: () => <PictureScene existing disabled /> };
export const UploadRetry: Story = { render: () => <PictureScene failOnce /> };
export const UploadCancellation: Story = { render: () => <PictureScene slow /> };
export const CommittingPicture: Story = { render: () => <PictureScene commitDelay /> };
export const DarkLogo: Story = { ...OrganizationLogo, globals: { theme: "dark" } };
export const UploadStates: Story = {
  render: () => (
    <div className="mx-auto w-full max-w-80 space-y-3">
      <UploadItem name="report.pdf" status="uploading" progress={35} />
      <UploadItem name="recording.webm" status="uploading" />
      <UploadItem name="brief.txt" status="complete" />
      <UploadItem name="notes.txt" status="cancelled" />
      <ItemRecovery />
    </div>
  ),
};
export const ItemRetry: Story = { render: () => <ItemRecovery /> };
