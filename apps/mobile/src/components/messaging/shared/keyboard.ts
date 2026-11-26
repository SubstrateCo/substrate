import { Platform } from "react-native";

/**
 * Expo 56 draws Android edge to edge, so the window does not resize for the keyboard. Both
 * platforms shrink the view instead: iOS by padding, Android by height.
 */
export const keyboardBehavior = Platform.OS === "ios" ? "padding" : "height";

/** The workspace shell's top bar (`h-14`) above the messaging screen. */
export const shellHeaderHeight = 56;
