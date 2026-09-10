"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface GitHubState {
  installationId: string | null
  repo: string | null
  repoAvatar: string | null
  setInstallation: (id: string, repo: string, avatar?: string) => void
  clear: () => void
}

export const useGitHubStore = create<GitHubState>()(
  persist(
    (set) => ({
      installationId: null,
      repo: null,
      repoAvatar: null,
      setInstallation: (id, repo, avatar) =>
        set({ installationId: id, repo, repoAvatar: avatar ?? null }),
      clear: () => set({ installationId: null, repo: null, repoAvatar: null }),
    }),
    { name: "flint-github" },
  ),
)
