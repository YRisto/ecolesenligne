/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // Kokolio : l'application n'exécute que ses propres scripts, ne s'affiche dans aucun cadre, et n'est pas indexée.
    const kokolioCsp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; "
      + "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
    const kokolioCommuns = [
      { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), payment=(), usb=()' },
    ];
    return [
      { source: '/kokolio', headers: [{ key: 'Content-Security-Policy', value: kokolioCsp }, { key: 'Cache-Control', value: 'no-cache' }, ...kokolioCommuns] },
      { source: '/Kokolio', headers: [{ key: 'Content-Security-Policy', value: kokolioCsp }, { key: 'Cache-Control', value: 'no-cache' }, ...kokolioCommuns] },
      { source: '/kokolio/index.html', headers: [{ key: 'Content-Security-Policy', value: kokolioCsp }, { key: 'Cache-Control', value: 'no-cache' }, ...kokolioCommuns] },
      { source: '/kokolio/js/:path*', headers: [{ key: 'Cache-Control', value: 'no-cache' }, ...kokolioCommuns] },
      { source: '/kokolio/app.css', headers: [{ key: 'Cache-Control', value: 'no-cache' }, ...kokolioCommuns] },
      { source: '/kokolio/manifest.webmanifest', headers: [{ key: 'Content-Type', value: 'application/manifest+json' }] },
      { source: '/kokolio/fonts/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/api/kokolio/:path*', headers: kokolioCommuns },
      { source: '/lejeuduDG/sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/lejeuduDG' }, { key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/lejeuduDG/manifest.webmanifest', headers: [{ key: 'Content-Type', value: 'application/manifest+json' }] },
      { source: '/landoflord/sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/landoflord' }, { key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/landoflord/manifest.webmanifest', headers: [{ key: 'Content-Type', value: 'application/manifest+json' }] },
    ];
  },
  async rewrites() {
    return [
      { source: '/lejeuduDG', destination: '/lejeuduDG/index.html' },
      { source: '/lejeududg', destination: '/lejeuduDG/index.html' },
      { source: '/lejeuduDG/stats', destination: '/lejeuduDG/stats.html' },
      { source: '/xyn', destination: '/xyn/index.html' },
      { source: '/Xyn', destination: '/xyn/index.html' },
      { source: '/XYN', destination: '/xyn/index.html' },
      { source: '/landoflord', destination: '/landoflord/index.html' },
      { source: '/LandOfLord', destination: '/landoflord/index.html' },
      { source: '/velpo', destination: '/velpo/index.html' },
      { source: '/Velpo', destination: '/velpo/index.html' },
      { source: '/kokolio', destination: '/kokolio/index.html' },
      { source: '/Kokolio', destination: '/kokolio/index.html' },
      { source: '/kokolio/demo', destination: '/kokolio/demo/index.html' },
    ];
  },
};
export default nextConfig;
