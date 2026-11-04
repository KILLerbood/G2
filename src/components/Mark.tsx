/** G2 mark: a carbon square with «G2» in mono and a signal-orange cursor bar. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="g-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="3" fill="currentColor" />
      <text x="5" y="21" fontFamily="ui-monospace, Menlo, Consolas, monospace" fontWeight="700" fontSize="14" fill="var(--g-mark-ink, #fff)">G2</text>
      <rect x="24" y="9" width="3" height="14" fill="var(--signal)"><animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite" /></rect>
    </svg>
  );
}

export function Brand({ sub = 'COMMAND' }: { sub?: string }) {
  return (
    <span className="g-brand" dir="ltr">
      <Mark />
      <span className="g-brand__txt"><b>Magmafy</b><i>/{sub}</i></span>
    </span>
  );
}
