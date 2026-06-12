export default function FactoryMachinesLoading() {
  return (
    <main className="xt-planta xt-planta-page min-h-screen bg-[var(--xt-paper)]">
      <div className="xt-planta-loading-header sticky top-0 z-10 border-b border-[var(--xt-graphite)] bg-[var(--xt-black)] text-[var(--xt-white)]">
        <div className="xt-planta-loading-bar flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="xt-loading-logo h-10 w-56 animate-pulse bg-white/15" />
          <div className="xt-loading-actions flex gap-3">
            <div className="xt-loading-button h-11 w-40 animate-pulse bg-white/15" />
            <div className="xt-loading-button h-11 w-32 animate-pulse bg-white/15" />
          </div>
        </div>
        <div className="xt-hazard h-2" />
      </div>

      <div className="xt-machine-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="xt-machine-card xt-loading-card min-h-[230px] border border-[var(--xt-black)] bg-[var(--xt-white)] p-5 shadow-[var(--shadow-sm)]">
            <div className="xt-loading-card-body grid h-full gap-4">
              <div className="xt-skeleton xt-skeleton-small h-4 w-20 animate-pulse bg-[var(--xt-cement)]" />
              <div className="xt-skeleton xt-skeleton-title h-12 w-3/4 animate-pulse bg-[var(--xt-cement)]" />
              <div className="xt-skeleton-stack space-y-2">
                <div className="xt-skeleton h-4 w-full animate-pulse bg-[var(--xt-cement)]" />
                <div className="xt-skeleton xt-skeleton-line h-4 w-5/6 animate-pulse bg-[var(--xt-cement)]" />
              </div>
              <div className="xt-skeleton xt-skeleton-status mt-auto h-6 w-1/2 animate-pulse bg-[var(--xt-cement)]" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
