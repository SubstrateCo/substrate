export const AVATAR_SIZES = {
  sm: { px: 24, box: "size-6" },
  md: { px: 32, box: "size-8" },
  lg: { px: 48, box: "size-12" },
} as const;

export type AvatarSize = keyof typeof AVATAR_SIZES;
