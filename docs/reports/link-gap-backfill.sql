-- SliceWP lifetime commissions: customer link backfill (gap fix)
-- generated 2026-09-01
-- affiliates 51 (Trin), 81 (Blair), 138 (Emmie)
-- window 2026-08-17 (first qualifying commission on or after)
-- 12 statements, each a no-op if the link already exists
--
-- Apply via SiteGround phpMyAdmin or:
--   ssh tsprod 'cd ~/www/true-sciences.com/public_html && wp db query < link-gap-backfill.sql'
--
-- Does NOT backfill commissions or change past payouts — only writes
-- slicewp_customer_meta.affiliate_id for naked-repeat lifetime eligibility.
--
-- Review list:
--   #118   → Trin #51   (first B/T/E since 8/17)
--   #5353  → Trin #51   (Aug 31, auto-link miss)
--   #5354  → Trin #51   (Aug 31, auto-link miss)
--   #5355  → Trin #51   (Aug 31, auto-link miss)
--   #2841  → Blair #81  (first B/T/E since 8/17)
--   #3056  → Blair #81  (first B/T/E since 8/17)
--   #3157  → Blair #81  (first B/T/E since 8/17)
--   #5345  → Blair #81  (Aug 31, auto-link miss)
--   #5346  → Blair #81  (Aug 31, auto-link miss)
--   #5348  → Emmie #138 (Aug 31, auto-link miss)
--   #5349  → Emmie #138 (Aug 31, auto-link miss)
--   #5352  → Emmie #138 (Aug 31, auto-link miss)

START TRANSACTION;

INSERT INTO zww_slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)
SELECT 118, 'affiliate_id', '51' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM zww_slicewp_customer_meta
  WHERE slicewp_customer_id = 118 AND meta_key = 'affiliate_id');

INSERT INTO zww_slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)
SELECT 5353, 'affiliate_id', '51' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM zww_slicewp_customer_meta
  WHERE slicewp_customer_id = 5353 AND meta_key = 'affiliate_id');

INSERT INTO zww_slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)
SELECT 5354, 'affiliate_id', '51' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM zww_slicewp_customer_meta
  WHERE slicewp_customer_id = 5354 AND meta_key = 'affiliate_id');

INSERT INTO zww_slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)
SELECT 5355, 'affiliate_id', '51' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM zww_slicewp_customer_meta
  WHERE slicewp_customer_id = 5355 AND meta_key = 'affiliate_id');

INSERT INTO zww_slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)
SELECT 2841, 'affiliate_id', '81' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM zww_slicewp_customer_meta
  WHERE slicewp_customer_id = 2841 AND meta_key = 'affiliate_id');

INSERT INTO zww_slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)
SELECT 3056, 'affiliate_id', '81' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM zww_slicewp_customer_meta
  WHERE slicewp_customer_id = 3056 AND meta_key = 'affiliate_id');

INSERT INTO zww_slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)
SELECT 3157, 'affiliate_id', '81' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM zww_slicewp_customer_meta
  WHERE slicewp_customer_id = 3157 AND meta_key = 'affiliate_id');

INSERT INTO zww_slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)
SELECT 5345, 'affiliate_id', '81' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM zww_slicewp_customer_meta
  WHERE slicewp_customer_id = 5345 AND meta_key = 'affiliate_id');

INSERT INTO zww_slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)
SELECT 5346, 'affiliate_id', '81' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM zww_slicewp_customer_meta
  WHERE slicewp_customer_id = 5346 AND meta_key = 'affiliate_id');

INSERT INTO zww_slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)
SELECT 5348, 'affiliate_id', '138' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM zww_slicewp_customer_meta
  WHERE slicewp_customer_id = 5348 AND meta_key = 'affiliate_id');

INSERT INTO zww_slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)
SELECT 5349, 'affiliate_id', '138' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM zww_slicewp_customer_meta
  WHERE slicewp_customer_id = 5349 AND meta_key = 'affiliate_id');

INSERT INTO zww_slicewp_customer_meta (slicewp_customer_id, meta_key, meta_value)
SELECT 5352, 'affiliate_id', '138' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM zww_slicewp_customer_meta
  WHERE slicewp_customer_id = 5352 AND meta_key = 'affiliate_id');

COMMIT;
