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
  const modalUrl = Deno.env.get("MODAL_VIDEO_ENDPOINT_URL")?.replace(/\/+$/, "");
  const modalKey = Deno.env.get("MODAL_KEY");
  const modalSecret = Deno.env.get("MODAL_SECRET");

  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "authentication_required" });
  if (!supabaseUrl || !publishableKey || !serviceKey) return reply(500, { error: "supabase_server_not_configured" });
  if (!modalUrl || !modalKey || !modalSecret) {
    return reply(503, {
      error: "modal_not_configured",
      message: "اضبط MODAL_VIDEO_ENDPOINT_URL وMODAL_KEY وMODAL_SECRET في Supabase Edge Function Secrets.",
    });
  }

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
    if (project.video_storage_path) {
      const { data: signed } = await admin.storage.from("cuto-assets").createSignedUrl(project.video_storage_path, 3600);
      return reply(200, { status: "completed", project: { ...project, video_url: signed?.signedUrl ?? null } });
    }

    const { data: channel, error: channelError } = await userClient
      .from("channels").select("*").eq("id", project.channel_id).eq("user_id", user.id).maybeSingle();
    if (channelError || !channel) return reply(404, { error: "channel_not_found" });

    const plan = project.recipe_plan && typeof project.recipe_plan === "object"
      ? project.recipe_plan as Record<string, unknown> : {};
    const shotList = Array.isArray(plan.shot_list) ? plan.shot_list as Record<string, unknown>[] : [];
    const voiceScript = typeof plan.voice_script === "string" ? plan.voice_script.trim() : "";
    if (!voiceScript || !project.voice_storage_path) {
      return reply(409, { error: "voice_not_generated", message: "جهّز خطة Gemini والتعليق الصوتي من Google AI Studio قبل بدء المشاهد." });
    }
    if (!shotList.length || shotList.some(scene => typeof scene.ai_video_prompt !== "string" || !scene.ai_video_prompt.trim())) {
      return reply(422, { error: "ai_scene_prompts_missing", message: "الخطة الحالية لا تحتوي برومبتات مشاهد AI كاملة. أعد توليد خطة Gemini." });
    }

    const { data: existing, error: existingError } = await admin
      .from("video_render_jobs").select("*").eq("project_id", projectId).eq("user_id", user.id).maybeSingle();
    if (existingError) return reply(500, { error: "render_job_lookup_failed" });
    if (existing?.status === "completed" && existing.output_storage_path) {
      const { data: signed } = await admin.storage.from("cuto-assets").createSignedUrl(existing.output_storage_path, 3600);
      return reply(200, { status: "completed", job: existing, project: { ...project, video_url: signed?.signedUrl ?? null } });
    }
    if (existing && ["queued", "generating_scenes", "rendering", "uploading"].includes(existing.status)) {
      return reply(200, { status: existing.status, job: existing, existing_job: true });
    }

    const previousScenes = Array.isArray(existing?.scenes) ? existing.scenes as Record<string, unknown>[] : [];
    const sceneRows = shotList.map((scene, index) => {
      const previous = previousScenes.find(row => Number(row.index) === index);
      const isReusable = previous?.status === "completed" && typeof previous?.storage_path === "string" && !!previous.storage_path;
      return {
        index,
        label: String(scene.scene || scene.visual || ("Scene " + (index + 1))).slice(0, 180),
        seconds: 8,
        prompt: String(scene.ai_video_prompt).trim().slice(0, 4000),
        continuity_notes: String(scene.continuity_notes || "").slice(0, 1000),
        status: isReusable ? "completed" : "queued",
        storage_path: isReusable ? previous?.storage_path : null,
        error_message: null,
      };
    });
    let job: Record<string, unknown>;

    if (existing?.id) {
      const { data: reset, error: resetError } = await admin.from("video_render_jobs")
        .update({
          status: "queued", progress: 3, stage: "تمت إعادة جدولة توليد المقاطع على Modal",
          scenes: sceneRows, render_provider_id: null, output_storage_path: null, error_message: null,
        })
        .eq("id", existing.id).eq("user_id", user.id).eq("status", "failed").select("*").maybeSingle();
      if (resetError) return reply(500, { error: "render_job_reset_failed" });
      if (!reset) {
        const { data: current } = await admin.from("video_render_jobs").select("*").eq("project_id", projectId).maybeSingle();
        return reply(200, { status: current?.status ?? "queued", job: current, existing_job: true });
      }
      job = reset;
    } else {
      const { data: inserted, error: insertError } = await admin.from("video_render_jobs")
        .insert({
          project_id: projectId, user_id: user.id, channel_id: channel.id,
          status: "queued", progress: 3, stage: "إرسال مهمة توليد المشاهد إلى Modal",
          scenes: sceneRows,
        }).select("*").single();
      if (insertError) {
        if (insertError.code === "23505") {
          const { data: current } = await admin.from("video_render_jobs").select("*").eq("project_id", projectId).maybeSingle();
          return reply(200, { status: current?.status ?? "queued", job: current, existing_job: true });
        }
        return reply(500, { error: "render_job_create_failed" });
      }
      job = inserted;
    }

    await admin.from("video_projects").update({
      status: "processing", progress: 3, stage: "Gemini وAI Studio جاهزان؛ يجري إرسال المقاطع إلى Modal",
      error_message: null,
    }).eq("id", projectId).eq("user_id", user.id);

    let modalResponse: Response;
    try {
      modalResponse = await fetch(modalUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Modal-Key": modalKey,
          "Modal-Secret": modalSecret,
        },
        body: JSON.stringify({ job_id: job.id, project_id: projectId, user_id: user.id }),
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Modal request failed.";
      await admin.from("video_render_jobs").update({ status: "failed", stage: "تعذّر الاتصال بخدمة Modal", error_message: message.slice(0, 500) }).eq("id", job.id);
      await admin.from("video_projects").update({ status: "failed", stage: "تعذّر الاتصال بخدمة Modal", error_message: "modal_endpoint_unreachable" }).eq("id", projectId).eq("user_id", user.id);
      return reply(502, { error: "modal_endpoint_unreachable", message: "تعذّر الوصول إلى Modal. تحقق من عنوان endpoint ومفاتيح الحماية." });
    }

    const modalPayload = await modalResponse.json().catch(() => ({}));
    const callId = typeof modalPayload?.call_id === "string" ? modalPayload.call_id : "";
    if (!modalResponse.ok || modalPayload?.accepted !== true || !callId) {
      const safeMessage = typeof modalPayload?.detail === "string" ? modalPayload.detail.slice(0, 300) : "Modal did not accept the generation job.";
      await admin.from("video_render_jobs").update({ status: "failed", stage: "رفضت Modal المهمة", error_message: safeMessage }).eq("id", job.id);
      await admin.from("video_projects").update({ status: "failed", stage: "رفضت Modal مهمة توليد الفيديو", error_message: "modal_job_rejected" }).eq("id", projectId).eq("user_id", user.id);
      return reply(502, { error: "modal_job_rejected", message: "Modal لم تقبل مهمة توليد الفيديو. راجع إعدادات النشر والسجلات." });
    }

    const { data: startedJob, error: saveCallError } = await admin.from("video_render_jobs").update({
      status: "generating_scenes", progress: 5,
      stage: "بدأت Modal توليد المشاهد باستخدام LTX-2.5",
      render_provider_id: "modal:" + callId, error_message: null,
    }).eq("id", job.id).select("*").single();
    if (saveCallError) return reply(500, { error: "modal_call_id_save_failed" });
    await admin.from("video_projects").update({
      status: "processing", progress: 5,
      stage: "بدأت Modal توليد المشاهد باستخدام LTX-2.5",
    }).eq("id", projectId).eq("user_id", user.id);

    return reply(202, { status: "generating_scenes", job: startedJob, provider: "modal", model: "Lightricks/LTX-2.5-Diffusers" });
  } catch (error) {
    console.error("modal-render-start error:", error instanceof Error ? error.message : "unknown");
    return reply(500, { error: "unexpected_modal_start_error" });
  }
});
