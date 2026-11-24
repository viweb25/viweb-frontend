const paths = {
  brand: 'M3 7l5 11 4-8 4 8 5-11M10 5h4',
  overview: 'M3 10l9-7 9 7v10H3zM9 20v-6h6v6',
  inspection: 'M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M8 12l3 3 5-6',
  models: 'M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
  test: 'M9 4h6m-5 0v6l-5 7a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-7V4M8 15h8',
  training: 'M3 5h18v14H3zM3 16l5-5 4 4 4-5 5 6M15 8h.01',
  catalogue: 'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v5H4zM14 15h6v5h-6z',
  preferences: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  check: 'M5 12l4 4L19 6',
} as const;

export function WorkspaceIcon({ name }: { name: keyof typeof paths }) {
  return <svg className="workspace-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} />
  </svg>;
}

export function InspectionIllustration() {
  return <svg className="inspection-illustration" viewBox="0 0 380 240" fill="none" aria-hidden="true">
    <defs>
      <pattern id="inspection-grid" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M24 0H0v24" stroke="#fff4eb" strokeOpacity=".17" />
      </pattern>
    </defs>
    <rect x="24" y="8" width="332" height="224" rx="22" fill="url(#inspection-grid)" />
    <path d="M74 48H50v24m256-24h24v24M50 168v24h24m256-24v24h-24" stroke="#ffdfc6" strokeWidth="2" />
    <path d="M145 94c0-13 11-24 24-24h42c13 0 24 11 24 24v54c0 13-11 24-24 24h-42c-13 0-24-11-24-24z" fill="#b7470d" stroke="#ffdfc6" strokeWidth="2" />
    <path d="M170 70V52h40v18m-64 60h88m-64 25h40" stroke="#ffdfc6" strokeWidth="2" />
    <rect x="152" y="44" width="76" height="41" rx="4" stroke="#fff" strokeWidth="2" />
    <path d="M82 85H298" stroke="#fff" strokeWidth="2" strokeDasharray="4 6" />
    <circle cx="270" cy="142" r="22" fill="#fff" />
    <path d="m260 142 7 7 13-14" stroke="#a83e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
