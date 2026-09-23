import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OWNER_EMAIL = "ceo@riversideluxeretreats.com";
const SQUARE_VERSION = "2026-09-16";

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!;
    const squareToken = Deno.env.get("SQUARE_SANDBOX_ACCESS_TOKEN");
    const locationId = Deno.env.get("SQUARE_SANDBOX_LOCATION_ID");
    if (!squareToken || !locationId) throw new Error("Square Sandbox secrets are not configured.");

    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user || String(user.email).toLowerCase() !== OWNER_EMAIL) {
      return Response.json({ error: "Owner authorization required." }, { status: 403, headers: cors });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { time_entry_id, square_team_member_id } = await req.json();
    if (!time_entry_id || !square_team_member_id) {
      return Response.json({ error: "time_entry_id and square_team_member_id are required." }, { status: 400, headers: cors });
    }

    const { data: row, error: rowError } = await admin.from("time_entries").select("*").eq("id", time_entry_id).single();
    if (rowError || !row) throw rowError || new Error("Time entry not found.");
    if (!row.approved || row.status !== "approved" || !row.clock_in || !row.clock_out) {
      return Response.json({ error: "Only approved, completed shifts can sync." }, { status: 409, headers: cors });
    }

    const idem = "hcc-" + String(row.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 90);
    const body = {
      idempotency_key: idem,
      timecard: {
        location_id: locationId,
        team_member_id: square_team_member_id,
        start_at: new Date(row.clock_in).toISOString(),
        end_at: new Date(row.clock_out).toISOString(),
        timezone: "America/New_York"
      }
    };
    const sq = await fetch("https://connect.squareupsandbox.com/v2/labor/timecards", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + squareToken,
        "Square-Version": SQUARE_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const result = await sq.json();
    if (!sq.ok) return Response.json({ error: "Square rejected the timecard.", square: result }, { status: sq.status, headers: cors });
    return Response.json({ ok: true, environment: "sandbox", square_timecard_id: result?.timecard?.id, timecard: result?.timecard }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500, headers: cors });
  }
});
