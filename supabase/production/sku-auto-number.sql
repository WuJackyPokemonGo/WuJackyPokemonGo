-- WJ permanent SKU rollout: existing products first, future inserts automatically.
-- Do not execute against production until its live SKU inventory is reviewed and backed up.
-- The full transaction aborts if any legacy/non-WJ SKU exists (do not silently overwrite it).
BEGIN;
LOCK TABLE public.products IN ACCESS EXCLUSIVE MODE;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.products
    WHERE sku IS NOT NULL
      AND CASE WHEN sku ~ '^WJ-[0-9]{4,15}$'
               THEN substring(sku from 4)::bigint < 1
               ELSE true END
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Legacy product SKUs require manual review; no SKU was replaced';
  END IF;
END
$preflight$;

CREATE SEQUENCE IF NOT EXISTS private.product_sku_seq
  AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 NO CYCLE CACHE 1;
REVOKE ALL ON SEQUENCE private.product_sku_seq FROM PUBLIC, anon, authenticated;

-- Never lower the sequence on a re-run: even deleted SKU numbers stay retired.
DO $backfill$
DECLARE
  v_max bigint;
  v_last bigint;
  v_called boolean;
  v_next bigint;
  v_product_id uuid;
  v_number bigint;
BEGIN
  SELECT coalesce(max(substring(sku from 4)::bigint), 0) INTO v_max
    FROM public.products WHERE sku ~ '^WJ-[0-9]{4,15}$';
  SELECT last_value, is_called INTO v_last, v_called FROM private.product_sku_seq;
  v_next := CASE WHEN v_called THEN v_last + 1 ELSE v_last END;
  IF v_max >= v_next THEN
    PERFORM setval('private.product_sku_seq'::regclass, v_max + 1, false);
  END IF;

  -- Stable order; does not depend on the current storefront display order.
  FOR v_product_id IN
    SELECT id FROM public.products WHERE sku IS NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    v_number := nextval('private.product_sku_seq'::regclass);
    UPDATE public.products
      SET sku = 'WJ-' || lpad(v_number::text, 4, '0')
      WHERE id = v_product_id;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.products WHERE sku IS NULL) THEN
    RAISE EXCEPTION 'SKU backfill incomplete';
  END IF;
END
$backfill$;

-- Trigger covers the admin editor, CSV import, and any future product insert path.
-- Existing identifiers can never be changed or cleared through ordinary writes.
CREATE OR REPLACE FUNCTION private.assign_permanent_product_sku()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $sku$
DECLARE
  v_number bigint;
  v_restoring boolean := coalesce(current_setting('wj.restoring', true) = 'true', false);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF nullif(btrim(NEW.sku), '') IS NOT NULL THEN
      IF v_restoring THEN RETURN NEW; END IF;
      RAISE check_violation USING MESSAGE = 'SKU is assigned automatically; leave it blank on new products';
    END IF;
    IF v_restoring THEN RETURN NEW; END IF;
    v_number := nextval('private.product_sku_seq'::regclass);
    NEW.sku := 'WJ-' || lpad(v_number::text, 4, '0');
    RETURN NEW;
  END IF;

  IF v_restoring THEN RETURN NEW; END IF;
  IF OLD.sku IS NULL THEN
    v_number := nextval('private.product_sku_seq'::regclass);
    NEW.sku := 'WJ-' || lpad(v_number::text, 4, '0');
  ELSIF NEW.sku IS NULL OR btrim(NEW.sku) = '' THEN
    -- Legacy editors that send an empty value cannot erase an assigned number.
    NEW.sku := OLD.sku;
  ELSIF NEW.sku IS DISTINCT FROM OLD.sku THEN
    RAISE check_violation USING MESSAGE = 'Permanent product SKU cannot be changed';
  END IF;
  RETURN NEW;
END
$sku$;

REVOKE ALL ON FUNCTION private.assign_permanent_product_sku() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS assign_permanent_product_sku ON public.products;
CREATE TRIGGER assign_permanent_product_sku
  BEFORE INSERT OR UPDATE OF sku ON public.products
  FOR EACH ROW EXECUTE FUNCTION private.assign_permanent_product_sku();

COMMIT;
