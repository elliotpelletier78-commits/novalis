#!/usr/bin/env python3
"""
Crée ou met à jour un assistant Vapi pour un client Novalis.
Usage: python vapi/setup_assistant.py
Requiert: VAPI_API_KEY dans l'environnement ou .env
"""
import os, json, sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

VAPI_API_KEY = os.getenv("VAPI_API_KEY", "")
if not VAPI_API_KEY:
    sys.exit("VAPI_API_KEY manquant dans .env")

try:
    import requests
except ImportError:
    sys.exit("pip install requests")

BASE = "https://api.vapi.ai"
HEADERS = {"Authorization": f"Bearer {VAPI_API_KEY}", "Content-Type": "application/json"}

config_path = Path(__file__).parent / "assistant_config.json"
config = json.loads(config_path.read_text())

# Variables à remplacer — modifier ici ou passer par argv
client_name      = input("Nom du client (ex: Garage Tremblay): ").strip() or "{{CLIENT_NAME}}"
agent_name       = input("Prénom de l'agent (ex: Sophie): ").strip() or "Sophie"
phone_support    = input("Téléphone support (+1...): ").strip() or "+15555555555"
webhook_url      = input(f"URL webhook Novalis (ex: https://novalisia.ca/vapi/webhook): ").strip()
elevenlabs_voice = input("ElevenLabs Voice ID (laisser vide = Rachel): ").strip() or "21m00Tcm4TlvDq8ikWAM"
kb_file_id       = input("Vapi Knowledge Base File ID (optionnel): ").strip()

def replace(obj, mapping):
    if isinstance(obj, str):
        for k, v in mapping.items():
            obj = obj.replace(k, v)
        return obj
    if isinstance(obj, dict):
        return {k: replace(v, mapping) for k, v in obj.items()}
    if isinstance(obj, list):
        return [replace(i, mapping) for i in obj]
    return obj

mapping = {
    "{{CLIENT_NAME}}": client_name,
    "{{AGENT_NAME}}": agent_name,
    "{{PHONE_SUPPORT}}": phone_support,
    "{{PHONE_VENTES}}": phone_support,
    "{{PHONE_DIRECTION}}": phone_support,
    "{{MAKE_WEBHOOK_URL}}": webhook_url,
    "{{MAKE_WEBHOOK_URL_BOOKING}}": webhook_url,
    "{{ELEVENLABS_VOICE_ID}}": elevenlabs_voice,
    "{{VAPI_SERVER_WEBHOOK_URL}}": webhook_url,
    "{{VAPI_KNOWLEDGE_BASE_FILE_ID}}": kb_file_id,
    "INJECTER_ICI_LE_CONTENU_DE_system_prompt_template.md_AVEC_VARIABLES_REMPLIES": (
        Path(__file__).parent / "system_prompt_template.md"
    ).read_text().replace("{{CLIENT_NAME}}", client_name).replace("{{AGENT_NAME}}", agent_name),
}

payload = replace(config, mapping)
payload.pop("_comment", None)
payload.pop("_version", None)

# Supprimer knowledge base si pas de file ID
if not kb_file_id and "knowledgeBase" in payload.get("model", {}):
    del payload["model"]["knowledgeBase"]

r = requests.post(f"{BASE}/assistant", headers=HEADERS, json=payload)
if r.status_code in (200, 201):
    data = r.json()
    print(f"\nAssistant créé : {data.get('id')}")
    print(f"Colle cet ID dans Vapi → Phone Numbers → Assistant ID")
    print(json.dumps({"assistant_id": data.get("id"), "name": data.get("name")}, indent=2))
else:
    print(f"Erreur {r.status_code}: {r.text}")
