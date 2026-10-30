/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/lejeuduDG', destination: '/lejeuduDG/index.html' },
      { source: '/lejeududg', destination: '/lejeuduDG/index.html' },
    ];
  },
};
export default nextConfig;
