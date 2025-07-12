// Common utilities and modules used across multiple pages
export * from './imageModal.js';
export * from './popupWindow.js';

// Common DOM utilities
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastFunc: NodeJS.Timeout;
  let lastRan: number;
  return function executedFunction(...args: Parameters<T>) {
    if (!lastRan) {
      func(...args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if (Date.now() - lastRan >= limit) {
          func(...args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
}

// Performance monitoring utilities
export function measurePerformance(name: string, fn: () => void) {
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(`${name}-start`);
    fn();
    performance.mark(`${name}-end`);
    performance.measure(name, `${name}-start`, `${name}-end`);
  } else {
    fn();
  }
}

// Lazy loading utility
export function lazyLoad<T>(
  importFn: () => Promise<T>
): Promise<T> {
  return importFn();
}

// DOM ready utility
export function domReady(fn: () => void) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}