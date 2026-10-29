import "./globals.css";
import Header from "../components/Header";
import Footer from "../components/Footer";

export const metadata = {
  metadataBase: new URL("https://ecolesenligne.fr"),
  title: { default: "Écoles en ligne — Comparateur de formations 100 % à distance", template: "%s | ecolesenligne.fr" },
  description: "Comparez les formations à distance (BTS, Bachelors, titres professionnels, VAE) et demandez des renseignements aux écoles.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <Header />
        <main className="wrap">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
