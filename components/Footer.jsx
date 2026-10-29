import Link from "next/link";
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <p>© {new Date().getFullYear()} ecolesenligne.fr — Comparateur indépendant de formations 100 % à distance.
        Les écoles présentées sont des partenaires ; elles peuvent rémunérer le site pour la mise en relation.</p>
        <p><Link href="/mentions-legales">Mentions légales</Link> · <Link href="/confidentialite">Confidentialité & données</Link></p>
      </div>
    </footer>
  );
}
