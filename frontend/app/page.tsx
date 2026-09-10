import Image from "next/image"
import Link from "next/link"

const features = [
  {
    title: "TEE-attested scoring",
    desc: "AI agent scores contributions inside a Chainlink CRE enclave. API keys and raw data never leave.",
  },
  {
    title: "Hardware approval",
    desc: "Every payout requires a physical Ledger confirmation. No funds move without a button press.",
  },
  {
    title: "On-chain audit trail",
    desc: "The Graph indexes every score, payout, and milestone. Fully queryable, permanently verifiable.",
  },
]

const stats = [
  { label: "Contracts deployed", value: "10" },
  { label: "Chain", value: "Base Sepolia" },
  { label: "Scoring model", value: "Gemini Flash" },
  { label: "Token", value: "USDC" },
]

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
        <span className="flex items-center gap-1.5 text-[17px] font-semibold text-black tracking-tight">
          <Image src="/logo.png" alt="Flint logo" width={32} height={32} priority className="rounded-md" />
          Flint
        </span>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/apps/flint-protocol/installations/new"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-[13px] font-medium text-gray-700 border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
          >
            Connect repo
          </a>
          <Link
            href="/dashboard"
            className="px-4 py-2 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
          >
            Open dashboard
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-20">
        <div className="max-w-2xl w-full space-y-16">
          <div className="space-y-4">
            <h1 className="text-[28px] font-semibold text-black tracking-tight leading-tight">
              Trustless disbursement for grants<br />and open source contributions
            </h1>
            <p className="text-[15px] text-gray-700 leading-relaxed max-w-lg">
              Work verified inside a TEE. Ledger proves a human approved. Blockchain records
              everything. No spreadsheets, no manual transfers, no trust required.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <Link
                href="/dashboard"
                className="px-5 py-2.5 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
              >
                Open dashboard
              </Link>
              <Link
                href="/grant"
                className="px-5 py-2.5 text-[13px] font-medium text-gray-700 border border-gray-100 rounded-md hover:border-gray-400 transition-colors"
              >
                View grants
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-6">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider">{s.label}</p>
                <p className="text-[15px] text-black font-medium mt-1">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 pt-10">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-6">How it works</p>
            <div className="grid grid-cols-3 gap-8">
              {features.map((f) => (
                <div key={f.title} className="space-y-2">
                  <h3 className="text-[13px] font-medium text-black">{f.title}</h3>
                  <p className="text-[13px] text-gray-400 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-10">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-4">Architecture</p>
            <div className="bg-black rounded-md px-6 py-5 space-y-1">
              <p className="font-mono text-[12px] text-green">GitHub App webhooks  -&gt;  Chainlink CRE (TEE enclave)</p>
              <p className="font-mono text-[12px] text-green">Gemini Flash scores  -&gt;  DON consensus  -&gt;  on-chain</p>
              <p className="font-mono text-[12px] text-green">Ledger approval      -&gt;  USDC payout   -&gt;  ERC-5484 receipt</p>
              <p className="font-mono text-[12px] text-green">The Graph indexes    -&gt;  queryable audit trail</p>
            </div>
          </div>

          <div className="flex items-center gap-8 text-[12px] text-gray-400 border-t border-gray-100 pt-6">
            <span>Chainlink CRE</span>
            <span>Ledger</span>
            <span>The Graph</span>
            <span>Base Sepolia</span>
            <span>ERC-5484</span>
            <span className="ml-auto">Built for ETHGlobal ETHOnline</span>
          </div>
        </div>
      </main>
    </div>
  )
}
