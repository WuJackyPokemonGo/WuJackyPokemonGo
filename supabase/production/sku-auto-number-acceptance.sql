-- Run only AFTER sku-auto-number.sql. This test rolls back its DATA changes.
-- WARNING: PostgreSQL sequences are non-transactional: this QA consumes two SKU numbers
-- even after ROLLBACK. Do not re-run on production unless you accept gaps.
BEGIN;
DO $sku_qa$
DECLARE
  v_id uuid;
  v_original text;
  v_inserted uuid;
  v_sku text;
  v_second text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.products
             WHERE sku IS NULL OR sku !~ '^WJ-[0-9]{4,15}$') THEN
    RAISE EXCEPTION 'QA: backfill left missing or malformed SKUs';
  END IF;
  IF (SELECT count(*) FROM public.products) <>
     (SELECT count(DISTINCT sku) FROM public.products) THEN
    RAISE EXCEPTION 'QA: duplicate SKUs';
  END IF;

  SELECT id,sku INTO v_id,v_original FROM public.products ORDER BY created_at,id LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.products SET sku=NULL WHERE id=v_id;
    IF (SELECT sku FROM public.products WHERE id=v_id) IS DISTINCT FROM v_original THEN
      RAISE EXCEPTION 'QA: blank editor erased a permanent SKU';
    END IF;
    BEGIN
      UPDATE public.products SET sku='WJ-999999999999999' WHERE id=v_id;
      RAISE EXCEPTION 'QA: an existing SKU was changed';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END IF;

  INSERT INTO public.products(name_zh,sku) VALUES ('SKU-QA-auto',NULL)
    RETURNING id,sku INTO v_inserted,v_sku;
  INSERT INTO public.products(name_zh) VALUES ('SKU-QA-second')
    RETURNING sku INTO v_second;
  IF v_sku !~ '^WJ-[0-9]{4,15}$'
     OR v_second !~ '^WJ-[0-9]{4,15}$'
     OR v_sku=v_second
     OR (v_original IS NOT NULL AND v_sku=v_original) THEN
    RAISE EXCEPTION 'QA: generated SKU missing or repeated';
  END IF;

  BEGIN
    INSERT INTO public.products(name_zh,sku) VALUES ('SKU-QA-manual','WJ-0001');
    RAISE EXCEPTION 'QA: manually supplied SKU was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$sku_qa$;
SELECT 'SKU backfill, uniqueness, auto-create, immutability: passed; no QA data retained' AS result;
ROLLBACK;
