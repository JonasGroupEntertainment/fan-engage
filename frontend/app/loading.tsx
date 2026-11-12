// Root-level loading state: a calm midnight skeleton while a server
// component streams in. Renders inside the root layout.
export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading"
      className="mx-auto max-w-5xl animate-pulse space-y-8 px-6 py-12"
    >
      <div className="space-y-4">
        <div className="h-3 w-24 rounded-full bg-white/10" />
        <div className="h-9 w-2/3 max-w-md rounded-lg bg-white/10" />
        <div className="h-4 w-1/2 max-w-sm rounded-full bg-white/10" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-white/10 bg-white/5" />
        ))}
      </div>
    </main>
  );
}
