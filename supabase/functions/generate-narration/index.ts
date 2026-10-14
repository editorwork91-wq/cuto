import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function pcmToWav(pcm: Uint8Array, sampleRate = 24000) {
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) wav[offset + i] = value.charCodeAt(i);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function makeSpeech(text: string, voiceGender: string, language: string) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_TTS_MODEL") ?? "gemini-3.1-flash-tts-preview";
  if (!apiKey) throw new Error("gemini_not_configured");

  const voiceName = voiceGender === "male" ? "Charon" : "Aoede";
  const dialect = language === "ar-EG"
    ? "Use natural Egyptian Arabic (Masri), with a warm and clear Egyptian accent."
    : language === "ar"
      ? "Use clear Modern Standard Arabic."
      : language === "tr"
        ? "Speak naturally in Turkish."
        : "Speak naturally in English.";
  const genderStyle = voiceGender === "male" ? "a natural adult male narrator" : "a natural adult female narrator";
  const prompt = `Read the exact script below and do not add or omit words. Use ${genderStyle}. ${dialect} Sound polished, friendly, warm and conversational, suitable for a professional short-form cooking video. Keep a moderate pace, clear diction and natural pauses. Do not announce these instructions.\n\nSCRIPT:\n${text}`;

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: prompt,
      response_format: { type: "audio" },
      generation_config: { speech_config: [{ voice: voiceName }] },
    }),
  });
  if (!response.ok) {
    console.error("Gemini TTS upstream status:", response.status);
    throw new Error("speech_provider_failed");
  }
  const payload = await response.json();
  const audioData = payload?.output_audio?.data;
  if (typeof audioData !== "string" || !audioData.length) throw new Error("empty_speech_response");
  const pcm = Uint8Array.from(atob(audioData), char => char.charCodeAt(0));
  return pcmToWav(pcm);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!authorization?.startsWith("Bearer ")) return respond(401, { error: "authentication_required" });
  if (!supabaseUrl || !supabaseKey) return respond(500, { error: "supabase_function_not_configured" });

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return respond(401, { error: "invalid_session" });
    const body = await request.json().catch(() => ({}));
    const projectId = typeof body.project_id === "string" ? body.project_id : "";
    if (!projectId) return respond(400, { error: "project_id_required" });

    const { data: project, error: projectError } = await supabase.from("video_projects")
      .select("*").eq("id", projectId).eq("user_id", user.id).maybeSingle();
    if (projectError) return respond(500, { error: "project_lookup_failed" });
    if (!project) return respond(404, { error: "project_not_found" });

    const { data: channel, error: channelError } = await supabase.from("channels")
      .select("*").eq("id", project.channel_id).eq("user_id", user.id).maybeSingle();
    if (channelError || !channel) return respond(404, { error: "channel_not_found" });

    const assetPath = project.voice_storage_path || `${user.id}/${channel.id}/${project.id}/narration.wav`;
    if (!project.voice_storage_path) {
      if (!Deno.env.get("GEMINI_API_KEY")) return respond(503, { error: "gemini_not_configured", message: "Set GEMINI_API_KEY in Supabase Edge Function secrets." });
      const voiceScript = project.recipe_plan?.voice_script;
      if (typeof voiceScript !== "string" || !voiceScript.trim()) {
        return respond(409, { error: "voice_script_missing", message: "Generate the recipe plan before generating narration." });
      }
      if (voiceScript.length > 7000) return respond(413, { error: "voice_script_too_long" });

      const wav = await makeSpeech(voiceScript, channel.voice_gender, channel.language);
      const { error: uploadError } = await supabase.storage.from("cuto-assets").upload(assetPath, wav, {
        contentType: "audio/wav",
        cacheControl: "3600",
        upsert: true,
      });
      if (uploadError) {
        console.error("Narration upload failed:", uploadError.message);
        return respond(500, { error: "narration_storage_failed", message: "Could not securely save the generated audio." });
      }
      const { error: updateError } = await supabase.from("video_projects")
        .update({ voice_storage_path: assetPath, stage: "التعليق الصوتي جاهز — الفيديو لم يُصيّر بعد" })
        .eq("id", project.id).eq("user_id", user.id);
      if (updateError) return respond(500, { error: "narration_path_save_failed" });
    }

    const { data: signed, error: signedError } = await supabase.storage.from("cuto-assets").createSignedUrl(assetPath, 3600);
    if (signedError || !signed?.signedUrl) return respond(500, { error: "narration_url_failed" });
    const { data: updated } = await supabase.from("video_projects").select("*").eq("id", project.id).eq("user_id", user.id).single();
    return respond(200, { project: { ...(updated ?? project), voice_audio_url: signed.signedUrl } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_narration_error";
    if (code === "gemini_not_configured") return respond(503, { error: code, message: "Set GEMINI_API_KEY in Supabase Edge Function secrets." });
    return respond(502, { error: code === "speech_provider_failed" ? code : "unexpected_narration_error", message: "Narration generation failed. No MP4 was created." });
  }
});
