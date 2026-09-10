"use client"

import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Image from "next/image"

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleGitHubSignIn = async () => {
    setIsLoading(true)
    const result = await signIn("github", { redirect: false })
    if (result?.ok) {
      router.push("/dashboard")
    }
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="max-w-sm w-full px-6">
        <div className="flex flex-col items-center gap-8">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Flint"
              width={40}
              height={40}
              className="rounded-md"
            />
            <h1 className="text-[24px] font-semibold text-black">Flint</h1>
          </div>

          <div className="text-center">
            <p className="text-[13px] text-gray-600">
              Trustless disbursement protocol for open source
            </p>
          </div>

          <button
            onClick={handleGitHubSignIn}
            disabled={isLoading}
            className="w-full px-4 py-3 text-[13px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? "Signing in..." : "Sign in with GitHub"}
          </button>

          <p className="text-[12px] text-gray-400 text-center">
            By signing in, you'll be able to see all repositories where you've installed the Flint app
          </p>
        </div>
      </div>
    </div>
  )
}
