/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/lejeuduDG/sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/lejeuduDG' }, { key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/lejeuduDG/manifest.webmanifest', headers: [{ key: 'Content-Type', value: 'application/manifest+json' }] },
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
    ];
  },
};
export default nextConfig;
