-- Normalize Mexican phone numbers in the public ticket verifier.
-- Accepts 10-digit local numbers, +52, and the legacy +521 mobile format.
CREATE OR REPLACE FUNCTION public.consultar_boletos_por_celular(p_rifa_id uuid, p_celular text)
RETURNS TABLE(numero integer, estado text, apartado_hasta timestamp with time zone, estado_pago text, nombre text, celular text, fecha_pago timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phone text;
BEGIN
  v_phone := regexp_replace(coalesce(p_celular, ''), '[^0-9]', '', 'g');

  IF length(v_phone) = 13 AND left(v_phone, 3) = '521' THEN
    v_phone := right(v_phone, 10);
  ELSIF length(v_phone) = 12 AND left(v_phone, 2) = '52' THEN
    v_phone := right(v_phone, 10);
  END IF;

  IF length(v_phone) < 10 OR length(v_phone) > 15 THEN
    RAISE EXCEPTION 'Ingresa un número de celular válido.';
  END IF;

  RETURN QUERY
  SELECT
    n.numero,
    n.estado,
    n.apartado_hasta,
    coalesce(pg.estado, 'sin_pago')::text,
    coalesce(p.nombre, '')::text,
    coalesce(p.whatsapp, '')::text,
    pg.confirmado_at
  FROM public.numeros n
  JOIN public.participantes p ON p.id = n.participante_id
  LEFT JOIN public.pagos pg ON pg.id = n.pago_id
  WHERE n.rifa_id = p_rifa_id
    AND (
      CASE
        WHEN length(regexp_replace(coalesce(p.whatsapp, ''), '[^0-9]', '', 'g')) = 13
             AND left(regexp_replace(coalesce(p.whatsapp, ''), '[^0-9]', '', 'g'), 3) = '521'
          THEN right(regexp_replace(coalesce(p.whatsapp, ''), '[^0-9]', '', 'g'), 10)
        WHEN length(regexp_replace(coalesce(p.whatsapp, ''), '[^0-9]', '', 'g')) = 12
             AND left(regexp_replace(coalesce(p.whatsapp, ''), '[^0-9]', '', 'g'), 2) = '52'
          THEN right(regexp_replace(coalesce(p.whatsapp, ''), '[^0-9]', '', 'g'), 10)
        ELSE regexp_replace(coalesce(p.whatsapp, ''), '[^0-9]', '', 'g')
      END
    ) = v_phone
  ORDER BY n.numero
  LIMIT 300;
END;
$function$;
