const ORIGIN = "https://rifando-ando-mx.pages.dev";

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);

    // Keep the Rifa Regia catalog at the root domain.
    if (incoming.pathname === "/") {
      return env.ASSETS.fetch(request);
    }

    // Serve the existing raffle site through the branded domain path.
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

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outHeaders
    });
  }
};