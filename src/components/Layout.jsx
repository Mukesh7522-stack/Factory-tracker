const Layout = ({ children }) => (
  <div className="min-h-screen bg-slate-950 text-slate-50 brand-grid">
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-10 md:px-8">
      <header className="flex items-center justify-between pb-10">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-slate-400">
            Factory Tracker
          </p>
          <h1 className="text-2xl font-display font-semibold text-white">
            Operational Pulse
          </h1>
        </div>
        <button className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:border-white/30 hover:bg-white/10">
          Live status
        </button>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="pt-8 text-xs text-slate-500">
        Built with React + Tailwind · {new Date().getFullYear()}
      </footer>
    </div>
  </div>
);

export default Layout;

