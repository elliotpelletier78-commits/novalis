#!/usr/bin/env python3
"""
Novalis IA — Générateur de vidéo de présentation
================================================
Génère une vidéo professionnelle (MP4) avec :
  - Slides visuels dark-mode aux couleurs de Novalis
  - Voix professionnelle via ElevenLabs
  - Format vertical 1080x1920 (TikTok / Instagram Reels)
  - Format horizontal 1920x1080 (YouTube / LinkedIn)

Usage:
  python3 generate_video.py              → format vertical (Reels/TikTok)
  python3 generate_video.py --horizontal → format horizontal (YouTube)
  python3 generate_video.py --no-voice  → sans voix (slides seulement)

Requis dans .env :
  ELEVENLABS_API_KEY=...
  ELEVENLABS_VOICE_ID=...  (optionnel, défaut: voix française)
"""

import os
import sys
import json
import time
import struct
import tempfile
import subprocess
import textwrap
import argparse
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("❌ Pillow manquant. Installez: pip install pillow")
    sys.exit(1)

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# ── Config ───────────────────────────────────────────────────────────────────
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")

VERTICAL   = (1080, 1920)
HORIZONTAL = (1920, 1080)

# Couleurs Novalis
BG        = (6,   10,  18)   # #060a12
CARD      = (15,  23,  42)   # #0f172a
ACCENT    = (52,  211, 153)  # #34d399 vert
BLUE      = (56,  189, 248)  # #38bdf8
TEXT      = (226, 232, 240)  # #e2e8f0
MUTED     = (100, 116, 139)  # #64748b
WHITE     = (255, 255, 255)

# ── Polices ──────────────────────────────────────────────────────────────────
_FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf",
]
_FONT_REGULAR_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf",
]

def _load_font(size, bold=True):
    paths = _FONT_PATHS if bold else _FONT_REGULAR_PATHS
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

# ── Script de la vidéo ───────────────────────────────────────────────────────
SLIDES = [
    {
        "type":     "hook",
        "title":    "💸 Tu perds des clients",
        "subtitle": "sans le savoir",
        "body":     "Chaque soir, des clients t'écrivent.\nPersonne ne répond.\nIls appellent ton compétiteur.",
        "voice":    "Chaque soir, des clients t'écrivent. Personne ne répond. Ils appellent ton compétiteur.",
        "accent":   ACCENT,
        "duration": 6,
    },
    {
        "type":     "problem",
        "title":    "Le problème",
        "subtitle": "des PMEs québécoises",
        "body":     "• 67% des clients ne rappellent pas\n• Un appel manqué = 200–500$ perdu\n• Tes heures d'ouverture: 9h à 17h\n• Tes clients: 24h sur 24",
        "voice":    "Soixante-sept pourcent des clients ne rappellent pas. Un appel manqué, c'est entre deux cents et cinq cents dollars perdus. Tu es ouvert neuf à cinq. Tes clients ont besoin de toi vingt-quatre heures sur vingt-quatre.",
        "accent":   (239, 68, 68),  # rouge
        "duration": 9,
    },
    {
        "type":     "reveal",
        "title":    "Novalis IA",
        "subtitle": "L'agence d'intelligence artificielle québécoise",
        "body":     "On automatise ton service client.\nTu ne perds plus jamais un client.",
        "voice":    "Novalis I-A. L'agence d'intelligence artificielle québécoise. On automatise ton service client. Tu ne perds plus jamais un seul client.",
        "accent":   ACCENT,
        "duration": 7,
        "logo":     True,
    },
    {
        "type":     "feature",
        "title":    "Agent IA 24h/7j",
        "subtitle": "Par texto, web et téléphone",
        "body":     "✅ Répond à tes clients en 10 secondes\n✅ Prend les rendez-vous automatiquement\n✅ Répond aux questions fréquentes\n✅ T'alerte seulement si c'est urgent",
        "voice":    "Notre agent IA répond à tes clients en dix secondes. Il prend les rendez-vous automatiquement. Il répond aux questions fréquentes. Et il t'alerte seulement si c'est vraiment urgent.",
        "accent":   BLUE,
        "duration": 10,
    },
    {
        "type":     "results",
        "title":    "Les résultats",
        "subtitle": "Ce que vivent nos clients",
        "body":     "⏱  10h récupérées par semaine\n📱 Zéro appel manqué\n💰 ROI moyen: 3x en 90 jours\n🌙 Clients servis à 2h du matin",
        "voice":    "Nos clients récupèrent en moyenne dix heures par semaine. Zéro appel manqué. Un retour sur investissement moyen de trois fois en quatre-vingt-dix jours. Et leurs clients sont servis même à deux heures du matin.",
        "accent":   ACCENT,
        "duration": 9,
    },
    {
        "type":     "pricing",
        "title":    "497$ / mois",
        "subtitle": "Premier mois gratuit — aucun contrat",
        "body":     "Un café par jour.\nPour ne plus jamais perdre un client.\n\n🎁 5 places disponibles\nà prix pionnier",
        "voice":    "Quatre-cent-quatre-vingt-dix-sept dollars par mois. L'équivalent d'un café par jour. Pour ne plus jamais perdre un client. Et le premier mois est entièrement gratuit, sans contrat. Il reste cinq places au prix pionnier.",
        "accent":   (251, 191, 36),  # jaune
        "duration": 10,
    },
    {
        "type":     "who",
        "title":    "Pour qui?",
        "subtitle": "Toute PME québécoise avec des clients",
        "body":     "🦷 Dentistes    ✂️ Coiffeurs\n🔧 Garages      🏥 Cliniques\n🍽  Restaurants  🏠 Agents immo\n🌿 Spas          ⚡ Électriciens",
        "voice":    "Pour les dentistes, coiffeurs, garages, cliniques, restaurants, agents immobiliers, spas, électriciens. Si tu as des clients au Québec, Novalis IA est fait pour toi.",
        "accent":   BLUE,
        "duration": 8,
    },
    {
        "type":     "cta",
        "title":    "novalisia.ca",
        "subtitle": "Commence gratuitement aujourd'hui",
        "body":     "📧 Répond en moins de 24h\n🇶🇨 100% québécois\n🤝 Appel de 15 min offert",
        "voice":    "Visite novalisia point c-a. Commence gratuitement aujourd'hui. On répond en moins de vingt-quatre heures. Cent pourcent québécois. Et ton appel de quinze minutes est offert.",
        "accent":   ACCENT,
        "duration": 8,
        "logo":     True,
    },
]


# ── Dessin des slides ─────────────────────────────────────────────────────────
def draw_slide(slide: dict, size: tuple) -> Image.Image:
    W, H = size
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    accent = slide.get("accent", ACCENT)
    is_vertical = H > W

    # ── Fond avec gradient simulé (dégradé via rectangles)
    for i in range(H // 3):
        alpha = int(20 * (1 - i / (H // 3)))
        r = min(255, BG[0] + alpha)
        g = min(255, BG[1] + alpha)
        b = min(255, BG[2] + alpha + 5)
        draw.rectangle([(0, i), (W, i + 1)], fill=(r, g, b))

    # ── Ligne accent en haut
    draw.rectangle([(0, 0), (W, 6)], fill=accent)

    # ── Cadre central
    padding = int(W * 0.07)
    card_x1 = padding
    card_y1 = int(H * 0.12) if is_vertical else int(H * 0.08)
    card_x2 = W - padding
    card_y2 = H - int(H * 0.1)
    draw.rounded_rectangle(
        [(card_x1, card_y1), (card_x2, card_y2)],
        radius=28, fill=CARD,
        outline=(*accent, 60), width=2
    )

    # ── Titre
    title_size = int(W * 0.072) if is_vertical else int(H * 0.1)
    font_title = _load_font(title_size, bold=True)
    title = slide.get("title", "")
    title_y = card_y1 + int(H * 0.05)
    draw.text((W // 2, title_y), title, font=font_title, fill=TEXT, anchor="mt")

    # ── Ligne décorative sous titre
    line_y = title_y + int(title_size * 1.3)
    line_w = int(W * 0.15)
    draw.rectangle([(W // 2 - line_w, line_y), (W // 2 + line_w, line_y + 4)], fill=accent)

    # ── Sous-titre
    sub_size = int(W * 0.038) if is_vertical else int(H * 0.052)
    font_sub = _load_font(sub_size, bold=False)
    sub_y = line_y + int(H * 0.025)
    draw.text((W // 2, sub_y), slide.get("subtitle", ""), font=font_sub, fill=(*accent, 220), anchor="mt")

    # ── Corps
    body_size = int(W * 0.042) if is_vertical else int(H * 0.058)
    font_body = _load_font(body_size, bold=False)
    body_text = slide.get("body", "")
    body_y = sub_y + int(H * 0.07)
    line_h = int(body_size * 1.55)
    for line in body_text.split("\n"):
        draw.text((W // 2, body_y), line, font=font_body, fill=TEXT, anchor="mt")
        body_y += line_h

    # ── Logo / branding bas
    brand_size = int(W * 0.032) if is_vertical else int(H * 0.045)
    font_brand = _load_font(brand_size, bold=True)
    brand_y = card_y2 - int(H * 0.06)
    brand_text = "● NOVALIS IA" if slide.get("logo") else "novalisia.ca"
    draw.text((W // 2, brand_y), brand_text, font=font_brand, fill=accent, anchor="mt")

    # ── Numéro de slide
    num_size = int(W * 0.025)
    font_num = _load_font(num_size, bold=False)
    draw.text((W - padding - 10, H - int(H * 0.04)), "", font=font_num, fill=MUTED, anchor="rb")

    return img


# ── ElevenLabs TTS ───────────────────────────────────────────────────────────
def generate_voice(text: str, out_path: str) -> bool:
    if not ELEVENLABS_API_KEY or not HAS_REQUESTS:
        return False
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.6,
            "similarity_boost": 0.85,
            "style": 0.2,
            "use_speaker_boost": True,
        },
    }
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=30)
        if r.status_code == 200:
            with open(out_path, "wb") as f:
                f.write(r.content)
            return True
        else:
            print(f"  ⚠ ElevenLabs erreur {r.status_code}: {r.text[:200]}")
            return False
    except Exception as e:
        print(f"  ⚠ ElevenLabs erreur réseau: {e}")
        return False


# ── Génération audio silence ──────────────────────────────────────────────────
def generate_silence(duration_s: float, out_path: str):
    """Génère un fichier audio silencieux (WAV) de la durée donnée."""
    sample_rate = 44100
    num_samples = int(sample_rate * duration_s)
    with open(out_path, "wb") as f:
        # WAV header
        data_size = num_samples * 2
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + data_size))
        f.write(b"WAVE")
        f.write(b"fmt ")
        f.write(struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16))
        f.write(b"data")
        f.write(struct.pack("<I", data_size))
        f.write(b"\x00" * data_size)


# ── Audio duration ────────────────────────────────────────────────────────────
def get_audio_duration(path: str) -> float:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, timeout=10
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


# ── Assemblage vidéo ──────────────────────────────────────────────────────────
def make_clip(img_path: str, audio_path: str, out_path: str, duration: float):
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-loop", "1", "-i", img_path,
        "-i", audio_path,
        "-c:v", "libx264", "-tune", "stillimage", "-preset", "fast",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-t", str(duration),
        "-vf", f"scale=trunc(iw/2)*2:trunc(ih/2)*2",
        out_path
    ]
    subprocess.run(cmd, check=True)


def concat_clips(clip_paths: list, out_path: str, tmp_dir: str):
    list_file = os.path.join(tmp_dir, "clips.txt")
    with open(list_file, "w") as f:
        for p in clip_paths:
            f.write(f"file '{p}'\n")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", list_file,
        "-c", "copy",
        out_path
    ]
    subprocess.run(cmd, check=True)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Générateur vidéo Novalis IA")
    parser.add_argument("--horizontal", action="store_true", help="Format 1920x1080 (YouTube/LinkedIn)")
    parser.add_argument("--no-voice",   action="store_true", help="Sans voix ElevenLabs")
    parser.add_argument("--output",     default="novalis_presentation.mp4", help="Fichier de sortie")
    args = parser.parse_args()

    size = HORIZONTAL if args.horizontal else VERTICAL
    use_voice = not args.no_voice and bool(ELEVENLABS_API_KEY)
    fmt = "horizontal" if args.horizontal else "vertical (Reels/TikTok)"

    print(f"\n🎬 Novalis IA — Générateur de vidéo")
    print(f"   Format  : {size[0]}×{size[1]} ({fmt})")
    print(f"   Voix    : {'ElevenLabs ✅' if use_voice else '❌ ELEVENLABS_API_KEY manquant — slides muets'}")
    print(f"   Slides  : {len(SLIDES)}")
    print(f"   Sortie  : {args.output}\n")

    with tempfile.TemporaryDirectory() as tmp:
        clips = []

        for i, slide in enumerate(SLIDES):
            print(f"  [{i+1}/{len(SLIDES)}] {slide['title']} ...", end=" ", flush=True)

            # 1. Slide image
            img = draw_slide(slide, size)
            img_path = os.path.join(tmp, f"slide_{i:02d}.png")
            img.save(img_path, "PNG")

            # 2. Audio
            audio_path = os.path.join(tmp, f"audio_{i:02d}.mp3")
            silence_path = os.path.join(tmp, f"silence_{i:02d}.wav")

            if use_voice:
                ok = generate_voice(slide["voice"], audio_path)
                if ok:
                    duration = get_audio_duration(audio_path) + 0.8  # 0.8s pause
                else:
                    generate_silence(slide["duration"], silence_path)
                    audio_path = silence_path
                    duration = slide["duration"]
            else:
                generate_silence(slide["duration"], silence_path)
                audio_path = silence_path
                duration = slide["duration"]

            # 3. Clip
            clip_path = os.path.join(tmp, f"clip_{i:02d}.mp4")
            make_clip(img_path, audio_path, clip_path, duration)
            clips.append(clip_path)
            print(f"✅ ({duration:.1f}s)")

        # 4. Concaténation
        print(f"\n  🎞  Assemblage final...")
        concat_clips(clips, args.output, tmp)

    total = sum(SLIDES[i].get("duration", 8) for i in range(len(SLIDES)))
    size_mb = os.path.getsize(args.output) / 1024 / 1024
    print(f"\n✅ Vidéo générée : {args.output}")
    print(f"   Durée estimée : ~{total}s")
    print(f"   Taille        : {size_mb:.1f} Mo")
    print(f"\n📱 Prêt pour TikTok, Instagram Reels, Facebook, LinkedIn!\n")


if __name__ == "__main__":
    main()
