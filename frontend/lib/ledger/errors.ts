/// Ledger device error classification, per the Ledger DMK skill files
/// (`ledger/dmk-code-pattern.md`, `ledger/dmk-sdk-reference.md`).
///
/// Rules followed here:
/// - Device rejection and picker dismissal are NOT errors: neutral outcomes, never red UI.
/// - Classify by stable `_tag` / `errorCode` (incl. nested `originalError.errorCode`),
///   never by message text.

function getProp(err: unknown, key: string): unknown {
  if (typeof err === "object" && err !== null && key in err) {
    return (err as Record<string, unknown>)[key];
  }
  return undefined;
}

function errorCodeOf(err: unknown): string {
  const code = getProp(err, "errorCode");
  if (typeof code === "string") return code;
  const nestedCode = getProp(getProp(err, "originalError"), "errorCode");
  return typeof nestedCode === "string" ? nestedCode : "";
}

function tagOf(err: unknown): string {
  const tag = getProp(err, "_tag");
  return typeof tag === "string" ? tag : "";
}

/// True when the user pressed ✗ on the device itself.
export function isDeviceRejection(err: unknown): boolean {
  const tag = tagOf(err);
  if (tag === "RefusedByUserDAError") return true;
  const code = errorCodeOf(err);
  return code === "5501" || code === "6985" || code === "6982";
}

/// True when the user closed the browser HID picker without picking a device.
/// Distinct from a device rejection: nothing was touched on the Ledger.
export function isPickerDismissal(err: unknown): boolean {
  return tagOf(err) === "NoAccessibleDeviceError";
}

/// Detect WebHID-specific errors: competing holder, missing app, timeouts.
function detectWebHidIssue(err: unknown): string | null {
  const tag = tagOf(err);
  const code = errorCodeOf(err);

  // USB/HID connection failure — usually Ledger Live (or another tab) holding the device.
  if (tag === "OpeningConnectionError") {
    return "Could not open the Ledger USB connection. Quit Ledger Live (it locks the device), keep a single tab open, then retry.";
  }
  // The device vanished mid-operation — cable, sleep, or an app switch
  // (switching apps re-enumerates USB; the device is briefly absent).
  if (tag === "DeviceDisconnectedWhileSendingError") {
    return "Lost the Ledger mid-operation. If you just switched apps, wait a few seconds for USB to reappear, then retry.";
  }
  // Ethereum app missing.
  if (code === "6807") {
    return "Ethereum app not installed on the Ledger. Install it via Ledger Live, then retry.";
  }
  // Communication timeout.
  if (tag === "SendApduTimeoutError" || code === "6f00" || code === "6f01") {
    return "Ledger did not respond in time. Check the USB connection and retry.";
  }
  return null;
}

export function classifyDeviceError(err: unknown): string {
  if (isDeviceRejection(err)) return "Cancelled on the Ledger — nothing was signed.";
  if (isPickerDismissal(err)) {
    return "No device selected. Click Connect and pick your Ledger in the browser dialog.";
  }

  // Check WebHID-specific issues first (most common cause of failure).
  const webHidMsg = detectWebHidIssue(err);
  if (webHidMsg) return webHidMsg;

  const tag = tagOf(err);
  const code = errorCodeOf(err);
  if (tag === "DeviceLockedError" || code === "5515") {
    return "Ledger is locked. Enter your PIN on the device, then retry.";
  }
  if (code === "6a80") {
    return "Blind signing is disabled. Enable it in the Ethereum app settings on the device, then retry.";
  }
  if (code === "6e00" || code === "6d00") {
    return "Wrong app open on the Ledger. Open the Ethereum app, wait a few seconds, then retry.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Unexpected Ledger error. Retry.";
}
