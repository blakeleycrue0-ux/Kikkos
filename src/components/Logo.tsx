export function Logo({ variant = 'color', width = 150, className }: { variant?: 'color' | 'reversed' | 'icon'; width?: number; className?: string }) {
  const src = variant === 'icon' ? '/brand/kikko-icon.webp' : variant === 'reversed' ? '/brand/kikko-logo-reversed.webp' : '/brand/kikko-logo.webp';
  const ratio = variant === 'icon' ? 939 / 919 : 623 / 1923;
  return <img src={src} alt="KIKKO" width={width} height={Math.round(width * ratio)} className={className} draggable={false} />;
}
