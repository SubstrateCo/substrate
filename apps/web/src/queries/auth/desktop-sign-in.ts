type DesktopSignInBridge = {
  requestAuth: () => Promise<void>;
  onAuthenticated: (callback: () => void) => () => void;
  onAuthError: (callback: () => void) => () => void;
};

export function requestDesktopSignIn(
  bridge: DesktopSignInBridge,
  signal: AbortSignal,
  onBrowserOpened: () => void,
) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const cleanup = () => {
      authenticated();
      failed();
      signal.removeEventListener("abort", aborted);
    };
    const finish = (error?: Error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const aborted = () => {
      cleanup();
      reject(signal.reason);
    };
    const authenticated = bridge.onAuthenticated(() => finish());
    const failed = bridge.onAuthError(() =>
      finish(new Error("Could not complete sign-in. Please try again.")),
    );
    signal.addEventListener("abort", aborted, { once: true });
    void bridge.requestAuth().then(onBrowserOpened).catch(finish);
  });
}
