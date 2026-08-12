// Cliente mínimo para la API REST oficial de Boleta Electrónica del SII.
//
// SimpleAPI sigue generando y firmando tanto el DTE como EnvioBOLETA. Este
// módulo reemplaza solamente el transporte al SII, porque las boletas no usan
// el upload tradicional de facturas: requieren una semilla, un token propio y
// el receptor REST pangal/rahue.

import forge from "https://esm.sh/node-forge@1.3.1";

export type AmbienteDte = "certificacion" | "produccion";

export interface SesionBoletaSii {
  ambiente: AmbienteDte;
  token: string;
}

const URLS = {
  certificacion: {
    api: "https://apicert.sii.cl/recursos/v1",
    envio: "https://pangal.sii.cl/recursos/v1/boleta.electronica.envio",
  },
  produccion: {
    api: "https://api.sii.cl/recursos/v1",
    envio: "https://rahue.sii.cl/recursos/v1/boleta.electronica.envio",
  },
} as const;

// El receptor de boletas declara esta cabecera como obligatoria y algunos de
// sus frontales rechazan agentes no compatibles antes de procesar el token.
// Se usa literalmente el formato publicado en la especificación del SII.
const USER_AGENT = "Mozilla/4.0 ( compatible; PROG 1.0; Windows NT)";
const XMLDSIG = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

function textoSeguro(texto: string): string {
  // Nunca incluir un token válido en logs ni errores guardados en la BD.
  return texto.replace(/(<(?:\w+:)?TOKEN[^>]*>)[^<]*(<\/)/gi, "$1[oculto]$2").slice(0, 1200);
}

function extraerTag(xml: string, nombre: string): string | null {
  const re = new RegExp(`<(?:(?:\\w+):)?${nombre}[^>]*>([^<]+)<\\/(?:(?:\\w+):)?${nombre}>`, "i");
  return re.exec(xml)?.[1]?.trim() ?? null;
}

function binario(bytes: ArrayBuffer): string {
  const vista = new Uint8Array(bytes);
  const partes: string[] = [];
  for (let i = 0; i < vista.length; i += 0x8000) {
    partes.push(String.fromCharCode(...vista.subarray(i, i + 0x8000)));
  }
  return partes.join("");
}

function unirBytes(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((n, parte) => n + parte.byteLength, 0);
  const salida = new Uint8Array(total);
  let offset = 0;
  for (const parte of partes) {
    salida.set(parte, offset);
    offset += parte.byteLength;
  }
  return salida;
}

function multipartBoleta(
  campos: Record<string, string>,
  nombreArchivo: string,
  archivo: ArrayBuffer,
): { boundary: string; body: Uint8Array } {
  const encoder = new TextEncoder();
  const boundary = `----PixitSii${crypto.randomUUID().replaceAll("-", "")}`;
  const partes: Uint8Array[] = [];
  for (const [nombre, valor] of Object.entries(campos)) {
    partes.push(encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${nombre}"\r\n\r\n${valor}\r\n`,
    ));
  }
  partes.push(encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombreArchivo}"\r\nContent-Type: application/xml\r\n\r\n`,
  ));
  partes.push(new Uint8Array(archivo));
  partes.push(encoder.encode(`\r\n--${boundary}--\r\n`));
  return { boundary, body: unirBytes(partes) };
}

function enteroBase64(n: { toString(radix: number): string }): string {
  let hex = n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  return forge.util.encode64(forge.util.hexToBytes(hex));
}

function credencialesPfx(bytes: ArrayBuffer, clave: string) {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(binario(bytes)));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, clave);

  const claves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ].map((b: forge.pkcs12.Bag) => b.key).filter(Boolean);
  const certificados = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b: forge.pkcs12.Bag) => b.cert).filter(Boolean) as forge.pki.Certificate[];

  if (!claves.length) throw new Error("El certificado PFX no contiene una llave privada");
  if (!certificados.length) throw new Error("El certificado PFX no contiene un certificado X.509");

  const privada = claves[0]!;
  // El PFX puede traer también la cadena de la CA. Se selecciona el
  // certificado cuya llave pública coincide con la llave privada.
  const certificado = certificados.find((c: forge.pki.Certificate) =>
    c.publicKey?.n?.compareTo?.(privada.n) === 0 && c.publicKey?.e?.compareTo?.(privada.e) === 0
  ) ?? certificados[0]!;

  return { privada, certificado };
}

// Firma exactamente el documento de dos líneas exigido por el SII. No se usa
// un serializador XML porque agregar indentación o un salto final cambia el
// digest y el servicio rechaza la firma.
export function firmarSemilla(certificadoPfx: ArrayBuffer, clave: string, semilla: string): string {
  if (!/^\d+$/.test(semilla)) throw new Error("El SII devolvió una semilla con formato inválido");

  const { privada, certificado } = credencialesPfx(certificadoPfx, clave);
  const raiz = `<getToken><item><Semilla>${semilla}</Semilla></item></getToken>`;

  const mdRaiz = forge.md.sha1.create();
  mdRaiz.update(raiz, "utf8");
  const digest = forge.util.encode64(mdRaiz.digest().getBytes());

  // Al canonicalizar SignedInfo como nodo independiente, el namespace
  // heredado de Signature debe aparecer en el elemento raíz canonicalizado.
  const signedInfoCanonico = `<SignedInfo xmlns="${XMLDSIG}"><CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod><SignatureMethod Algorithm="${RSA_SHA1}"></SignatureMethod><Reference URI=""><Transforms><Transform Algorithm="${ENVELOPED}"></Transform></Transforms><DigestMethod Algorithm="${SHA1}"></DigestMethod><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
  const mdFirma = forge.md.sha1.create();
  mdFirma.update(signedInfoCanonico, "utf8");
  const firma = forge.util.encode64(privada.sign(mdFirma));

  const publica = certificado.publicKey;
  const modulus = enteroBase64(publica.n);
  const exponent = enteroBase64(publica.e);
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificado)).getBytes();
  const x509 = forge.util.encode64(der);

  const signedInfoXml = signedInfoCanonico.replace(` xmlns="${XMLDSIG}"`, "");
  const signature = `<Signature xmlns="${XMLDSIG}">${signedInfoXml}<SignatureValue>${firma}</SignatureValue><KeyInfo><KeyValue><RSAKeyValue><Modulus>${modulus}</Modulus><Exponent>${exponent}</Exponent></RSAKeyValue></KeyValue><X509Data><X509Certificate>${x509}</X509Certificate></X509Data></KeyInfo></Signature>`;

  return `<?xml version="1.0" encoding="UTF-8"?>\n<getToken><item><Semilla>${semilla}</Semilla></item>${signature}</getToken>`;
}

async function respuestaTexto(res: Response, operacion: string): Promise<string> {
  const texto = await res.text();
  if (!res.ok) throw new Error(`${operacion} SII ${res.status}: ${textoSeguro(texto)}`);
  return texto;
}

export async function crearSesionBoletaSii(
  ambiente: AmbienteDte,
  certificadoPfx: ArrayBuffer,
  clave: string,
): Promise<SesionBoletaSii> {
  const base = URLS[ambiente].api;
  const semillaXml = await respuestaTexto(await fetch(`${base}/boleta.electronica.semilla`, {
    headers: { Accept: "application/xml", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  }), "Semilla");
  const semilla = extraerTag(semillaXml, "SEMILLA");
  if (!semilla) throw new Error(`El SII no devolvió una semilla: ${textoSeguro(semillaXml)}`);

  const solicitudToken = firmarSemilla(certificadoPfx, clave, semilla);
  const tokenXml = await respuestaTexto(await fetch(`${base}/boleta.electronica.token`, {
    method: "POST",
    headers: {
      Accept: "application/xml",
      "Content-Type": "application/xml; charset=UTF-8",
      "User-Agent": USER_AGENT,
    },
    body: solicitudToken,
    signal: AbortSignal.timeout(20_000),
  }), "Token");
  const estado = extraerTag(tokenXml, "ESTADO") ?? "";
  if (estado !== "00" && estado !== "0") {
    const glosa = extraerTag(tokenXml, "GLOSA") ?? textoSeguro(tokenXml);
    throw new Error(`El SII rechazó la creación del token (${estado || "sin estado"}): ${glosa}`);
  }
  const token = extraerTag(tokenXml, "TOKEN");
  if (!token) {
    const glosa = extraerTag(tokenXml, "GLOSA") ?? textoSeguro(tokenXml);
    throw new Error(`El SII no entregó token (${estado || "sin estado"}): ${glosa}`);
  }
  return { ambiente, token };
}

export function separarRut(rut: string): { cuerpo: string; dv: string } {
  const limpio = String(rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (!/^\d{6,8}[0-9K]$/.test(limpio)) throw new Error(`RUT inválido para el SII: ${rut}`);
  return { cuerpo: limpio.slice(0, -1), dv: limpio.slice(-1) };
}

export async function enviarSobreBoleta(
  sesion: SesionBoletaSii,
  rutFirmante: string,
  rutEmpresa: string,
  sobre: ArrayBuffer,
): Promise<{ trackId: string; respuesta: unknown }> {
  const envia = separarRut(rutFirmante);
  const empresa = separarRut(rutEmpresa);
  const nombreArchivo = `envio-boleta-${Date.now()}.xml`;
  // Pangal no procesa de forma confiable el multipart transmitido en chunks
  // por FormData desde Edge Runtime: puede leer el XML hasta la mitad y
  // responder LPX-00007 (unexpected EOF). Se arma un cuerpo binario completo,
  // manteniendo intactos los bytes ISO-8859-1 del XML y permitiendo que fetch
  // envíe un Content-Length definido.
  const multipart = multipartBoleta({
    rutSender: envia.cuerpo,
    dvSender: envia.dv,
    rutCompany: empresa.cuerpo,
    dvCompany: empresa.dv,
  }, nombreArchivo, sobre);

  const texto = await respuestaTexto(await fetch(URLS[sesion.ambiente].envio, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Cookie: `TOKEN=${sesion.token}`,
      "Content-Type": `multipart/form-data; boundary=${multipart.boundary}`,
      "User-Agent": USER_AGENT,
    },
    body: multipart.body,
    signal: AbortSignal.timeout(30_000),
  }), "Envío de boleta");

  let respuesta: Record<string, unknown>;
  try {
    respuesta = JSON.parse(texto);
  } catch {
    throw new Error(`El SII respondió un envío sin JSON válido: ${textoSeguro(texto)}`);
  }
  const trackId = String(respuesta.trackid ?? respuesta.trackId ?? "").trim();
  // La API define un entero de hasta 15 dígitos (no exactamente 15) y sus
  // propios ejemplos usan valores cortos. En certificación Pangal actualmente
  // devuelve TrackID de 8 dígitos.
  if (!/^\d{1,15}$/.test(trackId) || String(respuesta.estado ?? "").toUpperCase() !== "REC") {
    throw new Error(`El receptor REST no devolvió un TrackID de boleta válido: ${textoSeguro(texto)}`);
  }
  return { trackId, respuesta };
}

export async function consultarSobreBoleta(
  sesion: SesionBoletaSii,
  rutEmpresa: string,
  trackId: string,
): Promise<Record<string, unknown>> {
  const empresa = separarRut(rutEmpresa);
  if (!/^\d{1,15}$/.test(trackId)) throw new Error(`TrackID de boleta inválido: ${trackId}`);
  const url = `${URLS[sesion.ambiente].api}/boleta.electronica.envio/${empresa.cuerpo}-${empresa.dv}-${trackId}`;
  const texto = await respuestaTexto(await fetch(url, {
    headers: {
      Accept: "application/json",
      Cookie: `TOKEN=${sesion.token}`,
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(20_000),
  }), "Consulta de boleta");
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`El SII respondió una consulta sin JSON válido: ${textoSeguro(texto)}`);
  }
}
