"use client"

import { useConnect } from "wagmi"
import type { Connector } from "wagmi"
import { walletConnectEnabled, arcTestnet } from "@/lib/wagmi"

function Row({
  title,
  subtitle,
  icon,
  disabled,
  busy,
  onClick,
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  disabled?: boolean
  busy?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-md border border-border hover:border-text-muted transition-colors disabled:opacity-50 disabled:hover:border-border text-left"
    >
      <span className="w-6 h-6 shrink-0 flex items-center justify-center">
        {icon ?? <span className="w-2 h-2 rounded-full bg-border" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium text-text-primary">
          {busy ? "Waiting…" : title}
        </span>
        {subtitle && (
          <span className="block text-[11px] text-text-muted truncate">{subtitle}</span>
        )}
      </span>
    </button>
  )
}

export function ConnectWalletDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { connectors, connect, isPending, error, reset } = useConnect()

  if (!open) return null

  const browserWallets = connectors.filter((c) => c.type !== "walletConnect")
  const qrConnector = connectors.find((c) => c.type === "walletConnect")

  const onSelect = (connector: Connector) => {
    reset()
    // chainId pins Arc Testnet: wagmi switches after connecting.
    connect(
      { connector, chainId: arcTestnet.id },
      { onSuccess: onClose },
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[380px] bg-surface rounded-md border border-border p-4 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-1 pb-1">
          <p className="text-[14px] font-semibold text-text-primary">Connect wallet</p>
          <button
            onClick={onClose}
            className="text-[12px] text-text-muted hover:text-text-secondary transition-colors"
          >
            Close
          </button>
        </div>

        <Row
          title="Email wallet"
          subtitle="Log in with email — no seed phrase (Privy)"
          disabled
          onClick={() => {}}
        />

        <p className="text-[10px] text-text-muted uppercase tracking-wider px-1 pt-2">
          Browser wallets
        </p>
        {browserWallets.length === 0 && (
          <p className="text-[12px] text-text-muted px-1">
            No browser wallet detected. Install MetaMask or Rabby.
          </p>
        )}
        {browserWallets.map((c) => (
          <Row
            key={c.uid}
            title={c.name}
            subtitle="Via browser extension"
            icon={
              c.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.icon} alt="" className="w-5 h-5" />
              ) : undefined
            }
            disabled={isPending}
            onClick={() => onSelect(c)}
          />
        ))}

        <p className="text-[10px] text-text-muted uppercase tracking-wider px-1 pt-2">
          Mobile
        </p>
        {qrConnector ? (
          <Row
            title="WalletConnect QR"
            subtitle="Scan with your mobile wallet"
            disabled={isPending}
            onClick={() => onSelect(qrConnector)}
          />
        ) : (
          <Row
            title="WalletConnect QR"
            subtitle={
              walletConnectEnabled
                ? "Scan with your mobile wallet"
                : "Coming soon — needs a project ID"
            }
            disabled
            onClick={() => {}}
          />
        )}

        {(error || isPending) && (
          <p className="text-[12px] text-text-muted px-1 pt-1">
            {error ? "Connection failed — try another option." : "Confirm in your wallet…"}
          </p>
        )}
      </div>
    </div>
  )
}
