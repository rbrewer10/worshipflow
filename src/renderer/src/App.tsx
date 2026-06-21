function App(): JSX.Element {
  const phases = [
    { n: '0', title: 'Engine', desc: 'Main process owns the monitors · operator + output windows · lockstep state · crash recovery', status: 'next' },
    { n: '1', title: 'Run one Sunday', desc: 'Service builder · song library · KJV · countdown · backgrounds · volunteer mode · multi-screen mirror', status: 'planned' },
    { n: '2', title: 'Differentiators', desc: 'Screen routing + scenes · pastor/stage display · private booth messaging', status: 'planned' },
    { n: '3', title: 'Streaming', desc: 'OBS WebSocket · lower-thirds · NDI output', status: 'planned' },
    { n: '4', title: 'Everything else', desc: 'Sound Check Assistant · scheduler · QR · multi-church · cloud · mobile remote', status: 'planned' }
  ]

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 font-sans">
      <header className="border-b border-white/10 px-8 py-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✝</span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">WorshipFlow</h1>
            <p className="text-sm text-slate-400">Build Sunday once. Route it everywhere. — Snow Hill Church</p>
          </div>
        </div>
      </header>

      <main className="px-8 py-8 max-w-3xl">
        <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Project scaffolded ✓ &nbsp;·&nbsp; True Electron desktop app &nbsp;·&nbsp; React + TypeScript + Tailwind
        </div>

        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Build roadmap</h2>
        <ol className="space-y-3">
          {phases.map((p) => (
            <li
              key={p.n}
              className={`flex gap-4 rounded-lg border px-4 py-4 ${
                p.status === 'next'
                  ? 'border-blue-500/40 bg-blue-500/10'
                  : 'border-white/10 bg-white/[0.02]'
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-sm">
                {p.n}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">Phase {p.n} — {p.title}</h3>
                  {p.status === 'next' && (
                    <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[11px] font-semibold">NEXT</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-400">{p.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  )
}

export default App
