"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useGitHubStore } from "@/lib/github-store"

interface Repo {
  name: string
  fullName: string
  owner: string
  avatar: string
}

export function RepoSwitcher() {
  const { data: session } = useSession()
  const { repo: selectedRepo, setInstallation } = useGitHubStore()
  const [repos, setRepos] = useState<Repo[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.accessToken) {
      setIsLoading(false)
      return
    }

    const fetchRepos = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch("/api/github/installations")
        const data = await res.json()

        console.log("API response:", data)

        if (!res.ok) {
          console.error("API error:", data.error)
          setError(data.error || "Failed to fetch repositories")
          setRepos([])
        } else {
          setRepos(data.repos || [])
          if (!data.repos || data.repos.length === 0) {
            setError("No repositories with Flint app installed")
          }
        }
      } catch (err) {
        console.error("Fetch error:", err)
        setError("Error fetching repositories")
        setRepos([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchRepos()
  }, [session?.accessToken])

  const selected = repos.find((r) => r.name === selectedRepo)

  const handleSelect = (repo: Repo) => {
    setInstallation("oauth", repo.name, repo.avatar)
    setIsOpen(false)
  }

  if (!session) return null

  if (isLoading) {
    return (
      <div className="text-[12px] text-gray-400">
        Loading repositories...
      </div>
    )
  }

  if (error && repos.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] text-gray-400">{error}</p>
        <a
          href="https://github.com/apps/flint-protocol/installations/new"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-3 py-1.5 text-[11px] font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors"
        >
          Install Flint app
        </a>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-2 text-[12px] font-medium text-gray-700 border border-gray-100 rounded-md hover:border-gray-400 transition-colors text-left flex items-center justify-between gap-2"
      >
        <span className="truncate">
          {selected?.name || "Select repository"}
        </span>
        <span className="text-[10px] text-gray-400 shrink-0">▼</span>
      </button>

      {isOpen && repos.length > 0 && (
        <div className="absolute top-full mt-1 w-full bg-white border border-gray-100 rounded-md shadow-sm z-50 max-h-60 overflow-y-auto">
          {repos.map((repo) => (
            <button
              key={repo.name}
              onClick={() => handleSelect(repo)}
              className={`w-full px-3 py-2 text-[11px] text-left hover:bg-gray-50 border-b border-gray-50 last:border-b-0 flex items-center gap-2 ${
                selected?.name === repo.name
                  ? "bg-gray-50 text-accent font-medium"
                  : "text-gray-700"
              }`}
            >
              <img
                src={repo.avatar}
                alt={repo.owner}
                className="w-4 h-4 rounded-full shrink-0"
              />
              <span className="truncate">{repo.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
