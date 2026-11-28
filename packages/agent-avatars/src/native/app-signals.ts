import { AccessibilityInfo, AppState, type AppStateStatus } from "react-native";

interface AppSignals {
  foreground: boolean;
  lastActivity: number;
  reduceMotion: boolean;
}

const signals: AppSignals = { foreground: true, lastActivity: 0, reduceMotion: false };
const listeners = new Set<() => void>();
let subscriptions: { remove(): void }[] = [];

function notify() {
  for (const listener of listeners) listener();
}

const isForeground = (state: AppStateStatus) => state !== "background";

function onAppState(state: AppStateStatus) {
  const foreground = isForeground(state);
  if (foreground === signals.foreground) return;
  signals.foreground = foreground;
  if (foreground) signals.lastActivity = performance.now();
  notify();
}

function onReduceMotion(enabled: boolean) {
  if (enabled === signals.reduceMotion) return;
  signals.reduceMotion = enabled;
  notify();
}

function start() {
  signals.foreground = isForeground(AppState.currentState);
  signals.lastActivity = performance.now();
  subscriptions = [
    AppState.addEventListener("change", onAppState),
    AccessibilityInfo.addEventListener("reduceMotionChanged", onReduceMotion),
  ];
  void AccessibilityInfo.isReduceMotionEnabled().then(onReduceMotion);
}

function stop() {
  for (const subscription of subscriptions) subscription.remove();
  subscriptions = [];
}

export function subscribeAppSignals(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

export function appSignals(): Readonly<AppSignals> {
  return signals;
}

export const reduceMotion = () => signals.reduceMotion;

export function noteActivity(): void {
  signals.lastActivity = performance.now();
}
