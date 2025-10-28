// ==================== RATE LIMITER ====================
// Protects auth endpoints from brute force attacks and email flooding

class RateLimiter {
  constructor() {
    this.attempts = new Map();
    this.emailsSent = new Map();
    this.blocklist = new Map();

    // Clean up every hour
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  // Check if IP is allowed to make another attempt
  canAttempt(ip, action = 'auth') {
    if (this.isBlocked(ip)) return false;

    const key = `${ip}:${action}`;
    const now = Date.now();

    // Get attempts in the last hour
    const attempts = this.attempts.get(key) || [];
    const recentAttempts = attempts.filter((time) => now - time < 60 * 60 * 1000);

    // Update attempts
    this.attempts.set(key, recentAttempts);

    // Check limits based on action
    switch (action) {
      case 'auth':
        return recentAttempts.length < 5; // 5 attempts per hour
      case 'email':
        return recentAttempts.length < 3; // 3 emails per hour
      default:
        return recentAttempts.length < 10; // 10 attempts per hour default
    }
  }

  // Record an attempt
  recordAttempt(ip, action = 'auth') {
    const key = `${ip}:${action}`;
    const attempts = this.attempts.get(key) || [];
    attempts.push(Date.now());
    this.attempts.set(key, attempts);

    // Check if should be blocked
    const recentAttempts = attempts.filter((time) => Date.now() - time < 60 * 60 * 1000);
    if (recentAttempts.length >= 10) {
      // Block after 10 attempts regardless of action
      this.block(ip);
    }
  }

  // Block an IP
  block(ip) {
    this.blocklist.set(ip, Date.now() + 24 * 60 * 60 * 1000); // 24 hour block
    console.log(`🛡️ Blocked IP ${ip} for 24 hours due to excessive attempts`);
  }

  // Check if IP is blocked
  isBlocked(ip) {
    const blockExpiry = this.blocklist.get(ip);
    if (!blockExpiry) return false;

    if (Date.now() >= blockExpiry) {
      this.blocklist.delete(ip);
      return false;
    }

    return true;
  }

  // Clean up old entries
  cleanup() {
    const now = Date.now();

    // Clean up attempts older than 1 hour
    for (const [key, attempts] of this.attempts) {
      const recentAttempts = attempts.filter((time) => now - time < 60 * 60 * 1000);
      if (recentAttempts.length === 0) {
        this.attempts.delete(key);
      } else {
        this.attempts.set(key, recentAttempts);
      }
    }

    // Clean up expired blocks
    for (const [ip, expiry] of this.blocklist) {
      if (now >= expiry) {
        this.blocklist.delete(ip);
      }
    }
  }
}

module.exports = new RateLimiter();
