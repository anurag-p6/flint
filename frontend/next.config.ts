import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DMK ships pre-built ESM with no CJS fallback — must be transpiled
  // (per Ledger DMK skill: required in standalone apps).
  transpilePackages: [
    "@ledgerhq/device-management-kit",
    "@ledgerhq/device-transport-kit-web-hid",
    "@ledgerhq/device-signer-kit-ethereum",
    "@ledgerhq/context-module",
  ],
};

export default nextConfig;
