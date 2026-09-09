import { Sidebar } from "@/components/sidebar"

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 max-w-[860px] px-8 py-8">
        {children}
      </main>
    </div>
  )
}
