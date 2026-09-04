<?php
/**
 * Backfill missed naked lifetime commissions for Blair / Trin / Emmie.
 *
 * Default: dry-run only (no DB writes). Use --apply to insert unpaid lifetime_sale rows.
 * Emails are suppressed during --apply (admin + affiliate + wp_mail).
 *
 * Prod:
 *   wp eval-file /tmp/lifetime-commission-backfill.php -- --csv=/tmp/missed-lifetime-commissions-2026-08-17.csv
 *   wp eval-file /tmp/lifetime-commission-backfill.php -- --csv=... --dedupe=customer
 *   wp eval-file /tmp/lifetime-commission-backfill.php -- --csv=... --apply
 */

if ( php_sapi_name() !== 'cli' && ! defined( 'WP_CLI' ) ) {
	exit( "CLI only.\n" );
}

if ( ! function_exists( 'slicewp_insert_commission' ) || ! function_exists( 'wc_get_order' ) ) {
	fwrite( STDERR, "SliceWP or WooCommerce not loaded.\n" );
	exit( 1 );
}

define( 'TS_LIFETIME_BACKFILL_TAG', '2026-09-01-naked-lifetime' );
define( 'TS_LIFETIME_BACKFILL_BTE', array( 81, 51, 138 ) );

/**
 * @return array{csv:string,apply:bool,dedupe:bool,out:string}
 */
function ts_lifetime_backfill_parse_args(): array {
	$csv    = getenv( 'TS_BACKFILL_CSV' ) ?: '';
	$apply  = getenv( 'TS_BACKFILL_APPLY' ) === '1';
	$dedupe = getenv( 'TS_BACKFILL_DEDUPE' ) === 'customer';
	$out    = getenv( 'TS_BACKFILL_OUT' ) ?: '';

	global $argv;
	if ( ! empty( $argv ) ) {
		foreach ( $argv as $arg ) {
			if ( str_starts_with( $arg, '--csv=' ) ) {
				$csv = substr( $arg, 6 );
			} elseif ( $arg === '--apply' ) {
				$apply = true;
			} elseif ( $arg === '--dedupe=customer' ) {
				$dedupe = true;
			} elseif ( str_starts_with( $arg, '--out=' ) ) {
				$out = substr( $arg, 6 );
			}
		}
	}

	if ( $csv === '' || ! is_readable( $csv ) ) {
		fwrite( STDERR, "Readable --csv= path required (or TS_BACKFILL_CSV).\n" );
		exit( 1 );
	}

	if ( $out === '' ) {
		$out = dirname( $csv ) . '/lifetime-backfill-dry-run-' . gmdate( 'Y-m-d' ) . '.csv';
	}

	return compact( 'csv', 'apply', 'dedupe', 'out' );
}

/**
 * @return list<array<string,string>>
 */
function ts_lifetime_backfill_load_csv( string $path, bool $dedupe = false ): array {
	$handle = fopen( $path, 'r' );
	if ( ! $handle ) {
		fwrite( STDERR, "Cannot open CSV: {$path}\n" );
		exit( 1 );
	}

	$header = fgetcsv( $handle );
	if ( ! $header ) {
		fclose( $handle );
		return array();
	}

	$rows = array();
	while ( ( $data = fgetcsv( $handle ) ) !== false ) {
		if ( count( $data ) !== count( $header ) ) {
			continue;
		}
		$row = array_combine( $header, $data );
		if ( ! is_array( $row ) ) {
			continue;
		}
		if ( ( $row['outcome'] ?? '' ) !== 'no_commission' ) {
			continue;
		}
		$rows[] = $row;
	}
	fclose( $handle );

	if ( $dedupe ) {
		$first = array();
		foreach ( $rows as $row ) {
			$key = strtolower( $row['email'] ?? '' );
			if ( $key === '' || isset( $first[ $key ] ) ) {
				continue;
			}
			$first[ $key ] = $row;
		}
		$rows = array_values( $first );
		usort(
			$rows,
			static function ( $a, $b ) {
				return strcmp( $a['order_date'] ?? '', $b['order_date'] ?? '' );
			}
		);
	}

	return $rows;
}

function ts_lifetime_backfill_prepare_transaction_data( WC_Order $order, int $customer_id ): array {
	$formatted       = slicewp()->integrations['woo']->get_formatted_order_data( $order );
	$active_currency = slicewp_get_setting( 'active_currency', 'USD' );
	$order_currency  = $formatted['currency'];

	$transaction_data                            = $formatted;
	$transaction_data['original_currency']       = $transaction_data['currency'];
	$transaction_data['original_subtotal']       = $transaction_data['subtotal'];
	$transaction_data['original_total']          = $transaction_data['total'];
	$transaction_data['original_tax']            = $transaction_data['tax'];
	$transaction_data['currency']                = $active_currency;
	$transaction_data['subtotal']                = slicewp_sanitize_amount( slicewp_maybe_convert_amount( $transaction_data['subtotal'], $order_currency, $active_currency ) );
	$transaction_data['total']                   = slicewp_sanitize_amount( slicewp_maybe_convert_amount( $transaction_data['total'], $order_currency, $active_currency ) );
	$transaction_data['tax']                     = slicewp_sanitize_amount( slicewp_maybe_convert_amount( $transaction_data['tax'], $order_currency, $active_currency ) );
	$transaction_data['customer_id']             = $customer_id;
	$transaction_data['currency_conversion_rate'] = slicewp_get_currency_conversion_rate( $order_currency, $active_currency );

	foreach ( $transaction_data['items'] as $key => $transaction_item_data ) {
		if ( isset( $transaction_item_data['subtotal'] ) ) {
			$transaction_item_data['original_subtotal'] = $transaction_item_data['subtotal'];
		}
		$transaction_item_data['original_total'] = $transaction_item_data['total'];
		$transaction_item_data['original_tax']   = $transaction_item_data['tax'];
		if ( isset( $transaction_item_data['subtotal'] ) ) {
			$transaction_item_data['subtotal'] = slicewp_sanitize_amount( slicewp_maybe_convert_amount( $transaction_item_data['subtotal'], $order_currency, $active_currency ) );
		}
		$transaction_item_data['total'] = slicewp_sanitize_amount( slicewp_maybe_convert_amount( $transaction_item_data['total'], $order_currency, $active_currency ) );
		$transaction_item_data['tax']   = slicewp_sanitize_amount( slicewp_maybe_convert_amount( $transaction_item_data['tax'], $order_currency, $active_currency ) );
		$transaction_data['items'][ $key ] = $transaction_item_data;
	}

	return $transaction_data;
}

/**
 * @return array{amount:float,items:array<int,array<string,mixed>>}
 */
function ts_lifetime_backfill_calculate( WC_Order $order, int $affiliate_id, int $customer_id, array $transaction_data ): array {
	$commission_amount = 0.0;
	$commission_items  = array();
	$per_order         = slicewp_is_commission_basis_per_order( $affiliate_id );

	if ( ! $per_order ) {
		foreach ( $transaction_data['items'] as $transaction_item_data ) {
			if ( ( $transaction_item_data['type'] ?? '' ) !== 'product' ) {
				continue;
			}

			$product_id   = absint( $transaction_item_data['meta_data']['product_id'] ?? 0 );
			$variation_id = absint( $transaction_item_data['meta_data']['variation_id'] ?? 0 );

			if ( $product_id <= 0 ) {
				continue;
			}

			$commissionable_amount = $transaction_item_data['total'];
			if ( ! empty( slicewp_get_setting( 'exclude_tax', false ) ) ) {
				$commissionable_amount -= $transaction_item_data['tax'];
			}

			$args = array(
				'origin'       => 'woo',
				'type'         => 'lifetime_sale',
				'affiliate_id' => $affiliate_id,
				'product_id'   => $variation_id > 0 ? $variation_id : $product_id,
				'quantity'     => $transaction_item_data['quantity'],
				'customer_id'  => $customer_id,
				'reference'    => $order->get_id(),
			);

			$item_amount = slicewp_calculate_commission_amount( $commissionable_amount, $args );
			$commission_items[] = array(
				'commissionable_amount'   => $commissionable_amount,
				'commissionable_quantity' => $transaction_item_data['quantity'],
				'amount'                  => $item_amount,
				'transaction_item'        => $transaction_item_data,
			);
			$commission_amount += (float) $item_amount;
		}

		if ( ! empty( $commission_items ) && empty( slicewp_get_setting( 'exclude_shipping', false ) ) ) {
			foreach ( $transaction_data['items'] as $transaction_item_data ) {
				if ( ( $transaction_item_data['type'] ?? '' ) !== 'shipping' || empty( floatval( $transaction_item_data['total'] ) ) ) {
					continue;
				}
				$commissionable_amount = $transaction_item_data['total'];
				if ( ! empty( slicewp_get_setting( 'exclude_tax', false ) ) ) {
					$commissionable_amount -= $transaction_item_data['tax'];
				}
				$args = array(
					'origin'       => 'woo',
					'type'         => 'lifetime_sale',
					'affiliate_id' => $affiliate_id,
					'customer_id'  => $customer_id,
					'reference'    => $order->get_id(),
				);
				$item_amount = slicewp_calculate_commission_amount( slicewp_sanitize_amount( $commissionable_amount ), $args );
				$commission_items[] = array(
					'commissionable_amount'   => slicewp_sanitize_amount( $commissionable_amount ),
					'commissionable_quantity' => $transaction_item_data['quantity'],
					'amount'                  => $item_amount,
					'transaction_item'        => $transaction_item_data,
				);
				$commission_amount += (float) $item_amount;
			}
		}
	} else {
		$commissionable_amount = $transaction_data['total'];
		if ( ! empty( slicewp_get_setting( 'exclude_tax', false ) ) ) {
			$commissionable_amount -= $transaction_data['tax'];
		}
		$args = array(
			'origin'       => 'woo',
			'type'         => 'lifetime_sale',
			'affiliate_id' => $affiliate_id,
			'customer_id'  => $customer_id,
			'reference'    => $order->get_id(),
		);
		$commission_amount = (float) slicewp_calculate_commission_amount( $commissionable_amount, $args );
	}

	return array(
		'amount' => round( $commission_amount, 2 ),
		'items'  => $commission_items,
	);
}

function ts_lifetime_backfill_order_is_naked( WC_Order $order, int $affiliate_id ): bool {
	$ref   = (int) $order->get_meta( '_ts_slicewp_referrer_affiliate_id', true );
	$visit = (int) $order->get_meta( '_ts_slicewp_referrer_visit_id', true );
	if ( $ref > 0 || $visit > 0 ) {
		return false;
	}

	foreach ( $order->get_coupon_codes() as $code ) {
		$coupon = new WC_Coupon( $code );
		$coupon_id = (int) $coupon->get_id();
		if ( $coupon_id <= 0 ) {
			continue;
		}
		foreach ( array( 'slicewp_affiliate_id', '_slicewp_affiliate_id' ) as $meta_key ) {
			if ( (int) get_post_meta( $coupon_id, $meta_key, true ) === $affiliate_id ) {
				return false;
			}
		}
	}

	return true;
}

function ts_lifetime_backfill_existing_linked_commission( int $order_id, int $affiliate_id ): bool {
	$rows = slicewp_get_commissions(
		array(
			'reference'    => $order_id,
			'origin'       => 'woo',
			'affiliate_id' => $affiliate_id,
			'status'       => array( 'paid', 'unpaid', 'pending' ),
			'number'       => 1,
		)
	);

	return ! empty( $rows );
}

function ts_lifetime_backfill_mute_emails(): void {
	if ( ! defined( 'TS_LIFETIME_BACKFILL_SILENT' ) ) {
		define( 'TS_LIFETIME_BACKFILL_SILENT', true );
	}

	add_filter(
		'pre_wp_mail',
		static function ( $pre, $atts ) {
			unset( $atts );
			return TS_LIFETIME_BACKFILL_SILENT ? false : $pre;
		},
		999,
		2
	);

	foreach (
		array(
			array( 'slicewp_insert_commission', 'slicewp_send_email_notification_admin_new_commission_registered', 10 ),
			array( 'slicewp_insert_commission', 'slicewp_send_email_notification_affiliate_commission_approved', 10 ),
			array( 'slicewp_insert_commission', 'slicewp_send_email_notification_affiliate_commission_rejected', 10 ),
			array( 'slicewp_update_commission', 'slicewp_send_email_notification_affiliate_commission_approved', 10 ),
		) as $hook
	) {
		remove_action( $hook[0], $hook[1], $hook[2] );
	}
}

/**
 * @param array<string,mixed> $plan
 */
function ts_lifetime_backfill_insert( array $plan ): int {
	ts_lifetime_backfill_mute_emails();

	$commission_data = array(
		'affiliate_id'     => (int) $plan['affiliate_id'],
		'visit_id'         => 0,
		'type'             => 'lifetime_sale',
		'status'           => 'unpaid',
		'reference'        => (string) $plan['order_id'],
		'reference_amount' => slicewp_sanitize_amount( $plan['reference_amount'] ),
		'customer_id'      => (int) $plan['customer_id'],
		'origin'           => 'woo',
		'amount'           => slicewp_sanitize_amount( $plan['amount'] ),
		'currency'         => slicewp_get_setting( 'active_currency', 'USD' ),
		'date_created'     => $plan['date_created'],
		'date_modified'    => $plan['date_created'],
	);

	$commission_id = slicewp_insert_commission( $commission_data );
	if ( empty( $commission_id ) ) {
		return 0;
	}

	slicewp_add_commission_meta( $commission_id, '_ts_lifetime_backfill', TS_LIFETIME_BACKFILL_TAG );
	if ( ! empty( $plan['transaction_data'] ) ) {
		slicewp_update_commission_meta( $commission_id, '__transaction_data', $plan['transaction_data'] );
	}
	if ( ! empty( $plan['commission_items'] ) ) {
		slicewp_update_commission_meta( $commission_id, '__commission_items', $plan['commission_items'] );
	}

	return (int) $commission_id;
}

function ts_lifetime_backfill_plan_row( array $row ): array {
	$order_id     = (int) ( $row['order_id'] ?? 0 );
	$affiliate_id = (int) ( $row['linked_affiliate_id'] ?? 0 );
	$email        = strtolower( trim( $row['email'] ?? '' ) );

	$result = array(
		'order_id'      => $order_id,
		'email'           => $email,
		'affiliate_id'    => $affiliate_id,
		'affiliate'       => $row['linked_affiliate'] ?? '',
		'status'          => 'skip',
		'reason'          => '',
		'amount'          => '',
		'csv_expected'    => $row['expected_lifetime_10pct'] ?? '',
		'date_created'    => '',
		'commission_id'   => '',
	);

	if ( ! in_array( $affiliate_id, TS_LIFETIME_BACKFILL_BTE, true ) ) {
		$result['reason'] = 'not_bte_affiliate';
		return $result;
	}

	$order = wc_get_order( $order_id );
	if ( ! $order instanceof WC_Order ) {
		$result['reason'] = 'order_not_found';
		return $result;
	}

	if ( ! in_array( $order->get_status(), array( 'processing', 'completed' ), true ) ) {
		$result['reason'] = 'order_not_paid_status';
		return $result;
	}

	if ( ! ts_lifetime_backfill_order_is_naked( $order, $affiliate_id ) ) {
		$result['reason'] = 'no_longer_naked';
		return $result;
	}

	if ( ts_lifetime_backfill_existing_linked_commission( $order_id, $affiliate_id ) ) {
		$result['reason'] = 'commission_already_exists';
		return $result;
	}

	$customer = slicewp_get_customer_by_email( $email );
	if ( empty( $customer ) ) {
		$result['reason'] = 'customer_not_found';
		return $result;
	}

	$customer_id    = (int) $customer->get( 'id' );
	$linked_affiliate = (int) slicewp_get_customer_meta( $customer_id, 'affiliate_id', true );
	if ( $linked_affiliate !== $affiliate_id ) {
		$result['reason'] = 'customer_not_linked';
		return $result;
	}

	$transaction_data = ts_lifetime_backfill_prepare_transaction_data( $order, $customer_id );
	$calc             = ts_lifetime_backfill_calculate( $order, $affiliate_id, $customer_id, $transaction_data );
	if ( $calc['amount'] <= 0 && empty( slicewp_get_setting( 'zero_amount_commissions' ) ) ) {
		$result['reason'] = 'zero_amount';
		return $result;
	}

	$created = $order->get_date_created();
	$date_created = $created instanceof WC_DateTime
		? gmdate( 'Y-m-d H:i:s', $created->getTimestamp() + (int) $created->getOffset() )
		: slicewp_mysql_gmdate();

	$result['status']       = 'ready';
	$result['reason']       = 'ok';
	$result['amount']       = number_format( $calc['amount'], 2, '.', '' );
	$result['date_created'] = $date_created;
	$result['plan']         = array(
		'order_id'         => $order_id,
		'affiliate_id'     => $affiliate_id,
		'customer_id'      => $customer_id,
		'amount'           => $calc['amount'],
		'reference_amount' => $transaction_data['total'],
		'date_created'     => $date_created,
		'transaction_data' => $transaction_data,
		'commission_items' => $calc['items'],
	);

	return $result;
}

function ts_lifetime_backfill_write_report( string $path, array $results ): void {
	$handle = fopen( $path, 'w' );
	if ( ! $handle ) {
		fwrite( STDERR, "Cannot write report: {$path}\n" );
		return;
	}

	$fields = array(
		'order_id',
		'order_date',
		'email',
		'affiliate',
		'affiliate_id',
		'status',
		'reason',
		'amount',
		'csv_expected',
		'date_created',
		'commission_id',
	);
	fputcsv( $handle, $fields );

	foreach ( $results as $result ) {
		fputcsv(
			$handle,
			array(
				$result['order_id'],
				$result['order_date'] ?? '',
				$result['email'],
				$result['affiliate'],
				$result['affiliate_id'],
				$result['status'],
				$result['reason'],
				$result['amount'],
				$result['csv_expected'],
				$result['date_created'],
				$result['commission_id'],
			)
		);
	}

	fclose( $handle );
}

// --- main ---
$args = ts_lifetime_backfill_parse_args();
$rows = ts_lifetime_backfill_load_csv( $args['csv'], $args['dedupe'] );

echo 'Lifetime commission backfill' . ( $args['apply'] ? ' APPLY' : ' DRY-RUN' ) . "\n";
echo 'Source: ' . $args['csv'] . ' (' . count( $rows ) . " candidate rows)\n";
if ( $args['dedupe'] ) {
	echo "Dedupe: first naked miss per customer\n";
}

if ( $args['apply'] ) {
	ts_lifetime_backfill_mute_emails();
	echo "Email notifications: suppressed (pre_wp_mail + SliceWP hooks)\n";
}

$results = array();
$ready   = 0;
$skipped = 0;
$total   = 0.0;
$by_aff  = array();

foreach ( $rows as $row ) {
	$row['order_date'] = $row['order_date'] ?? '';
	$planned           = ts_lifetime_backfill_plan_row( $row );
	$planned['order_date'] = $row['order_date'];

	if ( $planned['status'] === 'ready' ) {
		++$ready;
		$total += (float) $planned['amount'];
		$by_aff[ $planned['affiliate'] ] = ( $by_aff[ $planned['affiliate'] ] ?? 0 ) + 1;

		if ( $args['apply'] ) {
			$commission_id = ts_lifetime_backfill_insert( $planned['plan'] );
			if ( $commission_id <= 0 ) {
				$planned['status'] = 'skip';
				$planned['reason']   = 'insert_failed';
				--$ready;
				++$skipped;
			} else {
				$planned['commission_id'] = (string) $commission_id;
				$planned['status']        = 'inserted';
			}
		}
	} else {
		++$skipped;
	}

	$results[] = $planned;
}

$report_path = $args['out'];
if ( ! $args['apply'] ) {
	ts_lifetime_backfill_write_report( $report_path, array_map(
		static function ( $result ) {
			return $result;
		},
		$results
	) );
}

echo "\nSummary\n";
echo "  ready: {$ready}\n";
echo "  skipped: {$skipped}\n";
echo "  total lifetime_sale @ unpaid: $" . number_format( $total, 2 ) . "\n";
foreach ( $by_aff as $name => $count ) {
	echo "    {$name}: {$count}\n";
}
echo '  report: ' . $report_path . "\n";

if ( ! $args['apply'] ) {
	echo "\nNo commissions inserted. Re-run with --apply after review.\n";
	echo "Emails are suppressed during --apply.\n";
	echo "MLM inherit rows may still be created for sponsors (also silent).\n";
}
