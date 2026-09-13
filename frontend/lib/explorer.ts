export const ARCSCAN = "https://testnet.arcscan.app"

export function txUrl(hash: string): string {
  return `${ARCSCAN}/tx/${hash}`
}

export function addressUrl(address: string): string {
  return `${ARCSCAN}/address/${address}`
}
