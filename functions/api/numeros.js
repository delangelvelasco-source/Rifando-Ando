const SUPABASE_URL = 'https://iaviafijfdqinehcfebr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OOyCaQno11jdZhXkmZvd3w_Wl6PjmES';

export async function onRequestGet({ request }) {
  const incoming = new URL(request.url);
  const rifaId = incoming.searchParams.get('rifa_id');

  if (!rifaId || !/^[0-9a-fA-F-]{36}$/.test(rifaId)) {
    return new Response(JSON.stringify({ error: 'rifa_id inválido' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  const url = new URL(SUPABASE_URL + '/rest/v1/numeros');
  url.searchParams.set('select', 'numero,estado,apartado_hasta');
  url.searchParams.set('rifa_id', 'eq.' + rifaId);
  url.searchParams.set('order', 'numero.asc');
  url.searchParams.set('limit', '500');

  try {
    const response = await fetch(url.toString(), {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        Accept: 'application/json'
      }
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'No se pudo consultar Supabase' }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
}
