import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método no permitido." }), { status: 405, headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
      return new Response(JSON.stringify({ error: "Enlace inválido o incompleto." }), { status: 400, headers: cors });
    }
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Falta configuración del servidor.");
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: participant, error: pe } = await db.from("participantes").select("id,nombre,consulta_token").eq("consulta_token", token).maybeSingle();
    if (pe) throw pe;
    if (!participant) return new Response(JSON.stringify({ error: "No encontramos esta participación. Solicita al administrador un enlace nuevo." }), { status: 404, headers: cors });
    const { data: numbers, error: ne } = await db.from("numeros").select("id,numero,estado,pago_id,rifa_id").eq("participante_id", participant.id).order("numero");
    if (ne) throw ne;
    const raffleIds = [...new Set((numbers || []).map((x: any) => x.rifa_id))];
    const { data: raffles, error: re } = raffleIds.length ? await db.from("rifas").select("id,nombre,codigo_sorteo,precio_numero,fecha_sorteo").in("id", raffleIds) : { data: [], error: null };
    if (re) throw re;
    const { data: payments, error: paye } = raffleIds.length ? await db.from("pagos").select("id,rifa_id,monto,estado,confirmado_at,metodo").eq("participante_id", participant.id).in("rifa_id", raffleIds) : { data: [], error: null };
    if (paye) throw paye;
    const paidPayments = (payments || []).filter((p: any) => p.estado === "confirmado");
    const raffleMap = new Map((raffles || []).map((r: any) => [r.id, r]));
    const payById = new Map(paidPayments.map((p: any) => [p.id, p]));
    const grouped = raffleIds.map((rid) => {
      const raffle: any = raffleMap.get(rid) || {};
      const ns = (numbers || []).filter((n: any) => n.rifa_id === rid && n.estado !== "disponible");
      const ps = paidPayments.filter((p: any) => p.rifa_id === rid);
      const paid = ps.reduce((sum: number, p: any) => sum + Number(p.monto || 0), 0);
      const total = ns.length * Number(raffle.precio_numero || 0);
      const balance = Math.max(0, total - paid);
      const allPaid = total > 0 && paid >= total;
      return {
        raffle: raffle.nombre || "Sorteo Regio",
        code: raffle.codigo_sorteo || "",
        total, paid, balance,
        status: allPaid ? "Pagado" : paid > 0 ? "Abono recibido · saldo pendiente" : "Pendiente de pago",
        numbers: ns.map((n: any) => ({ number: n.numero, status: n.pago_id && payById.has(n.pago_id) ? "Pagado" : allPaid ? "Pagado" : "Pendiente" })),
        payments: ps.map((p: any) => ({ amount: Number(p.monto || 0), date: p.confirmado_at, method: p.metodo || "No especificado" })),
      };
    }).filter((g: any) => g.numbers.length);
    return new Response(JSON.stringify({ participant: { name: String(participant.nombre || "Participante").split(/\\s+/)[0] }, updated_at: new Date().toISOString(), raffles: grouped }), { status: 200, headers: { ...cors, "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    console.error("consulta-boletos:", e);
    return new Response(JSON.stringify({ error: "No se pudo consultar la participación. Intenta más tarde." }), { status: 500, headers: cors });
  }
});
