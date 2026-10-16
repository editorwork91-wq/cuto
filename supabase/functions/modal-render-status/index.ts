import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

function readKeyMap(name: string): Record<string, string> {
  try {
    const parsed = JSON.parse(Deno.env.get(name) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function getPublishableKey() {
  return Deno.env.get("SUPABASE_ANON_KEY")
    ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
    ?? readKeyMap("SUPABASE_PUBLISHABLE_KEYS").default
    ?? "";
}

function getServiceKey() {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? Deno.env.get("SUPABASE_SECRET_KEY")
    ?? readKeyMap("SUPABASE_SECRET_KEYS").default
    ?? "";
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = getPublishableKey();
  const serviceKey = getServiceKey();

  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "authentication_required" });
  if (!supabaseUrl || !publishableKey || !serviceKey) return reply(500, { error: "supabase_server_not_configured" });

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return reply(401, { error: "invalid_session" });
    const body = await request.json().catch(() => ({}));
    const projectId = typeof body.project_id === "string" ? body.project_id : "";
    if (!projectId) return reply(400, { error: "project_id_required" });

    const { data: project, error: projectError } = await userClient
      .from("video_projects").select("*").eq("id", projectId).eq("user_id", user.id).maybeSingle();
    if (projectError) return reply(500, { error: "project_lookup_failed" });
    if (!project) return reply(404, { error: "project_not_found" });

    const { data: job, error: jobError } = await userClient
      .from("video_render_jobs").select("*").eq("project_id", projectId).eq("user_id", user.id).maybeSingle();
    if (jobError) return reply(500, { error: "render_job_lookup_failed" });
    if (!job) return reply(404, { error: "render_job_not_found", message: "لا توجد مهمة Modal محفوظة لهذا المشروع." });

    if (job.status === "completed" && job.output_storage_path) {
      const { data: signed, error: signedError } = await admin.storage
        .from("cuto-assets").createSignedUrl(job.output_storage_path, 3600);
      if (signedError || !signed?.signedUrl) {
        return reply(500, { error: "final_video_signed_url_failed", message: "الفيديو مكتمل لكن تعذّر إنشاء رابط مؤقت آمن." });
      }
      return reply(200, {
        status: "completed", progress: 100, stage: job.stage,
        job, project: { ...project, status: "completed", progress: 100, stage: job.stage, video_url: signed.signedUrl },
      });
    }

    return reply(200, {
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      error: job.status === "failed" ? job.error_message : null,
      job,
      project: {
        ...project,
        status: job.status === "failed" ? "failed" : project.status,
        progress: job.progress,
        stage: job.stage,
        error_message: job.status === "failed" ? job.error_message : project.error_message,
      },
    });
  } catch (error) {
    console.error("modal-render-status error:", error instanceof Error ? error.message : "unknown");
    return reply(500, { error: "unexpected_modal_status_error" });
  }
});
