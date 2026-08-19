/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "utfs.io",
            },
        ],
        formats: ['image/avif', 'image/webp'],
        minimumCacheTTL: 31536000,
    }
};

export default config;