import { useMemo } from "react";

/**
 * Returns an injectJavaScript-compatible script that highlights a previously
 * visited item in a WebView list, without changing the WebView source (which
 * would trigger a full reload and corrupt pagination state).
 *
 * Items are matched by their `data-route-link` attribute.
 */
export function useWebViewHighlight(
  previousUrl: string | undefined,
  getRouteLink: (link: string) => string,
): string | undefined {
  return useMemo(() => {
    if (!previousUrl) return undefined;

    const routePath = getRouteLink(previousUrl);

    return `
      (function() {
        var items = document.querySelectorAll('[data-route-link]');
        items.forEach(function(el) {
          var link = el.getAttribute('data-route-link');
          if (link && link.includes(${JSON.stringify(routePath)})) {
            el.style.setProperty('border-bottom-width', '5px');
          } else {
            el.style.removeProperty('border-bottom-width');
          }
        });
      })();
      true; // required by injectJavaScript — the script must evaluate to true
    `;
  }, [previousUrl, getRouteLink]);
}
