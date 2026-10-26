-- Private per-participant link token for the customer ticket portal.
-- The token is only returned by the server-side consulta-boletos function.
ALTER TABLE public.participantes
  ADD COLUMN IF NOT EXISTS consulta_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS participantes_consulta_token_uidx
  ON public.participantes (consulta_token);

REVOKE SELECT (consulta_token) ON public.participantes FROM anon, public;
