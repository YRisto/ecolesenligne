/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
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
    ];
  },
};
export default nextConfig;
