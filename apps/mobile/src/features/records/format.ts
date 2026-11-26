import { interactionFields } from "@substrate/contracts/context/interactions";
import type { ServiceErrorCode } from "@substrate/contracts/result";
import type { PermissionLevel, TaskPriority, TaskStatus } from "@substrate/contracts/tasks";

import { ApiError, NetworkError } from "@/api/result";

export const taskPriorityLabels: Record<TaskPriority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const permissionLabels: Record<PermissionLevel, string> = {
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
  owner: "Owner",
};

export const interactionKindLabels = {
  email: "Email",
  meeting: "Meeting",
  call: "Call",
  message: "Message",
  note: "Note",
  other: "Other",
} as const;
export type InteractionKind = keyof typeof interactionKindLabels;
export const interactionKinds = interactionFields.shape.kind.options;

export const outcomeLabels = { open: "Open", won: "Won", lost: "Lost" } as const;
export const outcomeTones = { open: "outline", won: "accent", lost: "danger" } as const;

export function canEdit(level: PermissionLevel | null | undefined) {
  return level === "edit" || level === "owner";
}

export function openTask(status: TaskStatus) {
  return status !== "completed" && status !== "canceled";
}

const accessCopy: Partial<Record<ServiceErrorCode, string>> = {
  UNAUTHENTICATED: "Your session ended. Sign in again.",
  FORBIDDEN: "You don't have access to this.",
  NOT_FOUND: "This record doesn't exist or you can't open it.",
  APP_DISABLED: "This app is turned off for the workspace.",
  WORKSPACE_CHANGED: "You switched workspaces. Reopen this record.",
  CONFLICT: "Someone else changed this. Refresh and try again.",
  PAYLOAD_TOO_LARGE: "That's too large to save.",
};

/** Copy that is safe to show for a failed request. */
export function errorText(error: Error | null, fallback = "Something went wrong. Try again.") {
  if (error instanceof ApiError) return error.userMessage ?? accessCopy[error.code] ?? fallback;
  if (error instanceof NetworkError) return "Couldn't reach the server. Check your connection.";
  return fallback;
}

const accessCodes: ServiceErrorCode[] = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "APP_DISABLED",
  "WORKSPACE_CHANGED",
];
export function isAccessError(error: Error | null) {
  return error instanceof ApiError && accessCodes.includes(error.code);
}

function inThisYear(date: Date) {
  return date.getFullYear() === new Date().getFullYear();
}

/** A calendar date stored as YYYY-MM-DD, shown in the reader's locale without a time zone shift. */
export function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (!inThisYear(date)) options.year = "numeric";
  return date.toLocaleDateString(undefined, options);
}

export function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function nowTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** A local YYYY-MM-DD date and 24-hour HH:MM time as an instant, or null when either is invalid. */
export function localInstant(date: string, time: string) {
  if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

export function overdue(value: string | null | undefined) {
  return !!value && value.slice(0, 10) < todayDate();
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  if (!inThisYear(date)) options.year = "numeric";
  return date.toLocaleString(undefined, options);
}

export function formatMoney(amount: string | null, currency: string | null) {
  if (amount === null) return "";
  try {
    return new Intl.NumberFormat(
      undefined,
      currency ? { style: "currency", currency } : { maximumFractionDigits: 4 },
    ).format(Number(amount));
  } catch {
    return currency ? `${amount} ${currency}` : amount;
  }
}

export const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export function validDate(value: string) {
  if (!datePattern.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * An idempotency key for create requests. Retrying a save sends the same key. It is not a secret,
 * so Math.random is enough, and Hermes may run without Web Crypto.
 */
export function newRequestId(): string {
  const bytes = Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The name other features import. */
export const requestId = newRequestId;
