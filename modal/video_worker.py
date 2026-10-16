import hashlib
import os
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import quote

import httpx
import modal
from pydantic import BaseModel, Field

APP_NAME = "cuto-modal-video-worker"
MODEL_ID = "Lightricks/LTX-2.5-Diffusers"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ADMIN_KEY = SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY
BUCKET = "cuto-assets"

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name("cuto-ltx-model-cache", create_if_missing=True)
MODEL_CACHE = "/model-cache"

# LTX-2.5 is the video model hosted on Modal GPUs. It is not Google Flow.
# The model is loaded once per warm container and cached on a private Modal Volume.
video_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "fonts-noto-core", "fonts-noto-extra")
    .uv_pip_install(
        "torch",
        "accelerate",
        "transformers",
        "sentencepiece",
        "safetensors",
        "huggingface-hub",
        "httpx",
        "pydantic",
        "imageio",
        "imageio-ffmpeg",
        "git+https://github.com/huggingface/diffusers@main",
    )
    .env({"HF_HOME": MODEL_CACHE, "HF_HUB_ENABLE_HF_TRANSFER": "1"})
)

video_secrets = modal.Secret.from_name("cuto-supabase-worker")
PIPE = None


class SubmitVideoRequest(BaseModel):
    job_id: str = Field(min_length=1, max_length=64)
    project_id: str = Field(min_length=1, max_length=64)
    user_id: str = Field(min_length=1, max_length=64)


def supabase_headers(extra=None):
    if not SUPABASE_URL or not SUPABASE_ADMIN_KEY:
        raise RuntimeError("Modal secret cuto-supabase-worker needs SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY).")
    # Modern Supabase sb_secret_* API keys are sent only through apikey. The legacy
    # service_role key is a JWT and can safely also be used as a Bearer token.
    result = {"apikey": SUPABASE_ADMIN_KEY}
    if not SUPABASE_ADMIN_KEY.startswith("sb_secret_"):
        result["Authorization"] = "Bearer " + SUPABASE_ADMIN_KEY
    if extra:
        result.update(extra)
    return result


def db_rows(table, params):
    response = httpx.get(
        SUPABASE_URL + "/rest/v1/" + table,
        params=params,
        headers=supabase_headers({"Accept": "application/json"}),
        timeout=60.0,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise RuntimeError("Unexpected Supabase response while reading " + table)
    return payload


def db_patch(table, params, payload):
    response = httpx.patch(
        SUPABASE_URL + "/rest/v1/" + table,
        params=params,
        headers=supabase_headers({"Content-Type": "application/json", "Prefer": "return=representation"}),
        json=payload,
        timeout=60.0,
    )
    response.raise_for_status()
    return response.json()


def storage_download(path, timeout=180.0):
    url = SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + quote(path, safe="/")
    response = httpx.get(url, headers=supabase_headers(), timeout=timeout)
    response.raise_for_status()
    return response.content


def storage_upload(path, data, content_type):
    url = SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + quote(path, safe="/")
    response = httpx.post(
        url,
        headers=supabase_headers({
            "Content-Type": content_type,
            "x-upsert": "true",
            "Cache-Control": "3600",
        }),
        content=data,
        timeout=300.0,
    )
    response.raise_for_status()


def update_state(job_id, project_id, user_id, job_patch, project_patch=None):
    db_patch("video_render_jobs", {"id": "eq." + job_id, "user_id": "eq." + user_id}, job_patch)
    if project_patch:
        db_patch("video_projects", {"id": "eq." + project_id, "user_id": "eq." + user_id}, project_patch)


def get_pipeline():
    global PIPE
    if PIPE is not None:
        return PIPE

    import torch
    from diffusers import LTX2Pipeline
    from diffusers.pipelines.ltx2.utils import DISTILLED_SIGMA_VALUES

    pipe = LTX2Pipeline.from_pretrained(MODEL_ID, dtype=torch.bfloat16)
    pipe.enable_model_cpu_offload()
    pipe.vae.enable_tiling()
    PIPE = (pipe, DISTILLED_SIGMA_VALUES, torch)
    model_volume.commit()
    return PIPE


def ass_time(seconds):
    total_cs = max(0, int(round(float(seconds) * 100)))
    hours, rem = divmod(total_cs, 360000)
    minutes, rem = divmod(rem, 6000)
    secs, centis = divmod(rem, 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{centis:02d}"


def clean_ass_text(value):
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    # Prevent user/model text from injecting ASS formatting override tags.
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


def write_ass(path, subtitle_lines, duration):
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans Arabic,52,&H00FFFFFF,&H000000FF,&H00101010,&H8C000000,1,0,0,0,100,100,0,0,1,3,1,2,72,72,300,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    if isinstance(subtitle_lines, list):
        for line in subtitle_lines[:160]:
            if not isinstance(line, dict):
                continue
            text = clean_ass_text(line.get("text", ""))[:180]
            try:
                start = max(0.0, min(float(line.get("start_seconds", 0)), duration))
                end = max(start + 0.25, min(float(line.get("end_seconds", start + 2)), duration))
            except (TypeError, ValueError):
                continue
            if not text or end <= start:
                continue
            events.append(
                f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{text}"
            )
    Path(path).write_text(header + "\n".join(events) + "\n", encoding="utf-8")


def run_ffmpeg(args, timeout=600):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        tail = (result.stderr or "ffmpeg failed")[-2500:]
        raise RuntimeError("FFmpeg failed: " + tail)
    return result


def render_final_video(scene_paths, voice_path, output_path, subtitle_path, watermark_path, hook_path,
                       duration, captions_enabled, watermark_enabled, hook_text):
    concat_path = Path(output_path).with_suffix(".concat.txt")
    concat_path.write_text(
        "".join("file '" + str(Path(item).resolve()).replace("'", "'\\''") + "'\n" for item in scene_paths),
        encoding="utf-8",
    )
    video_filters = ["scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920"]
    font_path = "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf"
    if captions_enabled and Path(subtitle_path).exists():
        video_filters.append("subtitles=" + subtitle_path + ":fontsdir=/usr/share/fonts/truetype/noto")
    if watermark_enabled:
        video_filters.append(
            "drawtext=fontfile=" + font_path
            + ":textfile=" + watermark_path
            + ":expansion=none:x=(w-text_w)/2:y=h-text_h-h*0.055"
            + ":fontsize=38:fontcolor=white:borderw=2:bordercolor=black"
        )
    if hook_text:
        video_filters.append(
            "drawtext=fontfile=" + font_path
            + ":textfile=" + hook_path
            + ":expansion=none:x=(w-text_w)/2:y=h*0.12"
            + ":fontsize=54:fontcolor=white:borderw=3:bordercolor=black"
            + ":enable='between(t,0,3)'"
        )
    run_ffmpeg([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "concat", "-safe", "0", "-i", str(concat_path),
        "-i", str(voice_path),
        "-filter_complex",
        "[1:a]apad,atrim=duration=" + str(duration) + "[aout]",
        "-vf", ",".join(video_filters),
        "-map", "0:v:0", "-map", "[aout]",
        "-t", str(duration),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "25",
        "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart", str(output_path),
    ], timeout=900)

    max_bytes = 50 * 1024 * 1024
    if Path(output_path).stat().st_size > max_bytes:
        fallback = str(Path(output_path).with_name("final-compressed.mp4"))
        run_ffmpeg([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(output_path),
            "-vf", "scale=720:1280:flags=lanczos",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "29",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "112k",
            "-t", str(duration), "-movflags", "+faststart", fallback,
        ], timeout=900)
        Path(fallback).replace(output_path)
    if Path(output_path).stat().st_size > max_bytes:
        raise RuntimeError("Final MP4 exceeds the current 50 MB cuto-assets file limit after compression.")


@app.function(
    image=video_image,
    gpu="H100",
    max_containers=1,
    timeout=1800,
    scaledown_window=120,
    volumes={MODEL_CACHE: model_volume},
    secrets=[video_secrets],
)
def render_project(job_id: str, project_id: str, user_id: str):
    started = time.monotonic()
    import torch
    from diffusers.utils import encode_video

    job_rows = db_rows("video_render_jobs", {
        "select": "*", "id": "eq." + job_id, "project_id": "eq." + project_id,
        "user_id": "eq." + user_id, "limit": "1",
    })
    project_rows = db_rows("video_projects", {
        "select": "*", "id": "eq." + project_id, "user_id": "eq." + user_id, "limit": "1",
    })
    if not job_rows or not project_rows:
        raise RuntimeError("render_job_or_project_not_found_for_owner")
    job, project = job_rows[0], project_rows[0]
    if job.get("status") == "completed" and job.get("output_storage_path"):
        return {"status": "completed", "output_storage_path": job["output_storage_path"]}
    channel_rows = db_rows("channels", {
        "select": "*", "id": "eq." + str(project["channel_id"]),
        "user_id": "eq." + user_id, "limit": "1",
    })
    if not channel_rows:
        raise RuntimeError("channel_not_found_for_owner")
    channel = channel_rows[0]

    plan = project.get("recipe_plan") if isinstance(project.get("recipe_plan"), dict) else {}
    shot_list = plan.get("shot_list") if isinstance(plan.get("shot_list"), list) else []
    scene_rows = job.get("scenes") if isinstance(job.get("scenes"), list) else []
    duration = max(30, min(60, int(project.get("duration_seconds") or 45)))
    if not scene_rows or not shot_list or len(scene_rows) != len(shot_list):
        raise RuntimeError("scene_prompt_count_mismatch")
    voice_storage_path = project.get("voice_storage_path")
    if not voice_storage_path:
        raise RuntimeError("voice_not_generated")

    tmp_root = Path(tempfile.mkdtemp(prefix="cuto-render-"))
    try:
        voice_path = tmp_root / "narration.wav"
        voice_path.write_bytes(storage_download(str(voice_storage_path)))
        if voice_path.stat().st_size < 44:
            raise RuntimeError("narration_audio_file_is_invalid")

        pipe, sigmas, torch = get_pipeline()
        local_scenes = []
        completed = 0

        # Preserve already-completed clips on retry; never fall back to downloaded stock footage.
        for index, scene in enumerate(scene_rows):
            number = index + 1
            storage_path = scene.get("storage_path")
            local_path = tmp_root / f"scene-{number:02d}.mp4"
            if scene.get("status") == "completed" and storage_path:
                try:
                    local_path.write_bytes(storage_download(str(storage_path)))
                    completed += 1
                    local_scenes.append(str(local_path))
                    continue
                except Exception:
                    scene["status"] = "queued"
                    scene["storage_path"] = None

            scene["status"] = "generating"
            scene["error_message"] = None
            progress = min(68, 5 + int(63 * completed / len(scene_rows)))
            update_state(
                job_id, project_id, user_id,
                {"status": "generating_scenes", "progress": progress,
                 "stage": f"Modal/LTX 2.5: جاري توليد المشهد {number} من {len(scene_rows)}",
                 "scenes": scene_rows},
                {"status": "processing", "progress": progress,
                 "stage": f"Modal/LTX 2.5: جاري توليد المشهد {number} من {len(scene_rows)}",
                 "error_message": None},
            )

            shot = shot_list[index] if index < len(shot_list) and isinstance(shot_list[index], dict) else {}
            prompt = str(scene.get("prompt") or shot.get("ai_video_prompt") or shot.get("visual") or "").strip()
            if not prompt:
                raise RuntimeError("ai_video_prompt_missing_for_scene_" + str(number))
            prompt = (
                "High-quality vertical food-video scene created entirely by generative AI. "
                "Do not use stock footage, existing video clips, nature b-roll, logos, captions, "
                "watermarks, or readable text. Realistic food preparation, physically plausible action, "
                "clean close-up cinematography, controlled studio lighting, clear ingredient texture. "
                "Keep the same dish, ingredients, pan, plate, countertop, and visual identity across this "
                "recipe sequence. Scene description: " + prompt[:3500]
                + ". Continuity notes: " + str(scene.get("continuity_notes") or "")[:800]
            )
            seed = int.from_bytes(hashlib.sha256(f"{project_id}:{index}".encode("utf-8")).digest()[:4], "big") % (2**31)
            output = pipe(
                prompt=prompt,
                width=576,
                height=1024,
                num_frames=193,
                frame_rate=24.0,
                sigmas=sigmas,
                guidance_scale=1.0,
                audio_guidance_scale=1.0,
                stg_scale=0.0,
                audio_stg_scale=0.0,
                modality_scale=1.0,
                audio_modality_scale=1.0,
                generator=torch.Generator("cuda").manual_seed(seed),
                output_type="np",
                return_dict=False,
            )
            video = output[0][0]
            raw_path = tmp_root / f"raw-scene-{number:02d}.mp4"
            encode_video(video, fps=24, output_path=str(raw_path))
            encoded_path = tmp_root / f"scene-{number:02d}.mp4"
            run_ffmpeg([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw_path),
                "-an", "-vf", "scale=576:1024:flags=lanczos",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "25",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(encoded_path),
            ], timeout=300)
            clip_bytes = encoded_path.read_bytes()
            if not clip_bytes or len(clip_bytes) > 50 * 1024 * 1024:
                raise RuntimeError("generated_scene_file_is_empty_or_exceeds_storage_limit")
            scene_storage = f"{user_id}/{channel['id']}/{project_id}/scenes/scene-{number:02d}.mp4"
            storage_upload(scene_storage, clip_bytes, "video/mp4")
            scene["status"] = "completed"
            scene["storage_path"] = scene_storage
            scene["seconds"] = 8
            completed += 1
            local_scenes.append(str(encoded_path))
            progress = min(68, 5 + int(63 * completed / len(scene_rows)))
            update_state(
                job_id, project_id, user_id,
                {"status": "generating_scenes", "progress": progress,
                 "stage": f"اكتمل توليد {completed} من {len(scene_rows)} مشاهد بواسطة Modal",
                 "scenes": scene_rows},
                {"status": "processing", "progress": progress,
                 "stage": f"اكتمل توليد {completed} من {len(scene_rows)} مشاهد بواسطة Modal"},
            )

        update_state(
            job_id, project_id, user_id,
            {"status": "rendering", "progress": 76, "stage": "يجمع FFmpeg مقاطع Modal وصوت AI Studio والترجمة"},
            {"status": "processing", "progress": 76, "stage": "يجمع FFmpeg مقاطع Modal وصوت AI Studio والترجمة"},
        )
        total_duration = duration
        subtitles_path = tmp_root / "captions.ass"
        write_ass(subtitles_path, plan.get("subtitle_lines", []), total_duration)
        watermark = tmp_root / "watermark.txt"
        watermark.write_text(
            str(channel.get("name") or "CUTO") + " · @" + str(channel.get("username") or ""),
            encoding="utf-8",
        )
        hook_path = tmp_root / "hook.txt"
        hook_text = str(plan.get("hook") or "").replace("\n", " ").strip()[:100]
        hook_path.write_text(hook_text, encoding="utf-8")
        final_path = tmp_root / "final.mp4"
        render_final_video(
            local_scenes, voice_path, final_path, str(subtitles_path), str(watermark), str(hook_path),
            total_duration, channel.get("captions_enabled") is not False,
            channel.get("watermark_enabled") is not False, hook_text,
        )
        update_state(
            job_id, project_id, user_id,
            {"status": "uploading", "progress": 94, "stage": "اكتمل الرندر؛ يحفظ MP4 النهائي في Supabase"},
            {"status": "processing", "progress": 94, "stage": "اكتمل الرندر؛ يحفظ MP4 النهائي في Supabase"},
        )
        final_storage_path = f"{user_id}/{channel['id']}/{project_id}/final.mp4"
        storage_upload(final_storage_path, final_path.read_bytes(), "video/mp4")
        update_state(
            job_id, project_id, user_id,
            {"status": "completed", "progress": 100, "stage": "اكتمل الفيديو وحُفظ في Supabase",
             "output_storage_path": final_storage_path, "error_message": None,
             "render_provider_id": "modal:" + APP_NAME},
            {"status": "completed", "progress": 100, "stage": "اكتمل الفيديو وحُفظ في Supabase",
             "video_storage_path": final_storage_path, "video_url": None, "error_message": None},
        )
        return {"status": "completed", "output_storage_path": final_storage_path,
                "duration_seconds": duration, "elapsed_seconds": round(time.monotonic() - started, 1)}
    except Exception as exc:
        safe_message = str(exc)[:1000]
        try:
            current_scenes = scene_rows if "scene_rows" in locals() else []
            update_state(
                job_id, project_id, user_id,
                {"status": "failed", "stage": "توقّف توليد الفيديو بواسطة Modal", "error_message": safe_message,
                 "scenes": current_scenes},
                {"status": "failed", "stage": "توقّف توليد الفيديو بواسطة Modal", "error_message": safe_message},
            )
        except Exception:
            pass
        raise
    finally:
        import shutil
        shutil.rmtree(tmp_root, ignore_errors=True)


endpoint_image = modal.Image.debian_slim(python_version="3.12").uv_pip_install("fastapi[standard]", "pydantic", "httpx")


@app.function(image=endpoint_image, timeout=30)
@modal.fastapi_endpoint(method="GET", requires_proxy_auth=True)
def health_check():
    return {"status": "ok", "app": APP_NAME, "video_model": MODEL_ID}


@app.function(image=endpoint_image, timeout=30)
@modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
def submit_video(payload: SubmitVideoRequest):
    # The Supabase Edge Function verifies the user and project before calling this endpoint.
    call = render_project.spawn(payload.job_id, payload.project_id, payload.user_id)
    return {"accepted": True, "call_id": call.object_id, "provider": "modal", "model": MODEL_ID}
