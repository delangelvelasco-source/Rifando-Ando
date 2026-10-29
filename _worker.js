const ORIGIN = "https://rifando-ando-mx.pages.dev";
const SHARE_IMAGE = "https://rifasmty.com/og-sorteo-regio.svg";

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);

    // Keep the Rifa Regia catalog and its share image on this Pages project.
    if (incoming.pathname === "/" || incoming.pathname === "/og-sorteo-regio.svg") {
      return env.ASSETS.fetch(request);
    }

    // Proxy the original raffle under the branded path.
    const upstream = new URL(incoming.pathname + incoming.search, ORIGIN);
    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-Host", incoming.host);
    headers.set("X-Forwarded-Proto", incoming.protocol.replace(":", ""));

    const upstreamRequest = new Request(upstream.toString(), {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual"
    });

    const response = await fetch(upstreamRequest);
    const outHeaders = new Headers(response.headers);
    const location = outHeaders.get("Location");
    if (location) {
      try {
        const redirected = new URL(location);
        if (redirected.hostname === "rifando-ando-mx.pages.dev") {
          redirected.hostname = incoming.hostname;
          outHeaders.set("Location", redirected.toString());
        }
      } catch {}
    }

    const contentType = outHeaders.get("Content-Type") || "";
    if (incoming.pathname.replace(/\/$/, "") === "/sorteo-regio" &&
        request.method === "GET" &&
        contentType.includes("text/html")) {
      let html = await response.text();
      const tags = [
        '<title>Sorteo Regio | Rifa Regia</title>',
        '<meta property="og:site_name" content="Rifa Regia">',
        '<meta property="og:type" content="website">',
        '<meta property="og:title" content="Sorteo Regio | Premio de $50,000 MXN">',
        '<meta property="og:description" content="Premio de $50,000 MXN. Cada boleto cuesta $2 MXN. ¡Échale número, compa!">',
        '<meta property="og:url" content="https://rifasmty.com/sorteo-regio">',
        '<meta property="og:image" content="' + SHARE_IMAGE + '">',
        '<meta property="og:image:secure_url" content="' + SHARE_IMAGE + '">',
        '<meta property="og:image:type" content="image/svg+xml">',
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="twitter:title" content="Sorteo Regio | Premio de $50,000 MXN">',
        '<meta name="twitter:description" content="Premio de $50,000 MXN. Cada boleto cuesta $2 MXN.">',
        '<meta name="twitter:image" content="' + SHARE_IMAGE + '">',
        '<link rel="canonical" href="https://rifasmty.com/sorteo-regio">'
      ].join("\n");
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, match => match + "\n" + tags + "\n");
      }
      outHeaders.delete("Content-Length");
      outHeaders.delete("ETag");
      outHeaders.set("Cache-Control", "public, max-age=300");
      return new Response(html, { status: response.status, statusText: response.statusText, headers: outHeaders });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outHeaders
    });
  }
};