import Link from "next/link";
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div>
          <Link href="/" className="brand">Écoles<span>enligne</span>.fr</Link>
          <p>Comparateur indépendant de formations 100 % à distance. Les écoles présentées sont des partenaires ; elles peuvent rémunérer le site pour la mise en relation.</p>
          <p>© {new Date().getFullYear()} ecolesenligne.fr</p>
        </div>
        <nav aria-label="Pied de page">
          <Link href="/formations">Toutes les formations</Link>
          <Link href="/demande">Demander des infos</Link>
          <Link href="/mentions-legales">Mentions légales</Link>
          <Link href="/confidentialite">Confidentialité &amp; données</Link>
        </nav>
      </div>
    </footer>
  );
}
