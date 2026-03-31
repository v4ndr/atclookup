const RcpViewerSkeleton = () => (
  <div className="w-full space-y-4 animate-pulse">
    {/* Header area */}
    <div className="mb-6 border-b pb-4 space-y-2">
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-4 w-1/2 rounded bg-muted" />
      <div className="h-4 w-1/3 rounded bg-muted" />
    </div>
    {/* Sections */}
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="space-y-2">
        <div className="flex items-center gap-2 py-2">
          <div className="size-4 rounded bg-muted" />
          <div
            className="h-5 rounded bg-muted"
            style={{ width: `${140 + (i * 37) % 120}px` }}
          />
        </div>
        {i < 2 && (
          <div className="pl-6 space-y-1.5">
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-5/6 rounded bg-muted" />
            <div className="h-3 w-2/3 rounded bg-muted" />
          </div>
        )}
      </div>
    ))}
  </div>
);

export default RcpViewerSkeleton;
