# Incidente: bucle de redirecciones en el panel administrativo

- **Fecha:** 26 de octubre de 2026
- **Sistema:** Rifando Ando / Sorteo Económico Regio
- **Servicio afectado:** acceso al panel administrativo en Cloudflare Pages
- **Síntoma:** Safari mostraba “demasiadas redirecciones” al abrir `/admin.html`; el sitio público principal sí llegó a cargar.
- **Estado:** recuperado. El usuario confirmó que el panel volvió a funcionar después de retirar las reglas de alias.

## Impacto observado

El panel administrativo no se podía abrir de forma fiable desde el navegador. No se hicieron cambios a Supabase, Mercado Pago, participantes, pagos ni números/boletos para resolver este incidente.

## Cronología y evidencia

1. El commit [`035423e`](https://github.com/delangelvelasco-source/Rifando-Ando/commit/035423ec7a58dc0cb9b71c6f03ea6f6a224d6343), **“Restore admin route aliases”**, agregó estas reglas a `_redirects`:
   - `/admin       /admin.html          200`
   - `/admin/      /admin.html          200`
   - `/admin-especial  /admin-especial.html  200`
   - `/admin-especial/ /admin-especial.html  200`
2. Tras el reporte del bucle, se revisó `admin.html`. No se encontró en esa revisión una redirección automática evidente que explicara por sí sola el error.
3. El commit [`08c5e6f`](https://github.com/delangelvelasco-source/Rifando-Ando/commit/08c5e6f3ca7f6295ba04876e53cc3b17a8cc11d2), **“Revert recent admin route aliases to restore stable Pages routing”**, retiró las cuatro reglas y restauró la configuración anterior de `_redirects`.
4. El usuario confirmó después que el panel ya funcionaba.

## Diagnóstico

**Causa más probable:** interacción no deseada entre los aliases nuevos de administración y el enrutamiento/despliegue de Cloudflare Pages.

**Nivel de certeza:** probable, no demostración completa de la cadena HTTP. Las reglas añadidas usan estado `200` (reescrituras internas), no son redirecciones HTTP explícitas. La correlación temporal y la recuperación tras retirarlas son evidencia fuerte para revertirlas, pero no se capturó una traza de red con todos los saltos para demostrar qué capa originó el bucle. Por ello, no atribuimos el fallo a un error concreto de autenticación, cookies, Supabase ni al código de `admin.html` sin evidencia adicional.

## Corrección aplicada

- Se quitaron los aliases de administración de `_redirects`.
- Se conservaron `admin.html` y `admin-especial.html`, incluidas sus funciones recientes.
- Se mantuvieron las cuatro rutas públicas existentes: `/regular/`, `/especial/`, `/iphone/` y `/express/`.
- No se restauró una versión antigua completa del panel, porque eso habría descartado mejoras recientes sin evidencia de que fueran la causa.

## Prevención incorporada

Se agregó el workflow de GitHub Actions [`.github/workflows/validate-pages-routing.yml`](../.github/workflows/validate-pages-routing.yml). En cada push a `main` y en pull requests hacia `main`, comprueba que ambos archivos HTML administrativos existan y falla si alguien vuelve a introducir aliases `/admin` o `/admin-especial` en `_redirects`.

## Lista de comprobación para futuros cambios de rutas

Antes de publicar una modificación a `_redirects`:

1. Revisar el diff y confirmar que no haya reglas duplicadas, comodines o aliases que entren en conflicto con archivos existentes.
2. Probar primero en una URL de preview/staging, no directamente en el dominio público.
3. Validar por separado:
   - `/regular/`
   - `/especial/`
   - `/iphone/`
   - `/express/`
   - `/admin.html`
   - `/admin-especial.html`
4. Probar en ventana privada y comprobar que cada URL termina en una respuesta estable, sin repetición de redirecciones.
5. Solo después de validar el panel, comprobar inicio de sesión y lectura del panel; no usar cambios de rutas como motivo para modificar pagos o datos.
6. Si vuelve a ocurrir, registrar la URL exacta, hora, cadena de redirecciones y reglas activas de Cloudflare antes de cambiar más código.

## Limitaciones de verificación

La recuperación fue confirmada por el usuario. No se pudo obtener desde esta sesión una traza HTTP del despliegue público; por tanto, la prevención automatizada reduce la posibilidad de repetir el mismo cambio de configuración, pero no sustituye una prueba de humo del despliegue ni protege contra reglas añadidas directamente en el panel de Cloudflare.
