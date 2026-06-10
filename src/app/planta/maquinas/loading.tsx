export default function FactoryMachinesLoading() {
  return (
    <main className="min-h-screen bg-[var(--xt-paper)]">
      <div className="sticky top-0 z-10 border-b border-[var(--xt-graphite)] bg-[var(--xt-black)] text-[var(--xt-white)]">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="h-10 w-56 animate-pulse bg-white/15" />
          <div className="flex gap-3">
            <div className="h-11 w-40 animate-pulse bg-white/15" />
            <div className="h-11 w-32 animate-pulse bg-white/15" />
          </div>
        </div>
        <div className="xt-hazard h-2" />
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="min-h-[230px] border border-[var(--xt-black)] bg-[var(--xt-white)] p-5 shadow-[var(--shadow-sm)]">
            <div className="grid h-full gap-4">
              <div className="h-4 w-20 animate-pulse bg-[var(--xt-cement)]" />
              <div className="h-12 w-3/4 animate-pulse bg-[var(--xt-cement)]" />
              <div className="space-y-2">
                <div className="h-4 w-full animate-pulse bg-[var(--xt-cement)]" />
                <div className="h-4 w-5/6 animate-pulse bg-[var(--xt-cement)]" />
              </div>
              <div className="mt-auto h-6 w-1/2 animate-pulse bg-[var(--xt-cement)]" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
