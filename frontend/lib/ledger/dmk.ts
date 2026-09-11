import {
  ConsoleLogger,
  DeviceManagementKit,
  DeviceManagementKitBuilder,
} from "@ledgerhq/device-management-kit";
import { webHidTransportFactory } from "@ledgerhq/device-transport-kit-web-hid";

/// Standard Ethereum derivation path used for the maintainer's Ledger signer.
/// The address at this path must match the `ledgerSigner` registered in the pool.
export const LEDGER_DERIVATION_PATH = "44'/60'/0'/0/0";

let dmkInstance: DeviceManagementKit | null = null;

/// WebHID is only available in desktop Chromium browsers (Chrome/Edge).
export function isWebHidSupported(): boolean {
  return typeof navigator !== "undefined" && "hid" in navigator;
}

/// Singleton DMK instance. Client-only: throws during SSR and where WebHID is missing.
/// Module scope is SSR-safe (no `navigator` access at import time).
/// DMK's WebHID discovery opens the browser device picker itself — never call
/// `navigator.hid.requestDevice()` alongside it (two pickers fight over the device).
export function getDmk(): DeviceManagementKit {
  if (typeof window === "undefined") {
    throw new Error("Ledger DMK can only be used in the browser");
  }
  if (!isWebHidSupported()) {
    throw new Error("Ledger USB requires desktop Chrome or Edge (WebHID)");
  }
  if (!dmkInstance) {
    dmkInstance = new DeviceManagementKitBuilder()
      .addLogger(new ConsoleLogger())
      .addTransport(webHidTransportFactory)
      .build();
  }
  return dmkInstance;
}
