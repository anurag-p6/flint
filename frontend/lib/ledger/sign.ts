import {
  DeviceActionStatus,
  type DeviceSessionId,
} from "@ledgerhq/device-management-kit";
import { SignerEthBuilder } from "@ledgerhq/device-signer-kit-ethereum";
import type { Observable } from "rxjs";
import {
  concatHex,
  hexToBytes,
  numberToHex,
  pad,
  type Hex,
} from "viem";
import { getDmk, LEDGER_DERIVATION_PATH } from "./dmk";

type DeviceActionStateLike =
  | { status: DeviceActionStatus.Completed; output: unknown }
  | { status: DeviceActionStatus.Error; error: unknown }
  | { status: DeviceActionStatus.Stopped }
  | { status: DeviceActionStatus.Pending; intermediateValue?: unknown }
  | { status: DeviceActionStatus.NotStarted };

/// Await a DMK device-action observable to its terminal state.
/// Device errors reject with the RAW error object so callers can classify it
/// (isDeviceRejection / classifyDeviceError) — never wrap it in a new Error.
function awaitDeviceAction<T>(observable: Observable<DeviceActionStateLike>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const sub = observable.subscribe({
      next: (state) => {
        if (state.status === DeviceActionStatus.Completed) {
          sub.unsubscribe();
          resolve(state.output as T);
        } else if (state.status === DeviceActionStatus.Error) {
          sub.unsubscribe();
          reject(state.error);
        } else if (state.status === DeviceActionStatus.Stopped) {
          sub.unsubscribe();
          reject(new Error("Ledger action cancelled"));
        }
      },
      error: (err: unknown) => {
        reject(err);
      },
    });
  });
}

function buildSigner(sessionId: DeviceSessionId) {
  return new SignerEthBuilder({ dmk: getDmk(), sessionId }).build();
}

/// Read the Ethereum address at the standard derivation path (no on-device confirm).
export async function getDeviceAddress(
  sessionId: DeviceSessionId,
): Promise<`0x${string}`> {
  const signer = buildSigner(sessionId);
  const { observable } = signer.getAddress(LEDGER_DERIVATION_PATH);
  const output = await awaitDeviceAction<{ address: `0x${string}` }>(
    observable as Observable<DeviceActionStateLike>,
  );
  return output.address;
}

/// Sign the 32-byte approval hash with the Ledger device (EIP-191 personal_sign).
/// The device shows the hash; the user confirms with a physical button press.
/// Returns the 65-byte `0x{r}{s}{v}` signature the Flint contracts verify via
/// `toEthSignedMessageHash().recover() == ledgerSigner`.
export async function signApprovalHash(
  sessionId: DeviceSessionId,
  approvalHash: Hex,
): Promise<Hex> {
  const signer = buildSigner(sessionId);
  const { observable } = signer.signMessage(
    LEDGER_DERIVATION_PATH,
    hexToBytes(approvalHash),
  );
  const sig = await awaitDeviceAction<{ r: Hex; s: Hex; v: number }>(
    observable as Observable<DeviceActionStateLike>,
  );
  // Normalize v to 27/28 (some transports return 0/1) before packing 0x{r}{s}{v}.
  const v = sig.v < 27 ? sig.v + 27 : sig.v;
  return concatHex([
    pad(sig.r, { size: 32 }),
    pad(sig.s, { size: 32 }),
    numberToHex(v, { size: 1 }),
  ]);
}
