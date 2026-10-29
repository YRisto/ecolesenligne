import Link from "next/link";
export default function Header() {
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="brand">Écoles<span>enligne</span>.fr</Link>
        <nav>
          <Link href="/formations">Formations</Link>
          <Link href="/demande" className="btn-sm">Demander des infos</Link>
        </nav>
      </div>
    </header>
  );
}
