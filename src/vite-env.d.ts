/// <reference types="vite/client" />

declare global {
  interface Window {
    tap?: {
      login?: () => Promise<{ code?: string }>;
    };
  }
}

export {};
