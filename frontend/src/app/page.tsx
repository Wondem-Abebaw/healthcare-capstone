import { Suspense } from 'react'
import { DashboardClient } from '@/components/layout/DashboardClient'

export default function HomePage() {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--color-void)' }}
          className="bg-grid-subtle">
      <Suspense fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <div style={{ color: 'var(--color-subtext)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}
               className="animate-pulse">
            Initializing...
          </div>
        </div>
      }>
        <DashboardClient />
      </Suspense>
    </main>
  )
}
