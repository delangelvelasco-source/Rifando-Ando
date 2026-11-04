# Corrección propuesta: firma de webhooks de Mercado Pago

## Hallazgo

La función desplegada `mercado-pago` construye el manifiesto HMAC con `data.id` sin normalizar. Mercado Pago documenta que el identificador alfanumérico debe normalizarse a minúsculas al validar la firma. Las órdenes de esta integración tienen IDs como `ORD01...`; la diferencia puede hacer que una notificación válida sea rechazada con HTTP 401 y que el pago siga como `pendiente`.

## Cambio requerido en `verifyWebhook`

Antes de construir el manifiesto, normalizar solo IDs alfanuméricos:

```ts
const normalizedId = /^[0-9]+$/.test(dataId) ? dataId : dataId.toLowerCase();
const manifest = `id:${normalizedId};request-id:${requestId};ts:${ts};`;
const expected = await hmacHex(webhookSecret, manifest);
```

No cambiar el ID usado para consultar `/v1/orders/{orderId}`; solo normalizarlo dentro del manifiesto de firma.

## Pruebas antes de desplegar

1. Webhook firmado válido para una orden `ORD...` debe pasar la verificación.
2. Firma incorrecta debe responder 401.
3. Un webhook repetido para la misma orden debe ser idempotente.
4. Pago `processed` con importe correcto debe confirmar solo los números vinculados al `external_reference` de esa orden.
5. Pago aprobado cuyo boleto ya fue reasignado no debe marcar vendido el boleto de otro comprador; debe quedar para conciliación manual.

## Producción

No desplegar hasta probar el flujo y verificar que el endpoint webhook de Mercado Pago usa la ruta `/webhook`.
