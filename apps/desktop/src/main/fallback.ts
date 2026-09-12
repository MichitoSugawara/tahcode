/* Shown when the web app cannot be reached (offline, deployment down).
 * Rendered from a data: URL so it needs no bundled assets; the "retry"
 * button navigates back to the app origin, which the navigation policy allows. */

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function fallbackPage(appUrl: string, detail: string): string {
  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="color-scheme" content="light dark" />
<title>dalecode — 接続できません</title>
<style>
  :root { color-scheme: light dark; --canvas: #f4f5f6; --ink: #1c1f1c; --muted: #6b716b; --line: #0e9c2d55; --btn: #077015; --btn-hover: #0ab320; }
  @media (prefers-color-scheme: dark) { :root { --canvas: #0b140b; --ink: #c9c9c9; --muted: #8a938a; } }
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; background: var(--canvas); color: var(--ink);
         font: 14px/1.6 -apple-system, "Inter Variable", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 420px; padding: 32px; border: 1px solid var(--line); border-radius: 14px; }
  h1 { font-size: 18px; font-weight: 500; margin: 0 0 8px; letter-spacing: -0.01em; }
  p { margin: 0 0 8px; color: var(--muted); }
  code { font: 12px/1.5 "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  button { margin-top: 16px; padding: 8px 14px; border: 0; border-radius: 8px; background: var(--btn); color: #fff;
           font: inherit; font-weight: 500; cursor: pointer; }
  button:hover { background: var(--btn-hover); }
</style>
</head>
<body>
<main>
  <h1>dalecode に接続できません</h1>
  <p>ネットワーク接続を確認してから、もう一度お試しください。</p>
  <p><code>${escapeHtml(appUrl)}</code></p>
  <p><code>${escapeHtml(detail)}</code></p>
  <button type="button" onclick="location.replace(${JSON.stringify(appUrl)})">再接続</button>
</main>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
