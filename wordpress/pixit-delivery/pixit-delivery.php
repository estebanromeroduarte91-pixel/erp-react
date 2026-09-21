<?php
/**
 * Plugin Name: Pixit Delivery
 * Description: Formulario de retiro y entrega a domicilio conectado a Pixit. Usa el shortcode [pixit_delivery].
 * Version: 1.0.2
 * Author: Pixit
 * Text Domain: pixit-delivery
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

define('PIXIT_DELIVERY_VERSION', '1.0.2');
define('PIXIT_DELIVERY_ENDPOINT_DEFAULT', 'https://nfcdqdbhrsjhbnbtqewl.supabase.co/functions/v1/delivery-solicitud');

// ── Ajustes → Pixit Delivery ────────────────────────────────────────────────
// Solo dos datos, y ninguno es secreto: la URL pública del endpoint y el
// identificador del formulario. No se guarda ninguna clave de Pixit ni de
// Supabase en WordPress.
add_action('admin_init', function () {
    register_setting('pixit_delivery', 'pixit_delivery_endpoint', [
        'type' => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'default' => PIXIT_DELIVERY_ENDPOINT_DEFAULT,
    ]);
    register_setting('pixit_delivery', 'pixit_delivery_formulario', [
        'type' => 'string',
        'sanitize_callback' => 'sanitize_title',
        'default' => 'steve-docs',
    ]);
});

add_action('admin_menu', function () {
    add_options_page('Pixit Delivery', 'Pixit Delivery', 'manage_options', 'pixit-delivery', 'pixit_delivery_ajustes');
});

function pixit_delivery_ajustes() {
    if (!current_user_can('manage_options')) return;
    ?>
    <div class="wrap">
        <h1>Pixit Delivery</h1>
        <p>Inserta el formulario en cualquier página con el shortcode <code>[pixit_delivery]</code>.
           Para mostrar solo el formulario, sin portada ni preguntas frecuentes: <code>[pixit_delivery completo="no"]</code>.</p>
        <p>Comunas, bloques horarios y la verificación antispam se configuran en Pixit, no aquí.</p>
        <form method="post" action="options.php">
            <?php settings_fields('pixit_delivery'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="pixit_delivery_endpoint">URL del endpoint</label></th>
                    <td><input name="pixit_delivery_endpoint" id="pixit_delivery_endpoint" type="url" class="regular-text code"
                               value="<?php echo esc_attr(get_option('pixit_delivery_endpoint', PIXIT_DELIVERY_ENDPOINT_DEFAULT)); ?>"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="pixit_delivery_formulario">Formulario</label></th>
                    <td><input name="pixit_delivery_formulario" id="pixit_delivery_formulario" type="text" class="regular-text code"
                               value="<?php echo esc_attr(get_option('pixit_delivery_formulario', 'steve-docs')); ?>">
                        <p class="description">Identificador que entrega Pixit, por ejemplo <code>steve-docs</code>.</p></td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}

// ── Shortcode ───────────────────────────────────────────────────────────────
add_shortcode('pixit_delivery', function ($atts) {
    $atts = shortcode_atts([
        'completo' => 'si',
        'formulario' => get_option('pixit_delivery_formulario', 'steve-docs'),
    ], $atts, 'pixit_delivery');

    $base = plugin_dir_url(__FILE__) . 'assets/';
    wp_enqueue_style('pixit-delivery', $base . 'pixit-delivery.css', [], PIXIT_DELIVERY_VERSION);
    wp_enqueue_script('pixit-delivery', $base . 'pixit-delivery.js', [], PIXIT_DELIVERY_VERSION, true);

    $config = [
        'endpoint' => get_option('pixit_delivery_endpoint', PIXIT_DELIVERY_ENDPOINT_DEFAULT),
        'formulario' => sanitize_title($atts['formulario']),
        'completo' => $atts['completo'] !== 'no',
    ];

    // El formulario lo arma el JS. Sin JS se muestra el aviso de noscript.
    return sprintf(
        '<div class="pxd" data-pixit-delivery="%s"><noscript><p>Para pedir un retiro necesitas activar JavaScript, o escríbenos por WhatsApp.</p></noscript></div>',
        esc_attr(wp_json_encode($config))
    );
});
