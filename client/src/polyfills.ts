import { Buffer } from 'buffer';

// Polyfill Buffer for browser compatibility with Solana libraries
// This must be set before any Solana libraries are imported
if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
}
if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = Buffer;
}
if (typeof global !== 'undefined') {
  (global as any).Buffer = Buffer;
}

export { Buffer };
