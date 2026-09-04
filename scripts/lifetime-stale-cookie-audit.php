<?php
/**
 * Audit B/T/E repeat commissions since 8/17 for stale-cookie lifetime eligibility.
 *
 * Usage (on prod via WP-CLI):
 *   wp eval-file ~/path/lifetime-stale-cookie-audit.php
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
	echo "Run via: wp eval-file lifetime-stale-cookie-audit.php\n";
	exit(1);
}

global $wpdb;

$bte = array(
	81  => array('name' => 'Blair', 'sale_rate' => 30, 'lifetime_rate' => 10),
	51  => array('name' => 'Trin', 'sale_rate' => 30, 'lifetime_rate' => 10),
	138 => array('name' => 'Emmie', 'sale_rate' => 30, 'lifetime_rate' => 10),
);

$since           = '2026-08-17 00:00:00';
$rules_effective = strtotime('2026-09-01 00:00:00 UTC');
$prefix          = $wpdb->prefix;

$commissions = $wpdb->get_results(
	$wpdb->prepare(
		"SELECT c.id, c.reference, c.date_created, c.type, c.amount, c.status, c.visit_id,
		        c.customer_id, c.affiliate_id, cu.email
		 FROM {$prefix}slicewp_commissions c
		 LEFT JOIN {$prefix}slicewp_customers cu ON cu.id = c.customer_id
		 WHERE c.affiliate_id IN (81, 51, 138)
		   AND c.origin = 'woo'
		   AND c.date_created >= %s
		   AND c.status IN ('paid', 'unpaid', 'pending')
		 ORDER BY c.date_created ASC, c.id ASC",
		$since
	),
	ARRAY_A
);

function ts_order_coupon_codes(int $order_id): array
{
	$order = wc_get_order($order_id);
	if (!$order instanceof WC_Order) {
		return array();
	}

	return array_map('strtolower', $order->get_coupon_codes());
}

function ts_coupon_affiliate_id(string $code): int
{
	if ($code === '' || !function_exists('true_sciences_slicewp_order_coupon_affiliate_id')) {
		return 0;
	}

	$order = wc_get_order(0);
	return 0;
}

function ts_affiliate_coupon_on_order(int $order_id): bool
{
	$order = wc_get_order($order_id);
	if (!$order instanceof WC_Order) {
		return false;
	}

	foreach ($order->get_coupon_codes() as $code) {
		$coupon = new WC_Coupon($code);
		$aff    = (int) get_post_meta($coupon->get_id(), 'slicewp_affiliate_id', true);
		if ($aff > 0) {
			return true;
		}
	}

	return false;
}

function ts_visit_had_prior_conversion(int $visit_id, int $before_commission_id): bool
{
	if ($visit_id <= 0 || !function_exists('slicewp_get_visit')) {
		return false;
	}

	$visit = slicewp_get_visit($visit_id);
	if (!is_object($visit) || !method_exists($visit, 'get')) {
		return false;
	}

	$converted = (int) $visit->get('commission_id');
	if ($converted <= 0) {
		return false;
	}

	return $converted < $before_commission_id;
}

function ts_customer_linked_to(int $customer_id, int $affiliate_id): bool
{
	if ($customer_id <= 0 || !function_exists('slicewp_get_customer_meta')) {
		return false;
	}

	return (int) slicewp_get_customer_meta($customer_id, 'affiliate_id', true) === $affiliate_id;
}

function ts_prior_commission_count(int $customer_id, int $affiliate_id, int $commission_id): int
{
	global $wpdb, $prefix;

	return (int) $wpdb->get_var(
		$wpdb->prepare(
			"SELECT COUNT(*) FROM {$prefix}slicewp_commissions
			 WHERE customer_id = %d AND affiliate_id = %d AND id < %d
			   AND status IN ('paid', 'unpaid', 'pending')",
			$customer_id,
			$affiliate_id,
			$commission_id
		)
	);
}

$results = array();

foreach ($commissions as $row) {
	$commission_id = (int) $row['id'];
	$order_id      = (int) $row['reference'];
	$affiliate_id  = (int) $row['affiliate_id'];
	$customer_id   = (int) $row['customer_id'];
	$visit_id      = (int) $row['visit_id'];
	$prior         = ts_prior_commission_count($customer_id, $affiliate_id, $commission_id);
	$is_repeat     = $prior > 0;
	$linked        = ts_customer_linked_to($customer_id, $affiliate_id);
	$has_aff_coupon = ts_affiliate_coupon_on_order($order_id);
	$visit_stale   = $visit_id <= 0 || ts_visit_had_prior_conversion($visit_id, $commission_id);
	$fresh_link    = !$has_aff_coupon && $visit_id > 0 && !ts_visit_had_prior_conversion($visit_id, $commission_id);

	$should_lifetime = $is_repeat
		&& $linked
		&& !$has_aff_coupon
		&& !$fresh_link
		&& ($visit_stale || $visit_id <= 0);

	$current_type = (string) $row['type'];
	$is_lifetime_type = ($current_type === 'lifetime_sale');
	$order_ts = strtotime((string) $row['date_created'] . ' UTC');

	$order = wc_get_order($order_id);
	$line_total = 0.0;
	if ($order instanceof WC_Order) {
		foreach ($order->get_items() as $item) {
			if ($item->is_type('line_item')) {
				$line_total += (float) $item->get_total();
			}
		}
	}
	$lifetime_rate = $bte[$affiliate_id]['lifetime_rate'] ?? 10;
	$expected_lifetime = $line_total > 0 ? round($line_total * $lifetime_rate / 100, 2) : null;
	$amount = (float) $row['amount'];
	$looks_lifetime_rate = $expected_lifetime !== null && abs($amount - $expected_lifetime) < 0.02;

	$mislabeled = $should_lifetime && !$is_lifetime_type;
	$overpaid   = $should_lifetime && !$looks_lifetime_rate && $expected_lifetime !== null && $amount > $expected_lifetime + 0.02;

	if (!$is_repeat) {
		continue;
	}

	$results[] = array(
		'commission_id'      => $commission_id,
		'order_id'           => $order_id,
		'order_date'         => $row['date_created'],
		'affiliate'          => $bte[$affiliate_id]['name'] ?? (string) $affiliate_id,
		'affiliate_id'       => $affiliate_id,
		'email'              => $row['email'] ?? '',
		'customer_id'        => $customer_id,
		'linked'             => $linked ? 'yes' : 'no',
		'prior_commissions'  => $prior,
		'visit_id'           => $visit_id,
		'visit_stale'        => $visit_stale ? 'yes' : 'no',
		'fresh_link'         => $fresh_link ? 'yes' : 'no',
		'affiliate_coupon'   => $has_aff_coupon ? 'yes' : 'no',
		'should_lifetime'    => $should_lifetime ? 'yes' : 'no',
		'current_type'       => $current_type,
		'amount'             => $amount,
		'expected_lifetime'  => $expected_lifetime,
		'looks_lifetime_rate'=> $looks_lifetime_rate ? 'yes' : 'no',
		'mislabeled_type'    => $mislabeled ? 'yes' : 'no',
		'overpaid_vs_lifetime'=> $overpaid ? 'yes' : 'no',
		'status'             => $row['status'],
		'post_rules_effective'=> ($order_ts >= $rules_effective) ? 'yes' : 'no',
	);
}

$should = array_values(array_filter($results, static fn($r) => $r['should_lifetime'] === 'yes'));
$mislabeled = array_values(array_filter($should, static fn($r) => $r['mislabeled_type'] === 'yes'));
$overpaid = array_values(array_filter($should, static fn($r) => $r['overpaid_vs_lifetime'] === 'yes'));
$pre_sep = array_values(array_filter($should, static fn($r) => $r['post_rules_effective'] === 'no'));
$post_sep = array_values(array_filter($should, static fn($r) => $r['post_rules_effective'] === 'yes'));

echo "B/T/E repeat commissions since {$since}: " . count($results) . "\n";
echo "Should be lifetime (stale cookie / naked repeat): " . count($should) . "\n";
echo "  mislabeled type (sale but should lifetime_sale): " . count($mislabeled) . "\n";
echo "  overpaid vs 10% lifetime rate: " . count($overpaid) . "\n";
echo "  before Sep 1 rules (no backfill planned): " . count($pre_sep) . "\n";
echo "  on/after Sep 1: " . count($post_sep) . "\n\n";

$out_path = getenv('TS_AUDIT_CSV') ?: '/tmp/lifetime-stale-cookie-audit.csv';
$fp = fopen($out_path, 'w');
if ($fp) {
	fputcsv($fp, array_keys($results[0] ?? $should[0] ?? array('note' => 'empty')));
	foreach ($should as $r) {
		fputcsv($fp, $r);
	}
	fclose($fp);
	echo "CSV (should-lifetime only): {$out_path}\n\n";
}

echo "--- mislabeled type (all dates) ---\n";
foreach ($mislabeled as $r) {
	printf(
		"#%d order %s %s %s visit=%d type=%s amt=%.2f expect=%.2f status=%s %s\n",
		$r['commission_id'],
		$r['order_id'],
		$r['order_date'],
		$r['affiliate'],
		$r['visit_id'],
		$r['current_type'],
		$r['amount'],
		$r['expected_lifetime'] ?? 0,
		$r['status'],
		$r['post_rules_effective'] === 'yes' ? '[post-Sep1]' : '[pre-Sep1]'
	);
}

echo "\n--- overpaid vs lifetime rate (subset may overlap) ---\n";
foreach (array_slice($overpaid, 0, 40) as $r) {
	printf(
		"#%d order %s %s amt=%.2f expect=%.2f diff=%.2f %s\n",
		$r['commission_id'],
		$r['order_id'],
		$r['affiliate'],
		$r['amount'],
		$r['expected_lifetime'] ?? 0,
		$r['amount'] - ($r['expected_lifetime'] ?? 0),
		$r['post_rules_effective'] === 'yes' ? '[post-Sep1]' : '[pre-Sep1]'
	);
}
if (count($overpaid) > 40) {
	echo '... and ' . (count($overpaid) - 40) . " more\n";
}
