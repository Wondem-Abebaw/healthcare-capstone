import { Suspense } from 'react'
import { SessionClient } from '@/components/chat/SessionClient'

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-void flex flex-col">
      <Suspense
        fallback={
          <div className="flex items-center justify-center flex-1">
            <div className="text-subtext font-mono text-sm animate-pulse">
              Loading session...
            </div>
          </div>
        }
      >
        <SessionClient sessionId={id} />
      </Suspense>
    </main>
  );
}
