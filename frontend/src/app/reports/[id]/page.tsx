import { Suspense } from "react";
import { ReportClient } from "@/components/report/ReportClient";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-void bg-grid-subtle bg-grid">
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-subtext font-mono text-sm animate-pulse">
              Loading report...
            </div>
          </div>
        }
      >
        <ReportClient sessionId={id} />
      </Suspense>
    </main>
  );
}
