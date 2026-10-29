export default function Etoiles({ note }) {
  const pct = Math.max(0, Math.min(100, (note / 5) * 100));
  return (
    <span className="etoiles" title={`${note.toFixed(1)} / 5`} aria-label={`${note.toFixed(1)} sur 5`}>
      <span className="etoiles-bg">★★★★★</span><span className="etoiles-fg" style={{ width: `${pct}%` }}>★★★★★</span>
      <strong>{note.toFixed(1).replace(".", ",")}</strong>
    </span>
  );
}
