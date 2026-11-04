// Line icons on a 24 grid, stroke 1.8 (same family as the P set in crm.html).
const P: Record<string, string> = {
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  contacts: '<circle cx="9" cy="8" r="3.4"/><path d="M3 19.5c.6-3.3 3.1-5 6-5s5.4 1.7 6 5"/><path d="M15.5 4.6a3.4 3.4 0 0 1 0 6.8M17.6 14.6c1.8.6 3 2.2 3.4 4.9"/>',
  building: '<path d="M4 20V6.5L12 4v16M12 9h8v11"/><path d="M7.5 9h1M7.5 12.5h1M7.5 16h1M15.5 12.5h1M15.5 16h1M3 20h18"/>',
  tasks: '<rect x="4" y="4" width="16" height="16" rx="5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/>',
  tools: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  inbox: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/><path d="M8.5 9.5h7M8.5 12.5h4"/>',
  megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l7 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M17.5 9a4 4 0 0 1 0 6M7.5 15l1 4.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="4"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M7 17 17 7M9 7h8v8"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  filter: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
  wa: '<path d="M4 20l1.2-3.7A8 8 0 1 1 7.9 19z"/><path d="M9.2 8.6c-.4 2.8 2.9 6.2 5.8 5.9l.9-1.4-1.9-1-.9.7a4 4 0 0 1-2.3-2.3l.7-.9-1-1.9z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  phone: '<path d="M5.5 4h3.3l1.7 4.4-2.1 1.3a11 11 0 0 0 5.9 5.9l1.3-2.1 4.4 1.7v3.3a1.8 1.8 0 0 1-1.9 1.8A15.5 15.5 0 0 1 3.7 5.9 1.8 1.8 0 0 1 5.5 4z"/>',
  note: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8.5h5M9 13h7M9 16.5h4.5"/>',
  doc: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8.5h5"/>',
  video: '<rect x="3" y="6.5" width="12" height="11" rx="2.5"/><path d="m15 10.5 6-3v9l-6-3"/>',
  stage: '<path d="M4 12h12M12 6.5 17.5 12 12 17.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  monitor: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checks: '<path d="m3 12.5 4 4L15 8.5M11 16.5l1 1 8.5-9"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.5"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
  logout: '<path d="M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h9.5"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>',
  reply: '<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="M12 3.5 5 6v6c0 4.2 3 7.4 7 8.5 4-1.1 7-4.3 7-8.5V6z"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4M12 8v4l3 2"/>',
  userplus: '<circle cx="10" cy="8" r="3.4"/><path d="M4 19.5c.6-3.3 3.1-5 6-5s5.4 1.7 6 5M18.5 8v6M15.5 11h6"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.7-3.6 3.6-5.6 7-5.6s6.3 2 7 5.6"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 19c.6-3.2 3-4.8 6-4.8s5.4 1.6 6 4.8M15.5 14.4c2.6.1 4.5 1.6 5 4.6"/>',
  board: '<rect x="3.5" y="4" width="5" height="16" rx="1.6"/><rect x="10.5" y="4" width="5" height="11" rx="1.6"/><rect x="17.5" y="4" width="3.5" height="7" rx="1.4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  template: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 9h16M9 9v11"/>',
  activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  hangup: '<path d="M3 13.5c5-4.5 13-4.5 18 0l-2.5 2.5-3-1.5v-2.5a10 10 0 0 0-7 0v2.5l-3 1.5z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  sparkle: '<path d="M12 3.5 13.8 9 19.5 10.5 13.8 12 12 17.5 10.2 12 4.5 10.5 10.2 9z"/><path d="M18.5 15.5 19.2 17.8 21.5 18.5 19.2 19.2 18.5 21.5 17.8 19.2 15.5 18.5 17.8 17.8z"/>',
  cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  fire: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-3.8 3.3-5.6 3.8-9 2.2 1.3 3.2 3.4 3.2 5 1-.6 1.6-1.7 1.7-3 2.4 1.8 4.3 4.4 4.3 7 0 3.4-2.6 6-6.5 6z"/>'
};

export function Icon({ name, size, className, label }: { name: string; size?: number; className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      width={size} height={size} className={className} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}
      dangerouslySetInnerHTML={{ __html: P[name] || '' }}
    />
  );
}

/** Small brand marks for the meeting platforms and WhatsApp (as on the kit's task cards). */
export function Brand({ name, size = 22 }: { name: 'meet' | 'zoom' | 'wa' | 'mail' | 'call' | 'doc'; size?: number }) {
  if (name === 'meet') return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path fill="#00832d" d="M13.5 12 15.6 14.4 18.4 16.2l.5-4.2-.5-4.1-2.9 1.6z" /><path fill="#0066da" d="M3 15.8v3.6c0 .8.7 1.5 1.5 1.5h3.6l.8-2.7-.8-2.4-2.5-.8z" /><path fill="#e94235" d="M8.1 3 3 8.1l2.6.8 2.5-.8.8-2.5z" /><path fill="#2684fc" d="M8.1 8.1H3v7.7h5.1z" /><path fill="#00ac47" d="M19.5 5.2l-3.9 3.2v7l3.9 3.2c.6.5 1.5.1 1.5-.7V5.9c0-.8-.9-1.2-1.5-.7zM13.5 12v3.8H8.1V21h7.4c.8 0 1.5-.7 1.5-1.5v-4z" /><path fill="#ffba00" d="M15.5 3H8.1v5.1h5.4V12l3.5-2.9V4.5c0-.8-.7-1.5-1.5-1.5z" /></svg>
  );
  if (name === 'zoom') return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><rect width="24" height="24" rx="7" fill="#2d8cff" /><path fill="#fff" d="M5 8.5h8.5a2 2 0 0 1 2 2V16H7a2 2 0 0 1-2-2zM16.5 11l3-2.2v6.4l-3-2.2z" /></svg>;
  if (name === 'wa') return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#25d366" /><path fill="#fff" d="M17.3 14.4c-.3-.1-1.6-.8-1.9-.9-.3-.1-.4-.1-.6.1l-.8 1c-.2.2-.3.2-.6.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.9-2c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 .9-1 2.3s1 2.7 1.1 2.9c.1.2 2 3.1 4.9 4.3 1.8.8 2.5.8 3.4.7.5-.1 1.6-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.2-.1-.5-.2z" /></svg>;
  return <Icon name={name === 'call' ? 'phone' : name} size={size} />;
}
