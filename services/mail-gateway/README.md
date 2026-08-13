# Pixit Mail Gateway

Gateway HTTPS que realiza las conexiones SMTP desde un VPS con IP pública fija.
Los talleres solo configuran su casilla; no necesitan verificar su dominio en
Pixit. El SMTP del propio taller firma el mensaje con su SPF/DKIM habitual.

## Seguridad

- Solo acepta solicitudes firmadas HMAC por la Edge Function de Pixit.
- Las firmas vencen a los 5 minutos y cada `requestId` se procesa una vez.
- Solo permite los puertos SMTP de envío 465, 587 y 2525.
- Resuelve DNS antes de conectar y bloquea loopback, metadata y redes privadas.
- Obliga TLS 1.2 o superior y nunca registra contraseñas ni cuerpos de correo.
- Limita la concurrencia y encola brevemente los picos para proteger los SMTP.

## Puesta en marcha

1. Crear un VPS con Ubuntu y una IPv4 pública fija. Para el piloto se recomienda
   AWS EC2 con Elastic IP y salida TCP 465/587; DigitalOcean bloquea esos tres
   puertos SMTP en sus Droplets.
2. Crear el registro DNS `A mail-gateway.pixit.cl -> IP_DEL_VPS`.
3. Instalar Docker y Docker Compose en el VPS.
4. Copiar esta carpeta al servidor y ejecutar `cp .env.example .env`.
5. Generar un secreto con `openssl rand -hex 32` y ponerlo en `.env`. No debe
   enviarse por chat, correo ni quedar versionado.
6. Ejecutar `docker compose up -d --build`.
7. Comprobar `https://mail-gateway.pixit.cl/health`.
8. Configurar en Supabase los secretos con el mismo valor:

   ```sh
   supabase secrets set \
     SMTP_GATEWAY_URL=https://mail-gateway.pixit.cl \
     SMTP_GATEWAY_SECRET=EL_MISMO_SECRETO
   ```

9. Aplicar `supabase/45_correo_modo_explicito.sql` y desplegar `send-email`.

Para la prueba de Steve Docs se configura `mail.stevedocs.cl`, puerto 465,
SSL/TLS activo, remitente `contacto@stevedocs.cl` y su contraseña. Si el hosting
mantiene una lista blanca, se autoriza solamente la IPv4 fija del VPS.
