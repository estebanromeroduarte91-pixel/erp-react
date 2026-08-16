import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'
import { empresaPermitida } from '../_shared/impersonacion.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

    // Exigir un usuario real logueado — antes bastaba la anon key (pública)
    // y un empresaId cualquiera en el body para mandar push a otra empresa.
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: 'No autenticado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // La empresa sale del perfil del usuario autenticado — nunca directo del
    // body. La única excepción es un platform admin impersonando desde el
    // Panel Pixit, y solo si empresaPermitida confirma que es platform admin
    // de verdad (no basta con que el body lo pida).
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('empresa_id')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!profile?.empresa_id) {
      return new Response(JSON.stringify({ ok: false, error: 'Usuario sin empresa' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { title, body, url, empresa_id: empresaSolicitada } = await req.json()
    if (!title) {
      return new Response(JSON.stringify({ ok: false, error: 'Faltan parámetros' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { empresaId } = await empresaPermitida(supabase, userData.user.id, profile.empresa_id as string, empresaSolicitada)

    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT')!.trim(),
      Deno.env.get('VAPID_PUBLIC_KEY')!.trim(),
      Deno.env.get('VAPID_PRIVATE_KEY')!.trim(),
    )

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('empresa_id', empresaId)

    if (error) throw error

    const payload = JSON.stringify({ title, body, url })
    let sent = 0
    const errors: unknown[] = []

    await Promise.all((subs ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        const body = (err as { body?: string }).body
        console.error('push failed', { endpoint: sub.endpoint.slice(0, 60), status, body, message: (err as Error).message })
        errors.push({ endpoint: sub.endpoint.slice(0, 60), status, body })
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    }))

    return new Response(JSON.stringify({ ok: true, sent, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})