/// Ledger device error classification, per the Ledger DMK skill files
/// (`ledger/dmk-code-pattern.md`, `ledger/dmk-sdk-reference.md`).
///
/// Rules followed here:
/// - User rejection is NOT an error: neutral outcome, never red UI.
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

/// True when the user cancelled on purpose: rejected on the device, or
/// dismissed the browser HID picker (`NoAccessibleDeviceError`).
export function isDeviceRejection(err: unknown): boolean {
  const tag = tagOf(err);
  if (tag === "RefusedByUserDAError") return true;
  if (tag === "NoAccessibleDeviceError") return true;
  const code = errorCodeOf(err);
  return code === "5501" || code === "6985" || code === "6982";
}

export function classifyDeviceError(err: unknown): string {
  if (isDeviceRejection(err)) return "Action cancelled.";
  const tag = tagOf(err);
  const code = errorCodeOf(err);
  if (tag === "DeviceLockedError" || code === "5515") {
    return "Ledger is locked. Enter your PIN on the device, then retry.";
  }
  if (code === "6807") {
    return "Ethereum app not installed on the Ledger. Install it via Ledger Live, then retry.";
  }
  if (code === "6a80") {
    return "Blind signing is disabled. Enable it in the Ethereum app settings on the device, then retry.";
  }
  if (code === "6e00" || code === "6d00") {
    return "Wrong app open on the Ledger. Open the Ethereum app, then retry.";
  }
  if (tag === "DeviceDisconnectedWhileSendingError") {
    return "Ledger disconnected mid-operation. Reconnect and retry.";
  }
  if (tag === "SendApduTimeoutError") {
    return "Ledger did not respond in time. Check the USB connection and retry.";
  }
  if (tag === "OpeningConnectionError") {
    return "Could not open the Ledger USB connection. Quit Ledger Live (it locks the device), keep a single tab open, then retry.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Unexpected Ledger error. Retry.";
}
