const ORIGIN = "https://rifando-ando-mx.pages.dev";
const SHARE_IMAGE = "https://rifasmty.com/sorteo-regio-share.png?v=3";

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);

    // Serve SEO files directly so the raffle proxy can never corrupt or replace them.
    if (incoming.pathname === "/robots.txt") {
      return new Response(
        "User-agent: *\nAllow: /\n\nSitemap: https://rifasmty.com/sitemap.xml\n",
        { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }
      );
    }
    if (incoming.pathname === "/sitemap.xml") {
      const sitemap = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        '<url><loc>https://rifasmty.com/</loc></url>' +
        '<url><loc>https://rifasmty.com/sorteo-regio</loc></url>' +
        '<url><loc>https://rifasmty.com/catalogo</loc></url>' +
        '</urlset>';
      return new Response(sitemap, {
        headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
    if (incoming.pathname === "/og-sorteo-regio.svg") {
      return env.ASSETS.fetch(request);
    }
    if (incoming.pathname === "/" || incoming.pathname === "/catalogo" || incoming.pathname === "/catalogo/") {
      const catalogUrl = new URL("/", incoming);
      return env.ASSETS.fetch(new Request(catalogUrl, request));
    }

    // Sorteo Regular RA-0002 y Sorteo Express RA-0014 usan la página dinámica
    // del sistema principal, seleccionada mediante el ID de la rifa.
    const isRegular = incoming.pathname === "/sorteo-regular" || incoming.pathname === "/sorteo-regular/";
    const isExpress = incoming.pathname === "/express" || incoming.pathname === "/express/";
    const upstreamPath = (isRegular || isExpress) ? "/" :
      (incoming.pathname === "/sorteo-regio" || incoming.pathname === "/sorteo-regio/" ? "/sorteo-regio" : incoming.pathname);
    const upstreamSearch = isRegular
      ? "?rifa=4b23f516-7973-4a04-bff6-9b9b5cb90f4d"
      : isExpress
        ? "?rifa=7b590439-69dc-4dc4-9a88-f0a5711d9c4a"
        : incoming.search;
    const upstream = new URL(upstreamPath + upstreamSearch, ORIGIN);
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

    // Vista previa independiente para Sorteo Regular RA-0002 ($1,000 MXN).
    // Evita que WhatsApp reutilice la imagen y el premio del Sorteo Regio.
    if (isRegular && request.method === "GET" && contentType.includes("text/html")) {
      let html = await response.text();
      const tags = [
        '<title>Sorteo Regular RA-0002 | Gana $1,000 MXN</title>',
        '<meta name="description" content="Participa en el Sorteo Regular RA-0002 y gana $1,000 MXN. Boleto de $15 MXN. Consulta disponibilidad y bases oficiales.">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="Sorteos Regios">',
        '<meta property="og:title" content="Sorteo Regular RA-0002 | Gana $1,000 MXN">',
        '<meta property="og:description" content="Premio de $1,000 MXN · Boleto de $15 MXN · Sorteo Regular RA-0002. ¡Elige tus números!">',
        '<meta property="og:url" content="https://rifasmty.com/sorteo-regular">',
        '<meta name="twitter:card" content="summary">',
        '<meta name="twitter:title" content="Sorteo Regular RA-0002 | Gana $1,000 MXN">',
        '<meta name="twitter:description" content="Premio de $1,000 MXN. Boleto de $15 MXN. Consulta disponibilidad y bases oficiales.">',
        '<link rel="canonical" href="https://rifasmty.com/sorteo-regular">'
      ].join("\\n");
      html = html.replace(/<title[^>]*>[\\s\\S]*?<\\/title>/i, "");
      html = html.replace(/<meta\\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+|description)["'][^>]*>/gi, "");
      html = html.replace(/<link\\s+rel=["']canonical["'][^>]*>/gi, "");
      if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, match => match + "\\n" + tags + "\\n");
      outHeaders.delete("Content-Length");
      outHeaders.delete("ETag");
      outHeaders.set("Cache-Control", "no-store");
      return new Response(html, { status: response.status, statusText: response.statusText, headers: outHeaders });
    }

    // En las rutas de participación, llevar al usuario directamente a la selección
    // de números después de que el HTML del sorteo termine de cargarse.
    if ((isRegular || isExpress) && request.method === "GET" && contentType.includes("text/html")) {
      let html = await response.text();
      const directEntryScript = '<script>(function(){function irANumeros(){var seccion=document.getElementById("numeros");if(!seccion)return false;seccion.style.scrollMarginTop="100px";seccion.scrollIntoView({behavior:"instant",block:"start"});return true;}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",function(){setTimeout(irANumeros,80);},{once:true});}else{setTimeout(irANumeros,80);}})();</script>';
      const bodyClose = html.toLowerCase().lastIndexOf("</body>");
      if (bodyClose >= 0) html = html.slice(0, bodyClose) + directEntryScript + html.slice(bodyClose);
      else html += directEntryScript;
      outHeaders.delete("Content-Length");
      outHeaders.delete("ETag");
      outHeaders.set("Cache-Control", "no-store");
      return new Response(html, { status: response.status, statusText: response.statusText, headers: outHeaders });
    }
    if ((incoming.pathname === "/" || incoming.pathname.replace(/\/$/, "") === "/sorteo-regio") &&
        request.method === "GET" && contentType.includes("text/html")) {
      let html = await response.text();
      // Normalizar los enlaces antiguos que todavía pueda entregar el upstream.
      html = html
        .replaceAll("https://rifasmty.lol/sorteo-regio", "https://rifasmty.com/sorteo-regio")
        .replaceAll("http://rifasmty.lol/sorteo-regio", "https://rifasmty.com/sorteo-regio");
      const tags = [
        '<title>Sorteos Regios | Sorteo Regio · Premio de $50,000 MXN</title>',
        '<meta property="og:site_name" content="Sorteos Regios">',
        '<meta property="og:type" content="website">',
        '<meta property="og:title" content="Sorteos Regios | Sorteo Regio · Premio de $50,000 MXN">',
        '<meta property="og:description" content="Premio de $50,000 MXN. Cada boleto cuesta $2 MXN. ¡Échale número, compa!">',
        '<meta property="og:url" content="https://rifasmty.com/">',
        '<meta property="og:image" content="' + SHARE_IMAGE + '">',
        '<meta property="og:image:secure_url" content="' + SHARE_IMAGE + '">',
        '<meta property="og:image:type" content="image/png">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:image:alt" content="Sorteo Regio: premio de $50,000 MXN y boleto de $2 MXN">',
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="twitter:title" content="Sorteos Regios | Sorteo Regio · Premio de $50,000 MXN">',
        '<meta name="twitter:description" content="Premio de $50,000 MXN. Cada boleto cuesta $2 MXN.">',
        '<meta name="twitter:image" content="' + SHARE_IMAGE + '">',
        '<link rel="canonical" href="https://rifasmty.com/">'
      ].join("\n");
      // Remove upstream social tags first; duplicate og:image tags can make WhatsApp use the wrong preview.
      html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, "");
      html = html.replace(/<meta\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, "");
      html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "");
      if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, match => match + "\n" + tags + "\n");
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