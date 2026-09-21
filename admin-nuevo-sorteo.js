(function(){
function el(t,a){const e=document.createElement(t);Object.assign(e,a||{});return e}
function abrir(){
  if(typeof rifa==='undefined'||!rifa){alert('Primero espera a que cargue el sorteo actual.');return}
  const o=el('div',{id:'newRaffleOverlay'});
  o.style='position:fixed;inset:0;background:#000b;display:grid;place-items:center;padding:18px;z-index:50';
  const baseNombre=String(rifa.nombre||'Nuevo sorteo oficial');
  const basePremio=String(rifa.premio||'$1,000.00');
  const basePrecio=Number(rifa.precio_numero||15);
  const baseMetodo=String(rifa.metodo_sorteo||'interno');
  o.innerHTML='<div style="width:min(460px,100%);background:#151515;border:1px solid #363636;border-radius:18px;padding:22px"><button id="nrClose" class="btn secondary" style="float:right">×</button><h2>➕ Iniciar nuevo sorteo</h2><p class="muted">El sorteo actual se cerrará y quedará guardado en el historial.</p><div class="field"><label>Nombre del sorteo</label><input id="nrName" maxlength="100"></div><div class="field"><label>Premio</label><input id="nrPrize" type="text" maxlength="50"></div><div class="field"><label>Costo por boleto</label><input id="nrPrice" type="number" min="0.01" step="0.01"></div><div class="field"><label>Método del sorteo</label><select id="nrMethod"><option value="interno">🎲 Sorteo interno aleatorio</option><option value="loteria_nacional">🇲🇽 Lotería Nacional · últimas 2 cifras del Tris</option></select></div><p style="color:#d9a936">🎟️ Se crearán automáticamente los números 00–99.</p><button id="nrCreate" class="btn" style="width:100%">🚀 Crear nuevo sorteo</button><p id="nrMsg"></p></div>';
  document.body.appendChild(o);
  document.getElementById('nrName').value=baseNombre;
  document.getElementById('nrPrize').value=basePremio;
  document.getElementById('nrPrice').value=basePrecio.toFixed(2);
  document.getElementById('nrMethod').value=baseMetodo==='loteria_nacional'?'loteria_nacional':'interno';
  document.getElementById('nrClose').onclick=()=>o.remove();
  document.getElementById('nrCreate').onclick=async()=>{
    const nombre=document.getElementById('nrName').value.trim(),premio=document.getElementById('nrPrize').value.trim(),precio=Number(document.getElementById('nrPrice').value),metodo=document.getElementById('nrMethod').value;
    if(!nombre||!premio||!Number.isFinite(precio)||precio<=0){document.getElementById('nrMsg').innerHTML='<span class="error">Completa nombre, premio y costo del boleto.</span>';return}
    if(!confirm('¿Crear este nuevo sorteo?\n\n'+nombre+'\nPremio: '+premio+'\nBoleto: $'+precio.toLocaleString('es-MX',{minimumFractionDigits:2})+'\n\nMétodo: '+(metodo==='loteria_nacional'?'Lotería Nacional · últimas 2 cifras del Tris':'Sorteo interno aleatorio')+'\n\nEl actual se cerrará y se crearán 100 números nuevos.'))return;
    const b=document.getElementById('nrCreate');b.disabled=true;b.textContent='Creando...';
    try{
      const r=await db.rpc('crear_nueva_rifa',{p_rifa_id:rifa.id,p_nombre:nombre,p_premio:premio,p_precio_numero:precio,p_metodo_sorteo:metodo});
      if(r.error){document.getElementById('nrMsg').innerHTML='<span class="error">❌ '+esc(r.error.message)+'</span>';b.disabled=false;b.textContent='🚀 Crear nuevo sorteo';return}
      o.remove();
      const d=r.data||{};
      alert('✅ Nuevo sorteo creado.\n\nID: '+(d.codigo_sorteo||('RA-'+String(d.numero_sorteo||'').padStart(4,'0')))+'\n'+(d.nombre||nombre)+'\nPremio: '+(d.premio||premio)+'\nBoleto: $'+Number(d.precio_numero??precio).toLocaleString('es-MX',{minimumFractionDigits:2})+'\nMétodo: '+(d.metodo_sorteo==='loteria_nacional'?'Lotería Nacional':'Sorteo interno')+'\n\n100 números disponibles.');
      if(d.rifa_id){ window.location.href='?rifa='+encodeURIComponent(d.rifa_id); } else { await cargar(); }
    }catch(e){
      document.getElementById('nrMsg').innerHTML='<span class="error">❌ '+esc(e?.message||e)+'</span>';
      b.disabled=false;b.textContent='🚀 Crear nuevo sorteo';
    }
  };
}
function instalar(){
  const h=document.querySelector('#app h1');
  if(!h||document.getElementById('newRaffleBtn')){if(!document.getElementById('newRaffleBtn'))setTimeout(instalar,500);return}
  const b=el('button',{id:'newRaffleBtn',className:'btn'});b.textContent='➕ Nuevo sorteo';b.onclick=abrir;h.parentElement.appendChild(b)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instalar);else instalar()
})();