/* Pixit Delivery — formulario de retiro a domicilio.
 * Sin dependencias. Lee comunas, bloques y Turnstile desde el endpoint de
 * Pixit, y envía la solicitud al mismo endpoint. No usa claves. */
(function () {
  'use strict';

  var MODELOS = {
    iphone: ['iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16', 'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15',
      'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14', 'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13', 'iPhone 13 Mini',
      'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12', 'iPhone 12 Mini', 'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11', 'iPhone SE'],
    ipad: ['iPad Pro', 'iPad Air', 'iPad', 'iPad mini'],
    mac: ['MacBook Air', 'MacBook Pro', 'iMac', 'Mac mini'],
    watch: ['Apple Watch Ultra', 'Apple Watch Series 10', 'Apple Watch Series 9', 'Apple Watch Series 8', 'Apple Watch SE', 'Apple Watch Series 7 o anterior'],
    otro: []
  };
  var OTRO_MODELO = 'Otro modelo';
  var EQUIPOS = [
    ['iphone', 'iPhone', 'iPhone', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 5h3"/></svg>'],
    ['ipad', 'iPad', 'iPad', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="2.5" width="16" height="19" rx="2"/><circle cx="12" cy="18.5" r=".6" fill="currentColor"/></svg>'],
    ['mac', 'MacBook', 'Mac', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4.5" y="4.5" width="15" height="10.5" rx="1.2"/><path d="M2 18.5h20l-1.5-2h-17z"/></svg>'],
    ['watch', 'Watch', 'Apple Watch', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6.5" y="6" width="11" height="12" rx="3"/><path d="M8.5 6l1-3.5h5l1 3.5M8.5 18l1 3.5h5l1-3.5"/></svg>'],
    ['otro', 'Otro', 'Otro equipo', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>']
  ];
  var ICONOS = {
    truck: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M4 12h24v20H4z"/><path d="M30 18h8l6 7v7H30z"/><circle cx="12" cy="36" r="4.5" fill="#f6f6f6" stroke="currentColor" stroke-width="3"/><circle cx="36" cy="36" r="4.5" fill="#f6f6f6" stroke="currentColor" stroke-width="3"/></svg>',
    tool: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M30.5 6a10 10 0 0 0-9.4 13.4L6.4 34.1a4 4 0 0 0 5.6 5.6l14.7-14.7A10 10 0 0 0 40 14.9l-5.5 5.5-5.6-1.3-1.3-5.6L33.1 8A10 10 0 0 0 30.5 6z"/></svg>',
    home: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M24 5 3 22h6v20h11V30h8v12h11V22h6z"/></svg>'
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rutValido(rut) {
    var limpio = String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
    if (limpio.length < 8 || limpio.length > 9) return false;
    var cuerpo = limpio.slice(0, -1), dv = limpio.slice(-1);
    if (!/^\d+$/.test(cuerpo)) return false;
    var suma = 0, factor = 2;
    for (var i = cuerpo.length - 1; i >= 0; i--) {
      suma += Number(cuerpo[i]) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    }
    var resto = 11 - (suma % 11);
    var esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
    return dv === esperado;
  }

  function formatearRut(rut) {
    var limpio = String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
    if (limpio.length < 2) return rut;
    return limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + limpio.slice(-1);
  }

  function hoySantiago() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  function fechaLarga(ymd) {
    var p = String(ymd).split('-').map(Number);
    if (p.length !== 3 || !p[0]) return ymd;
    var s = new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Achica la foto en el navegador antes de enviarla: una foto de iPhone pesa
  // 3–5 MB y el endpoint acepta hasta 3 MB por foto.
  function comprimirFoto(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error('tipo'));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight;
        var escala = Math.min(1, max / Math.max(w, h));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(w * escala);
        canvas.height = Math.round(h * escala);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('lectura')); };
      img.src = url;
    });
  }

  var turnstileCargado = null;
  function cargarTurnstile() {
    if (turnstileCargado) return turnstileCargado;
    turnstileCargado = new Promise(function (resolve, reject) {
      if (window.turnstile) return resolve(window.turnstile);
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = function () { resolve(window.turnstile); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return turnstileCargado;
  }

  function montar(root) {
    var opciones;
    try { opciones = JSON.parse(root.getAttribute('data-pixit-delivery') || '{}'); } catch (e) { opciones = {}; }
    if (!opciones.endpoint || !opciones.formulario) return;
    if (!opciones.completo) root.classList.add('pxd-solo');

    var cfg = { comunas: [], bloques: [], whatsapp: null, turnstile_site_key: null };
    var S = {
      paso: 0, enviando: false, error: '', codigo: '', turnstileToken: '', turnstileWidget: null,
      datos: {
        nombre: '', apellido: '', rut: '', telefono: '', email: '',
        equipo: 'iphone', modelo: '', modeloOtro: '', falla: '', fotos: [],
        direccion: '', comuna: '', referencia: '', fecha: '', bloque: '', acepto: false, website: ''
      },
      errores: {}
    };

    function waLink(texto) {
      if (!cfg.whatsapp) return '';
      return 'https://wa.me/' + encodeURIComponent(cfg.whatsapp) + (texto ? '?text=' + encodeURIComponent(texto) : '');
    }

    function fld(nombre, label, html, opcional) {
      var err = S.errores[nombre];
      return '<div class="pxd-fld' + (err ? ' pxd-invalid' : '') + '">' +
        '<label for="pxd-' + nombre + '">' + esc(label) + (opcional ? ' <i>(' + esc(opcional) + ')</i>' : '') + '</label>' + html +
        '<div class="pxd-msg pxd-bad" id="pxd-' + nombre + '-msg" role="alert">' + esc(err || '') + '</div></div>';
    }

    function input(nombre, tipo, extra) {
      return '<input id="pxd-' + nombre + '" name="' + nombre + '" type="' + tipo + '" value="' + esc(S.datos[nombre]) + '" ' + (extra || '') +
        ' aria-describedby="pxd-' + nombre + '-msg">';
    }

    function tabs() {
      return '<div class="pxd-tabs">' + ['Tus datos', 'Tu equipo', 'Retiro'].map(function (t, i) {
        var cls = i === S.paso ? 'pxd-on' : i < S.paso ? 'pxd-ok' : '';
        return '<div class="' + cls + '"' + (i === S.paso ? ' aria-current="step"' : '') + '><em>' + (i < S.paso ? '✓' : i + 1) + '</em><span>' + t + '</span></div>';
      }).join('') + '</div>';
    }

    function alerta() {
      return S.error ? '<div class="pxd-alert" role="alert">' + esc(S.error) + '</div>' : '';
    }

    function modeloActual() {
      var d = S.datos;
      if (d.equipo === 'otro') return d.modeloOtro.trim();
      if (d.modelo === OTRO_MODELO) return d.modeloOtro.trim();
      return d.modelo;
    }

    function pasoDatos() {
      var rutOk = S.datos.rut && rutValido(S.datos.rut) && !S.errores.rut;
      return tabs() + alerta() +
        '<div class="pxd-grid2">' +
        fld('nombre', 'Nombre', input('nombre', 'text', 'autocomplete="given-name" required')) +
        fld('apellido', 'Apellido', input('apellido', 'text', 'autocomplete="family-name" required')) +
        fld('rut', 'RUT', input('rut', 'text', 'inputmode="text" placeholder="12.345.678-9" required') +
          (rutOk ? '<div class="pxd-msg pxd-good">✓ RUT válido</div>' : '')) +
        fld('telefono', 'Teléfono', input('telefono', 'tel', 'autocomplete="tel" placeholder="+56 9 1234 5678" required')) +
        '</div>' +
        fld('email', 'Correo', input('email', 'email', 'autocomplete="email"'), 'te enviamos el comprobante') +
        '<div class="pxd-actions"><span></span><button type="button" class="pxd-btn pxd-dark" data-accion="siguiente">Continuar ›</button></div>';
    }

    function pasoEquipo() {
      var d = S.datos;
      var lista = MODELOS[d.equipo];
      var selector = d.equipo === 'otro' ? '' : fld('modelo', 'Modelo',
        '<select id="pxd-modelo" name="modelo" aria-describedby="pxd-modelo-msg"><option value="">Elige el modelo</option>' +
        lista.concat([OTRO_MODELO]).map(function (m) { return '<option' + (m === d.modelo ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') +
        '</select>');
      var libre = (d.equipo === 'otro' || d.modelo === OTRO_MODELO)
        ? fld('modeloOtro', d.equipo === 'otro' ? '¿Qué equipo es?' : '¿Qué modelo?', input('modeloOtro', 'text', 'placeholder="' + (d.equipo === 'otro' ? 'Ej: Notebook Lenovo IdeaPad 3' : 'Ej: iPhone XR') + '"'))
        : '';
      var fotos = d.fotos.map(function (f, i) {
        return '<div class="pxd-ph"><img src="' + f + '" alt="Foto ' + (i + 1) + '"><button type="button" data-quitar-foto="' + i + '" aria-label="Quitar foto ' + (i + 1) + '">×</button></div>';
      }).join('');
      if (d.fotos.length < 3) {
        fotos += '<label class="pxd-ph" for="pxd-fotos" aria-label="Agregar foto">+<input id="pxd-fotos" type="file" accept="image/*" multiple></label>';
      }
      return tabs() + alerta() +
        '<span class="pxd-lbl">¿Qué equipo es?</span>' +
        '<div class="pxd-devs" role="group" aria-label="Tipo de equipo">' + EQUIPOS.map(function (e) {
          return '<button type="button" class="pxd-dev" data-equipo="' + e[0] + '" aria-pressed="' + (d.equipo === e[0]) + '">' + e[3] + esc(e[1]) + '</button>';
        }).join('') + '</div>' +
        selector + libre +
        fld('falla', '¿Qué le pasa?', '<textarea id="pxd-falla" name="falla" rows="3" placeholder="Cuéntanos qué le pasó y qué falla notas" aria-describedby="pxd-falla-msg">' + esc(d.falla) + '</textarea>') +
        '<div class="pxd-fld"><span class="pxd-lbl">Fotos <i>(opcional, hasta 3)</i></span><div class="pxd-photos">' + fotos + '</div>' +
        '<div class="pxd-msg pxd-bad" role="alert">' + esc(S.errores.fotos || '') + '</div></div>' +
        '<div class="pxd-actions"><button type="button" class="pxd-btn pxd-line" data-accion="atras">‹ Atrás</button>' +
        '<button type="button" class="pxd-btn pxd-dark" data-accion="siguiente">Continuar ›</button></div>';
    }

    function pasoRetiro() {
      var d = S.datos;
      var comunas = cfg.comunas.length
        ? '<select id="pxd-comuna" name="comuna" aria-describedby="pxd-comuna-msg"><option value="">Elige tu comuna</option>' +
          cfg.comunas.map(function (c) { return '<option' + (c === d.comuna ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>'
        : input('comuna', 'text', 'autocomplete="address-level2"');
      var bloques = cfg.bloques.length ? fld('bloque', 'Bloque horario',
        '<div class="pxd-slots" role="group" aria-label="Bloque horario">' + cfg.bloques.map(function (b) {
          return '<button type="button" class="pxd-slot" data-bloque="' + esc(b) + '" aria-pressed="' + (d.bloque === b) + '">' + esc(b) + '</button>';
        }).join('') + '</div>') : '';
      return tabs() + alerta() +
        fld('direccion', 'Dirección', input('direccion', 'text', 'autocomplete="street-address" placeholder="Calle, número, depto"')) +
        '<div class="pxd-grid2">' +
        fld('comuna', 'Comuna', comunas) +
        fld('fecha', 'Fecha de retiro', input('fecha', 'date', 'min="' + hoySantiago() + '"')) +
        '</div>' +
        fld('referencia', 'Referencia', input('referencia', 'text', 'placeholder="Ej: dejar en conserjería"'), 'opcional') +
        bloques +
        '<div class="pxd-turnstile" id="pxd-turnstile"></div>' +
        '<div class="pxd-hp" aria-hidden="true"><label for="pxd-website">No completar</label><input id="pxd-website" name="website" type="text" tabindex="-1" autocomplete="off" value="' + esc(d.website) + '"></div>' +
        '<div class="pxd-fld' + (S.errores.acepto ? ' pxd-invalid' : '') + '"><label class="pxd-check"><input id="pxd-acepto" name="acepto" type="checkbox"' + (d.acepto ? ' checked' : '') + '> ' +
        'Acepto que usen estos datos para coordinar el retiro, la reparación y la entrega.</label>' +
        '<div class="pxd-msg pxd-bad" role="alert">' + esc(S.errores.acepto || '') + '</div></div>' +
        (cfg.comunas.length ? '<p class="pxd-note">¿Tu comuna no aparece? ' + (cfg.whatsapp ? '<a href="' + waLink('Hola, quiero pedir un retiro a domicilio y mi comuna no aparece en el formulario.') + '" target="_blank" rel="noopener">Escríbenos por WhatsApp</a>.' : 'Escríbenos.') + '</p>' : '') +
        '<div class="pxd-actions"><button type="button" class="pxd-btn pxd-line" data-accion="atras">‹ Atrás</button>' +
        '<button type="button" class="pxd-btn pxd-dark" data-accion="enviar"' + (S.enviando ? ' disabled' : '') + '>' + (S.enviando ? 'Enviando…' : 'Pedir retiro ›') + '</button></div>' +
        '<p class="pxd-note">Te llamaremos para confirmar el horario antes de pasar.</p>';
    }

    function pasoListo() {
      var d = S.datos;
      var filas = [['Equipo', modeloActual() || EQUIPOS.filter(function (e) { return e[0] === d.equipo; })[0][2]],
        ['Retiro', (d.fecha ? fechaLarga(d.fecha) : 'Por coordinar') + (d.bloque ? ' · ' + d.bloque : '')],
        ['Dirección', d.direccion + ', ' + d.comuna]];
      return '<div class="pxd-done" tabindex="-1" id="pxd-listo">' +
        '<div class="pxd-tick"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>' +
        '<h3>¡Solicitud recibida!</h3><div class="pxd-code">' + esc(S.codigo) + '</div>' +
        '<p style="margin:0 auto;max-width:440px">Te llamaremos al <b style="color:#555">' + esc(d.telefono) + '</b> para confirmar el retiro. Guarda este número por si necesitas consultarnos.</p>' +
        '<table class="pxd-sum"><tbody>' + filas.map(function (f) { return '<tr><th>' + f[0] + '</th><td>' + esc(f[1]) + '</td></tr>'; }).join('') + '</tbody></table>' +
        '<div class="pxd-actions" style="justify-content:center">' +
        (cfg.whatsapp ? '<a class="pxd-btn pxd-wa" target="_blank" rel="noopener" href="' + waLink('Hola, acabo de pedir un retiro a domicilio: ' + S.codigo) + '">Escríbenos por WhatsApp ›</a>' : '') +
        '</div></div>';
    }

    function aside() {
      if (!opciones.completo) return '';
      return '<aside class="pxd-aside">' +
        (cfg.comunas.length ? '<h4>Zona de cobertura</h4><div class="pxd-zona"><b>Retiramos en:</b> ' + esc(cfg.comunas.join(', ')) + '.</div>' : '') +
        '<h4>Preguntas frecuentes</h4><ul>' +
        '<li><b>¿Cómo funciona?</b><small>Retiramos tu equipo, lo diagnosticamos en tienda y te enviamos el presupuesto antes de reparar.</small></li>' +
        '<li><b>¿Cuánto se demora?</b><small>La mayoría de las reparaciones están listas el mismo día.</small></li>' +
        '<li><b>¿Cómo me lo devuelven?</b><small>Cuando esté listo coordinamos contigo la entrega en tu domicilio.</small></li>' +
        '<li><b>¿Tiene garantía?</b><small>Todas nuestras reparaciones tienen garantía.</small></li>' +
        '</ul></aside>';
    }

    function portada() {
      if (!opciones.completo) return '';
      return '<div class="pxd-hero"><div class="pxd-hero-in"><div>' +
        '<h1>Retiro y entrega a domicilio</h1>' +
        '<p>Vamos a buscar tu iPhone, iPad, MacBook o Apple Watch, lo reparamos en nuestra tienda y te lo devolvemos en tu casa u oficina.</p>' +
        '<div class="pxd-row"><a href="#pxd-form" class="pxd-btn">Pedir retiro ›</a>' +
        (cfg.whatsapp ? '<a href="' + waLink('Hola, tengo una consulta sobre el retiro a domicilio.') + '" target="_blank" rel="noopener" class="pxd-btn pxd-ghost">Consultar por WhatsApp ›</a>' : '') +
        '</div></div></div></div>' +
        '<div class="pxd-promise">' +
        '<div>' + ICONOS.truck + '<span><b>Te lo vamos a buscar</b><small>Elige el día y el bloque horario que te acomode.</small></span></div>' +
        '<div>' + ICONOS.tool + '<span><b>Lo reparamos en tienda</b><small>Diagnóstico y presupuesto antes de reparar. Todo con garantía.</small></span></div>' +
        '<div>' + ICONOS.home + '<span><b>Te lo devolvemos</b><small>Coordinamos la entrega apenas tu equipo esté listo.</small></span></div>' +
        '</div>';
    }

    function render(enfocar) {
      var cuerpo = S.codigo ? pasoListo() : [pasoDatos, pasoEquipo, pasoRetiro][S.paso]();
      root.innerHTML = portada() +
        '<div class="pxd-main"><section id="pxd-form" aria-live="polite"><div class="pxd-stitle"><b>Solicita tu retiro</b></div>' +
        '<form novalidate onsubmit="return false">' + cuerpo + '</form></section>' + aside() + '</div>';
      if (S.paso === 2 && !S.codigo) montarTurnstile();
      if (enfocar) {
        var destino = root.querySelector('#pxd-listo') || root.querySelector('.pxd-invalid input, .pxd-invalid select, .pxd-invalid textarea') || root.querySelector('.pxd-stitle');
        if (destino) {
          if (destino.focus) destino.focus({ preventScroll: true });
          var top = root.querySelector('.pxd-stitle').getBoundingClientRect().top + window.pageYOffset - 90;
          if (top < window.pageYOffset) window.scrollTo({ top: top, behavior: 'smooth' });
        }
      }
    }

    function montarTurnstile() {
      if (!cfg.turnstile_site_key) return;
      var box = root.querySelector('#pxd-turnstile');
      cargarTurnstile().then(function (ts) {
        if (!box || !box.isConnected) return;
        S.turnstileWidget = ts.render(box, {
          sitekey: cfg.turnstile_site_key,
          language: 'es',
          callback: function (token) { S.turnstileToken = token; },
          'expired-callback': function () { S.turnstileToken = ''; },
          'error-callback': function () { S.turnstileToken = ''; }
        });
      }).catch(function () {
        S.error = 'No se pudo cargar la verificación antispam. Revisa tu conexión y recarga la página.';
      });
    }

    function validar(paso) {
      var d = S.datos, e = {};
      if (paso === 0) {
        if (!d.nombre.trim()) e.nombre = 'Escribe tu nombre';
        if (!d.apellido.trim()) e.apellido = 'Escribe tu apellido';
        if (!d.rut.trim()) e.rut = 'Escribe tu RUT';
        else if (!rutValido(d.rut)) e.rut = 'Revisa el RUT: el dígito verificador no coincide';
        if (!/^\+?[0-9\s()-]{8,20}$/.test(d.telefono.trim())) e.telefono = 'Escribe un teléfono válido, ej: +56 9 1234 5678';
        if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) e.email = 'Revisa el correo';
      }
      if (paso === 1) {
        if (d.equipo !== 'otro' && !d.modelo) e.modelo = 'Elige el modelo';
        if ((d.equipo === 'otro' || d.modelo === OTRO_MODELO) && !d.modeloOtro.trim()) e.modeloOtro = 'Cuéntanos qué equipo es';
        if (d.falla.trim().length < 5) e.falla = 'Cuéntanos qué le pasa al equipo';
      }
      if (paso === 2) {
        if (!d.direccion.trim()) e.direccion = 'Escribe la dirección de retiro';
        if (!d.comuna.trim()) e.comuna = 'Elige tu comuna';
        if (!d.fecha) e.fecha = 'Elige una fecha';
        else if (d.fecha < hoySantiago()) e.fecha = 'Elige una fecha desde hoy en adelante';
        if (cfg.bloques.length && !d.bloque) e.bloque = 'Elige un bloque horario';
        if (!d.acepto) e.acepto = 'Necesitamos tu autorización para coordinar el retiro';
      }
      S.errores = e;
      return Object.keys(e).length === 0;
    }

    function enviar() {
      if (!validar(2)) return render(true);
      if (cfg.turnstile_site_key && !S.turnstileToken) {
        S.error = 'Espera a que se complete la verificación antispam e intenta de nuevo.';
        return render(true);
      }
      var d = S.datos;
      var equipo = EQUIPOS.filter(function (x) { return x[0] === d.equipo; })[0];
      var payload = {
        formulario: opciones.formulario,
        website: d.website,
        turnstile_token: S.turnstileToken,
        nombre: d.nombre, apellido: d.apellido, rut: formatearRut(d.rut), telefono: d.telefono, email: d.email,
        tipo_equipo: equipo[2],
        marca: d.equipo === 'otro' ? '' : 'Apple',
        modelo: modeloActual(),
        falla: d.falla,
        fotos: d.fotos,
        direccion: d.direccion, comuna: d.comuna, referencia_direccion: d.referencia,
        fecha_preferida: d.fecha, bloque_horario: d.bloque,
        acepto_privacidad: d.acepto === true
      };
      S.enviando = true; S.error = '';
      render();
      fetch(opciones.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
        .then(function (res) {
          S.enviando = false;
          if (res && res.ok && res.codigo) {
            S.codigo = res.codigo;
          } else {
            S.error = (res && res.error) || 'No pudimos enviar la solicitud. Intenta de nuevo o escríbenos por WhatsApp.';
            if (window.turnstile && S.turnstileWidget !== null) { try { window.turnstile.reset(S.turnstileWidget); } catch (e) { /* nada */ } }
            S.turnstileToken = '';
          }
          render(true);
        })
        .catch(function () {
          S.enviando = false;
          S.error = 'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.';
          render(true);
        });
    }

    root.addEventListener('input', function (ev) {
      var t = ev.target;
      if (!t.name || !(t.name in S.datos) || t.type === 'checkbox' || t.type === 'file') return;
      S.datos[t.name] = t.value;
      if (S.errores[t.name]) {
        delete S.errores[t.name];
        var box = t.closest('.pxd-fld');
        if (box) { box.classList.remove('pxd-invalid'); var m = box.querySelector('.pxd-msg.pxd-bad'); if (m) m.textContent = ''; }
      }
    });

    root.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.name === 'acepto') { S.datos.acepto = t.checked; return; }
      if (t.name === 'rut') {
        // Se actualiza en el lugar, sin volver a dibujar el formulario: el
        // change llega al pasar al siguiente campo y un render le quitaría el foco.
        S.datos.rut = S.datos.rut.trim() ? formatearRut(t.value) : '';
        t.value = S.datos.rut;
        var ok = !!S.datos.rut && rutValido(S.datos.rut);
        if (S.datos.rut && !ok) S.errores.rut = 'Revisa el RUT: el dígito verificador no coincide';
        else delete S.errores.rut;
        var box = t.closest('.pxd-fld');
        box.classList.toggle('pxd-invalid', !!S.errores.rut);
        box.querySelector('.pxd-msg.pxd-bad').textContent = S.errores.rut || '';
        var bien = box.querySelector('.pxd-msg.pxd-good');
        if (ok && !bien) { bien = document.createElement('div'); bien.className = 'pxd-msg pxd-good'; bien.textContent = '✓ RUT válido'; t.insertAdjacentElement('afterend', bien); }
        if (!ok && bien) bien.remove();
        return;
      }
      if (t.name === 'modelo') { S.datos.modelo = t.value; delete S.errores.modelo; return render(); }
      if (t.id === 'pxd-fotos' && t.files) {
        var archivos = Array.prototype.slice.call(t.files, 0, 3 - S.datos.fotos.length);
        delete S.errores.fotos;
        Promise.all(archivos.map(function (f) { return comprimirFoto(f).catch(function () { return null; }); }))
          .then(function (lista) {
            lista.forEach(function (u) { if (u) S.datos.fotos.push(u); });
            if (lista.some(function (u) { return !u; })) S.errores.fotos = 'Una de las fotos no se pudo leer. Prueba con otra.';
            render();
          });
      }
    });

    root.addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-accion],[data-equipo],[data-bloque],[data-quitar-foto]');
      if (!el || !root.contains(el)) return;
      if (el.hasAttribute('data-equipo')) {
        S.datos.equipo = el.getAttribute('data-equipo');
        S.datos.modelo = ''; S.datos.modeloOtro = '';
        delete S.errores.modelo; delete S.errores.modeloOtro;
        return render();
      }
      if (el.hasAttribute('data-bloque')) { S.datos.bloque = el.getAttribute('data-bloque'); delete S.errores.bloque; return render(); }
      if (el.hasAttribute('data-quitar-foto')) { S.datos.fotos.splice(Number(el.getAttribute('data-quitar-foto')), 1); return render(); }
      var accion = el.getAttribute('data-accion');
      if (accion === 'siguiente') {
        S.error = '';
        if (validar(S.paso)) S.paso = Math.min(2, S.paso + 1);
        return render(true);
      }
      if (accion === 'atras') { S.error = ''; S.errores = {}; S.paso = Math.max(0, S.paso - 1); return render(true); }
      if (accion === 'enviar' && !S.enviando) enviar();
    });

    root.innerHTML = '<div class="pxd-loading">Cargando formulario…</div>';
    fetch(opciones.endpoint + '?formulario=' + encodeURIComponent(opciones.formulario))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || 'no disponible');
        cfg = res;
        cfg.comunas = res.comunas || [];
        cfg.bloques = res.bloques || [];
        render();
      })
      .catch(function () {
        root.innerHTML = '<div class="pxd-alert">El formulario de retiro no está disponible en este momento. Escríbenos por WhatsApp y coordinamos el retiro.</div>';
      });
  }

  function iniciar() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-pixit-delivery]'), montar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
