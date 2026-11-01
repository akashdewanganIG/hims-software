import { HOSPITAL } from "@/lib/sim/reference";

export default async function SharedDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-sm font-semibold text-foreground">
            {HOSPITAL.name}
          </h1>
          <p className="text-xs text-muted-foreground">Shared document</p>
        </div>
        <a
          href={`/api/public/documents/${encodeURIComponent(token)}`}
          download
          className="text-sm font-medium text-primary hover:underline"
        >
          Download file
        </a>
      </header>
      <iframe
        title="Shared hospital document"
        src={`/api/public/documents/${encodeURIComponent(token)}`}
        className="min-h-[calc(100svh-3.75rem)] flex-1 bg-white"
      />
    </main>
  );
}
