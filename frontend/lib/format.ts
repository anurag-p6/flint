import { formatUnits, parseUnits } from "viem";

/// USDC uses 6 decimals (not 18). All contract amounts are raw 6-decimal units.
export const USDC_DECIMALS = 6;

/// "450000000n" -> "450"
export function formatUSDC(raw: bigint): string {
  const [int, frac = ""] = formatUnits(raw, USDC_DECIMALS).split(".");
  const trimmedFrac = frac.replace(/0+$/, "");
  return trimmedFrac ? `${int}.${trimmedFrac}` : int;
}

/// "450" -> 450000000n
export function parseUSDC(human: string): bigint {
  return parseUnits(human.trim(), USDC_DECIMALS);
}
