export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3.2c3.4 4.2 5.2 6.8 5.2 9.3a5.2 5.2 0 1 1-10.4 0c0-2.5 1.8-5.1 5.2-9.3z"
            fill="rgba(255,255,255,.95)"
          />
          <path
            d="M9.6 13.2c0 1.7 1.1 2.9 2.6 3.2"
            stroke="rgba(8,101,96,.55)"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div>
        <div className="brand-name">SokeriReport</div>
        {!compact && <div className="brand-tag">Zero-cloud glycemic summary</div>}
      </div>
    </div>
  );
}
