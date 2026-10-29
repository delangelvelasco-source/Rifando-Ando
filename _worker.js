const ORIGIN = "https://rifando-ando-mx.pages.dev";
const SHARE_IMAGE = "https://rifasmty.com/og-sorteo-regio.svg?v=4";

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);

    // Keep the catalog available at /catalogo, and the social image on this project.
    if (incoming.pathname === "/og-sorteo-regio.svg") {
      return env.ASSETS.fetch(request);
    }
    if (incoming.pathname === "/catalogo" || incoming.pathname === "/catalogo/") {
      const catalogUrl = new URL("/", incoming);
      return env.ASSETS.fetch(new Request(catalogUrl, request));
    }

    // The domain root opens Sorteo Regio directly. The explicit route remains an alias.
    const upstreamPath = incoming.pathname === "/" || incoming.pathname === "/sorteo-regio" || incoming.pathname === "/sorteo-regio/"
      ? "/sorteo-regio"
      : incoming.pathname;
    const upstream = new URL(upstreamPath + incoming.search, ORIGIN);
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
    if ((incoming.pathname === "/" || incoming.pathname.replace(/\/$/, "") === "/sorteo-regio") &&
        request.method === "GET" && contentType.includes("text/html")) {
      let html = await response.text();
      const tags = [
        '<title>Sorteo Regio | Premio de $50,000 MXN</title>',
        '<meta property="og:site_name" content="Sorteo Regio">',
        '<meta property="og:type" content="website">',
        '<meta property="og:title" content="Sorteo Regio | Premio de $50,000 MXN">',
        '<meta property="og:description" content="Premio de $50,000 MXN. Cada boleto cuesta $2 MXN. ¡Échale número, compa!">',
        '<meta property="og:url" content="https://rifasmty.com/?v=4">',
        '<meta property="og:image" content="' + SHARE_IMAGE + '">',
        '<meta property="og:image:secure_url" content="' + SHARE_IMAGE + '">',
        '<meta property="og:image:type" content="image/svg+xml">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="Sorteo Regio: premio de $50,000 MXN y boleto de $2 MXN">',
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="twitter:title" content="Sorteo Regio | Premio de $50,000 MXN">',
        '<meta name="twitter:description" content="Premio de $50,000 MXN. Cada boleto cuesta $2 MXN.">',
        '<meta name="twitter:image" content="' + SHARE_IMAGE + '">',
        '<link rel="canonical" href="https://rifasmty.com/">'
      ].join("\\n");
      // Remove upstream social tags first; duplicate og:image tags can make WhatsApp use the wrong preview.
      html = html.replace(/<title[^>]*>[\\s\\S]*?<\\/title>/i, "");
      html = html.replace(/<meta\\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, "");
      html = html.replace(/<link\\s+rel=["']canonical["'][^>]*>/gi, "");
      if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, match => match + "\\n" + tags + "\\n");
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