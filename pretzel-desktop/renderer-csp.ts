/**
 * Content-Security-Policy for the two renderer windows (tray + decision).
 *
 * These windows run privileged UI: they hold the preload bridge to the main
 * process. A CSP means that if attacker-controlled text ever reached the DOM
 * (a rule name, a matched snippet, a hostname), it could not turn into running
 * script. They load nothing from the network, so the policy can be very tight:
 * only bundled scripts and styles, images as bundled files or data: URIs, and
 * no network connections at all.
 *
 * Applied at build time only (see the plugin below): the Vite dev server needs
 * inline scripts for hot reload, which this policy would block.
 */
export const RENDERER_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/** Inserts the CSP <meta> as the first thing in <head> so it applies to everything after it. */
export function injectCsp(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${RENDERER_CSP}" />`
  return html.replace(/<head>/i, `<head>\n    ${meta}`)
}

/** Vite plugin: production builds only. */
export function cspPlugin() {
  return {
    name: 'pretzel-renderer-csp',
    apply: 'build' as const,
    transformIndexHtml: injectCsp,
  }
}
