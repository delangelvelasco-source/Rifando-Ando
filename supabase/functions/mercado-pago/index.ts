import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")!;
const publicSiteUrl = "https://rifasmty.lol";
const webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET")!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

async function verifyWebhook(req: Request, dataId: string) {
  if (!webhookSecret) return false;
  const signature = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(signature.split(",").map(p => {
    const [k, ...v] = p.split("=");
    return [k?.trim(), v.join("=").trim()];
  }));
  const ts = parts.ts || "";
  const v1 = parts.v1 || "";
  if (!ts || !v1 || !dataId) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = await hmacHex(webhookSecret, manifest);
  return timingSafeEqual(expected, v1);
}

function mercadoPagoError(mp: any, status: number, rawBody = "") {
  const firstCause = Array.isArray(mp?.cause) ? mp.cause[0] : null;
  const code = String(
    mp?.error ||
    firstCause?.code ||
    firstCause?.error ||
    (status ? `mp_http_${status}` : "unknown_error")
  );
  const description = String(
    mp?.message ||
    firstCause?.description ||
    firstCause?.message ||
    (rawBody ? rawBody.slice(0, 240) : `Mercado Pago respondió HTTP ${status} sin detalle.`)
  ).slice(0, 240);
  const causes = Array.isArray(mp?.cause)
    ? mp.cause.slice(0, 3).map((c: any) => ({
        code: c?.code ?? c?.error ?? null,
        description: String(c?.description ?? c?.message ?? "").slice(0, 180)
      }))
    : [];
  console.error("Mercado Pago create order error", {
    status,
    code,
    description,
    cause: causes,
    rawBody: rawBody.slice(0, 500)
  });
  return json({
    error: "No se pudo crear el pago en Mercado Pago.",
    code,
    detail: description,
    http_status: status,
    causes
  }, 502);
}

async function createOrder(body: any) {
  if (!mpToken) {
    console.error("MERCADOPAGO_ACCESS_TOKEN no está configurado");
    return json({ error: "Mercado Pago no está configurado todavía.", code: "missing_access_token" }, 503);
  }

  const paymentId = String(body.payment_id || "");
  const token = String(body.payment_token || "");
  const paymentMethod = String(body.payment_method || "mercado_pago").toLowerCase();
  const payerEmail = String(body.payer_email || "").trim();
  if (!["mercado_pago", "oxxo"].includes(paymentMethod)) return json({ error: "Método de pago no válido." }, 400);
  if (paymentMethod === "oxxo" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) return json({ error: "Para generar el ticket OXXO necesitamos un correo electrónico válido." }, 400);
  if (!paymentId || !token) return json({ error: "Faltan datos de pago." }, 400);

  const { data: pago, error } = await admin
    .from("pagos")
    .select("id,rifa_id,participante_id,monto,estado,payment_token,mercado_pago_order_id,checkout_url,metodo,created_at")
    .eq("id", paymentId)
    .maybeSingle();

  if (error || !pago) return json({ error: "Pago no encontrado." }, 404);
  if (String(pago.payment_token) !== token) return json({ error: "Token de pago inválido." }, 403);
  if (pago.estado !== "pendiente") return json({ error: "Este pago ya no está pendiente." }, 409);
  const { data: reservationRifa } = await admin.from("rifas").select("grupo_rifa").eq("id", pago.rifa_id).maybeSingle();
  const reservationMs = (reservationRifa?.grupo_rifa === "regio" || paymentMethod === "oxxo")
    ? 24 * 60 * 60 * 1000
    : 30 * 60 * 1000;
  const reservationDurationIso = reservationMs === 24 * 60 * 60 * 1000 ? "P1D" : "PT30M";
  if (new Date(pago.created_at).getTime() + reservationMs <= Date.now())
    return json({ error: "La reserva ya expiró." }, 409);

  if (pago.checkout_url && pago.mercado_pago_order_id) {
    const storedMethod = String(pago.metodo || "Mercado Pago").toLowerCase();
    const isStoredOxxo = storedMethod.includes("oxxo");
    if ((paymentMethod === "oxxo") !== isStoredOxxo)
      return json({ error: "Esta reserva ya tiene un pago generado con otro método. No generamos un segundo cobro para evitar duplicados." }, 409);
    return json({ checkout_url: pago.checkout_url, order_id: pago.mercado_pago_order_id, payment_method: isStoredOxxo ? "oxxo" : "mercado_pago" });
  }

  const { data: rifa } = await admin.from("rifas").select("nombre,precio_numero,estado").eq("id", pago.rifa_id).maybeSingle();
  if (!rifa || rifa.estado !== "activa") return json({ error: "La rifa ya no está disponible." }, 409);

  const { data: participante } = await admin.from("participantes").select("nombre,correo,whatsapp").eq("id", pago.participante_id).maybeSingle();
  const { data: numeros } = await admin
    .from("numeros")
    .select("numero")
    .eq("rifa_id", pago.rifa_id)
    .eq("pago_id", pago.id)
    .eq("participante_id", pago.participante_id)
    .eq("estado", "apartado")
    .gt("apartado_hasta", new Date().toISOString())
    .order("numero");

  if (!numeros?.length) return json({ error: "La reserva ya no contiene números válidos." }, 409);

  const expectedTotal = Number(rifa.precio_numero) * numeros.length;
  if (Math.abs(expectedTotal - Number(pago.monto)) > 0.01)
    return json({ error: "El importe de la reserva no coincide." }, 409);

  const externalReference = String(pago.id);
  // Una misma reserva usa siempre la misma clave: evita órdenes duplicadas si hay doble clic o reintento concurrente.
  const idem = paymentId;

  const returnQuery = `pago_id=${encodeURIComponent(pago.id)}&payment_token=${encodeURIComponent(String(pago.payment_token))}&rifa=${encodeURIComponent(String(pago.rifa_id))}`;
  const orderBody: Record<string, unknown> = {
    type: "online",
    processing_mode: paymentMethod === "oxxo" ? "automatic" : "manual",
    ...(paymentMethod === "oxxo" ? {} : { capture_mode: "automatic_async" }),
    total_amount: expectedTotal.toFixed(2),
    ...(paymentMethod === "oxxo" ? {} : { expiration_time: reservationDurationIso }),
    external_reference: externalReference,
    description: `Rifando Ando · ${rifa.nombre || "Rifa"} · ${numeros.length} boleto(s)`,
    config: {
      online: {
        success_url: `${publicSiteUrl}/pago-confirmado.html?mp_return=success&${returnQuery}`,
        failure_url: `${publicSiteUrl}/pago-confirmado.html?mp_return=failure&${returnQuery}`,
        pending_url: `${publicSiteUrl}/pago-confirmado.html?mp_return=pending&${returnQuery}`,
        auto_return: "approved"
      }
    },
    items: [{
      title: `Boleto(s) ${rifa.nombre || "Rifando Ando"}`,
      quantity: numeros.length,
      unit_price: Number(rifa.precio_numero).toFixed(2)
    }]
  };

  if (paymentMethod === "oxxo") {
    orderBody.payer = { email: payerEmail || participante?.correo };
    orderBody.transactions = { payments: [{ amount: expectedTotal.toFixed(2), expiration_time: "P1D", payment_method: { id: "oxxo", type: "ticket" } }] };
  } else if (participante?.correo) {
    orderBody.payer = { email: participante.correo };
  }

  const mpResponse = await fetch("https://api.mercadopago.com/v1/orders", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${mpToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idem
    },
    body: JSON.stringify(orderBody)
  });

  const rawResponse = await mpResponse.text();
  let mp: any = {};
  try {
    mp = rawResponse ? JSON.parse(rawResponse) : {};
  } catch {
    mp = {};
  }
  if (!mpResponse.ok) return mercadoPagoError(mp, mpResponse.status, rawResponse);

  const oxxoPayment = mp?.transactions?.payments?.[0] || {};
  const checkoutUrl = paymentMethod === "oxxo" ? oxxoPayment?.payment_method?.ticket_url : (mp.checkout_url || mp.init_point);
  if (!checkoutUrl || !mp.id) {
    console.error("Mercado Pago respondió sin checkout_url/order id", mp);
    return json({ error: "Mercado Pago no devolvió un enlace de pago.", code: "missing_checkout_url" }, 502);
  }

  // Mantener los números apartados hasta el mismo plazo de pago de la orden (1 día).
  const reservationExpiry = new Date(Date.now() + reservationMs).toISOString();
  const { error: reservationError } = await admin.from("numeros").update({
    apartado_hasta: reservationExpiry
  }).eq("pago_id", pago.id).eq("rifa_id", pago.rifa_id)
    .eq("participante_id", pago.participante_id).eq("estado", "apartado");
  if (reservationError) {
    console.error("No se pudo extender el apartado al vencimiento SPEI", reservationError);
    return json({ error: "Se creó el pago, pero no se pudo actualizar el vencimiento de los números. Intenta abrir el pago de nuevo." }, 500);
  }

  const { error: updateError } = await admin.from("pagos").update({
    metodo: paymentMethod === "oxxo" ? "OXXO" : "Mercado Pago",
    mercado_pago_order_id: mp.id,
    mercado_pago_external_reference: externalReference,
    checkout_url: checkoutUrl,
    updated_at: new Date().toISOString()
  }).eq("id", pago.id);

  if (updateError) {
    console.error("No se pudo guardar checkout_url", updateError);
    return json({ error: "El pago fue creado pero no se pudo guardar el enlace.", code: "database_update_failed" }, 500);
  }

  return json({
    checkout_url: checkoutUrl,
    order_id: mp.id,
    payment_method: paymentMethod,
    ticket_url: paymentMethod === "oxxo" ? checkoutUrl : undefined,
    expires_in: paymentMethod === "oxxo" ? "24 horas" : undefined,
    total: expectedTotal,
    numeros: numeros.map(n => n.numero)
  });
}


async function confirmationDetails(pago: any) {
  const [{ data: rifa }, { data: participante }, { data: numeros }] = await Promise.all([
    admin.from("rifas").select("nombre,codigo,codigo_sorteo").eq("id", pago.rifa_id).maybeSingle(),
    admin.from("participantes").select("nombre").eq("id", pago.participante_id).maybeSingle(),
    admin.from("numeros").select("numero").eq("rifa_id", pago.rifa_id).eq("pago_id", pago.id).eq("participante_id", pago.participante_id).eq("estado", "vendido").order("numero")
  ]);
  return {
    rifa_nombre: String(rifa?.nombre || "Sorteo Económico Regio"),
    rifa_codigo: String(rifa?.codigo_sorteo || rifa?.codigo || ""),
    participante: String(participante?.nombre || ""),
    monto: Number(pago.monto || 0),
    numeros: (numeros || []).map((n: any) => Number(n.numero))
  };
}

async function reconcilePayment(body: any) {
  const paymentId = String(body.payment_id || "");
  const token = String(body.payment_token || "");
  if (!paymentId || !token) return json({ error: "Faltan datos para consultar el pago." }, 400);

  const { data: pago, error } = await admin
    .from("pagos")
    .select("id,rifa_id,participante_id,monto,estado,payment_token,mercado_pago_order_id,created_at")
    .eq("id", paymentId)
    .maybeSingle();

  if (error || !pago) return json({ error: "Pago no encontrado." }, 404);
  if (String(pago.payment_token) !== token) return json({ error: "Token de pago inválido." }, 403);

  if (pago.estado === "confirmado") return json({ ok: true, estado: "confirmado", pago_id: pago.id, ...(await confirmationDetails(pago)) });
  if (pago.estado === "rechazado") return json({ ok: true, estado: "rechazado", pago_id: pago.id });
  if (!pago.mercado_pago_order_id) return json({ ok: true, estado: "pendiente", pago_id: pago.id });

  const mpResponse = await fetch(
    `https://api.mercadopago.com/v1/orders/${encodeURIComponent(String(pago.mercado_pago_order_id))}`,
    { headers: { "Authorization": `Bearer ${mpToken}`, "Accept": "application/json" } }
  );
  const order = await mpResponse.json().catch(() => ({}));
  if (!mpResponse.ok) return json({ error: "No se pudo consultar la orden en Mercado Pago." }, 502);

  const status = String(order.status || "");
  const totalPaid = Number(order.total_paid_amount || 0);
  if (status === "processed" && Math.abs(totalPaid - Number(pago.monto)) > 0.01)
    return json({ error: "El importe pagado no coincide con la reserva." }, 409);

  const payment = order?.transactions?.payments?.[0] || {};
  const statusDetail = String(payment.status_detail || order.status_detail || "");
  const paymentMpId = String(payment.id || "");

  const { error: rpcError } = await admin.rpc("confirmar_pago_mp", {
    p_pago_id: pago.id,
    p_order_id: String(order.id || pago.mercado_pago_order_id),
    p_status: status,
    p_status_detail: statusDetail,
    p_payment_id: paymentMpId
  });
  if (rpcError) {
    const { data: current } = await admin.from("pagos").select("estado").eq("id", pago.id).maybeSingle();
    if (current?.estado === "confirmado") return json({ ok: true, estado: "confirmado", pago_id: pago.id, ...(await confirmationDetails(pago)) });
    console.error("reconcilePayment confirmar_pago_mp error", rpcError);
    return json({ error: "No se pudo actualizar la reserva.", detail: rpcError.message }, 500);
  }

  return json({
    ok: true,
    estado: status === "processed" ? "confirmado" : status,
    pago_id: pago.id,
    ...(status === "processed" ? await confirmationDetails(pago) : {}),
    order_id: String(order.id || pago.mercado_pago_order_id),
    payment_id: paymentMpId
  });
}

async function handleWebhook(req: Request) {
  const url = new URL(req.url);
  const dataId = url.searchParams.get("data.id") || "";
  const body = await req.json().catch(() => ({}));
  const orderId = String(dataId || body?.data?.id || "");
  if (!orderId) return json({ ok: true });

  if (!(await verifyWebhook(req, orderId))) return json({ error: "Firma inválida." }, 401);

  // La herramienta de simulación de Mercado Pago usa el Data ID 123456.
  // Para esa prueba no consultamos una orden real en la API.
  if (orderId === "123456") return json({ ok: true, simulated: true });

  const mpResponse = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: { "Authorization": `Bearer ${mpToken}`, "Accept": "application/json" }
  });
  const order = await mpResponse.json().catch(() => ({}));
  if (!mpResponse.ok) {
    // La simulación de Webhooks puede usar un ID ficticio. La notificación
    // llegó correctamente aunque esa orden no exista en Mercado Pago.
    if (mpResponse.status === 404) return json({ ok: true, ignored: true, reason: "order_not_found" });
    return json({ error: "No se pudo consultar la orden." }, 502);
  }

  const externalReference = String(order.external_reference || body?.data?.external_reference || "");
  if (!externalReference) return json({ ok: true });

  const { data: pago } = await admin.from("pagos").select("id,monto,rifa_id,participante_id").eq("id", externalReference).maybeSingle();
  if (!pago) return json({ ok: true });

  const status = String(order.status || body?.data?.status || "");
  const totalPaid = Number(order.total_paid_amount || 0);
  if (status === "processed" && Math.abs(totalPaid - Number(pago.monto)) > 0.01)
    return json({ error: "Importe pagado no coincide." }, 409);

  const paymentId = String(order?.transactions?.payments?.[0]?.id || "");
  const statusDetail = String(order?.transactions?.payments?.[0]?.status_detail || order.status_detail || "");

  const { error } = await admin.rpc("confirmar_pago_mp", {
    p_pago_id: pago.id,
    p_order_id: orderId,
    p_status: status,
    p_status_detail: statusDetail,
    p_payment_id: paymentId
  });
  if (error) {
    console.error("confirmar_pago_mp error", error);
    return json({ error: "No se pudo actualizar la reserva." }, 500);
  }

  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const path = new URL(req.url).pathname;
  try {
    if (path.endsWith("/webhook")) return await handleWebhook(req);
    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      console.error("Cuerpo JSON inválido en mercado-pago", e);
      return json({ error: "El cuerpo de la solicitud no contiene JSON válido.", code: "invalid_json" }, 400);
    }
    if (body?.action === "status") return await reconcilePayment(body);
    return await createOrder(body);
  } catch (e) {
    console.error("Error interno en mercado-pago", e);
    return json({ error: "Error interno de la integración de pago.", code: "internal_error" }, 500);
  }
});