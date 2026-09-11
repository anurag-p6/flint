"use client";

import { useState } from "react";
import { usePrivy, useWallets, useConnectWallet } from "@privy-io/react-auth";
import { privyEnabled } from "@/lib/privy/config";
import { truncateAddress } from "@/lib/utils";

function sourceLabel(walletClientType: string | undefined): string {
  if (walletClientType === "privy" || walletClientType === "privy-v2") return "Email";
  if (!walletClientType) return "Wallet";
  return walletClientType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/// Compact wallet button for the dashboard top-right.
/// Two ways in: email (auto-creates an embedded wallet, no seed phrase)
/// or MetaMask/external (funds stay where they are).
export function PrivyWalletButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const [menuOpen, setMenuOpen] = useState(false);

  const active =
    wallets.find((w) => w.walletClientType === "privy" || w.walletClientType === "privy-v2") ??
    wallets[0];

  if (!privyEnabled) {
    return (
      <span className="px-4 py-2 text-[12px] text-amber border border-gray-100 rounded-md">
        Email login not configured
      </span>
    );
  }

  if (!ready) {
    return (
      <span className="px-4 py-2 text-[12px] text-gray-400 border border-gray-100 rounded-md">
        …
      </span>
    );
  }

  if (!authenticated || !active) {
    return (
      <span className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
        >
          Connect wallet
        </button>
        {menuOpen && (
          <>
            <span
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
            />
            <span className="absolute right-0 top-full mt-2 z-50 w-[260px] bg-white border border-gray-100 rounded-md p-2 space-y-1">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  login();
                }}
                className="w-full text-left px-3 py-2.5 rounded-md hover:bg-gray-50 transition-colors"
              >
                <span className="block text-[13px] font-medium text-black">Email</span>
                <span className="block text-[11px] text-gray-400">
                  Embedded wallet auto-created, no seed phrase
                </span>
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  connectWallet();
                }}
                className="w-full text-left px-3 py-2.5 rounded-md hover:bg-gray-50 transition-colors"
              >
                <span className="block text-[13px] font-medium text-black">MetaMask</span>
                <span className="block text-[11px] text-gray-400">
                  Use your funds in place
                </span>
              </button>
            </span>
          </>
        )}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2 px-4 py-2 border border-gray-100 rounded-md">
      <span className="w-1.5 h-1.5 rounded-full bg-green shrink-0" />
      <span className="font-mono text-gray-700 text-[12px]">
        {truncateAddress(active.address)}
      </span>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider">
        {sourceLabel(active.walletClientType)}
      </span>
      <button
        onClick={logout}
        className="text-[11px] text-gray-400 hover:text-red transition-colors"
      >
        Log out
      </button>
    </span>
  );
}
