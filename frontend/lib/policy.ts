import { addresses } from "@/lib/contracts"

export type PolicyId = "sqrt" | "proportional" | "equal"

export const POLICY_OPTIONS: { id: PolicyId; label: string; hint: string }[] = [
  { id: "sqrt", label: "Square root", hint: "Compresses the gap so smaller contributors still take a meaningful share." },
  { id: "proportional", label: "Proportional", hint: "Payout tracks score linearly — more work, larger share." },
  { id: "equal", label: "Fixed", hint: "Same USDC for every CONTRIBUTORS.md wallet, like an OSS stipend." },
]

export function policyAddress(id: PolicyId): string {
  if (id === "sqrt") return addresses.sqrtPolicy
  if (id === "equal") return addresses.equalPolicy
  return addresses.proportionalPolicy
}

export function policyIdFromAddress(addr: string): PolicyId {
  const a = addr.toLowerCase()
  if (a === addresses.sqrtPolicy.toLowerCase()) return "sqrt"
  if (a === addresses.equalPolicy.toLowerCase()) return "equal"
  return "proportional"
}

export function policyLabel(addrOrId: string): string {
  const id =
    addrOrId === "sqrt" || addrOrId === "proportional" || addrOrId === "equal"
      ? addrOrId
      : policyIdFromAddress(addrOrId)
  return POLICY_OPTIONS.find((p) => p.id === id)?.label ?? "Proportional"
}
