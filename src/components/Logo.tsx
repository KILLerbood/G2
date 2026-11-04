import mark from '../assets/logo-mark.webp';

/** The Magmafy mark (official artwork, cut out on transparency). */
export function Logo({ size = 40 }: { size?: number }) {
  return <img className="logo-mark" src={mark} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}

/** Mark + «Magmafy» wordmark with the sunset «fy», as in the official lockup. */
export function Wordmark({ size = 40, suffix }: { size?: number; suffix?: string }) {
  return (
    <span className="wordmark" dir="ltr">
      <Logo size={size} />
      <span className="wordmark__text" style={{ fontSize: size * 0.62 }}>Magma<span className="wordmark__fy">fy</span>{suffix ? <small> {suffix}</small> : null}</span>
    </span>
  );
}
