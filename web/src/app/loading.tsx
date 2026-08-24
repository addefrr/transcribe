export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="mx-auto min-h-64 max-w-3xl py-16 sm:py-24"
    >
      <p className="text-sm font-medium text-muted">Loading page…</p>
      <div aria-hidden="true" className="mt-5 space-y-3">
        <div className="h-7 w-2/3 rounded bg-paper-2" />
        <div className="h-4 w-full max-w-xl rounded bg-paper-2" />
        <div className="h-4 w-4/5 max-w-lg rounded bg-paper-2" />
      </div>
    </div>
  );
}
