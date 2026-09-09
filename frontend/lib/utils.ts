export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatUSDC(amount: bigint): string {
  const decimals = 6
  const whole = amount / BigInt(10 ** decimals)
  const frac = amount % BigInt(10 ** decimals)
  if (frac === 0n) return `${whole.toLocaleString()} USDC`
  return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")} USDC`
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000)
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

export function formatScore(score: bigint): number {
  return Number(score) / 1_000_000
}
