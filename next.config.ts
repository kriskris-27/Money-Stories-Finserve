import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Allow external scripts for PDF.js CDN if needed (usually handled by browser)
    webpack: (config) => {
        config.resolve.alias.canvas = false;
        return config;
    },
    experimental: {
        serverActions: {
            bodySizeLimit: "50mb",
        },
    },
};

export default nextConfig;
