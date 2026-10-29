import "./globals.css";

export const metadata = {
  title: "Écoles en ligne — Comparateur de formations 100 % à distance",
  description:
    "Comparez les formations à distance (BTS, Bachelors, titres professionnels, VAE) et demandez des renseignements aux écoles.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
