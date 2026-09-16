import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SQUARE_VERSION = '2026-01-22'
const SQUARE_API = 'https://connect.squareup.com/v2'

function bytesToBase64(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

async function validSignature(body: string, signature: string | null) {
  if (!signature) return false
  const key = Deno.env.get('SQUARE_WEBHOOK_SIGNATURE_KEY')!
  const url = Deno.env.get('SQUARE_WEBHOOK_URL')!
  if (!key || !url) return false
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(url + body)))
  return bytesToBase64(digest) === signature
}

async function square(path: string) {
  const token = Deno.env.get('SQUARE_ACCESS_TOKEN')!
  const r = await fetch(SQUARE_API + path, { headers: { Authorization: `Bearer ${token}`, 'Square-Version': SQUARE_VERSION, 'Content-Type': 'application/json' } })
  if (!r.ok) throw new Error(`Square ${r.status}: ${await r.text()}`)
  return r.json()
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const raw = await req.text()
  if (!await validSignature(raw, req.headers.get('x-square-hmacsha256-signature'))) return new Response('Invalid signature', { status: 401 })

  const event = JSON.parse(raw)
  if (!['booking.created', 'booking.updated'].includes(event.type)) return new Response('ok')

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const eventId = event.event_id || event.id
  if (eventId) {
    const { error } = await supabase.from('square_webhook_events').insert({ event_id: eventId, event_type: event.type })
    if (error?.code === '23505') return new Response('duplicate')
    if (error) throw error
  }

  const bookingId = event.data?.object?.booking?.id || event.data?.id
  if (!bookingId) return new Response('Missing booking id', { status: 400 })
  const { booking } = await square(`/bookings/${encodeURIComponent(bookingId)}`)
  if (!booking) return new Response('Booking not found', { status: 404 })

  let customerName = 'Square Booking'
  if (booking.customer_id) {
    try {
      const c = await square(`/customers/${encodeURIComponent(booking.customer_id)}`)
      const name = [c.customer?.given_name, c.customer?.family_name].filter(Boolean).join(' ')
      if (name) customerName = name
    } catch (_) {}
  }

  const segment = booking.appointment_segments?.[0] || {}
  const canceled = ['CANCELLED_BY_CUSTOMER','CANCELLED_BY_SELLER','NO_SHOW'].includes(booking.status)
  const completed = booking.status === 'COMPLETED'
  const row = {
    square_booking_id: booking.id,
    square_customer_id: booking.customer_id || null,
    square_location_id: booking.location_id || null,
    square_team_member_id: segment.team_member_id || null,
    square_status: booking.status || null,
    square_synced_at: new Date().toISOString(),
    booking_source: 'square',
    title: `${customerName} — Square Booking`,
    service_type: 'Square Appointment',
    scheduled_at: booking.start_at || null,
    address: 'See Square booking / assign service address',
    instructions: booking.customer_note || booking.seller_note || '',
    assigned_email: Deno.env.get('SQUARE_DEFAULT_ASSIGNEE_EMAIL') || 'ceo@riversideluxeretreats.com',
    assigned_name: Deno.env.get('SQUARE_DEFAULT_ASSIGNEE_NAME') || 'Philip Brooks',
    status: canceled ? 'canceled' : completed ? 'completed' : 'assigned'
  }

  const { error } = await supabase.from('jobs').upsert(row, { onConflict: 'square_booking_id' })
  if (error) throw error
  return Response.json({ ok: true, booking_id: booking.id })
})
