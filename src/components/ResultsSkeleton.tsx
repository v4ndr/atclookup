const CardSkeleton = () => (
  <div className="rounded-xl border bg-card p-4 space-y-3 animate-pulse">
    <div className="flex flex-wrap gap-2">
      <div className="h-5 w-16 rounded-full bg-muted" />
      <div className="h-5 w-20 rounded-full bg-muted" />
    </div>
    <div className="h-5 w-3/4 rounded bg-muted" />
    <div className="h-4 w-1/2 rounded bg-muted" />
    <div className="h-3 w-full rounded bg-muted" />
  </div>
);

const ResultsSkeleton = () => (
  <div className="w-full space-y-8">
    {[0, 1].map((mol) => (
      <div key={mol}>
        <div className="h-6 w-48 rounded bg-muted animate-pulse mb-4" />
        <div className="flex items-center gap-2 py-2 mb-2">
          <div className="h-5 w-24 rounded-full bg-muted animate-pulse" />
          <div className="h-4 w-6 rounded bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 pl-6">
          {Array.from({ length: mol === 0 ? 4 : 2 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    ))}
  </div>
);

export default ResultsSkeleton;
