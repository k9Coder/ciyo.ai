import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.mykka.ai' }],
        destination: 'https://mykka.ai/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
