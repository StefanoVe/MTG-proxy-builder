declare module 'react-dom/client' {
  import type { ReactNode } from 'react';
  export function createRoot(element: Element): { render(node: ReactNode): void };
}
