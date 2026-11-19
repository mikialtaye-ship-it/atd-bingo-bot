/**
 * Lightweight in-memory session store for user interaction states
 * Automatically expires stale user states after 30 minutes.
 */

class SessionStore {
  constructor(ttlMs = 30 * 60 * 1000) {
    this.sessions = new Map();
    this.ttlMs = ttlMs;

    // Periodic cleanup of stale sessions every 10 minutes
    setInterval(() => this.cleanup(), 10 * 60 * 1000).unref();
  }

  get(userId) {
    const key = String(userId);
    const session = this.sessions.get(key);
    if (!session) return null;

    if (Date.now() - session.updatedAt > this.ttlMs) {
      this.sessions.delete(key);
      return null;
    }
    return session.data;
  }

  set(userId, data) {
    const key = String(userId);
    this.sessions.set(key, {
      data,
      updatedAt: Date.now(),
    });
  }

  update(userId, partialData) {
    const current = this.get(userId) || {};
    this.set(userId, { ...current, ...partialData });
  }

  clear(userId) {
    this.sessions.delete(String(userId));
  }

  cleanup() {
    const now = Date.now();
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.updatedAt > this.ttlMs) {
        this.sessions.delete(key);
      }
    }
  }
}

module.exports = new SessionStore();
