"use client"

import { Sidebar } from "@/components/sidebar"
import { MobileNav } from "@/components/mobile-nav"
import { ProtectedRoute } from "@/components/protected-route"

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ProtectedRoute>
      <div className="flex flex-col md:flex-row min-h-screen">
        <MobileNav />
        <Sidebar />
        <main className="flex-1 min-w-0 max-w-[860px] px-4 sm:px-8 py-6 sm:py-8">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  )
}
