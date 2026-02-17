import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb', // Increase limit for image payloads
        },
    },
    // Allow external scripts for PDF.js CDN if needed (usually handled by browser)
};

export default nextConfig;
