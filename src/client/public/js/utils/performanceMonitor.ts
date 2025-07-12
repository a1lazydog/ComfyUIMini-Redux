// Performance monitoring utility
export class PerformanceMonitor {
  private metrics: Map<string, number> = new Map();
  private startTimes: Map<string, number> = new Map();

  constructor() {
    this.initializeWebVitals();
    this.trackPageLoad();
  }

  // Start timing a specific operation
  startTiming(name: string) {
    this.startTimes.set(name, performance.now());
  }

  // End timing and store the result
  endTiming(name: string) {
    const startTime = this.startTimes.get(name);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.metrics.set(name, duration);
      this.startTimes.delete(name);
      console.log(`Performance: ${name} took ${duration.toFixed(2)}ms`);
      return duration;
    }
    return 0;
  }

  // Get a specific metric
  getMetric(name: string): number {
    return this.metrics.get(name) || 0;
  }

  // Get all metrics
  getAllMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }

  // Track page load performance
  private trackPageLoad() {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        
        if (navigation) {
          this.metrics.set('domContentLoaded', navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart);
          this.metrics.set('loadComplete', navigation.loadEventEnd - navigation.loadEventStart);
          this.metrics.set('totalLoadTime', navigation.loadEventEnd - navigation.fetchStart);
          this.metrics.set('dnsLookup', navigation.domainLookupEnd - navigation.domainLookupStart);
          this.metrics.set('tcpConnection', navigation.connectEnd - navigation.connectStart);
          this.metrics.set('ttfb', navigation.responseStart - navigation.fetchStart);
          
          console.log('Page Load Metrics:', this.getAllMetrics());
        }
      }, 0);
    });
  }

  // Initialize Core Web Vitals tracking
  private initializeWebVitals() {
    // Track LCP (Largest Contentful Paint)
    this.observeLCP();
    
    // Track FID (First Input Delay)
    this.observeFID();
    
    // Track CLS (Cumulative Layout Shift)
    this.observeCLS();
  }

  // Track Largest Contentful Paint
  private observeLCP() {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      
      if (lastEntry) {
        this.metrics.set('lcp', lastEntry.startTime);
        console.log('LCP:', lastEntry.startTime);
      }
    });
    
    try {
      observer.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
      console.warn('LCP observation not supported');
    }
  }

  // Track First Input Delay
  private observeFID() {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.name === 'first-input') {
          const fid = (entry as any).processingStart - entry.startTime;
          this.metrics.set('fid', fid);
          console.log('FID:', fid);
        }
      });
    });
    
    try {
      observer.observe({ entryTypes: ['first-input'] });
    } catch (e) {
      console.warn('FID observation not supported');
    }
  }

  // Track Cumulative Layout Shift
  private observeCLS() {
    let clsValue = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      }
      this.metrics.set('cls', clsValue);
    });
    
    try {
      observer.observe({ entryTypes: ['layout-shift'] });
    } catch (e) {
      console.warn('CLS observation not supported');
    }
  }

  // Track resource loading performance
  trackResourceLoading() {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.name.includes('.js') || entry.name.includes('.css')) {
          const resourceName = entry.name.split('/').pop() || entry.name;
          this.metrics.set(`resource_${resourceName}`, entry.duration);
        }
      });
    });
    
    try {
      observer.observe({ entryTypes: ['resource'] });
    } catch (e) {
      console.warn('Resource observation not supported');
    }
  }

  // Send metrics to server (if needed)
  sendMetrics() {
    const metrics = this.getAllMetrics();
    
    // Only send if we have meaningful metrics
    if (Object.keys(metrics).length > 0) {
      fetch('/api/metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metrics,
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      }).catch(console.error);
    }
  }

  // Generate a performance report
  generateReport(): string {
    const metrics = this.getAllMetrics();
    
    let report = 'Performance Report:\n';
    report += '==================\n\n';
    
    // Core Web Vitals
    report += 'Core Web Vitals:\n';
    report += `- LCP: ${metrics.lcp?.toFixed(2) || 'N/A'}ms\n`;
    report += `- FID: ${metrics.fid?.toFixed(2) || 'N/A'}ms\n`;
    report += `- CLS: ${metrics.cls?.toFixed(4) || 'N/A'}\n\n`;
    
    // Load times
    report += 'Load Times:\n';
    report += `- Total Load Time: ${metrics.totalLoadTime?.toFixed(2) || 'N/A'}ms\n`;
    report += `- DOM Content Loaded: ${metrics.domContentLoaded?.toFixed(2) || 'N/A'}ms\n`;
    report += `- TTFB: ${metrics.ttfb?.toFixed(2) || 'N/A'}ms\n\n`;
    
    // Custom metrics
    report += 'Custom Metrics:\n';
    Object.entries(metrics).forEach(([key, value]) => {
      if (!['lcp', 'fid', 'cls', 'totalLoadTime', 'domContentLoaded', 'ttfb'].includes(key)) {
        report += `- ${key}: ${value.toFixed(2)}ms\n`;
      }
    });
    
    return report;
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Auto-send metrics on page unload
window.addEventListener('beforeunload', () => {
  performanceMonitor.sendMetrics();
});