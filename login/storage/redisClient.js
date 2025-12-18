import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// Create a mock Redis client for test environment
const createMockRedisClient = () => ({
  isOpen: false,
  connect: async () => Promise.resolve(),
  get: async () => null,
  set: async () => 'OK',
  hSet: async () => 1,
  hGet: async () => null,
  hGetAll: async () => ({}),
  hIncrBy: async () => 1,
  sAdd: async () => 1,
  sIsMember: async () => false,
  del: async () => 1,
  setEx: async () => 'OK',
  expire: async () => true,
  on: () => {},
  disconnect: async () => Promise.resolve(),
});

// Build Redis URL with password support
const buildRedisUrl = () => {
  // If REDIS_URL is explicitly provided, use it (may already include password)
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  // Otherwise, build URL without password (password will be set separately)
  const host = process.env.REDIS_HOST || '39.97.36.219';
  const port = process.env.REDIS_PORT || '6379';

  // URL format: redis://host:port (password set separately for better compatibility)
  return `redis://${host}:${port}`;
};

const redisClient =
  process.env.NODE_ENV === 'test'
    ? createMockRedisClient()
    : createClient({
        url: buildRedisUrl(),
        password: process.env.REDIS_PASSWORD || 'KuranGames!',
      });

// Only set up error handlers and auto-connect for real Redis client
if (process.env.NODE_ENV !== 'test') {
  redisClient.on('error', (err) => console.log('Redis Client Error', err));

  // Auto-connect on first use
  const originalClient = /** @type {any} */ (redisClient);
  const connectIfNeeded = async () => {
    if (!originalClient.isOpen && !originalClient.isReady) {
      try {
        await originalClient.connect();
        console.log('Redis client connected successfully');
      } catch (error) {
        console.error('Failed to connect to Redis:', error);
        throw error;
      }
    }
  };

  // Wrap critical methods to auto-connect
  const wrapMethod = (methodName) => {
    const originalMethod = originalClient[methodName];
    if (typeof originalMethod !== 'function') return;
    originalClient[methodName] = async (...args) => {
      await connectIfNeeded();
      return originalMethod.apply(originalClient, args);
    };
  };

  // Wrap commonly used methods
  // 注意：Redis v4+ 中，hSet 方法可以接受对象来设置多个字段（替代了原来的 hMSet）
  [
    'get',
    'set',
    'hSet',
    'hGet',
    'hGetAll',
    'hIncrBy',
    'sAdd',
    'sIsMember',
    'del',
    'setEx',
    'expire',
  ].forEach(wrapMethod);
}

export default redisClient;


