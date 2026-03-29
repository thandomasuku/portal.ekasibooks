declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

type EventParams = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(eventName: string, params: EventParams = {}): void {
  if (typeof window === "undefined") return;
  if (!GA_ID) return;
  if (typeof window.gtag !== "function") return;

  window.gtag("event", eventName, params);
}

export function trackPageView(url: string): void {
  if (typeof window === "undefined") return;
  if (!GA_ID) return;
  if (typeof window.gtag !== "function") return;

  window.gtag("config", GA_ID, {
    page_path: url,
  });
}

export {};