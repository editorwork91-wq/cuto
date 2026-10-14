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
  const style = `${genderStyle}. ${dialect} Read exactly the supplied script in a polished, friendly, warm and conversational tone suitable for a professional short-form cooking video. Keep a moderate pace, clear diction and natural pauses.`;

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{
        type: "user_input",
        content: [{
          type: "text",
          text,
          annotations: [{ type: "speech_metadata", style }],
        }],
      }],
      response_format: { type: "audio", mime_type: "audio/wav" },
      generation_config: { speech_config: [{ voice: voiceName }] },
    }),
  });
  if (!response.ok) {
    console.error("Gemini TTS upstream status:", response.status);
    throw new Error("speech_provider_failed");
  }
  const payload = await response.json();
  const audioData = payload?.output_audio?.data
    ?? payload?.steps?.filter((step: { type?: string }) => step.type === "model_output")
      ?.flatMap((step: { content?: { type?: string; data?: string }[] }) => step.content ?? [])
      ?.filter((part: { type?: string }) => part.type === "audio")
      ?.at(-1)?.data;
  if (typeof audioData !== "string" || !audioData.length) throw new Error("empty_speech_response");
  const audioBytes = Uint8Array.from(atob(audioData), char => char.charCodeAt(0));
  // Non-streaming audio/wav returns a WAV container; raw PCM is used as a fallback.
  if (audioBytes.length >= 12 &&
      String.fromCharCode(...audioBytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...audioBytes.subarray(8, 12)) === "WAVE") return audioBytes;
  return pcmToWav(audioBytes);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!authorization?.startsWith("Bearer ")) return respond(401, { error: "authentication_required" });
  if (!supabaseUrl || !supabaseKey) return respond(500, { error: "supabase_function_not_configured" });
  if (!Deno.env.get("GEMINI_API_KEY")) return respond(503, { error: "gemini_not_configured", message: "Set GEMINI_API_KEY in Supabase Edge Function secrets." });

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return respond(401, { error: "invalid_session" });
    const body = await request.json().catch(() => ({}));
    const voiceGender = body.voice_gender === "male" ? "male" : "female";
    const language = ["ar-EG", "ar", "en", "tr"].includes(body.language) ? body.language : "ar-EG";
    const sample = language === "ar-EG"
      ? "أهلًا بيكم، النهارده هنحضّر وصفة سهلة وطعمها حكاية. يلا نبدأ مع بعض."
      : language === "ar"
        ? "مرحبًا بكم، سنحضّر اليوم وصفة سهلة ولذيذة خطوة بخطوة."
        : language === "tr"
          ? "Merhaba, bugün kolay ve lezzetli bir tarifi birlikte hazırlayacağız."
          : "Hello, today we're making a simple and delicious recipe together.";

    const wav = await makeSpeech(sample, voiceGender, language);
    return respond(200, { audio_data_url: `data:audio/wav;base64,${bytesToBase64(wav)}`, language, voice_gender: voiceGender });
  } catch (error) {
    const code = error instanceof Error ? error.message : "unexpected_voice_preview_error";
    if (code === "gemini_not_configured") return respond(503, { error: code, message: "Set GEMINI_API_KEY in Supabase Edge Function secrets." });
    return respond(502, { error: code === "speech_provider_failed" ? code : "unexpected_voice_preview_error", message: "The voice preview did not complete. Try again in a moment." });
  }
});
