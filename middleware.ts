
import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Create a new ratelimiter, that allows 5 requests per 60 seconds
// If no Redis is configured, it will skip rate limiting (safer for dev)
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    ? Redis.fromEnv()
    : null;

const ratelimit = redis
    ? new Ratelimit({
        redis: redis,
        limiter: Ratelimit.slidingWindow(5, "60 s"),
        analytics: true,
    })
    : null;

export const config = {
    matcher: '/:path*',
};

export default async function middleware(request: NextRequest) {
    // Only limit the API routes or the main page upload action
    // Skip static files, images, favicon
    if (
        request.nextUrl.pathname.startsWith('/_next') ||
        request.nextUrl.pathname.startsWith('/static') ||
        request.nextUrl.pathname === '/favicon.ico'
    ) {
        return NextResponse.next();
    }

    // If Redis is not set up, skip limiting (Dev mode fallback)
    if (!ratelimit) {
        return NextResponse.next();
    }

    const ip = request.ip ?? "127.0.0.1";
    const { success, limit, reset, remaining } = await ratelimit.limit(ip);

    if (!success) {
        return new NextResponse("Too Many Requests. Please try again in a minute.", {
            status: 429,
            headers: {
                "X-RateLimit-Limit": limit.toString(),
                "X-RateLimit-Remaining": remaining.toString(),
                "X-RateLimit-Reset": reset.toString(),
            },
        });
    }

    const res = NextResponse.next();
    res.headers.set("X-RateLimit-Remaining", remaining.toString());
    return res;
}
