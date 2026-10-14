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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type SceneJob = {
  index: number;
  label: string;
  seconds: number;
  prompt: string;
  continuity_notes: string;
  status: "queued" | "generating" | "completed" | "failed";
  operation_name: string | null;
  storage_path: string | null;
  error_message?: string;
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const creatomateKey = Deno.env.get("CREATOMATE_API_KEY");

  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "authentication_required" });
  if (!url || !anonKey || !serviceKey) return reply(500, { error: "supabase_server_not_configured" });
  if (!geminiKey) return reply(503, { error: "gemini_not_configured" });
  if (!creatomateKey) return reply(503, { error: "renderer_not_configured", message: "أضف CREATOMATE_API_KEY لإخراج MP4 بعد اكتمال مشاهد Veo." });

  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let activeJobId = "";
  let activeProjectId = "";
  let activeUserId = "";

  async function markFailed(jobId: string, projectId: string, userId: string, message: string) {
    await admin.from("video_render_jobs").update({
      status: "failed", stage: "تعذّر إكمال إنتاج الفيديو", error_message: message.slice(0, 1000),
    }).eq("id", jobId);
    await admin.from("video_projects").update({
      status: "failed", stage: "تعذّر إكمال إنتاج الفيديو", error_message: message.slice(0, 1000),
    }).eq("id", projectId).eq("user_id", userId);
  }

  try {
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return reply(401, { error: "invalid_session" });
    activeUserId = user.id;

    const body = await request.json().catch(() => ({}));
    const projectId = typeof body.project_id === "string" ? body.project_id : "";
    if (!projectId) return reply(400, { error: "project_id_required" });
    activeProjectId = projectId;

    const { data: project, error: projectError } = await userClient
      .from("video_projects").select("*").eq("id", projectId).eq("user_id", user.id).maybeSingle();
    if (projectError) return reply(500, { error: "project_lookup_failed" });
    if (!project) return reply(404, { error: "project_not_found" });

    const { data: job, error: jobError } = await admin
      .from("video_render_jobs").select("*").eq("project_id", projectId).eq("user_id", user.id).maybeSingle();
    if (jobError) return reply(500, { error: "render_job_lookup_failed" });
    if (!job) return reply(404, { error: "render_job_not_found" });
    activeJobId = job.id;

    if (job.status === "completed" && job.output_storage_path) {
      const { data: signed } = await admin.storage.from("cuto-assets").createSignedUrl(job.output_storage_path, 604800);
      return reply(200, { status: "completed", progress: 100, project: { ...project, video_url: signed?.signedUrl ?? null } });
    }
    if (job.status === "failed") return reply(200, { status: "failed", progress: job.progress, stage: job.stage, error: job.error_message });
    if (job.status === "rendering" && !job.render_provider_id && String(job.stage || "").includes("إرسال مهمة الرندر")) {
      return reply(200, { status: job.status, progress: job.progress, stage: job.stage, waiting: true });
    }

    const channelResult = await admin.from("channels").select("*").eq("id", job.channel_id).eq("user_id", user.id).maybeSingle();
    const channel = channelResult.data;
    if (channelResult.error || !channel) {
      await markFailed(job.id, projectId, user.id, "channel_not_found");
      return reply(404, { error: "channel_not_found" });
    }

    let scenes = Array.isArray(job.scenes) ? job.scenes as SceneJob[] : [];
    if (!scenes.length) return reply(422, { error: "render_scenes_missing" });

    if (job.status === "generating_scenes" || job.status === "queued") {
      for (let index = 0; index < scenes.length; index++) {
        const scene = scenes[index];
        if (scene.status !== "generating" || !scene.operation_name) continue;

        const operationResponse = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/" + scene.operation_name,
          { headers: { "x-goog-api-key": geminiKey } },
        );
        const operationPayload = await operationResponse.json().catch(() => ({}));
        if (!operationResponse.ok) {
          return reply(202, { status: job.status, progress: job.progress, stage: "في انتظار تأكيد حالة أحد مشاهد Veo", poll_again: true });
        }
        if (!operationPayload?.done) continue;

        if (operationPayload?.error) {
          const message = typeof operationPayload.error.message === "string"
            ? operationPayload.error.message : "Veo scene generation failed.";
          scenes[index] = { ...scene, status: "failed", error_message: message.slice(0, 500) };
          await admin.from("video_render_jobs").update({ scenes }).eq("id", job.id);
          await markFailed(job.id, projectId, user.id, message);
          return reply(200, { status: "failed", progress: job.progress, stage: "فشل توليد مشهد", error: message.slice(0, 500) });
        }

        const generated = operationPayload?.response?.generateVideoResponse?.generatedSamples?.[0]?.video
          ?? operationPayload?.response?.generatedVideos?.[0]?.video;
        const videoUri = typeof generated?.uri === "string" ? generated.uri : "";
        if (!videoUri) {
          await markFailed(job.id, projectId, user.id, "Veo reported completion without a video URI.");
          return reply(502, { error: "veo_video_uri_missing" });
        }

        const videoResponse = await fetch(videoUri, { headers: { "x-goog-api-key": geminiKey } });
        if (!videoResponse.ok) {
          return reply(202, { status: job.status, progress: job.progress, stage: "المشهد جاهز لكن التنزيل من Google سيعاد في الفحص التالي", poll_again: true });
        }
        const videoBytes = new Uint8Array(await videoResponse.arrayBuffer());
        if (!videoBytes.length || videoBytes.length > 52428800) {
          await markFailed(job.id, projectId, user.id, "Generated scene was empty or exceeded the configured 50 MB per-file Storage limit.");
          return reply(413, { error: "scene_file_size_invalid" });
        }

        const storagePath = user.id + "/" + channel.id + "/" + projectId + "/scenes/scene-" + String(index + 1).padStart(2, "0") + ".mp4";
        const { error: uploadError } = await admin.storage.from("cuto-assets").upload(storagePath, videoBytes, {
          contentType: "video/mp4", cacheControl: "3600", upsert: true,
        });
        if (uploadError) {
          console.error("AI scene upload failed:", uploadError.message);
          return reply(202, { status: job.status, progress: job.progress, stage: "المشهد مولّد؛ يُعاد حفظه في التخزين الخاص", poll_again: true });
        }
        scenes[index] = { ...scene, status: "completed", storage_path: storagePath };
      }

      const completedCount = scenes.filter(scene => scene.status === "completed").length;
      const progress = Math.min(68, 5 + Math.floor(63 * completedCount / scenes.length));
      if (completedCount < scenes.length) {
        const stage = "اكتمل " + completedCount + " من " + scenes.length + " مشاهد AI";
        await admin.from("video_render_jobs").update({ scenes, status: "generating_scenes", progress, stage }).eq("id", job.id);
        await admin.from("video_projects").update({ status: "processing", progress, stage }).eq("id", projectId).eq("user_id", user.id);
        return reply(200, { status: "generating_scenes", progress, stage, completed_scenes: completedCount, total_scenes: scenes.length, poll_again: true });
      }

      const voicePath = typeof project.voice_storage_path === "string" ? project.voice_storage_path : "";
      if (!voicePath) {
        await markFailed(job.id, projectId, user.id, "voice_not_generated");
        return reply(409, { error: "voice_not_generated", message: "ولّد التعليق الصوتي قبل تركيب الفيديو." });
      }
      const { data: voiceSigned, error: voiceSignError } = await admin.storage.from("cuto-assets").createSignedUrl(voicePath, 7200);
      if (voiceSignError || !voiceSigned?.signedUrl) {
        await markFailed(job.id, projectId, user.id, "voice_signed_url_failed");
        return reply(500, { error: "voice_signed_url_failed" });
      }

      const renderClaim = await admin.from("video_render_jobs").update({
        status: "rendering", progress: 72, stage: "إرسال مهمة الرندر إلى محرك MP4",
      }).eq("id", job.id).eq("status", "generating_scenes").is("render_provider_id", null).select("*").maybeSingle();
      if (renderClaim.error) return reply(500, { error: "render_claim_failed" });
      if (!renderClaim.data) {
        const { data: current } = await admin.from("video_render_jobs").select("*").eq("id", job.id).single();
        return reply(200, { status: current?.status, progress: current?.progress, stage: current?.stage, waiting: true, poll_again: true });
      }

      const totalDuration = clamp(Number(project.duration_seconds) || 45, 30, 60);
      const secondsPerScene = totalDuration / scenes.length;
      const elements: Record<string, unknown>[] = [];
      let currentTime = 0;
      for (let index = 0; index < scenes.length; index++) {
        const scene = scenes[index];
        const { data: videoSigned, error: videoSignError } = await admin.storage.from("cuto-assets").createSignedUrl(scene.storage_path || "", 7200);
        if (videoSignError || !videoSigned?.signedUrl) {
          await markFailed(job.id, projectId, user.id, "scene_signed_url_failed_" + index);
          return reply(500, { error: "scene_signed_url_failed" });
        }
        elements.push({
          name: "AI-Scene-" + (index + 1), type: "video", track: 1, time: currentTime, duration: secondsPerScene,
          source: videoSigned.signedUrl, x: "50%", y: "50%", width: "100%", height: "100%", fit: "cover",
        });
        currentTime += secondsPerScene;
      }
      elements.push({
        name: "Gemini-Voiceover", type: "audio", track: 2, time: 0, duration: totalDuration,
        source: voiceSigned.signedUrl, audio_fade_out: 0.25,
      });

      const plan = project.recipe_plan && typeof project.recipe_plan === "object"
        ? project.recipe_plan as Record<string, unknown> : {};
      const subtitleLines = Array.isArray(plan.subtitle_lines) ? plan.subtitle_lines as Record<string, unknown>[] : [];
      const subtitlesEnabled = channel.captions_enabled !== false;
      if (subtitlesEnabled) {
        for (let index = 0; index < subtitleLines.length && index < 120; index++) {
          const line = subtitleLines[index];
          const start = clamp(Number(line.start_seconds) || 0, 0, totalDuration);
          const end = clamp(Number(line.end_seconds) || start + 2, start + 0.25, totalDuration);
          const text = typeof line.text === "string" ? line.text.trim().slice(0, 100) : "";
          if (!text || end <= start) continue;
          elements.push({
            name: "Subtitle-" + (index + 1), type: "text", track: 3, time: start, duration: end - start,
            text, x: "50%", y: "72%", width: "88%", height: "11%", x_alignment: "50%", y_alignment: "50%",
            fill_color: "#ffffff", stroke_color: "#111111", stroke_width: "0.65 vmin",
            font_family: "Arial", font_weight: "700", font_size: "4.2 vmin",
          });
        }
      }
      if (channel.watermark_enabled !== false) {
        const channelLabel = String(channel.name || "CUTO") + " · @" + String(channel.username || "");
        elements.push({
          name: "CUTO-Channel-Identity", type: "text", track: 4, time: 0, duration: totalDuration,
          text: channelLabel.slice(0, 100), x: "50%", y: "90%", width: "92%", height: "4.5%",
          x_alignment: "50%", y_alignment: "50%", fill_color: "#ffffff", stroke_color: "#171717",
          stroke_width: "0.35 vmin", font_family: "Arial", font_weight: "700", font_size: "3.3 vmin",
        });
      }
      const hook = typeof plan.hook === "string" ? plan.hook.trim().slice(0, 90) : "";
      if (hook) {
        elements.push({
          name: "Opening-Hook", type: "text", track: 5, time: 0, duration: Math.min(3, totalDuration),
          text: hook, x: "50%", y: "18%", width: "88%", height: "12%", x_alignment: "50%", y_alignment: "50%",
          fill_color: "#ffffff", stroke_color: "#101010", stroke_width: "0.55 vmin",
          font_family: "Arial", font_weight: "700", font_size: "5 vmin",
        });
      }

      await admin.from("video_projects").update({ status: "processing", progress: 72, stage: "كل مشاهد AI جاهزة؛ يركّب الصوت والترجمة والهوية" })
        .eq("id", projectId).eq("user_id", user.id);
      const renderResponse = await fetch("https://api.creatomate.com/v2/renders", {
        method: "POST",
        headers: { Authorization: "Bearer " + creatomateKey, "Content-Type": "application/json" },
        body: JSON.stringify({ output_format: "mp4", width: 1080, height: 1920, frame_rate: 30, duration: totalDuration, elements, metadata: "cuto-project-" + projectId }),
      });
      const renderPayload = await renderResponse.json().catch(() => ({}));
      const renderId = typeof renderPayload?.id === "string" ? renderPayload.id : "";
      if (!renderResponse.ok || !renderId) {
        const detail = typeof renderPayload?.hint === "string" ? renderPayload.hint
          : typeof renderPayload?.message === "string" ? renderPayload.message : "The MP4 renderer rejected the request.";
        await markFailed(job.id, projectId, user.id, detail);
        return reply(502, { error: "mp4_render_start_failed", message: "تعذّر بدء تركيب MP4. راجع رصيد وخطة محرك الرندر وإعداداته." });
      }
      await admin.from("video_render_jobs").update({
        render_provider_id: renderId, status: "rendering", progress: 75, stage: "محرك الرندر يجمع مشاهد Veo والصوت والترجمة",
      }).eq("id", job.id);
      await admin.from("video_projects").update({
        status: "processing", progress: 75, stage: "محرك الرندر يجمع مشاهد Veo والصوت والترجمة",
      }).eq("id", projectId).eq("user_id", user.id);
      return reply(202, { status: "rendering", progress: 75, stage: "محرك الرندر يجمع مشاهد Veo والصوت والترجمة", render_id: renderId, poll_again: true });
    }

    if ((job.status === "rendering" || job.status === "uploading") && job.render_provider_id) {
      const renderResponse = await fetch("https://api.creatomate.com/v2/renders/" + encodeURIComponent(job.render_provider_id), {
        headers: { Authorization: "Bearer " + creatomateKey },
      });
      const renderPayload = await renderResponse.json().catch(() => ({}));
      if (!renderResponse.ok) return reply(202, { status: "rendering", progress: job.progress, stage: "جارٍ فحص حالة الرندر", poll_again: true });

      const renderStatus = String(renderPayload?.status || "").toLowerCase();
      if (renderStatus === "failed") {
        const message = typeof renderPayload?.error_message === "string" ? renderPayload.error_message : "MP4 rendering failed.";
        await markFailed(job.id, projectId, user.id, message);
        return reply(200, { status: "failed", progress: job.progress, error: message });
      }
      if (renderStatus !== "succeeded" || typeof renderPayload?.url !== "string") {
        const progress = clamp(Math.max(Number(job.progress) || 75, 78), 78, 91);
        const stage = renderStatus === "planned" ? "الفيديو في قائمة انتظار محرك الرندر" : "يتم تجميع MP4 مع التعليق والترجمة";
        await admin.from("video_render_jobs").update({ progress, stage }).eq("id", job.id);
        await admin.from("video_projects").update({ status: "processing", progress, stage }).eq("id", projectId).eq("user_id", user.id);
        return reply(200, { status: "rendering", progress, stage, poll_again: true });
      }

      await admin.from("video_render_jobs").update({ status: "uploading", progress: 94, stage: "الرندر اكتمل؛ يُحفظ MP4 في Supabase الخاص" }).eq("id", job.id);
      await admin.from("video_projects").update({ status: "processing", progress: 94, stage: "الرندر اكتمل؛ يُحفظ MP4 في Supabase الخاص" })
        .eq("id", projectId).eq("user_id", user.id);
      const finalResponse = await fetch(renderPayload.url);
      if (!finalResponse.ok) return reply(202, { status: "uploading", progress: 94, stage: "يُعاد تنزيل MP4 النهائي قبل حفظه", poll_again: true });
      const maxOutputBytes = 262144000;
      const lengthHeader = Number(finalResponse.headers.get("content-length") || 0);
      if (lengthHeader > maxOutputBytes) {
        await markFailed(job.id, projectId, user.id, "Final MP4 exceeded 250 MB.");
        return reply(413, { error: "final_video_too_large" });
      }
      const bytes = new Uint8Array(await finalResponse.arrayBuffer());
      if (!bytes.length || bytes.length > maxOutputBytes) {
        await markFailed(job.id, projectId, user.id, "Final MP4 was empty or exceeded 250 MB.");
        return reply(413, { error: "final_video_size_invalid" });
      }
      const outputPath = user.id + "/" + channel.id + "/" + projectId + "/final.mp4";
      const { error: outputUploadError } = await admin.storage.from("cuto-assets").upload(outputPath, bytes, {
        contentType: "video/mp4", cacheControl: "3600", upsert: true,
      });
      if (outputUploadError) {
        console.error("Final MP4 upload failed:", outputUploadError.message);
        return reply(202, { status: "uploading", progress: 94, stage: "إعادة محاولة حفظ MP4 في Supabase", poll_again: true });
      }
      const { data: signedVideo } = await admin.storage.from("cuto-assets").createSignedUrl(outputPath, 604800);
      const { error: completeJobError } = await admin.from("video_render_jobs").update({
        status: "completed", progress: 100, stage: "اكتمل الفيديو وحُفظ في Supabase", output_storage_path: outputPath, error_message: null,
      }).eq("id", job.id);
      if (completeJobError) return reply(500, { error: "render_job_completion_save_failed" });
      const { error: completeProjectError } = await admin.from("video_projects").update({
        status: "completed", progress: 100, stage: "اكتمل الفيديو وحُفظ في Supabase",
        video_storage_path: outputPath, video_url: signedVideo?.signedUrl ?? null, error_message: null,
      }).eq("id", projectId).eq("user_id", user.id);
      if (completeProjectError) return reply(500, { error: "project_completion_save_failed" });
      const { data: updatedProject } = await userClient.from("video_projects").select("*").eq("id", projectId).eq("user_id", user.id).single();
      return reply(200, { status: "completed", progress: 100, stage: "اكتمل الفيديو وحُفظ في Supabase", project: { ...(updatedProject ?? project), video_url: signedVideo?.signedUrl ?? null } });
    }

    return reply(200, { status: job.status, progress: job.progress, stage: job.stage, poll_again: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_video_pipeline_error";
    console.error("veo-render-status error:", message);
    if (activeJobId && activeProjectId && activeUserId) {
      await markFailed(activeJobId, activeProjectId, activeUserId, message);
    }
    return reply(500, { error: "unexpected_video_pipeline_error", message: "حدث خطأ أثناء متابعة إنتاج الفيديو. الحالة محفوظة حتى يمكن مراجعتها أو إعادة المحاولة." });
  }
});
