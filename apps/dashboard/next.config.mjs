/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dashboard is server-rendered; no secrets cross to the browser bundle.
  output: 'standalone',
  reactStrictMode: true,
};

export default nextConfig;
