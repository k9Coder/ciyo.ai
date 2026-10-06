import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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

export default withSentryConfig(nextConfig, {
  org: "ciyoai",
  project: "mykka-web",
  // Source maps: upload during build for readable stack traces, then delete
  // from the client bundle so they aren't served publicly.
  widenClientFileUpload: true,
  // Skip source-map upload locally (no SENTRY_AUTH_TOKEN in dev).
  silent: !process.env.CI,
});
