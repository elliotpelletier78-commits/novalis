"""
NOVALIS - Backend Serveur Principal
====================================
Agent IA qui répond aux clients par SMS, Messenger et téléphone.
Conçu pour les commerces du Québec.

PRÉREQUIS:
  pip install fastapi uvicorn twilio anthropic python-dotenv requests

DÉMARRAGE:
  uvicorn main:app --host 0.0.0.0 --port 8000
"""

import os
import json
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import anthropic
from twilio.rest import Client as TwilioClient
from twilio.twiml.messaging_response import MessagingResponse
from twilio.twiml.voice_response import VoiceResponse, Gather
import requests

# ============================================================
# CONFIGURATION
# ============================================================
load_dotenv()

# Clés API (à mettre dans le fichier .env)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")  # Ex: +18191234567

# Configuration de l'entreprise (à personnaliser)
BUSINESS_CONFIG = {
    "name": os.getenv("BUSINESS_NAME", "Mon Commerce"),
    "type": os.getenv("BUSINESS_TYPE", "Commerce"),
    "services": os.getenv("BUSINESS_SERVICES", "Services variés"),
    "hours": os.getenv("BUSINESS_HOURS", "Lundi-Vendredi 9h-17h"),
    "address": os.getenv("BUSINESS_ADDRESS", "Sherbrooke, QC"),
    "info": os.getenv("BUSINESS_INFO", ""),
    "owner_phone": os.getenv("OWNER_PHONE", ""),  # Pour les alertes urgentes
}

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("novalis")

# ============================================================
# APPLICATION FASTAPI
# ============================================================
app = FastAPI(title="Novalis", description="Agent IA de gestion client")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Clients API
claude_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) if TWILIO_ACCOUNT_SID else None

# ============================================================
# STOCKAGE EN MÉMOIRE (remplacer par PostgreSQL en production)
# ============================================================
conversations = {}  # {phone_number: [messages]}
stats = {
    "total_interactions": 0,
    "rdv_requests": 0,
    "questions_answered": 0,
    "clients_saved": 0,
    "started_at": datetime.now().isoformat(),
}


def get_conversation(phone: str) -> list:
    """Récupère l'historique de conversation pour un numéro."""
    if phone not in conversations:
        conversations[phone] = []
    return conversations[phone]


def add_message(phone: str, role: str, content: str):
    """Ajoute un message à l'historique."""
    conv = get_conversation(phone)
    conv.append({
        "role": role,
        "content": content,
        "timestamp": datetime.now().isoformat()
    })
    # Garder seulement les 20 derniers messages
    if len(conv) > 20:
        conversations[phone] = conv[-20:]


# ============================================================
# MOTEUR IA (CLAUDE)
# ============================================================
def get_system_prompt() -> str:
    """Génère le prompt système pour Claude."""
    now = datetime.now()
    day_names_fr = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
    current_day = day_names_fr[now.weekday()]

    return f"""Tu es l'assistant de "{BUSINESS_CONFIG['name']}" ({BUSINESS_CONFIG['type']}) situé à {BUSINESS_CONFIG['address']}.

INFORMATIONS SUR L'ENTREPRISE :
- Services et prix : {BUSINESS_CONFIG['services']}
- Heures d'ouverture : {BUSINESS_CONFIG['hours']}
- Adresse : {BUSINESS_CONFIG['address']}
- Informations supplémentaires : {BUSINESS_CONFIG['info']}

CONTEXTE :
- Nous sommes {current_day} le {now.strftime('%d/%m/%Y')} à {now.strftime('%Hh%M')}.
- Le client communique par SMS.

RÈGLES STRICTES :
1. Réponds TOUJOURS en français québécois naturel et professionnel
2. Utilise le vouvoiement
3. Sois CONCIS — maximum 2-3 phrases par SMS (les gens textent vite)
4. Si on demande un rendez-vous, propose des créneaux selon les heures d'ouverture
5. Les prix sont en dollars canadiens ($)
6. Ne mentionne JAMAIS que tu es une intelligence artificielle
7. Agis comme un(e) secrétaire/réceptionniste chaleureux(se)
8. Si c'est urgent ou complexe, propose de faire rappeler par le propriétaire
9. Termine par une question ou une invitation si pertinent
10. Si tu ne connais pas la réponse, dis que tu vas vérifier et revenir rapidement"""


async def generate_response(phone: str, message: str) -> str:
    """Génère une réponse IA avec Claude."""
    if not claude_client:
        return "Merci pour votre message ! Nous allons vous répondre très bientôt."

    # Récupérer l'historique
    history = get_conversation(phone)
    messages = []
    for msg in history[-10:]:  # 10 derniers messages pour le contexte
        messages.append({
            "role": "user" if msg["role"] == "client" else "assistant",
            "content": msg["content"]
        })
    messages.append({"role": "user", "content": message})

    try:
        response = claude_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,  # Court pour SMS
            system=get_system_prompt(),
            messages=messages
        )
        return response.content[0].text
    except Exception as e:
        logger.error(f"Erreur Claude API: {e}")
        return "Merci pour votre message ! Un membre de notre équipe va vous répondre sous peu."


# ============================================================
# DÉTECTION D'INTENTION
# ============================================================
def detect_intent(message: str) -> str:
    """Détecte l'intention du message client."""
    msg_lower = message.lower()

    rdv_keywords = ["rendez-vous", "rdv", "réserver", "booking", "disponible",
                     "disponibilité", "créneau", "appointment", "libre"]
    urgent_keywords = ["urgent", "urgence", "immédiatement", "tout de suite",
                       "maintenant", "asap", "vite"]
    price_keywords = ["prix", "tarif", "coût", "combien", "coûte", "$$"]
    hours_keywords = ["heure", "ouvert", "fermé", "horaire", "quand"]
    location_keywords = ["adresse", "où", "situé", "emplacement", "comment aller"]

    if any(k in msg_lower for k in urgent_keywords):
        return "urgent"
    elif any(k in msg_lower for k in rdv_keywords):
        return "rdv"
    elif any(k in msg_lower for k in price_keywords):
        return "prix"
    elif any(k in msg_lower for k in hours_keywords):
        return "horaires"
    elif any(k in msg_lower for k in location_keywords):
        return "adresse"
    else:
        return "general"


def update_stats(intent: str):
    """Met à jour les statistiques."""
    stats["total_interactions"] += 1
    if intent == "rdv":
        stats["rdv_requests"] += 1
    else:
        stats["questions_answered"] += 1
    stats["clients_saved"] += 1


# ============================================================
# ALERTES AU PROPRIÉTAIRE
# ============================================================
def notify_owner(client_phone: str, message: str, intent: str):
    """Envoie une alerte SMS au propriétaire si nécessaire."""
    if not twilio_client or not BUSINESS_CONFIG["owner_phone"]:
        return

    if intent in ["urgent", "rdv"]:
        try:
            alert = f"🔔 NOVALIS - Nouveau {intent.upper()}\n"
            alert += f"Client: {client_phone}\n"
            alert += f"Message: {message[:100]}"

            twilio_client.messages.create(
                body=alert,
                from_=TWILIO_PHONE_NUMBER,
                to=BUSINESS_CONFIG["owner_phone"]
            )
            logger.info(f"Alerte envoyée au propriétaire pour {intent}")
        except Exception as e:
            logger.error(f"Erreur alerte propriétaire: {e}")


# ============================================================
# ENDPOINTS SMS (TWILIO WEBHOOK)
# ============================================================
@app.post("/sms/incoming")
async def handle_incoming_sms(request: Request):
    """
    Webhook Twilio pour les SMS entrants.
    Configure dans Twilio: https://votre-domaine.com/sms/incoming
    """
    form = await request.form()
    from_number = form.get("From", "")
    body = form.get("Body", "").strip()

    logger.info(f"SMS reçu de {from_number}: {body}")

    if not body:
        return Response(content="", media_type="text/xml")

    # Détecter l'intention
    intent = detect_intent(body)
    update_stats(intent)

    # Sauvegarder le message client
    add_message(from_number, "client", body)

    # Générer la réponse IA
    ai_response = await generate_response(from_number, body)

    # Sauvegarder la réponse
    add_message(from_number, "agent", ai_response)

    # Alerter le propriétaire si urgent ou RDV
    notify_owner(from_number, body, intent)

    # Répondre via Twilio
    twiml = MessagingResponse()
    twiml.message(ai_response)

    logger.info(f"Réponse envoyée à {from_number}: {ai_response[:50]}...")

    return Response(content=str(twiml), media_type="text/xml")


# ============================================================
# ENDPOINTS VOIX (TWILIO VOICE)
# ============================================================
@app.post("/voice/incoming")
async def handle_incoming_call(request: Request):
    """
    Webhook Twilio pour les appels entrants.
    Configure dans Twilio: https://votre-domaine.com/voice/incoming
    """
    response = VoiceResponse()

    # Message d'accueil
    gather = Gather(
        input="speech",
        action="/voice/respond",
        method="POST",
        language="fr-CA",
        speechTimeout="auto",
        timeout=5
    )
    gather.say(
        f"Bonjour et merci d'appeler {BUSINESS_CONFIG['name']}. "
        f"Comment puis-je vous aider ?",
        voice="Polly.Gabrielle",  # Voix française canadienne
        language="fr-CA"
    )
    response.append(gather)

    # Si pas de réponse vocale
    response.say(
        "Je n'ai pas entendu votre demande. "
        "Vous pouvez aussi nous envoyer un texto à ce numéro. Merci et bonne journée !",
        voice="Polly.Gabrielle",
        language="fr-CA"
    )

    return Response(content=str(response), media_type="text/xml")


@app.post("/voice/respond")
async def handle_voice_response(request: Request):
    """Traite la réponse vocale du client."""
    form = await request.form()
    speech_result = form.get("SpeechResult", "")
    from_number = form.get("From", "")

    logger.info(f"Appel de {from_number}, transcription: {speech_result}")

    response = VoiceResponse()

    if speech_result:
        # Détecter l'intention et mettre à jour les stats
        intent = detect_intent(speech_result)
        update_stats(intent)

        # Générer réponse IA
        add_message(from_number, "client", speech_result)
        ai_response = await generate_response(from_number, speech_result)
        add_message(from_number, "agent", ai_response)

        # Alerter le propriétaire
        notify_owner(from_number, speech_result, intent)

        # Lire la réponse
        gather = Gather(
            input="speech",
            action="/voice/respond",
            method="POST",
            language="fr-CA",
            speechTimeout="auto",
            timeout=5
        )
        gather.say(ai_response, voice="Polly.Gabrielle", language="fr-CA")
        response.append(gather)

        response.say(
            "Merci d'avoir appelé. Bonne journée !",
            voice="Polly.Gabrielle",
            language="fr-CA"
        )
    else:
        response.say(
            "Je n'ai pas compris. Vous pouvez nous envoyer un texto. Merci !",
            voice="Polly.Gabrielle",
            language="fr-CA"
        )

    return Response(content=str(response), media_type="text/xml")


# ============================================================
# ENDPOINT MESSENGER (FACEBOOK WEBHOOK)
# ============================================================
FB_VERIFY_TOKEN = os.getenv("FB_VERIFY_TOKEN", "novalis_verify_token")
FB_PAGE_ACCESS_TOKEN = os.getenv("FB_PAGE_ACCESS_TOKEN", "")


@app.get("/messenger/webhook")
async def verify_messenger(request: Request):
    """Vérification du webhook Facebook."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == FB_VERIFY_TOKEN:
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")


@app.post("/messenger/webhook")
async def handle_messenger(request: Request):
    """Traite les messages Messenger entrants."""
    data = await request.json()

    for entry in data.get("entry", []):
        for event in entry.get("messaging", []):
            sender_id = event.get("sender", {}).get("id", "")
            message = event.get("message", {}).get("text", "")

            if not message:
                continue

            logger.info(f"Messenger de {sender_id}: {message}")

            # Détecter intention et stats
            intent = detect_intent(message)
            update_stats(intent)

            # Générer réponse
            phone_key = f"messenger_{sender_id}"
            add_message(phone_key, "client", message)
            ai_response = await generate_response(phone_key, message)
            add_message(phone_key, "agent", ai_response)

            # Envoyer via Messenger
            if FB_PAGE_ACCESS_TOKEN:
                try:
                    requests.post(
                        "https://graph.facebook.com/v18.0/me/messages",
                        params={"access_token": FB_PAGE_ACCESS_TOKEN},
                        json={
                            "recipient": {"id": sender_id},
                            "message": {"text": ai_response}
                        }
                    )
                except Exception as e:
                    logger.error(f"Erreur Messenger: {e}")

            # Alerter le propriétaire
            notify_owner(sender_id, message, intent)

    return {"status": "ok"}


# ============================================================
# TABLEAU DE BORD (API)
# ============================================================
@app.get("/api/stats")
async def get_stats():
    """Retourne les statistiques."""
    return {
        **stats,
        "active_conversations": len(conversations),
        "uptime_hours": round(
            (datetime.now() - datetime.fromisoformat(stats["started_at"])).total_seconds() / 3600, 1
        )
    }


@app.get("/api/conversations")
async def get_conversations():
    """Retourne la liste des conversations."""
    result = []
    for phone, messages in conversations.items():
        if messages:
            result.append({
                "phone": phone,
                "message_count": len(messages),
                "last_message": messages[-1]["content"][:50],
                "last_time": messages[-1]["timestamp"],
            })
    return sorted(result, key=lambda x: x["last_time"], reverse=True)


@app.get("/api/conversation/{phone}")
async def get_single_conversation(phone: str):
    """Retourne une conversation complète."""
    return get_conversation(phone)


# ============================================================
# TABLEAU DE BORD (WEB)
# ============================================================
@app.get("/", response_class=HTMLResponse)
async def dashboard():
    """Page d'accueil / tableau de bord."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Novalis - Tableau de bord</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{ font-family: -apple-system, system-ui, sans-serif; background: #0a0e17; color: #e2e8f0; padding: 20px; }}
            h1 {{ color: #38bdf8; margin-bottom: 20px; }}
            .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }}
            .stat-card {{ background: #1a2332; border: 1px solid #1e3a5f; border-radius: 12px; padding: 20px; text-align: center; }}
            .stat-value {{ font-size: 2.5rem; font-weight: 700; color: #38bdf8; }}
            .stat-label {{ font-size: 0.85rem; color: #94a3b8; margin-top: 4px; }}
            .status {{ display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; background: rgba(52,211,153,0.15); color: #34d399; font-size: 0.85rem; margin-bottom: 20px; }}
            .status .dot {{ width: 8px; height: 8px; border-radius: 50%; background: #34d399; animation: pulse 2s infinite; }}
            @keyframes pulse {{ 0%,100% {{ opacity: 1; }} 50% {{ opacity: 0.3; }} }}
            .info {{ background: #1a2332; border: 1px solid #1e3a5f; border-radius: 12px; padding: 16px; margin-top: 16px; }}
            .info h3 {{ color: #38bdf8; margin-bottom: 8px; font-size: 0.9rem; }}
            .info p {{ color: #94a3b8; font-size: 0.85rem; line-height: 1.6; }}
        </style>
    </head>
    <body>
        <h1>🤖 NOVALIS</h1>
        <div class="status"><span class="dot"></span> Agent actif — {BUSINESS_CONFIG['name']}</div>
        <div class="stats" id="stats"></div>
        <div class="info">
            <h3>📋 Configuration</h3>
            <p>Commerce : {BUSINESS_CONFIG['name']} ({BUSINESS_CONFIG['type']})<br>
            Adresse : {BUSINESS_CONFIG['address']}<br>
            Heures : {BUSINESS_CONFIG['hours']}<br>
            Téléphone Twilio : {TWILIO_PHONE_NUMBER or 'Non configuré'}</p>
        </div>
        <script>
            async function loadStats() {{
                const res = await fetch('/api/stats');
                const data = await res.json();
                document.getElementById('stats').innerHTML = `
                    <div class="stat-card"><div class="stat-value">${{data.total_interactions}}</div><div class="stat-label">Interactions</div></div>
                    <div class="stat-card"><div class="stat-value">${{data.rdv_requests}}</div><div class="stat-label">Demandes RDV</div></div>
                    <div class="stat-card"><div class="stat-value">${{data.clients_saved}}</div><div class="stat-label">Clients sauvés</div></div>
                    <div class="stat-card"><div class="stat-value">${{data.active_conversations}}</div><div class="stat-label">Conversations</div></div>
                `;
            }}
            loadStats();
            setInterval(loadStats, 10000);
        </script>
    </body>
    </html>
    """


# ============================================================
# SANTÉ DU SERVEUR
# ============================================================
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "novalis",
        "business": BUSINESS_CONFIG["name"],
        "twilio_configured": bool(TWILIO_ACCOUNT_SID),
        "claude_configured": bool(ANTHROPIC_API_KEY),
        "messenger_configured": bool(FB_PAGE_ACCESS_TOKEN),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
