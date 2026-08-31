<?php
/**
 * Creates a naked repeat WooCommerce order on Local WordPress so SliceWP's
 * lifetime add-on generates a lifetime_sale commission. Local only — refuses
 * to run against production hosts.
 *
 * Invoked by: npm run lifetime-demo-order
 * Do not upload to prod or run against true-sciences.com.
 */

if ( php_sapi_name() !== 'cli' ) {
	fwrite( STDERR, "CLI only.\n" );
	exit( 1 );
}

$wp_load = getenv( 'TS_WP_LOAD' );
if ( ! $wp_load || ! is_readable( $wp_load ) ) {
	fwrite( STDERR, "TS_WP_LOAD must point at wp-load.php\n" );
	exit( 1 );
}

require $wp_load;

$host = wp_parse_url( home_url(), PHP_URL_HOST );
if ( ! in_array( $host, array( 'true-sciences-04.local', 'localhost' ), true ) ) {
	fwrite( STDERR, "Refusing to run on {$host}. Local WordPress only.\n" );
	exit( 1 );
}

if ( ! function_exists( 'wc_create_order' ) || ! function_exists( 'slicewp_insert_pending_commission_woo' ) ) {
	fwrite( STDERR, "WooCommerce or SliceWP is not loaded.\n" );
	exit( 1 );
}

$affiliate_id   = absint( getenv( 'LTC_DEMO_AFFILIATE_ID' ) ?: 126 );
$customer_email = sanitize_email( getenv( 'LTC_DEMO_EMAIL' ) ?: 'andreadrew@yahoo.com' );
$product_id     = absint( getenv( 'LTC_DEMO_PRODUCT_ID' ) ?: 25 );

$product = wc_get_product( $product_id );
if ( ! $product ) {
	fwrite( STDERR, "Product #{$product_id} not found.\n" );
	exit( 1 );
}

$customer = slicewp_get_customer_by_email( $customer_email );
if ( empty( $customer ) ) {
	fwrite( STDERR, "No SliceWP customer for {$customer_email}.\n" );
	exit( 1 );
}

$customer_id = (int) $customer->get( 'id' );
$linked_affiliate = slicewp_get_customer_meta( $customer_id, 'affiliate_id', true );

if ( (string) $linked_affiliate !== (string) $affiliate_id ) {
	fwrite(
		STDERR,
		"Customer #{$customer_id} is linked to affiliate #{$linked_affiliate}, not #{$affiliate_id}.\n"
	);
	exit( 1 );
}

$prior = slicewp_get_commissions(
	array(
		'number'       => 1,
		'affiliate_id' => $affiliate_id,
		'customer_id'  => $customer_id,
		'status'       => array( 'paid', 'unpaid', 'pending' ),
	)
);

if ( empty( $prior ) ) {
	fwrite( STDERR, "Customer has no prior commission from affiliate #{$affiliate_id}; lifetime needs a repeat.\n" );
	exit( 1 );
}

$before_max = (int) $GLOBALS['wpdb']->get_var( "SELECT COALESCE(MAX(id), 0) FROM {$GLOBALS['wpdb']->prefix}slicewp_commissions" );

$order = wc_create_order(
	array(
		'status' => 'pending',
	)
);

$order->add_product( $product, 1 );
$order->set_billing_email( $customer_email );
$order->set_billing_first_name( 'Lifetime' );
$order->set_billing_last_name( 'Demo' );
$order->set_payment_method( 'cod' );
$order->set_payment_method_title( 'Local lifetime demo (no link, no coupon)' );
$order->update_meta_data( '_ts_lifetime_demo', '1' );
$order->calculate_totals();
$order->save();

$order_id      = (int) $order->get_id();
$order_created = $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d H:i:s' ) : gmdate( 'Y-m-d H:i:s' );

// Call SliceWP directly — do_action( checkout_update_order_meta ) pulls in plugins
// (e.g. MailPoet) that expect a full checkout context.
slicewp_insert_pending_commission_woo( $order_id );
$order->update_status( 'completed', 'Local lifetime demo order — naked repeat, no referral cookie.' );

$commissions = slicewp_get_commissions(
	array(
		'number'    => -1,
		'reference' => $order_id,
		'origin'    => 'woo',
	)
);

$new_commissions = array_values(
	array_filter(
		$commissions,
		static function ( $commission ) use ( $before_max, $order_created ) {
			$id = (int) $commission->get( 'id' );
			if ( $id <= $before_max ) {
				return false;
			}

			return strtotime( $commission->get( 'date_created' ) ) >= strtotime( $order_created ) - 60;
		}
	)
);

if ( empty( $new_commissions ) ) {
	fwrite(
		STDERR,
		"Order #{$order_id} created but no new commission was registered (found "
		. count( $commissions )
		. " stale row(s) for this reference).\n"
	);
	exit( 1 );
}

$primary = null;
foreach ( $new_commissions as $commission ) {
	if ( (int) $commission->get( 'affiliate_id' ) === $affiliate_id ) {
		$primary = $commission;
		break;
	}
}

if ( ! $primary ) {
	$primary = $new_commissions[0];
}

echo $order_id . "\t"
	. $primary->get( 'id' ) . "\t"
	. $primary->get( 'type' ) . "\t"
	. $primary->get( 'status' ) . "\t"
	. $primary->get( 'amount' ) . "\t"
	. $primary->get( 'affiliate_id' ) . "\t"
	. $primary->get( 'customer_id' ) . "\t"
	. $customer_email . "\n";

if ( $primary->get( 'type' ) !== 'lifetime_sale' ) {
	fwrite(
		STDERR,
		"Warning: expected type lifetime_sale, got {$primary->get( 'type' )}.\n"
	);
	exit( 2 );
}

if ( (int) $primary->get( 'affiliate_id' ) !== $affiliate_id ) {
	fwrite(
		STDERR,
		"Warning: expected affiliate #{$affiliate_id}, got #{$primary->get( 'affiliate_id' )}.\n"
	);
	exit( 2 );
}
