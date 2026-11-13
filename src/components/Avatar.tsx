const SKINS = [
  { bg: '#3777F6', fg: '#5B90F8', text: '#FFF8E9' },
  { bg: '#FF8C60', fg: '#FFA884', text: '#29232A' },
  { bg: '#C9FF67', fg: '#B3EC4E', text: '#29232A' },
  { bg: '#29232A', fg: '#3B343C', text: '#C9FF67' },
  { bg: '#183A9E', fg: '#2257D6', text: '#FFF8E9' },
  { bg: '#F6ECD4', fg: '#EADCBC', text: '#29232A' },
];

/** Geometric generated avatar: palette skin + motif + initials. */
export function Avatar({ name, seed, size = 44, ring }: { name: string; seed: number; size?: number; ring?: boolean }) {
  const s = SKINS[Math.abs(seed) % SKINS.length];
  const motif = Math.abs(Math.floor(seed / 7)) % 4;
  const initials = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '?';
  return (
    <div className="avatar" style={{ width: size, height: size, background: s.bg, color: s.text, fontSize: size * 0.38,
      boxShadow: ring ? `0 0 0 3px var(--cream), 0 0 0 5.5px ${s.bg}` : undefined }}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        {motif === 0 && <circle cx="34" cy="34" r="16" fill={s.fg} />}
        {motif === 1 && <path d="M40 0v22L18 0z" fill={s.fg} />}
        {motif === 2 && <rect x="-6" y="26" width="52" height="8" fill={s.fg} transform="rotate(-18 20 30)" />}
        {motif === 3 && <circle cx="6" cy="6" r="12" fill={s.fg} />}
      </svg>
      <span>{initials}</span>
    </div>
  );
}
