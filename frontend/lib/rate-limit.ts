// Rate limiting utility using in-memory store (suitable for single-instance deployments)
// For distributed deployments, use Redis instead

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check if a request exceeds rate limit
 * @param key Unique identifier (IP, user ID, etc)
 * @param limit Maximum requests allowed
 * @param windowMs Time window in milliseconds
 * @returns true if limit exceeded, false if request is allowed
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // Initialize or reset if window expired
  if (!entry || now >= entry.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return false; // Request allowed
  }

  // Increment counter
  entry.count++;

  if (entry.count > limit) {
    return true; // Rate limit exceeded
  }

  return false; // Request allowed
}

/**
 * Clean up expired entries (call periodically)
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}


/**
 * Get client IP from request
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback: use a generic identifier if IP detection fails
  return 'unknown';
}
