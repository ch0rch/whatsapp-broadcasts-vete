import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // Sentry webpack plugin options
  // Suppress source map upload warnings when SENTRY_DSN/SENTRY_AUTH_TOKEN are not set (local dev)
  silent: !process.env.SENTRY_AUTH_TOKEN,
  // Disable source map upload — enable when SENTRY_AUTH_TOKEN is available in CI
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Automatically tree-shake Sentry logger statements in production
  disableLogger: true,
  // Tunnel Sentry requests through our domain to avoid ad-blockers
  // Disabled for MVP — re-enable if significant event loss observed
  tunnelRoute: undefined,
});
