const paths = {
  logo: 'M5 5h14v14H5z',
  home: 'M3 10l9-7 9 7v10H3zM9 20v-6h6v6',
  inspect: 'M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M8 12l3 3 5-6',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
  grid: 'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v5H4zM14 15h6v5h-6z',
  team: 'M9 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M1 20v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1m10-13a3 3 0 1 1-6 0 3 3 0 0 1 6 0m-4 8h2a4 4 0 0 1 4 4v1',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6-6-6 6 6 6',
  chevron: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  upload: 'M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5',
  download: 'M12 4v12m-4-4 4 4 4-4M4 15v5h16v-5',
  box: 'M4 4h16v16H4zM2 2h4v4H2zm16 16h4v4h-4z',
  camera: 'M3 7h5l2-3h4l2 3h5v13H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 4-5 5 6M15 8h.01',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4m-4 4v2',
  mail: 'M3 5h18v14H3zm0 1 9 7 9-7',
  building: 'M4 21V4h10v17M14 9h6v12M8 8h2m-2 4h2m-2 4h2M3 21h18',
  logout: 'M10 4H4v16h6m3-12 4 4-4 4m-5-4h13',
  alert: 'M12 3l10 18H2zm0 6v4m0 4h.01',
  info: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-11v6m0-9h.01',
  bolt: 'M13 2 4 14h7l-1 8 10-12h-7z',
  target: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-6 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  star: 'm12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.3-5.6-3-5.6 3 1-6.3L3 9.6l6.2-.9z',
  play: 'M8 4l13 8-13 8z',
  stop: 'M6 6h12v12H6z',
  check: 'M5 12l4 4L19 6',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  zoomIn: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm10 3-5-5M11 8v6m-3-3h6',
  zoomOut: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm10 3-5-5M8 11h6',
  sparkle: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6',
  save: 'M5 4h11l3 3v13H5zM8 4v5h8V4M8 20v-6h8v6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  clock: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-15v5l3 3',
  cpu: 'M7 7h10v10H7zM10 3v4m4-4v4m-4 10v4m4-4v4M3 10h4m-4 4h4m10-4h4m-4 4h4',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  sliders: 'M4 7h10m4 0h2M4 17h4m4 0h8M14 4v6M8 14v6',
  rocket: 'M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 15l-3-3a12 12 0 0 1 12-8 12 12 0 0 1-8 12zm6-6h.01',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4m-4 5a8 8 0 0 0 14.9 3M20 20v-4h-4',
  tag: 'M3 12V3h9l9 9-9 9zM8 8h.01',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  terminal: 'M3 5h18v14H3zM7 10l3 2-3 2m5 0h5',
  help: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6m0 3.5h.01',
  lightbulb: 'M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z',
  wand: 'M4 20 15 9m-2-2 2-2 4 4-2 2M17 3v2m4 4h-2M19 5l1-1',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size }: { name: IconName; size?: number }) {
  return <svg className="icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} />
  </svg>;
}

export function Logo() {
  return <span className="logo" aria-hidden="true"><span /></span>;
}
