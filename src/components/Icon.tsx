import type { SVGProps } from 'react';

export type IconName =
  | 'bolt' | 'globe' | 'users' | 'arcade' | 'user' | 'back' | 'close' | 'share' | 'copy' | 'flame'
  | 'trophy' | 'clock' | 'target' | 'check' | 'x' | 'plus' | 'link' | 'gear' | 'sound' | 'mute'
  | 'arrow' | 'lock' | 'refresh' | 'logout' | 'mail' | 'apple' | 'google' | 'chevron' | 'one' | 'vibrate' | 'edit';

const P: Record<IconName, JSX.Element> = {
  bolt: <path d="M13.5 2.8 5.6 13.2c-.3.4 0 .9.5.9h4.6l-1.6 7.1c-.1.6.6.9 1 .4l8.3-10.6c.3-.4 0-.9-.5-.9h-4.7l1.3-6.9c.1-.6-.6-.9-1-.4Z" fill="currentColor" stroke="none" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3.5 9h17M3.5 15h17M12 3c-2.6 2.6-3.8 5.6-3.8 9s1.2 6.4 3.8 9c2.6-2.6 3.8-5.6 3.8-9S14.6 5.6 12 3Z" /></>,
  users: <><circle cx="9" cy="8.5" r="3.6" /><path d="M2.8 20c.6-3.4 3.1-5.4 6.2-5.4s5.6 2 6.2 5.4" /><path d="M15.6 5.2a3.4 3.4 0 0 1 0 6.6M17.6 14.9c1.9.6 3.2 2.3 3.6 5.1" /></>,
  arcade: <><rect x="2.8" y="7" width="18.4" height="11" rx="5.5" /><path d="M7.6 10.3v4.4M5.4 12.5h4.4" /><circle cx="15.4" cy="11.2" r="1.15" fill="currentColor" /><circle cx="17.6" cy="13.8" r="1.15" fill="currentColor" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c.8-4 3.8-6.3 7.5-6.3s6.7 2.3 7.5 6.3" /></>,
  back: <path d="M14.5 5 7.5 12l7 7" />,
  chevron: <path d="m9.5 5 7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  share: <><path d="M12 15V3.5M7.5 7.8 12 3.3l4.5 4.5" /><path d="M5 11.5v6.8c0 1.2 1 2.2 2.2 2.2h9.6c1.2 0 2.2-1 2.2-2.2v-6.8" /></>,
  copy: <><rect x="8.5" y="8.5" width="12" height="12" rx="3" /><path d="M15.5 5.2A2.8 2.8 0 0 0 12.8 3.5H6.3a2.8 2.8 0 0 0-2.8 2.8v6.5c0 1.2.7 2.2 1.7 2.6" /></>,
  flame: <path d="M12 21.2c3.9 0 6.8-2.7 6.8-6.5 0-3.4-2.2-5.4-3.6-7.2-.4 1.6-1.2 2.8-2.3 3.3.3-3.2-.9-6.3-3.8-8-.1 3.3-2.2 5.2-3.6 7-1.3 1.6-2.3 3.2-2.3 5 0 3.7 2.9 6.4 6.8 6.4Z" />,
  trophy: <><path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0V4Z" /><path d="M7.5 6.2H4.2c0 2.8 1.4 4.6 3.6 5M16.5 6.2h3.3c0 2.8-1.4 4.6-3.6 5M12 14v3.4M8.2 20.5h7.6M9.4 17.4h5.2v3.1H9.4z" /></>,
  clock: <><circle cx="12" cy="12.5" r="8.5" /><path d="M12 8v4.8l3 1.9M9.5 2.5h5" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.4" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  check: <path d="m4.8 12.6 4.5 4.5 9.9-10.2" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3.2-3.2a4 4 0 0 0-5.7-5.7l-1.1 1.1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3.2 3.2a4 4 0 0 0 5.7 5.7l1.1-1.1" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4A7.6 7.6 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.7 7.7 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.6-1.5l2.4.9 2-3.4-2-1.6Z" /></>,
  sound: <><path d="M4 9.5h3.2L12 5.2v13.6l-4.8-4.3H4z" /><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.4a8 8 0 0 1 0 11.2" /></>,
  mute: <><path d="M4 9.5h3.2L12 5.2v13.6l-4.8-4.3H4z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></>,
  vibrate: <><rect x="7.5" y="3.5" width="9" height="17" rx="2.5" /><path d="M3.5 9v6M20.5 9v6" /></>,
  arrow: <path d="M4.5 12h14.5M13.5 6.5 19 12l-5.5 5.5" />,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="3" /><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" /></>,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4v4.5H15" /></>,
  logout: <><path d="M14 4.5H7.3c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2H14" /><path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3.5" /><path d="m4 7 8 6 8-6" /></>,
  edit: <><path d="M4 20h4.2L19.4 8.8a2.4 2.4 0 0 0-3.4-3.4L4.8 16.6 4 20Z" /><path d="m14.5 7 3.4 3.4" /></>,
  one: <path d="M10 7.5 13 5v14" />,
  apple: <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6-.1 0-2.5-1-2.5-3.8ZM14.1 5.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3Z" fill="currentColor" stroke="none" />,
  google: <g stroke="none"><path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" fill="#4285F4" /><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" fill="#34A853" /><path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z" fill="#FBBC05" /><path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1Z" fill="#EA4335" /></g>,
};

export function Icon({ name, size = 24, stroke = 2.3, ...rest }: { name: IconName; size?: number; stroke?: number } & Omit<SVGProps<SVGSVGElement>, 'stroke'>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {P[name]}
    </svg>
  );
}
