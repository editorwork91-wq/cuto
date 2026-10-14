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

type ScenePlan = {
  scene?: string;
  visual?: string;
  camera?: string;
  seconds?: number;
  ai_video_prompt?: string;
  continuity_notes?: string;
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_VIDEO_MODEL") ?? "veo-3.1-generate-preview";

  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "authentication_required" });
  if (!url || !anonKey || !serviceKey) return reply(500, { error: "supabase_server_not_configured" });
  if (!geminiKey) return reply(503, { error: "gemini_not_configured", message: "أضف GEMINI_API_KEY في أسرار Supabase أولًا." });

  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(url, serviceKey, {
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
    if (project.video_storage_path) return reply(200, { status: "completed", already_completed: true });

    const { data: channel, error: channelError } = await userClient
      .from("channels").select("*").eq("id", project.channel_id).eq("user_id", user.id).maybeSingle();
    if (channelError || !channel) return reply(404, { error: "channel_not_found" });

    const plan = project.recipe_plan && typeof project.recipe_plan === "object"
      ? project.recipe_plan as Record<string, unknown> : {};
    const shotList = Array.isArray(plan.shot_list) ? plan.shot_list as ScenePlan[] : [];
    const voiceScript = typeof plan.voice_script === "string" ? plan.voice_script.trim() : "";
    if (!voiceScript) return reply(409, { error: "voice_script_missing", message: "أعد إنشاء خطة السيناريو أولًا." });
    if (!project.voice_storage_path) return reply(409, { error: "voice_not_generated", message: "يجب تجهيز التعليق الصوتي قبل بدء توليد الفيديو." });

    const duration = Math.min(60, Math.max(30, Number(project.duration_seconds) || 45));
    const sceneCount = Math.ceil(duration / 8);
    const chosenScenes = shotList.slice(0, sceneCount);
    if (chosenScenes.length < sceneCount || chosenScenes.some(scene => !String(scene.ai_video_prompt || "").trim())) {
      return reply(422, {
        error: "ai_video_prompts_required",
        message: "خطة Gemini لا تحتوي عددًا كافيًا من برومبتات مشاهد الفيديو. أعد توليد خطة الوصفة.",
        required_scene_count: sceneCount,
        available_scene_count: chosenScenes.length,
      });
    }

    const { data: previous, error: previousError } = await admin
      .from("video_render_jobs").select("*").eq("project_id", projectId).maybeSingle();
    if (previousError) return reply(500, { error: "render_job_lookup_failed" });
    if (previous && ["queued", "generating_scenes", "rendering", "uploading", "completed"].includes(previous.status)) {
      return reply(200, { job: previous, existing_job: true });
    }

    const sceneRows = chosenScenes.map((scene, index) => ({
      index,
      label: String(scene.scene || scene.visual || ("Scene " + (index + 1))).slice(0, 180),
      seconds: 8,
      prompt: String(scene.ai_video_prompt).trim().slice(0, 4000),
      continuity_notes: String(scene.continuity_notes || "").slice(0, 1000),
      status: "queued",
      operation_name: null,
      storage_path: null,
    }));

    let job: Record<string, unknown>;
    if (previous?.id) {
      const { data: resetJob, error: resetError } = await admin
        .from("video_render_jobs")
        .update({
          status: "queued", progress: 3, stage: "جارٍ بدء توليد المشاهد بواسطة Veo",
          scenes: sceneRows, render_provider_id: null, output_storage_path: null, error_message: null,
        })
        .eq("id", previous.id).eq("status", "failed").select("*").maybeSingle();
      if (resetError) return reply(500, { error: "render_job_reset_failed" });
      if (!resetJob) {
        const { data: current } = await admin.from("video_render_jobs").select("*").eq("project_id", projectId).maybeSingle();
        return reply(200, { job: current ?? previous, existing_job: true });
      }
      job = resetJob;
    } else {
      const { data: inserted, error: insertError } = await admin
        .from("video_render_jobs")
        .insert({
          project_id: projectId, user_id: user.id, channel_id: channel.id,
          status: "queued", progress: 3, stage: "جارٍ بدء توليد المشاهد بواسطة Veo", scenes: sceneRows,
        }).select("*").single();
      if (insertError) {
        if (insertError.code === "23505") {
          const { data: current } = await admin.from("video_render_jobs").select("*").eq("project_id", projectId).maybeSingle();
          return reply(200, { job: current, existing_job: true });
        }
        return reply(500, { error: "render_job_create_failed" });
      }
      job = inserted;
    }

    await admin.from("video_projects").update({
      status: "processing", progress: 3, stage: "Gemini جهّز الخطة؛ Veo بدأ توليد المشاهد الأصلية",
      error_message: null,
    }).eq("id", projectId).eq("user_id", user.id);

    const updatedScenes = [...sceneRows];
    for (let index = 0; index < updatedScenes.length; index++) {
      const item = updatedScenes[index];
      const scenePlan = chosenScenes[index];
      const prompt = [
        "Create an original food-video scene from scratch. Do not use stock footage, existing clips, unrelated nature scenery, or generic b-roll.",
        "Vertical portrait 9:16, 8 seconds, polished cinematic food macro photography, 720p.",
        "Channel visual style: " + String(channel.visual_style || "cinematic food realism"),
        "Dish and action: " + String(item.label),
        "Shot direction: " + String(scenePlan.camera || ""),
        "Scene brief: " + String(item.prompt),
        "Continuity: " + String(item.continuity_notes || ""),
        "Keep ingredients, utensils, plate, countertop, lighting and dish identity consistent with the other scenes of this same recipe.",
        "No captions, logos, letters, watermarks, UI, or readable text inside the generated image; CUTO adds typography in post-production.",
        "Make the requested cooking action physically plausible and visually clear.",
      ].join("\n");

      const generationResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":predictLongRunning",
        {
          method: "POST",
          headers: { "x-goog-api-key": geminiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { aspectRatio: "9:16", durationSeconds: "8", resolution: "720p" },
          }),
        },
      );
      const generationPayload = await generationResponse.json().catch(() => ({}));
      const operationName = typeof generationPayload?.name === "string" ? generationPayload.name : "";
      if (!generationResponse.ok || !operationName) {
        const safeDetail = typeof generationPayload?.error?.message === "string"
          ? generationPayload.error.message.slice(0, 500) : "Veo did not return a generation operation.";
        await admin.from("video_render_jobs").update({
          status: "failed", stage: "تعذّر بدء توليد أحد المشاهد", error_message: safeDetail,
        }).eq("id", job.id);
        await admin.from("video_projects").update({
          status: "failed", stage: "تعذّر بدء توليد المشاهد بواسطة Veo", error_message: safeDetail,
        }).eq("id", projectId).eq("user_id", user.id);
        return reply(502, { error: "veo_generation_start_failed", message: "Veo رفض بدء أحد المشاهد. راجع إتاحة النموذج والحصة ومفتاح Gemini." });
      }

      updatedScenes[index] = { ...item, status: "generating", operation_name: operationName };
      const { error: sceneUpdateError } = await admin.from("video_render_jobs")
        .update({ status: "generating_scenes", scenes: updatedScenes, progress: 5, stage: "تم إرسال " + (index + 1) + " من " + updatedScenes.length + " مشاهد إلى Veo" })
        .eq("id", job.id);
      if (sceneUpdateError) return reply(500, { error: "render_job_scene_save_failed" });
    }

    await admin.from("video_projects").update({
      status: "processing", progress: 5, stage: "Veo يولّد " + sceneCount + " مشاهد أصلية؛ تتم متابعة الحالة من الخادم",
    }).eq("id", projectId).eq("user_id", user.id);

    const { data: readyJob } = await admin.from("video_render_jobs").select("*").eq("id", job.id).single();
    return reply(202, { job: readyJob, message: "تم إرسال عمليات التوليد إلى Veo. سيظهر التقدم بحسب الحالات الفعلية." });
  } catch (error) {
    console.error("veo-render-start error:", error instanceof Error ? error.message : "unknown");
    return reply(500, { error: "unexpected_render_start_error" });
  }
});
