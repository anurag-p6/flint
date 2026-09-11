"use client";

import type {
  DeviceSessionId,
  DiscoveredDevice,
} from "@ledgerhq/device-management-kit";
import { webHidIdentifier } from "@ledgerhq/device-transport-kit-web-hid";
import { create } from "zustand";
import { getDmk } from "./dmk";
import { getDeviceAddress } from "./sign";
import { classifyDeviceError, isDeviceRejection } from "./errors";

/// How long to wait for the device to appear in discovery before giving up.
const DISCOVERY_TIMEOUT_MS = 60_000;

export type LedgerTransport = "usb" | "companion";
export type LedgerStatus = "disconnected" | "connecting" | "connected" | "error";
export type LedgerErrorKind = "error" | "rejected";

interface LedgerState {
  transport: LedgerTransport | null;
  sessionId: DeviceSessionId | null;
  deviceAddress: `0x${string}` | null;
  status: LedgerStatus;
  error: string | null;
  errorKind: LedgerErrorKind | null;
  /// Direct USB connection via WebHID. Must be called from a user gesture (button click).
  connectUsb: () => Promise<void>;
  /// Mark the wagmi/injected wallet as the signing path (Ledger via companion app).
  useCompanion: () => void;
  disconnect: () => Promise<void>;
  clearError: () => void;
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

export const useLedgerStore = create<LedgerState>((set, get) => ({
  transport: null,
  sessionId: null,
  deviceAddress: null,
  status: "disconnected",
  error: null,
  errorKind: null,

  connectUsb: async () => {
    set({ status: "connecting", error: null, errorKind: null });
    try {
      const dmk = getDmk();
      // DMK's WebHID startDiscovering opens the browser device picker itself
      // (promptDeviceAccess) — no manual requestDevice call. Must run in a
      // user gesture. webHidIdentifier imported from the package, never hardcoded.
      const device = await withTimeout(
        new Promise<DiscoveredDevice>((resolve, reject) => {
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
        }),
        DISCOVERY_TIMEOUT_MS,
        "Timed out waiting for the Ledger. Unplug it, plug it back in, unlock it, then retry.",
      );
      const sessionId = await dmk.connect({ device });
      const deviceAddress = await getDeviceAddress(sessionId);
      set({
        transport: "usb",
        sessionId,
        deviceAddress,
        status: "connected",
      });
    } catch (err) {
      // Rejection (device ✗ or dismissed picker) is neutral, never red.
      if (isDeviceRejection(err)) {
        set({
          status: "error",
          errorKind: "rejected",
          error: "No Ledger connected. Click Connect and pick your device.",
        });
      } else {
        set({ status: "error", errorKind: "error", error: classifyDeviceError(err) });
      }
      throw err;
    }
  },

  useCompanion: () => {
    set({ transport: "companion", sessionId: null, deviceAddress: null, status: "connected", error: null, errorKind: null });
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
      error: null,
      errorKind: null,
    });
  },

  clearError: () => set({ error: null, errorKind: null, status: "disconnected" }),
}));
