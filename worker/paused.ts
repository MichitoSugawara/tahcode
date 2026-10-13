export const PAUSED_STATUS = 503;
export const PAUSED_TITLE = "tahcode は一時停止しています";

const PAUSED_HTML = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${PAUSED_TITLE}</title>
    <style>
      :root {
        color-scheme: dark;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #121712;
        color: #c9c9c9;
        font-family:
          Inter,
          "Hiragino Sans",
          "Noto Sans JP",
          sans-serif;
      }
      main {
        max-width: 36rem;
        padding: 2rem;
      }
      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.5rem;
        color: #e8e8e8;
      }
      p {
        margin: 0;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${PAUSED_TITLE}</h1>
      <p>
        公開面と自動デプロイを一旦すべて止めています。Convex と R2
        のデータは残しています。再開は
        <code>docs/infra-pause.md</code>
        を見てください。
      </p>
    </main>
  </body>
</html>
`;

export default {
  fetch(): Response {
    return new Response(PAUSED_HTML, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "CDN-Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": "86400",
      },
      status: PAUSED_STATUS,
    });
  },
};
