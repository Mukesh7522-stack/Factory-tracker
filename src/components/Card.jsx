const Card = ({ title, value, badge, children }) => (
  <div className="glass-panel flex flex-col gap-3 p-6 shadow-glow">
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-slate-400">{title}</p>
        <p className="text-2xl font-semibold text-white">{value}</p>
      </div>
      {badge && (
        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
          {badge}
        </span>
      )}
    </div>
    {children && <div className="text-sm text-slate-300">{children}</div>}
  </div>
);

export default Card;

