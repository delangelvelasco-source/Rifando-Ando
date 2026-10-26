# Revisión segura de pagos y liberación de boletos

## Alcance de esta rama
- No modifica la base de datos ni los sorteos activos.
- Sincroniza la duración del apartado con la vigencia configurada de la orden de Mercado Pago.
- Mantiene 24 horas para Sorteo Regio, OXXO y checkout estándar de Mercado Pago (incluido SPEI cuando esté disponible dentro del checkout).
- No despliega la función. El despliegue a Supabase debe hacerse después de revisar el diff y probarlo en un entorno de pruebas.

## Pruebas de regresión requeridas antes de desplegar
1. Sorteo Regio + Mercado Pago: orden y apartado expiran a 24 horas.
2. Sorteo regular + Mercado Pago/SPEI: orden y apartado expiran a 24 horas.
3. Sorteo regular + OXXO: ticket y apartado expiran a 24 horas.
4. Doble clic/reintento de crear orden: reutiliza la orden existente; no crea segundo cobro.
5. Webhook duplicado de pago aprobado: no duplica boletos vendidos.
6. Pago pendiente/rechazado/expirado: nunca marca como vendido sin pago aprobado.
7. Pago aprobado después de liberar la reserva: no reasignar números a ciegas; registrar incidente para conciliación/reembolso si los números ya fueron reasignados.
8. Sorteos cerrados y activos no deben cambiar de estado durante estas pruebas.

## Riesgo conocido que queda pendiente
La función SQL confirmar_pago_mp actualmente falla si Mercado Pago confirma una orden cuando ya no quedan boletos apartados vinculados al pago. Eso evita una venta incorrecta, pero puede dejar un cobro real pendiente de conciliación manual. Resolverlo de forma segura requiere conservar una instantánea de los números por pago y comprobar disponibilidad antes de restaurarlos; no debe corregirse liberando o vendiendo boletos de forma masiva.

## Despliegue
Esta rama añade el código desplegado actualmente como fuente versionada en supabase/functions/mercado-pago/index.ts. No despliegues desde Cloudflare Pages: la Edge Function se despliega por separado en Supabase. Revisar el diff, probarlo en staging y después aprobar un despliegue independiente.
