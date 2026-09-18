import { addressUrl, txUrl } from "@/lib/explorer"
import { truncateAddress } from "@/lib/utils"

export function TxLink({
  hash,
  label,
  className,
}: {
  hash: string
  label?: string
  className?: string
}) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-[12px] font-mono text-accent hover:underline"}
    >
      {label ?? `${truncateAddress(hash)} · Arcscan ↗`}
    </a>
  )
}

export function AddressLink({
  address,
  label,
  className,
}: {
  address: string
  label?: string
  className?: string
}) {
  return (
    <a
      href={addressUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "text-[12px] text-accent hover:underline"}
    >
      {label ?? `${truncateAddress(address)} · Arcscan ↗`}
    </a>
  )
}
