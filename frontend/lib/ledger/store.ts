"use client";

import type {
  DeviceManagementKit,
  DeviceSessionId,
  DiscoveredDevice,
} from "@ledgerhq/device-management-kit";
import { webHidIdentifier } from "@ledgerhq/device-transport-kit-web-hid";
import { create } from "zustand";
import { getDmk } from "./dmk";
import { getDeviceAddress } from "./sign";
import { classifyDeviceError, isDeviceRejection, isPickerDismissal } from "./errors";

/// Per-attempt discovery budget. The device re-enumerates USB when switching
/// apps (briefly absent), so discovery runs as a retry loop, not one shot.
const DISCOVERY_ATTEMPT_MS = 25_000;
const DISCOVERY_ATTEMPTS = 3;

export type LedgerTransport = "usb" | "companion";
export type LedgerStatus = "disconnected" | "connecting" | "connected" | "error";
export type LedgerErrorKind = "error" | "rejected" | "dismissed" | "webhid-blocked" | "no-device";

interface LedgerState {
  transport: LedgerTransport | null;
  sessionId: DeviceSessionId | null;
  deviceAddress: `0x${string}` | null;
  status: LedgerStatus;
  /// Step instruction shown while connecting (which app to open, what to tap).
  prompt: string | null;
  error: string | null;
  errorKind: LedgerErrorKind | null;
  /// Direct USB connection via WebHID. Must be called from a user gesture (button click).
  connectUsb: () => Promise<void>;
  /// Mark the wagmi/injected wallet as the signing path (Ledger via companion app).
  useCompanion: () => void;
  disconnect: () => Promise<void>;
  clearError: () => void;
  /// Retry the last failed connection.
  retry: () => void;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/// One discovery round: resolves with the first device the picker yields.
function discoverOnce(dmk: DeviceManagementKit): Promise<DiscoveredDevice> {
  return new Promise<DiscoveredDevice>((resolve, reject) => {
    const sub = dmk.startDiscovering({ transport: webHidIdentifier }).subscribe({
      next: (d) => {
        sub.unsubscribe();
        resolve(d);
      },
      error: (err: unknown) => {
        sub.unsubscribe();
        reject(err);
      },
    });
  });
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  transport: null,
  sessionId: null,
  deviceAddress: null,
  status: "disconnected",
  prompt: null,
  error: null,
  errorKind: null,

  connectUsb: async () => {
    set({ status: "connecting", error: null, errorKind: null, prompt: null });
    try {
      const dmk = getDmk();

      // Transport hygiene: drop any stale session before discovering, so a
      // half-open session never holds the device (same reason Lunave's host
      // bridge opens the transport per operation and always closes it).
      const stale = get().sessionId;
      if (stale) {
        try {
          await dmk.disconnect({ sessionId: stale });
        } catch {
          // Best effort — the device may already be gone.
        }
        set({ sessionId: null });
      }

      set({
        prompt:
          "Unlock your Ledger, open the Ethereum app, turn auto-lock OFF (Settings → Security), then pick the device in the browser dialog.",
      });

      // Retry loop: after an app switch the device re-enumerates USB and is
      // briefly absent, so a single discovery round can miss it. A dismissed
      // picker breaks immediately — re-popping the dialog is hostile.
      let device: DiscoveredDevice | null = null;
      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= DISCOVERY_ATTEMPTS; attempt++) {
        try {
          device = await withTimeout(
            discoverOnce(dmk),
            DISCOVERY_ATTEMPT_MS,
            "Timed out waiting for the Ledger. Unplug it, plug it back in, unlock it, open the Ethereum app, then retry.",
          );
          break;
        } catch (err) {
          lastErr = err;
          if (isPickerDismissal(err)) break;
        }
      }
      if (!device) throw lastErr ?? new Error("No Ledger device found.");

      const sessionId = await dmk.connect({ device });
      const deviceAddress = await getDeviceAddress(sessionId);
      set({
        transport: "usb",
        sessionId,
        deviceAddress,
        status: "connected",
        prompt: null,
      });
    } catch (err) {
      const msg = classifyDeviceError(err);
      if (isDeviceRejection(err)) {
        // ✗ on the device — neutral, never red.
        set({ status: "error", errorKind: "rejected", error: msg, prompt: null });
      } else if (isPickerDismissal(err)) {
        // Dialog closed, nothing touched — neutral, never red.
        set({ status: "error", errorKind: "dismissed", error: msg, prompt: null });
      } else if (msg.includes("chrome://settings/content/webhid")) {
        set({ status: "error", errorKind: "webhid-blocked", error: msg, prompt: null });
      } else if (/no ledger|not found|timed out|no device/i.test(msg)) {
        set({ status: "error", errorKind: "no-device", error: msg, prompt: null });
      } else {
        set({ status: "error", errorKind: "error", error: msg, prompt: null });
      }
      throw err;
    }
  },

  retry: () => {
    const { errorKind } = get();
    // After a WebHID-blocked error, the user must fix the setting first.
    if (errorKind === "webhid-blocked") {
      set({
        status: "error",
        errorKind: "webhid-blocked",
        error: "Go to chrome://settings/content/webhid, allow the Ledger, reload the page, then connect again.",
      });
      return;
    }
    // Otherwise retry the connection.
    void get().connectUsb();
  },

  useCompanion: () => {
    set({ transport: "companion", sessionId: null, deviceAddress: null, status: "connected", prompt: null, error: null, errorKind: null });
  },

  disconnect: async () => {
    const { sessionId } = get();
    try {
      if (sessionId) {
        await getDmk().disconnect({ sessionId });
      }
    } catch {
      // Best effort: still clear local state even if device is unplugged.
    }
    set({
      transport: null,
      sessionId: null,
      deviceAddress: null,
      status: "disconnected",
      prompt: null,
      error: null,
      errorKind: null,
    });
  },

  clearError: () => set({ error: null, errorKind: null, prompt: null, status: "disconnected" }),
}));
