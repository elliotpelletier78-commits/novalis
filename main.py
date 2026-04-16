"""
NOVALIS - Agence IA / Plateforme SaaS (V3.1)
==============================================
Agence d'intelligence artificielle — automatise tout, pour tout le monde.
Produits: Agent SMS/Voix/Messenger + Mandats d'automatisation custom + API

FONCTIONNALITÉS:
  - Architecture multi-clients (multi-tenant)
  - Agent IA SMS/Voix/Messenger par client
  - Système de projets/mandats d'automatisation à la demande
  - Portail client avec suivi de projets
  - Gestion de rendez-vous intégrée
  - Analytics avancés avec rapport ROI
  - API publique documentée (clés API)
  - Documentation R&D automatique (RS&DE)
  - Catalogue de services d'automatisation

PRÉREQUIS:
  pip install fastapi uvicorn twilio anthropic python-dotenv requests slowapi aiosqlite

DÉMARRAGE:
  uvicorn main:app --host 0.0.0.0 --port 8000
"""

import os
import json
import logging
import csv
import io
import hashlib
import uuid
import secrets
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, HTTPException, Depends, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import aiosqlite
import anthropic
from twilio.rest import Client as TwilioClient
from twilio.twiml.messaging_response import MessagingResponse
from twilio.twiml.voice_response import VoiceResponse, Gather
import requests as http_requests
import asyncio

# ============================================================
# CONFIGURATION
# ============================================================
load_dotenv()

# Clés API plateforme
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")

# Admin plateforme
ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASS", "novalis2024")
PLATFORM_SECRET = os.getenv("PLATFORM_SECRET", secrets.token_hex(32))

# CORS
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

# Facebook
FB_VERIFY_TOKEN = os.getenv("FB_VERIFY_TOKEN", "novalis_verify_token")

# Base de données
DB_PATH = os.getenv("DATABASE_PATH", "novalis.db")

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("novalis")

# Version
VERSION = "3.1.0"

# ============================================================
# APPLICATION FASTAPI
# ============================================================
app = FastAPI(
    title="Novalis — Agence IA",
    description="Agence d'intelligence artificielle — automatisation sur mesure pour entreprises",
    version=VERSION,
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS != ["*"] else ["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)

# Clients API
claude_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) if TWILIO_ACCOUNT_SID else None

security = HTTPBasic()

# ============================================================
# BASE DE DONNÉES V3 - MULTI-TENANT
# ============================================================
async def init_db():
    """Initialise la base de données avec support multi-clients."""
    async with aiosqlite.connect(DB_PATH) as db:
        # === TABLE CLIENTS (TENANTS) ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                business_name TEXT NOT NULL,
                business_type TEXT DEFAULT 'Commerce',
                services TEXT DEFAULT '',
                hours TEXT DEFAULT 'Lundi-Vendredi 9h-17h',
                address TEXT DEFAULT '',
                info TEXT DEFAULT '',
                owner_name TEXT NOT NULL,
                owner_email TEXT NOT NULL,
                owner_phone TEXT DEFAULT '',
                twilio_phone TEXT DEFAULT '',
                fb_page_token TEXT DEFAULT '',
                api_key TEXT UNIQUE NOT NULL,
                plan TEXT DEFAULT 'starter',
                status TEXT DEFAULT 'active',
                custom_prompt TEXT DEFAULT '',
                language TEXT DEFAULT 'fr-CA',
                max_messages_month INTEGER DEFAULT 500,
                messages_used_month INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        # === TABLE CONVERSATIONS ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                phone TEXT NOT NULL,
                channel TEXT NOT NULL DEFAULT 'sms',
                status TEXT DEFAULT 'active',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id)
            )
        """)

        # === TABLE MESSAGES ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                intent TEXT,
                response_time_ms INTEGER DEFAULT 0,
                tokens_used INTEGER DEFAULT 0,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id),
                FOREIGN KEY (client_id) REFERENCES clients(id)
            )
        """)

        # === TABLE STATS QUOTIDIENNES (par client) ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS stats_daily (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                date TEXT NOT NULL,
                interactions INTEGER DEFAULT 0,
                rdv_requests INTEGER DEFAULT 0,
                questions INTEGER DEFAULT 0,
                unique_clients INTEGER DEFAULT 0,
                complaints INTEGER DEFAULT 0,
                transfers INTEGER DEFAULT 0,
                avg_response_ms INTEGER DEFAULT 0,
                messages_in INTEGER DEFAULT 0,
                messages_out INTEGER DEFAULT 0,
                UNIQUE(client_id, date),
                FOREIGN KEY (client_id) REFERENCES clients(id)
            )
        """)

        # === TABLE RENDEZ-VOUS ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS appointments (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                customer_name TEXT DEFAULT '',
                service TEXT DEFAULT '',
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                duration_min INTEGER DEFAULT 60,
                status TEXT DEFAULT 'pending',
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id)
            )
        """)

        # === TABLE TRANSFERTS EN ATTENTE ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS pending_transfers (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                phone TEXT NOT NULL,
                last_message TEXT NOT NULL,
                requested_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id)
            )
        """)

        # === TABLE PROJETS / MANDATS D'AUTOMATISATION ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                service_type TEXT NOT NULL DEFAULT 'custom',
                status TEXT DEFAULT 'inquiry',
                priority TEXT DEFAULT 'normal',
                budget TEXT DEFAULT '',
                quote_amount REAL DEFAULT 0,
                paid_amount REAL DEFAULT 0,
                start_date TEXT DEFAULT '',
                deadline TEXT DEFAULT '',
                completed_date TEXT DEFAULT '',
                deliverables TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                progress INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id)
            )
        """)

        # === TABLE TÂCHES DE PROJET ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS project_tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                status TEXT DEFAULT 'todo',
                order_num INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            )
        """)

        # === TABLE MESSAGES DE PROJET (communication client) ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS project_messages (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                sender TEXT NOT NULL,
                content TEXT NOT NULL,
                attachment_url TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            )
        """)

        # === CATALOGUE DE SERVICES ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS service_catalog (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT DEFAULT '',
                features TEXT DEFAULT '',
                price_type TEXT DEFAULT 'quote',
                price_from REAL DEFAULT 0,
                price_to REAL DEFAULT 0,
                delivery_days INTEGER DEFAULT 14,
                is_active INTEGER DEFAULT 1,
                order_num INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)

        # === TABLE R&D LOG (pour RS&DE) ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS rd_log (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                hours REAL DEFAULT 0,
                technical_details TEXT DEFAULT '',
                results TEXT DEFAULT '',
                date TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        # === INDEX pour performance ===
        await db.execute("CREATE INDEX IF NOT EXISTS idx_conv_client ON conversations(client_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_conv_phone ON conversations(phone, client_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_msg_client ON messages(client_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_stats_client ON stats_daily(client_id, date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_appt_client ON appointments(client_id, date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(twilio_phone)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_clients_apikey ON clients(api_key)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id, status)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ptasks_project ON project_tasks(project_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_pmsg_project ON project_messages(project_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_catalog_active ON service_catalog(is_active)")

        await db.commit()
        logger.info("Base de données V3.1 (agence IA) initialisée")


@app.on_event("startup")
async def startup():
    await init_db()
    await seed_service_catalog()
    logger.info(f"Novalis V{VERSION} démarré — Agence IA")

# ============================================================
# UTILITAIRES
# ============================================================
async def seed_service_catalog():
    """Pré-remplit le catalogue de services si vide."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM service_catalog")
        count = (await cursor.fetchone())[0]
        if count > 0:
            return

        now = datetime.now().isoformat()
        services = [
            ("svc_chatbot", "Agent IA SMS/Voix", "chatbot",
             "Agent conversationnel qui repond a vos clients 24/7 par SMS, telephone et Messenger.",
             "Reponses automatiques|Detection d'intentions|Alertes proprietaire|Tableau de bord|Rapport ROI",
             "monthly", 39, 249, 3, 1),
            ("svc_workflow", "Automatisation de workflows", "automation",
             "Automatisation de vos processus repetitifs avec l'IA. Emails, factures, rapports, saisie de donnees.",
             "Analyse de vos processus|Design du workflow|Integration a vos outils|Tests et deploiement|Support",
             "project", 2500, 15000, 21, 2),
            ("svc_data", "Analyse de donnees IA", "data",
             "Extraction d'insights de vos donnees avec l'intelligence artificielle. Rapports, predictions, tendances.",
             "Collecte et nettoyage|Analyse exploratoire|Modeles predictifs|Tableaux de bord|Rapport executif",
             "project", 3000, 20000, 28, 3),
            ("svc_content", "Generation de contenu IA", "content",
             "Creation automatisee de contenu marketing, descriptions produits, articles, publications reseaux sociaux.",
             "Strategie de contenu|Templates personnalises|Generation automatique|Revision et approbation|Publication",
             "monthly", 500, 3000, 7, 4),
            ("svc_integration", "Integration IA sur mesure", "integration",
             "Integration de l'IA dans vos systemes existants. CRM, ERP, site web, application mobile.",
             "Audit technique|Architecture|Developpement API|Integration|Tests et deploiement",
             "project", 5000, 50000, 42, 5),
            ("svc_diagnostic", "Diagnostic IA", "consulting",
             "Audit complet de vos operations pour identifier les opportunites d'automatisation et d'IA.",
             "Entrevues equipe|Analyse processus|Cartographie opportunites|Plan d'action priorise|Presentation",
             "fixed", 2500, 7500, 14, 6),
            ("svc_training", "Formation IA pour equipes", "training",
             "Ateliers pratiques pour vos equipes sur l'utilisation de l'IA dans leur travail quotidien.",
             "Contenu personnalise|Exercices pratiques|Outils concrets|Support post-formation|Certificat",
             "fixed", 1500, 5000, 1, 7),
            ("svc_scraping", "Extraction de donnees web", "automation",
             "Collecte automatisee de donnees depuis des sites web, directories, reseaux sociaux.",
             "Identification des sources|Developpement scraper|Nettoyage donnees|Livraison structuree|Maintenance",
             "project", 1000, 8000, 14, 8),
        ]
        for s in services:
            await db.execute(
                """INSERT INTO service_catalog (id, name, category, description, features, price_type, price_from, price_to, delivery_days, order_num, is_active, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)""",
                (*s, now)
            )
        await db.commit()
        logger.info(f"Catalogue de {len(services)} services initialise")

def generate_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"

def generate_api_key() -> str:
    return f"nvls_{secrets.token_hex(24)}"

def sanitize_input(text: str) -> str:
    if not text:
        return ""
    text = "".join(char for char in text if ord(char) >= 32 or char in '\n\t')
    return text[:1000].strip()

def is_within_hours(hours_str: str) -> bool:
    """Vérifie si on est pendant les heures d'ouverture du client."""
    now = datetime.now()
    # Simple check lun-ven 9h-17h par défaut — peut être amélioré
    return 0 <= now.weekday() < 5 and 9 <= now.hour < 17

# ============================================================
# AUTHENTIFICATION
# ============================================================
async def verify_admin(credentials: HTTPBasicCredentials = Depends(security)):
    if credentials.username != ADMIN_USER or credentials.password != ADMIN_PASS:
        raise HTTPException(status_code=401, detail="Authentification échouée")
    return credentials.username

async def verify_api_key(x_api_key: str = Header(None)):
    """Vérifie la clé API d'un client."""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Clé API manquante. Utilisez le header X-API-Key.")
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM clients WHERE api_key = ? AND status = 'active'", (x_api_key,))
        client = await cursor.fetchone()
        if not client:
            raise HTTPException(status_code=401, detail="Clé API invalide ou compte désactivé")
        return dict(client)

async def get_client_by_phone(twilio_phone: str) -> Optional[Dict]:
    """Retrouve le client associé à un numéro Twilio."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM clients WHERE twilio_phone = ? AND status = 'active'",
            (twilio_phone,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None

# ============================================================
# DÉTECTION D'INTENTION
# ============================================================
def detect_intent(message: str) -> str:
    msg_lower = message.lower().strip()

    intents = {
        "transfer_human": ["parler à quelqu'un", "humain", "personne réelle",
                          "parler à une personne", "un agent", "talk to someone", "human"],
        "thanks": ["merci", "thanks", "thank you", "merci beaucoup"],
        "complaint": ["plainte", "complaint", "pas satisfait", "pas content",
                     "mécontent", "problème", "ne marche pas"],
        "rdv": ["rendez-vous", "rdv", "réserver", "booking", "disponible",
                "disponibilité", "créneau", "appointment"],
        "urgent": ["urgent", "urgence", "immédiatement", "tout de suite", "asap"],
        "prix": ["prix", "tarif", "coût", "combien", "coûte", "devis"],
        "horaires": ["heure", "ouvert", "fermé", "horaire", "quand", "fermeture"],
        "adresse": ["adresse", "où", "situé", "emplacement", "localisation"],
        "cancel": ["annuler", "annulation", "cancel", "décommander"],
        "confirm": ["confirmer", "confirmation", "oui c'est bon", "parfait"],
    }

    for intent, keywords in intents.items():
        if any(k in msg_lower for k in keywords):
            return intent
    return "general"

# ============================================================
# OPÉRATIONS DB MULTI-TENANT
# ============================================================
async def get_or_create_conversation(client_id: str, phone: str, channel: str = "sms") -> str:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT id FROM conversations WHERE phone = ? AND client_id = ? AND channel = ?",
            (phone, client_id, channel)
        )
        row = await cursor.fetchone()
        if row:
            return row[0]

        conv_id = generate_id("conv")
        now = datetime.now().isoformat()
        await db.execute(
            "INSERT INTO conversations (id, client_id, phone, channel, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (conv_id, client_id, phone, channel, now, now)
        )
        await db.commit()
        return conv_id

async def add_message(conv_id: str, client_id: str, role: str, content: str,
                      intent: str = None, response_time_ms: int = 0, tokens_used: int = 0):
    msg_id = generate_id("msg")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO messages (id, conversation_id, client_id, role, content, intent, response_time_ms, tokens_used, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (msg_id, conv_id, client_id, role, content, intent, response_time_ms, tokens_used, now)
        )
        await db.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conv_id))
        # Incrémenter compteur mensuel
        await db.execute("UPDATE clients SET messages_used_month = messages_used_month + 1 WHERE id = ?", (client_id,))
        await db.commit()

async def get_recent_history(conv_id: str, limit: int = 10) -> List[Dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT role, content, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?",
            (conv_id, limit)
        )
        rows = await cursor.fetchall()
        return [{"role": r[0], "content": r[1], "timestamp": r[2]} for r in reversed(rows)]

async def update_daily_stats(client_id: str, intent: str, response_ms: int = 0):
    today = datetime.now().strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT interactions FROM stats_daily WHERE client_id = ? AND date = ?",
            (client_id, today)
        )
        row = await cursor.fetchone()

        if row:
            updates = ["interactions = interactions + 1", "messages_in = messages_in + 1"]
            if intent == "rdv": updates.append("rdv_requests = rdv_requests + 1")
            elif intent == "complaint": updates.append("complaints = complaints + 1")
            elif intent == "transfer_human": updates.append("transfers = transfers + 1")
            else: updates.append("questions = questions + 1")

            query = f"UPDATE stats_daily SET {', '.join(updates)} WHERE client_id = ? AND date = ?"
            await db.execute(query, (client_id, today))
        else:
            stat_id = generate_id("stat")
            rdv = 1 if intent == "rdv" else 0
            complaints = 1 if intent == "complaint" else 0
            transfers = 1 if intent == "transfer_human" else 0
            questions = 1 if intent not in ["rdv", "complaint", "transfer_human"] else 0
            await db.execute(
                """INSERT INTO stats_daily (id, client_id, date, interactions, rdv_requests, questions, complaints, transfers, messages_in)
                   VALUES (?, ?, ?, 1, ?, ?, ?, ?, 1)""",
                (stat_id, client_id, today, rdv, questions, complaints, transfers)
            )
        await db.commit()

# ============================================================
# MOTEUR IA (CLAUDE) - MULTI-TENANT
# ============================================================
def get_system_prompt(client: Dict) -> str:
    now = datetime.now()
    days_fr = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
    current_day = days_fr[now.weekday()]

    hours_note = ""
    if not is_within_hours(client.get("hours", "")):
        hours_note = "\n- ⚠️ NOUS SOMMES ACTUELLEMENT FERMÉS."

    custom = client.get("custom_prompt", "")
    custom_section = f"\n\nINSTRUCTIONS SUPPLÉMENTAIRES DU PROPRIÉTAIRE :\n{custom}" if custom else ""

    return f"""Tu es l'assistant de "{client['business_name']}" ({client.get('business_type', 'Commerce')}) situé à {client.get('address', 'Québec')}.

INFORMATIONS SUR L'ENTREPRISE :
- Services et prix : {client.get('services', 'Services variés')}
- Heures d'ouverture : {client.get('hours', 'Lundi-Vendredi 9h-17h')}
- Adresse : {client.get('address', '')}
- Informations supplémentaires : {client.get('info', '')}

CONTEXTE :
- Nous sommes {current_day} le {now.strftime('%d/%m/%Y')} à {now.strftime('%Hh%M')}.{hours_note}

RÈGLES STRICTES :
1. Réponds TOUJOURS en français québécois naturel et professionnel
2. Utilise le vouvoiement
3. Sois CONCIS — maximum 2-3 phrases par SMS
4. Si on demande un rendez-vous, propose des créneaux selon les heures d'ouverture
5. Les prix sont en dollars canadiens ($)
6. Ne mentionne JAMAIS que tu es une intelligence artificielle
7. Agis comme un(e) secrétaire/réceptionniste chaleureux(se)
8. Si c'est urgent ou complexe, propose de faire rappeler par le propriétaire
9. Termine par une question ou une invitation si pertinent
10. Si tu ne connais pas la réponse, dis que tu vas vérifier et revenir rapidement

RENDEZ-VOUS :
- Si le client veut prendre rendez-vous, demande : la date souhaitée, l'heure préférée, et le service
- Confirme les détails avant de valider
- Mentionne que le rendez-vous sera confirmé par le commerce{custom_section}"""


async def generate_response(client: Dict, conv_id: str, message: str, max_retries: int = 3) -> tuple:
    """Génère une réponse IA. Retourne (response, response_time_ms, tokens_used)."""
    if not claude_client:
        return ("Merci pour votre message ! Nous allons vous répondre très bientôt.", 0, 0)

    history = await get_recent_history(conv_id, limit=10)
    messages = []
    for msg in history:
        messages.append({
            "role": "user" if msg["role"] == "client" else "assistant",
            "content": msg["content"]
        })
    messages.append({"role": "user", "content": message})

    start_time = datetime.now()
    for attempt in range(max_retries):
        try:
            response = claude_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                system=get_system_prompt(client),
                messages=messages
            )
            elapsed = (datetime.now() - start_time).total_seconds() * 1000
            tokens = response.usage.input_tokens + response.usage.output_tokens
            return (response.content[0].text, int(elapsed), tokens)
        except Exception as e:
            logger.warning(f"Claude API tentative #{attempt + 1}: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
            else:
                elapsed = (datetime.now() - start_time).total_seconds() * 1000
                return ("Merci pour votre message ! Un membre de notre équipe va vous répondre sous peu.", int(elapsed), 0)

# ============================================================
# ALERTES AU PROPRIÉTAIRE
# ============================================================
async def notify_owner(client: Dict, customer_phone: str, message: str, intent: str):
    if not twilio_client or not client.get("owner_phone") or not client.get("twilio_phone"):
        return
    if intent not in ["urgent", "rdv", "complaint", "transfer_human"]:
        return
    try:
        emoji = {"urgent": "🚨", "rdv": "📅", "complaint": "⚠️", "transfer_human": "👤"}.get(intent, "📢")
        alert = f"{emoji} NOVALIS - {intent.upper()}\nCommerce: {client['business_name']}\nClient: {customer_phone}\nMessage: {message[:100]}"
        twilio_client.messages.create(body=alert, from_=client["twilio_phone"], to=client["owner_phone"])
    except Exception as e:
        logger.error(f"Erreur alerte: {e}")

# ============================================================
# WEBHOOKS TWILIO - SMS (MULTI-TENANT)
# ============================================================
@app.post("/sms/incoming")
async def handle_incoming_sms(request: Request):
    """Webhook Twilio — route le SMS au bon client."""
    form = await request.form()
    from_number = form.get("From", "").strip()
    to_number = form.get("To", "").strip()
    body = form.get("Body", "").strip()

    logger.info(f"SMS reçu de {from_number} vers {to_number}: {body}")

    if not body:
        return Response(content="", media_type="text/xml")

    # Identifier le client par le numéro Twilio
    client = await get_client_by_phone(to_number)
    if not client:
        logger.warning(f"Aucun client pour le numéro {to_number}")
        twiml = MessagingResponse()
        twiml.message("Merci pour votre message. Ce service n'est pas encore configuré.")
        return Response(content=str(twiml), media_type="text/xml")

    # Vérifier la limite mensuelle
    if client["messages_used_month"] >= client["max_messages_month"]:
        twiml = MessagingResponse()
        twiml.message("Merci pour votre message ! Veuillez contacter directement le commerce.")
        return Response(content=str(twiml), media_type="text/xml")

    body = sanitize_input(body)
    conv_id = await get_or_create_conversation(client["id"], from_number, "sms")
    intent = detect_intent(body)
    await update_daily_stats(client["id"], intent)
    await add_message(conv_id, client["id"], "client", body, intent)

    # Générer réponse IA
    ai_response, response_ms, tokens = await generate_response(client, conv_id, body)
    await add_message(conv_id, client["id"], "agent", ai_response, response_time_ms=response_ms, tokens_used=tokens)

    # Alerter le propriétaire
    await notify_owner(client, from_number, body, intent)

    # Gérer les rendez-vous détectés
    if intent == "rdv":
        await create_appointment_from_intent(client["id"], from_number, body)

    twiml = MessagingResponse()
    twiml.message(ai_response)
    return Response(content=str(twiml), media_type="text/xml")

# ============================================================
# WEBHOOKS TWILIO - VOIX (MULTI-TENANT)
# ============================================================
@app.post("/voice/incoming")
async def handle_incoming_call(request: Request):
    form = await request.form()
    to_number = form.get("To", "").strip()
    client = await get_client_by_phone(to_number)

    response = VoiceResponse()
    biz_name = client["business_name"] if client else "notre service"

    gather = Gather(input="speech", action="/voice/respond", method="POST",
                    language="fr-CA", speechTimeout="auto", timeout=5)
    gather.say(f"Bonjour et merci d'appeler {biz_name}. Comment puis-je vous aider ?",
               voice="Polly.Gabrielle", language="fr-CA")
    response.append(gather)
    response.say("Je n'ai pas entendu. Vous pouvez aussi nous envoyer un texto. Bonne journée !",
                 voice="Polly.Gabrielle", language="fr-CA")
    return Response(content=str(response), media_type="text/xml")

@app.post("/voice/respond")
async def handle_voice_response(request: Request):
    form = await request.form()
    speech = form.get("SpeechResult", "")
    from_number = form.get("From", "")
    to_number = form.get("To", "")

    response = VoiceResponse()
    if not speech:
        response.say("Je n'ai pas compris. Vous pouvez nous envoyer un texto. Merci !",
                     voice="Polly.Gabrielle", language="fr-CA")
        return Response(content=str(response), media_type="text/xml")

    client = await get_client_by_phone(to_number)
    if not client:
        response.say("Ce service n'est pas encore configuré. Bonne journée !",
                     voice="Polly.Gabrielle", language="fr-CA")
        return Response(content=str(response), media_type="text/xml")

    conv_id = await get_or_create_conversation(client["id"], from_number, "voice")
    intent = detect_intent(speech)
    await update_daily_stats(client["id"], intent)
    await add_message(conv_id, client["id"], "client", speech, intent)

    ai_response, response_ms, tokens = await generate_response(client, conv_id, speech)
    await add_message(conv_id, client["id"], "agent", ai_response, response_time_ms=response_ms, tokens_used=tokens)
    await notify_owner(client, from_number, speech, intent)

    gather = Gather(input="speech", action="/voice/respond", method="POST",
                    language="fr-CA", speechTimeout="auto", timeout=5)
    gather.say(ai_response, voice="Polly.Gabrielle", language="fr-CA")
    response.append(gather)
    response.say("Merci d'avoir appelé. Bonne journée !", voice="Polly.Gabrielle", language="fr-CA")
    return Response(content=str(response), media_type="text/xml")

# ============================================================
# MESSENGER WEBHOOK (MULTI-TENANT)
# ============================================================
@app.get("/messenger/webhook")
async def verify_messenger(request: Request):
    params = request.query_params
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == FB_VERIFY_TOKEN:
        return Response(content=params.get("hub.challenge", ""), media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")

@app.post("/messenger/webhook")
async def handle_messenger(request: Request):
    data = await request.json()
    for entry in data.get("entry", []):
        for event in entry.get("messaging", []):
            sender_id = event.get("sender", {}).get("id", "")
            message = event.get("message", {}).get("text", "")
            if not message:
                continue
            message = sanitize_input(message)
            # Pour Messenger multi-tenant, on utilise le recipient ID pour identifier le client
            recipient_id = event.get("recipient", {}).get("id", "")
            # Trouver le client (chercher par fb_page_token association — simplifié ici)
            async with aiosqlite.connect(DB_PATH) as db:
                db.row_factory = aiosqlite.Row
                cursor = await db.execute("SELECT * FROM clients WHERE fb_page_token != '' AND status = 'active' LIMIT 1")
                client_row = await cursor.fetchone()
            if not client_row:
                continue
            client = dict(client_row)

            phone_key = f"messenger_{sender_id}"
            conv_id = await get_or_create_conversation(client["id"], phone_key, "messenger")
            intent = detect_intent(message)
            await update_daily_stats(client["id"], intent)
            await add_message(conv_id, client["id"], "client", message, intent)
            ai_response, response_ms, tokens = await generate_response(client, conv_id, message)
            await add_message(conv_id, client["id"], "agent", ai_response, response_time_ms=response_ms, tokens_used=tokens)

            if client.get("fb_page_token"):
                try:
                    http_requests.post(
                        "https://graph.facebook.com/v18.0/me/messages",
                        params={"access_token": client["fb_page_token"]},
                        json={"recipient": {"id": sender_id}, "message": {"text": ai_response}}
                    )
                except Exception as e:
                    logger.error(f"Erreur Messenger: {e}")
            await notify_owner(client, sender_id, message, intent)
    return {"status": "ok"}

# ============================================================
# GESTION DE RENDEZ-VOUS
# ============================================================
async def create_appointment_from_intent(client_id: str, phone: str, message: str):
    """Crée un rendez-vous en attente à partir d'une détection d'intention."""
    appt_id = generate_id("appt")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO appointments (id, client_id, customer_phone, service, date, time, status, notes, created_at, updated_at)
               VALUES (?, ?, ?, '', 'À déterminer', 'À déterminer', 'pending', ?, ?, ?)""",
            (appt_id, client_id, phone, f"Demande originale: {message[:200]}", now, now)
        )
        await db.commit()
    return appt_id

# ============================================================
# API PUBLIQUE — GESTION CLIENTS (admin)
# ============================================================
@app.post("/api/v1/clients")
async def create_client(request: Request, username: str = Depends(verify_admin)):
    """Crée un nouveau client sur la plateforme."""
    data = await request.json()
    required = ["business_name", "owner_name", "owner_email"]
    for field in required:
        if field not in data:
            raise HTTPException(status_code=400, detail=f"Champ requis manquant: {field}")

    client_id = generate_id("client")
    api_key = generate_api_key()
    now = datetime.now().isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO clients (id, business_name, business_type, services, hours, address, info,
                               owner_name, owner_email, owner_phone, twilio_phone, fb_page_token,
                               api_key, plan, status, custom_prompt, language, max_messages_month,
                               created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'fr-CA', ?, ?, ?)
        """, (
            client_id, data["business_name"], data.get("business_type", "Commerce"),
            data.get("services", ""), data.get("hours", "Lundi-Vendredi 9h-17h"),
            data.get("address", ""), data.get("info", ""),
            data["owner_name"], data["owner_email"],
            data.get("owner_phone", ""), data.get("twilio_phone", ""),
            data.get("fb_page_token", ""), api_key,
            data.get("plan", "starter"), data.get("custom_prompt", ""),
            data.get("max_messages_month", 500), now, now
        ))
        await db.commit()

    return {
        "id": client_id,
        "api_key": api_key,
        "business_name": data["business_name"],
        "status": "active",
        "message": f"Client créé avec succès. Clé API: {api_key}"
    }

@app.get("/api/v1/clients")
async def list_clients(username: str = Depends(verify_admin)):
    """Liste tous les clients."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, business_name, business_type, owner_name, owner_email, plan, status, twilio_phone, messages_used_month, max_messages_month, created_at FROM clients ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

@app.get("/api/v1/clients/{client_id}")
async def get_client(client_id: str, username: str = Depends(verify_admin)):
    """Détails d'un client."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM clients WHERE id = ?", (client_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Client non trouvé")
        return dict(row)

@app.put("/api/v1/clients/{client_id}")
async def update_client(client_id: str, request: Request, username: str = Depends(verify_admin)):
    """Met à jour un client."""
    data = await request.json()
    allowed_fields = ["business_name", "business_type", "services", "hours", "address", "info",
                      "owner_name", "owner_email", "owner_phone", "twilio_phone", "fb_page_token",
                      "plan", "status", "custom_prompt", "max_messages_month"]

    updates = []
    values = []
    for field in allowed_fields:
        if field in data:
            updates.append(f"{field} = ?")
            values.append(data[field])

    if not updates:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")

    updates.append("updated_at = ?")
    values.append(datetime.now().isoformat())
    values.append(client_id)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE clients SET {', '.join(updates)} WHERE id = ?", values)
        await db.commit()
    return {"status": "updated", "client_id": client_id}

@app.delete("/api/v1/clients/{client_id}")
async def deactivate_client(client_id: str, username: str = Depends(verify_admin)):
    """Désactive un client (ne supprime pas les données)."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE clients SET status = 'inactive', updated_at = ? WHERE id = ?",
                        (datetime.now().isoformat(), client_id))
        await db.commit()
    return {"status": "deactivated", "client_id": client_id}

# ============================================================
# API PUBLIQUE — POUR LES CLIENTS (via API key)
# ============================================================
@app.get("/api/v1/me")
async def get_my_info(client: dict = Depends(verify_api_key)):
    """Info du client authentifié."""
    return {
        "id": client["id"],
        "business_name": client["business_name"],
        "plan": client["plan"],
        "messages_used": client["messages_used_month"],
        "messages_limit": client["max_messages_month"],
        "status": client["status"]
    }

@app.get("/api/v1/me/stats")
async def get_my_stats(days: int = Query(30, ge=1, le=365), client: dict = Depends(verify_api_key)):
    """Stats du client authentifié."""
    async with aiosqlite.connect(DB_PATH) as db:
        start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        cursor = await db.execute(
            "SELECT date, interactions, rdv_requests, questions, complaints, transfers FROM stats_daily WHERE client_id = ? AND date >= ? ORDER BY date",
            (client["id"], start)
        )
        rows = await cursor.fetchall()

        # Totaux
        total_interactions = sum(r[1] for r in rows)
        total_rdv = sum(r[2] for r in rows)
        total_questions = sum(r[3] for r in rows)
        total_complaints = sum(r[4] for r in rows)

        return {
            "period_days": days,
            "summary": {
                "total_interactions": total_interactions,
                "rdv_requests": total_rdv,
                "questions_answered": total_questions,
                "complaints": total_complaints,
                "estimated_calls_saved": total_interactions,
                "estimated_hours_saved": round(total_interactions * 3 / 60, 1),
                "estimated_value_saved": f"{total_interactions * 5}$"
            },
            "daily": [
                {"date": r[0], "interactions": r[1], "rdv": r[2], "questions": r[3], "complaints": r[4], "transfers": r[5]}
                for r in rows
            ]
        }

@app.get("/api/v1/me/conversations")
async def get_my_conversations(client: dict = Depends(verify_api_key)):
    """Conversations du client."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("""
            SELECT c.id, c.phone, c.channel, c.status, c.updated_at, COUNT(m.id) as msg_count
            FROM conversations c LEFT JOIN messages m ON c.id = m.conversation_id
            WHERE c.client_id = ? GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 100
        """, (client["id"],))
        rows = await cursor.fetchall()
        return [{"id": r[0], "phone": r[1], "channel": r[2], "status": r[3],
                 "last_activity": r[4], "message_count": r[5]} for r in rows]

@app.get("/api/v1/me/conversations/{conv_id}")
async def get_my_conversation_detail(conv_id: str, client: dict = Depends(verify_api_key)):
    """Détails d'une conversation."""
    async with aiosqlite.connect(DB_PATH) as db:
        # Vérifier ownership
        cursor = await db.execute("SELECT id FROM conversations WHERE id = ? AND client_id = ?", (conv_id, client["id"]))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Conversation non trouvée")

        cursor = await db.execute(
            "SELECT role, content, intent, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp",
            (conv_id,)
        )
        rows = await cursor.fetchall()
        return [{"role": r[0], "content": r[1], "intent": r[2], "timestamp": r[3]} for r in rows]

@app.get("/api/v1/me/appointments")
async def get_my_appointments(status: str = Query(None), client: dict = Depends(verify_api_key)):
    """Liste les rendez-vous du client."""
    async with aiosqlite.connect(DB_PATH) as db:
        query = "SELECT * FROM appointments WHERE client_id = ?"
        params = [client["id"]]
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC LIMIT 100"
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

@app.put("/api/v1/me/appointments/{appt_id}")
async def update_my_appointment(appt_id: str, request: Request, client: dict = Depends(verify_api_key)):
    """Met à jour un rendez-vous."""
    data = await request.json()
    allowed = ["customer_name", "service", "date", "time", "duration_min", "status", "notes"]
    updates, values = [], []
    for f in allowed:
        if f in data:
            updates.append(f"{f} = ?")
            values.append(data[f])
    if not updates:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    updates.append("updated_at = ?")
    values.extend([datetime.now().isoformat(), appt_id, client["id"]])
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE appointments SET {', '.join(updates)} WHERE id = ? AND client_id = ?", values)
        await db.commit()
    return {"status": "updated"}

@app.get("/api/v1/me/transfers")
async def get_my_transfers(client: dict = Depends(verify_api_key)):
    """Transferts en attente."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT id, phone, last_message, requested_at FROM pending_transfers WHERE client_id = ? ORDER BY requested_at DESC",
            (client["id"],)
        )
        rows = await cursor.fetchall()
        return [{"id": r[0], "phone": r[1], "last_message": r[2], "requested_at": r[3]} for r in rows]

@app.delete("/api/v1/me/transfers/{transfer_id}")
async def resolve_my_transfer(transfer_id: str, client: dict = Depends(verify_api_key)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM pending_transfers WHERE id = ? AND client_id = ?", (transfer_id, client["id"]))
        await db.commit()
    return {"status": "resolved"}

# ============================================================
# API PUBLIQUE — ENVOYER UN MESSAGE (pour intégrations)
# ============================================================
@app.post("/api/v1/me/send")
async def send_message_api(request: Request, client: dict = Depends(verify_api_key)):
    """Envoie un message à un client (via l'API)."""
    data = await request.json()
    to_phone = data.get("to")
    message = data.get("message")
    if not to_phone or not message:
        raise HTTPException(status_code=400, detail="'to' et 'message' requis")
    if not twilio_client or not client.get("twilio_phone"):
        raise HTTPException(status_code=400, detail="Twilio non configuré pour ce client")
    try:
        twilio_client.messages.create(body=message, from_=client["twilio_phone"], to=to_phone)
        return {"status": "sent", "to": to_phone}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================
# ANALYTICS AVANCÉS — RAPPORT ROI
# ============================================================
@app.get("/api/v1/me/roi")
async def get_roi_report(client: dict = Depends(verify_api_key)):
    """Rapport ROI pour le client — utile pour justifier la valeur du service."""
    async with aiosqlite.connect(DB_PATH) as db:
        # Stats des 30 derniers jours
        start = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        cursor = await db.execute(
            "SELECT SUM(interactions), SUM(rdv_requests), SUM(questions), SUM(complaints), SUM(transfers) FROM stats_daily WHERE client_id = ? AND date >= ?",
            (client["id"], start)
        )
        row = await cursor.fetchone()
        total = row[0] or 0
        rdv = row[1] or 0
        questions = row[2] or 0
        complaints = row[3] or 0
        transfers = row[4] or 0

        # Messages totaux
        cursor = await db.execute(
            "SELECT COUNT(*) FROM messages WHERE client_id = ? AND timestamp >= ?",
            (client["id"], f"{start}T00:00:00")
        )
        msg_count = (await cursor.fetchone())[0] or 0

        # Conversations uniques
        cursor = await db.execute(
            "SELECT COUNT(DISTINCT id) FROM conversations WHERE client_id = ? AND updated_at >= ?",
            (client["id"], f"{start}T00:00:00")
        )
        unique_convs = (await cursor.fetchone())[0] or 0

        # Calculs ROI
        avg_call_cost = 5.00  # coût moyen d'un appel/interaction humaine ($)
        avg_call_duration_min = 3  # durée moyenne
        hours_saved = round(total * avg_call_duration_min / 60, 1)
        money_saved = round(total * avg_call_cost, 2)

        plan_cost = {"starter": 39, "pro": 99, "enterprise": 249}.get(client.get("plan", "starter"), 39)
        roi_ratio = round(money_saved / plan_cost, 1) if plan_cost > 0 else 0

    return {
        "period": "30 derniers jours",
        "interactions": {
            "total": total,
            "rdv_requests": rdv,
            "questions_answered": questions,
            "complaints_handled": complaints,
            "transfers_to_human": transfers,
            "messages_total": msg_count,
            "unique_conversations": unique_convs
        },
        "roi": {
            "hours_saved": hours_saved,
            "estimated_savings": f"{money_saved}$",
            "plan_cost": f"{plan_cost}$/mois",
            "roi_ratio": f"{roi_ratio}x",
            "calls_avoided": total - transfers,
            "availability": "24/7 vs heures d'ouverture"
        },
        "insights": [
            f"Novalis a traité {total} interactions ce mois, sauvant environ {hours_saved} heures de travail.",
            f"{rdv} demandes de rendez-vous gérées automatiquement.",
            f"ROI de {roi_ratio}x — chaque dollar investi a généré {roi_ratio}$ en valeur.",
            f"Disponible 24/7 : vos clients obtiennent des réponses même en dehors des heures d'ouverture."
        ]
    }

# ============================================================
# R&D LOG — DOCUMENTATION RS&DE
# ============================================================
@app.post("/api/v1/rd/log")
async def add_rd_entry(request: Request, username: str = Depends(verify_admin)):
    """Ajoute une entrée au journal R&D (pour RS&DE)."""
    data = await request.json()
    entry_id = generate_id("rd")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO rd_log (id, category, title, description, hours, technical_details, results, date, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (entry_id, data.get("category", "development"), data.get("title", ""),
             data.get("description", ""), data.get("hours", 0),
             data.get("technical_details", ""), data.get("results", ""),
             data.get("date", now[:10]), now)
        )
        await db.commit()
    return {"id": entry_id, "status": "logged"}

@app.get("/api/v1/rd/log")
async def get_rd_log(start_date: str = Query(None), end_date: str = Query(None),
                     username: str = Depends(verify_admin)):
    """Récupère le journal R&D."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        query = "SELECT * FROM rd_log"
        params = []
        conditions = []
        if start_date:
            conditions.append("date >= ?")
            params.append(start_date)
        if end_date:
            conditions.append("date <= ?")
            params.append(end_date)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY date DESC"

        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()

        entries = [dict(r) for r in rows]
        total_hours = sum(e.get("hours", 0) for e in entries)

        return {
            "entries": entries,
            "total_entries": len(entries),
            "total_hours": total_hours,
            "summary": f"{len(entries)} entrées R&D totalisant {total_hours} heures"
        }

@app.get("/api/v1/rd/export")
async def export_rd_log(format: str = Query("csv"), username: str = Depends(verify_admin)):
    """Exporte le journal R&D en CSV (pour RS&DE)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM rd_log ORDER BY date")
        rows = await cursor.fetchall()

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Date", "Catégorie", "Titre", "Description", "Heures", "Détails techniques", "Résultats"])
        for r in rows:
            r = dict(r)
            writer.writerow([r["date"], r["category"], r["title"], r["description"],
                           r["hours"], r["technical_details"], r["results"]])
        return Response(content=output.getvalue(), media_type="text/csv",
                       headers={"Content-Disposition": "attachment; filename=novalis_rd_log.csv"})
    else:
        return [dict(r) for r in rows]

# ============================================================
# CATALOGUE DE SERVICES (public)
# ============================================================
@app.get("/api/v1/services")
async def get_service_catalog():
    """Catalogue de services Novalis — public, pas besoin d'auth."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, name, category, description, features, price_type, price_from, price_to, delivery_days FROM service_catalog WHERE is_active = 1 ORDER BY order_num"
        )
        rows = await cursor.fetchall()
        return [
            {**dict(r), "features": dict(r)["features"].split("|") if dict(r)["features"] else []}
            for r in rows
        ]

@app.post("/api/v1/services")
async def add_service(request: Request, username: str = Depends(verify_admin)):
    """Ajoute un service au catalogue."""
    data = await request.json()
    svc_id = generate_id("svc")
    now = datetime.now().isoformat()
    features = "|".join(data.get("features", [])) if isinstance(data.get("features"), list) else data.get("features", "")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO service_catalog (id, name, category, description, features, price_type, price_from, price_to, delivery_days, is_active, order_num, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 99, ?)""",
            (svc_id, data.get("name",""), data.get("category","custom"), data.get("description",""),
             features, data.get("price_type","quote"), data.get("price_from",0),
             data.get("price_to",0), data.get("delivery_days",14), now)
        )
        await db.commit()
    return {"id": svc_id, "status": "created"}

# ============================================================
# PROJETS / MANDATS D'AUTOMATISATION
# ============================================================
@app.post("/api/v1/projects")
async def create_project(request: Request, username: str = Depends(verify_admin)):
    """Crée un nouveau projet/mandat pour un client."""
    data = await request.json()
    if not data.get("client_id") or not data.get("title"):
        raise HTTPException(status_code=400, detail="client_id et title requis")
    proj_id = generate_id("proj")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO projects (id, client_id, title, description, service_type, status, priority,
               budget, quote_amount, start_date, deadline, deliverables, notes, progress, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'inquiry', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
            (proj_id, data["client_id"], data["title"], data.get("description",""),
             data.get("service_type","custom"), data.get("priority","normal"),
             data.get("budget",""), data.get("quote_amount",0),
             data.get("start_date",""), data.get("deadline",""),
             data.get("deliverables",""), data.get("notes",""), now, now)
        )
        await db.commit()
    return {"id": proj_id, "status": "created"}

@app.get("/api/v1/projects")
async def list_all_projects(status: str = Query(None), username: str = Depends(verify_admin)):
    """Liste tous les projets (admin)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        query = """SELECT p.*, c.business_name, c.owner_name FROM projects p
                   JOIN clients c ON p.client_id = c.id"""
        params = []
        if status:
            query += " WHERE p.status = ?"
            params.append(status)
        query += " ORDER BY p.updated_at DESC"
        cursor = await db.execute(query, params)
        return [dict(r) for r in await cursor.fetchall()]

@app.get("/api/v1/projects/{proj_id}")
async def get_project(proj_id: str, username: str = Depends(verify_admin)):
    """Détails d'un projet avec tâches et messages."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM projects WHERE id = ?", (proj_id,))
        proj = await cursor.fetchone()
        if not proj:
            raise HTTPException(status_code=404, detail="Projet non trouve")
        proj = dict(proj)

        cursor = await db.execute("SELECT * FROM project_tasks WHERE project_id = ? ORDER BY order_num", (proj_id,))
        proj["tasks"] = [dict(r) for r in await cursor.fetchall()]

        cursor = await db.execute("SELECT * FROM project_messages WHERE project_id = ? ORDER BY created_at", (proj_id,))
        proj["messages"] = [dict(r) for r in await cursor.fetchall()]
    return proj

@app.put("/api/v1/projects/{proj_id}")
async def update_project(proj_id: str, request: Request, username: str = Depends(verify_admin)):
    """Met à jour un projet."""
    data = await request.json()
    allowed = ["title","description","service_type","status","priority","budget","quote_amount",
               "paid_amount","start_date","deadline","completed_date","deliverables","notes","progress"]
    updates, values = [], []
    for f in allowed:
        if f in data:
            updates.append(f"{f} = ?")
            values.append(data[f])
    if not updates:
        raise HTTPException(status_code=400, detail="Rien a mettre a jour")
    updates.append("updated_at = ?")
    values.extend([datetime.now().isoformat(), proj_id])
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE projects SET {', '.join(updates)} WHERE id = ?", values)
        await db.commit()
    return {"status": "updated"}

@app.post("/api/v1/projects/{proj_id}/tasks")
async def add_project_task(proj_id: str, request: Request, username: str = Depends(verify_admin)):
    """Ajoute une tâche à un projet."""
    data = await request.json()
    task_id = generate_id("task")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO project_tasks (id, project_id, title, description, status, order_num, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'todo', ?, ?, ?)""",
            (task_id, proj_id, data.get("title",""), data.get("description",""),
             data.get("order_num",0), now, now)
        )
        await db.commit()
    return {"id": task_id, "status": "created"}

@app.put("/api/v1/projects/{proj_id}/tasks/{task_id}")
async def update_project_task(proj_id: str, task_id: str, request: Request, username: str = Depends(verify_admin)):
    """Met à jour une tâche."""
    data = await request.json()
    allowed = ["title","description","status","order_num"]
    updates, values = [], []
    for f in allowed:
        if f in data:
            updates.append(f"{f} = ?")
            values.append(data[f])
    if not updates:
        raise HTTPException(status_code=400, detail="Rien a mettre a jour")
    updates.append("updated_at = ?")
    values.extend([datetime.now().isoformat(), task_id, proj_id])
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE project_tasks SET {', '.join(updates)} WHERE id = ? AND project_id = ?", values)
        await db.commit()
    return {"status": "updated"}

@app.post("/api/v1/projects/{proj_id}/messages")
async def add_project_message(proj_id: str, request: Request, username: str = Depends(verify_admin)):
    """Ajoute un message à un projet."""
    data = await request.json()
    msg_id = generate_id("pmsg")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO project_messages (id, project_id, sender, content, attachment_url, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (msg_id, proj_id, data.get("sender","novalis"), data.get("content",""), data.get("attachment_url",""), now)
        )
        await db.commit()
    return {"id": msg_id, "status": "sent"}

# ============================================================
# PORTAIL CLIENT — PROJETS (via API key)
# ============================================================
@app.get("/api/v1/me/projects")
async def get_my_projects(status: str = Query(None), client: dict = Depends(verify_api_key)):
    """Liste les projets du client."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        query = "SELECT * FROM projects WHERE client_id = ?"
        params = [client["id"]]
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY updated_at DESC"
        cursor = await db.execute(query, params)
        return [dict(r) for r in await cursor.fetchall()]

@app.get("/api/v1/me/projects/{proj_id}")
async def get_my_project_detail(proj_id: str, client: dict = Depends(verify_api_key)):
    """Détails d'un projet du client avec tâches et messages."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM projects WHERE id = ? AND client_id = ?", (proj_id, client["id"]))
        proj = await cursor.fetchone()
        if not proj:
            raise HTTPException(status_code=404, detail="Projet non trouve")
        proj = dict(proj)

        cursor = await db.execute("SELECT * FROM project_tasks WHERE project_id = ? ORDER BY order_num", (proj_id,))
        proj["tasks"] = [dict(r) for r in await cursor.fetchall()]

        cursor = await db.execute("SELECT * FROM project_messages WHERE project_id = ? ORDER BY created_at", (proj_id,))
        proj["messages"] = [dict(r) for r in await cursor.fetchall()]
    return proj

@app.post("/api/v1/me/projects/{proj_id}/messages")
async def client_send_project_message(proj_id: str, request: Request, client: dict = Depends(verify_api_key)):
    """Le client envoie un message sur un projet."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT id FROM projects WHERE id = ? AND client_id = ?", (proj_id, client["id"]))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Projet non trouve")
    data = await request.json()
    msg_id = generate_id("pmsg")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO project_messages (id, project_id, sender, content, attachment_url, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (msg_id, proj_id, client["business_name"], data.get("content",""), data.get("attachment_url",""), now)
        )
        await db.commit()
    return {"id": msg_id, "status": "sent"}

# ============================================================
# DEMANDE DE SOUMISSION PUBLIQUE
# ============================================================
@app.post("/api/v1/inquiry")
async def submit_inquiry(request: Request):
    """Formulaire de soumission publique — pas besoin d'auth."""
    data = await request.json()
    required = ["name", "email", "service_type", "description"]
    for f in required:
        if not data.get(f):
            raise HTTPException(status_code=400, detail=f"Champ requis: {f}")

    # Créer le client s'il n'existe pas
    now = datetime.now().isoformat()
    client_id = generate_id("client")
    api_key = generate_api_key()
    proj_id = generate_id("proj")

    async with aiosqlite.connect(DB_PATH) as db:
        # Check si email existe déjà
        cursor = await db.execute("SELECT id, api_key FROM clients WHERE owner_email = ?", (data["email"],))
        existing = await cursor.fetchone()
        if existing:
            client_id = existing[0]
            api_key = existing[1]
        else:
            await db.execute(
                """INSERT INTO clients (id, business_name, owner_name, owner_email, owner_phone,
                   api_key, plan, status, created_at, updated_at, business_type, services, hours, address, info,
                   twilio_phone, fb_page_token, custom_prompt, language, max_messages_month, messages_used_month)
                   VALUES (?, ?, ?, ?, ?, ?, 'inquiry', 'active', ?, ?, '', '', '', '', '', '', '', '', 'fr-CA', 0, 0)""",
                (client_id, data.get("company", data["name"]), data["name"], data["email"],
                 data.get("phone",""), api_key, now, now)
            )

        # Créer le projet
        await db.execute(
            """INSERT INTO projects (id, client_id, title, description, service_type, status, priority,
               budget, quote_amount, deliverables, notes, progress, created_at, updated_at,
               start_date, deadline, completed_date, paid_amount)
               VALUES (?, ?, ?, ?, ?, 'inquiry', 'normal', ?, 0, '', ?, 0, ?, ?, '', '', '', 0)""",
            (proj_id, client_id, f"Demande: {data.get('service_type','custom')}",
             data["description"], data.get("service_type","custom"),
             data.get("budget",""), data.get("notes",""), now, now)
        )
        await db.commit()

    return {
        "status": "received",
        "project_id": proj_id,
        "message": "Merci! Nous avons recu votre demande et vous contacterons sous 24h.",
        "api_key": api_key
    }

# ============================================================
# ANALYTICS PLATEFORME (admin)
# ============================================================
@app.get("/api/v1/platform/stats")
async def platform_stats(username: str = Depends(verify_admin)):
    """Stats globales de la plateforme."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM clients WHERE status = 'active'")
        active_clients = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM conversations")
        total_convs = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM messages")
        total_msgs = (await cursor.fetchone())[0]

        cursor = await db.execute("SELECT COUNT(*) FROM appointments")
        total_appts = (await cursor.fetchone())[0]

        today = datetime.now().strftime("%Y-%m-%d")
        cursor = await db.execute("SELECT SUM(interactions) FROM stats_daily WHERE date = ?", (today,))
        today_interactions = (await cursor.fetchone())[0] or 0

        # MRR calculation
        cursor = await db.execute("SELECT plan, COUNT(*) FROM clients WHERE status = 'active' GROUP BY plan")
        plans = await cursor.fetchall()
        prices = {"starter": 39, "pro": 99, "enterprise": 249}
        mrr = sum(prices.get(p[0], 0) * p[1] for p in plans)

    return {
        "active_clients": active_clients,
        "total_conversations": total_convs,
        "total_messages": total_msgs,
        "total_appointments": total_appts,
        "today_interactions": today_interactions,
        "mrr": f"{mrr}$",
        "version": VERSION
    }

# ============================================================
# DASHBOARD ADMIN (HTML)
# ============================================================
@app.get("/", response_class=HTMLResponse)
async def dashboard(username: str = Depends(verify_admin)):
    """Admin dashboard — plateforme Novalis V3."""
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Novalis — Platform Admin</title>
    <style>
        *{{margin:0;padding:0;box-sizing:border-box;}}
        body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0e17;color:#e2e8f0;}}
        .container{{display:flex;height:100vh;}}
        .sidebar{{width:72px;background:#0f1419;border-right:1px solid #1a2332;padding:16px 0;display:flex;flex-direction:column;align-items:center;gap:8px;position:fixed;left:0;top:0;height:100vh;z-index:1000;}}
        .main-content{{margin-left:72px;flex:1;display:flex;flex-direction:column;}}
        .header{{background:#0f1419;border-bottom:1px solid #1a2332;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;}}
        .header h1{{color:#38bdf8;font-size:1.3rem;}}
        .content{{flex:1;overflow-y:auto;padding:24px;}}
        .nav-logo{{width:44px;height:44px;background:linear-gradient(135deg,#38bdf8,#34d399);border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#0a0e17;font-size:1.1rem;margin-bottom:12px;}}
        .nav-item{{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;color:#64748b;font-size:1.2rem;}}
        .nav-item:hover{{background:rgba(56,189,248,0.1);color:#38bdf8;}}
        .nav-item.active{{background:rgba(56,189,248,0.2);color:#38bdf8;}}
        .view{{display:none;}}.view.active{{display:block;}}
        .stats-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px;}}
        .stat-card{{background:linear-gradient(135deg,#1a2332,#0f1f2e);border:1px solid #1e3a5f;border-radius:14px;padding:20px;}}
        .stat-label{{color:#94a3b8;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;}}
        .stat-value{{font-size:2rem;font-weight:700;background:linear-gradient(135deg,#38bdf8,#34d399);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}}
        .panel{{background:#1a2332;border:1px solid #1e3a5f;border-radius:14px;padding:18px;margin-bottom:16px;}}
        .panel h3{{color:#38bdf8;margin-bottom:14px;font-size:1rem;}}
        .client-card{{background:#0f1f2e;border:1px solid #1e3a5f;border-radius:12px;padding:14px;margin-bottom:10px;cursor:pointer;transition:all 0.2s;}}
        .client-card:hover{{border-color:#38bdf8;}}
        .client-name{{color:#38bdf8;font-weight:600;font-size:1.05rem;}}
        .client-meta{{color:#94a3b8;font-size:0.8rem;margin-top:4px;}}
        .badge{{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:16px;font-size:0.7rem;font-weight:600;}}
        .badge.active{{background:rgba(52,211,153,0.2);color:#34d399;}}
        .badge.inactive{{background:rgba(148,163,184,0.15);color:#94a3b8;}}
        .badge.starter{{background:rgba(56,189,248,0.15);color:#38bdf8;}}
        .badge.pro{{background:rgba(168,85,247,0.15);color:#a855f7;}}
        .badge.enterprise{{background:rgba(251,191,36,0.15);color:#fbbf24;}}
        .btn{{background:#38bdf8;color:#0a0e17;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.85rem;}}
        .btn:hover{{background:#34d399;}}
        .btn-sm{{padding:5px 12px;font-size:0.75rem;}}
        input,textarea,select{{background:#0f1f2e;border:1px solid #1e3a5f;border-radius:8px;padding:10px;color:#e2e8f0;width:100%;font-size:0.9rem;margin-bottom:10px;}}
        input:focus,textarea:focus,select:focus{{outline:none;border-color:#38bdf8;}}
        label{{color:#94a3b8;font-size:0.8rem;display:block;margin-bottom:4px;}}
        .form-grid{{display:grid;grid-template-columns:1fr 1fr;gap:12px;}}
        @media(max-width:768px){{.sidebar{{width:56px;}}.main-content{{margin-left:56px;}}.stats-grid{{grid-template-columns:1fr;}}.form-grid{{grid-template-columns:1fr;}}}}
    </style>
</head>
<body>
<div class="container">
    <div class="sidebar">
        <div class="nav-logo">N</div>
        <div class="nav-item active" data-view="dashboard" title="Dashboard">📊</div>
        <div class="nav-item" data-view="clients" title="Clients">🏢</div>
        <div class="nav-item" data-view="newclient" title="Nouveau client">➕</div>
        <div class="nav-item" data-view="rdlog" title="Journal R&D">🔬</div>
        <div class="nav-item" data-view="api" title="API">🔗</div>
    </div>
    <div class="main-content">
        <div class="header">
            <h1>Novalis Platform V{VERSION}</h1>
            <div style="color:#94a3b8;font-size:0.85rem;"><span id="clock">--:--</span></div>
        </div>
        <div class="content">
            <!-- DASHBOARD -->
            <div class="view active" id="dashboard">
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-label">Clients actifs</div><div class="stat-value" id="pClients">0</div></div>
                    <div class="stat-card"><div class="stat-label">Conversations</div><div class="stat-value" id="pConvs">0</div></div>
                    <div class="stat-card"><div class="stat-label">Messages</div><div class="stat-value" id="pMsgs">0</div></div>
                    <div class="stat-card"><div class="stat-label">RDV</div><div class="stat-value" id="pAppts">0</div></div>
                    <div class="stat-card"><div class="stat-label">Aujourd'hui</div><div class="stat-value" id="pToday">0</div></div>
                    <div class="stat-card"><div class="stat-label">MRR</div><div class="stat-value" id="pMrr">0$</div></div>
                </div>
            </div>
            <!-- CLIENTS -->
            <div class="view" id="clients">
                <h2 style="color:#38bdf8;margin-bottom:16px;">Clients</h2>
                <div id="clientList"><div style="color:#94a3b8;text-align:center;padding:20px;">Chargement...</div></div>
            </div>
            <!-- NEW CLIENT -->
            <div class="view" id="newclient">
                <h2 style="color:#38bdf8;margin-bottom:16px;">Nouveau client</h2>
                <div class="panel">
                    <div class="form-grid">
                        <div><label>Nom du commerce *</label><input id="nc_name" placeholder="ex: Salon Beauté Plus"/></div>
                        <div><label>Type</label><input id="nc_type" placeholder="ex: Salon de coiffure" value="Commerce"/></div>
                        <div><label>Nom du propriétaire *</label><input id="nc_owner"/></div>
                        <div><label>Email *</label><input id="nc_email" type="email"/></div>
                        <div><label>Téléphone propriétaire</label><input id="nc_phone"/></div>
                        <div><label>Numéro Twilio</label><input id="nc_twilio" placeholder="+1..."/></div>
                        <div><label>Adresse</label><input id="nc_address"/></div>
                        <div><label>Heures d'ouverture</label><input id="nc_hours" value="Lundi-Vendredi 9h-17h"/></div>
                    </div>
                    <label>Services et prix</label><textarea id="nc_services" rows="3" placeholder="Coupe homme: 25$, Coupe femme: 45$..."></textarea>
                    <label>Infos supplémentaires</label><textarea id="nc_info" rows="2"></textarea>
                    <label>Plan</label><select id="nc_plan"><option value="starter">Starter (39$/mois - 500 msg)</option><option value="pro">Pro (99$/mois - 2000 msg)</option><option value="enterprise">Enterprise (249$/mois - illimité)</option></select>
                    <br/><button class="btn" onclick="createClient()">Créer le client</button>
                    <div id="nc_result" style="margin-top:12px;color:#34d399;"></div>
                </div>
            </div>
            <!-- R&D LOG -->
            <div class="view" id="rdlog">
                <h2 style="color:#38bdf8;margin-bottom:16px;">Journal R&D (RS&DE)</h2>
                <div class="panel">
                    <h3>Nouvelle entrée</h3>
                    <div class="form-grid">
                        <div><label>Catégorie</label><select id="rd_cat"><option value="nlp">NLP / Traitement du langage</option><option value="ml">Machine Learning</option><option value="automation">Automatisation</option><option value="integration">Intégration</option><option value="architecture">Architecture</option><option value="testing">Tests / Expérimentation</option></select></div>
                        <div><label>Heures</label><input id="rd_hours" type="number" step="0.5" value="1"/></div>
                    </div>
                    <label>Titre</label><input id="rd_title" placeholder="ex: Amélioration détection d'intention"/>
                    <label>Description</label><textarea id="rd_desc" rows="3" placeholder="Objectif et approche..."></textarea>
                    <label>Détails techniques</label><textarea id="rd_tech" rows="3" placeholder="Technologies, algorithmes, méthodes..."></textarea>
                    <label>Résultats</label><textarea id="rd_results" rows="2" placeholder="Résultats obtenus, métriques..."></textarea>
                    <button class="btn" onclick="addRdEntry()">Enregistrer</button>
                    <button class="btn" style="background:#64748b;margin-left:8px;" onclick="exportRd()">Exporter CSV</button>
                </div>
                <div class="panel" style="margin-top:16px;"><h3>Entrées récentes</h3><div id="rdEntries">Chargement...</div></div>
            </div>
            <!-- API DOCS -->
            <div class="view" id="api">
                <h2 style="color:#38bdf8;margin-bottom:16px;">Documentation API</h2>
                <div class="panel">
                    <h3>Endpoints publics (authentification par X-API-Key)</h3>
                    <div style="font-family:monospace;font-size:0.85rem;color:#cbd5e1;line-height:2;">
                        <div><span style="color:#34d399;">GET</span> /api/v1/me — Info du client</div>
                        <div><span style="color:#34d399;">GET</span> /api/v1/me/stats?days=30 — Statistiques</div>
                        <div><span style="color:#34d399;">GET</span> /api/v1/me/conversations — Liste conversations</div>
                        <div><span style="color:#34d399;">GET</span> /api/v1/me/conversations/{{id}} — Détails conversation</div>
                        <div><span style="color:#34d399;">GET</span> /api/v1/me/appointments — Rendez-vous</div>
                        <div><span style="color:#fbbf24;">PUT</span> /api/v1/me/appointments/{{id}} — Modifier RDV</div>
                        <div><span style="color:#34d399;">GET</span> /api/v1/me/transfers — Transferts en attente</div>
                        <div><span style="color:#e63946;">DELETE</span> /api/v1/me/transfers/{{id}} — Résoudre transfert</div>
                        <div><span style="color:#38bdf8;">POST</span> /api/v1/me/send — Envoyer un SMS</div>
                        <div><span style="color:#34d399;">GET</span> /api/v1/me/roi — Rapport ROI</div>
                    </div>
                    <div style="margin-top:16px;color:#94a3b8;font-size:0.8rem;">
                        Documentation interactive : <a href="/docs" style="color:#38bdf8;">/docs</a> (Swagger UI) · <a href="/redoc" style="color:#38bdf8;">/redoc</a> (ReDoc)
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
<script>
document.querySelectorAll('.nav-item[data-view]').forEach(n=>{{n.addEventListener('click',()=>{{
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
    n.classList.add('active');document.getElementById(n.dataset.view).classList.add('active');
    if(n.dataset.view==='clients')loadClients();
    if(n.dataset.view==='rdlog')loadRdLog();
}});}});

async function loadPlatformStats(){{
    try{{const r=await fetch('/api/v1/platform/stats');const d=await r.json();
    document.getElementById('pClients').textContent=d.active_clients;
    document.getElementById('pConvs').textContent=d.total_conversations;
    document.getElementById('pMsgs').textContent=d.total_messages;
    document.getElementById('pAppts').textContent=d.total_appointments;
    document.getElementById('pToday').textContent=d.today_interactions;
    document.getElementById('pMrr').textContent=d.mrr;
    }}catch(e){{}}
}}

async function loadClients(){{
    try{{const r=await fetch('/api/v1/clients');const d=await r.json();
    const l=document.getElementById('clientList');
    if(!d.length){{l.innerHTML='<div style="color:#94a3b8;text-align:center;padding:20px;">Aucun client</div>';return;}}
    l.innerHTML=d.map(c=>`<div class="client-card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <div class="client-name">${{c.business_name}}</div>
            <div><span class="badge ${{c.status}}">${{c.status}}</span> <span class="badge ${{c.plan}}">${{c.plan}}</span></div>
        </div>
        <div class="client-meta">${{c.owner_name}} · ${{c.owner_email}} · ${{c.twilio_phone||'Pas de tel'}} · ${{c.messages_used_month}}/${{c.max_messages_month}} msg</div>
    </div>`).join('');
    }}catch(e){{}}
}}

async function createClient(){{
    const data={{
        business_name:document.getElementById('nc_name').value,
        business_type:document.getElementById('nc_type').value,
        owner_name:document.getElementById('nc_owner').value,
        owner_email:document.getElementById('nc_email').value,
        owner_phone:document.getElementById('nc_phone').value,
        twilio_phone:document.getElementById('nc_twilio').value,
        address:document.getElementById('nc_address').value,
        hours:document.getElementById('nc_hours').value,
        services:document.getElementById('nc_services').value,
        info:document.getElementById('nc_info').value,
        plan:document.getElementById('nc_plan').value,
    }};
    try{{const r=await fetch('/api/v1/clients',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(data)}});
    const d=await r.json();
    document.getElementById('nc_result').innerHTML=`✅ Client créé!<br/>API Key: <code style="color:#fbbf24;">${{d.api_key}}</code><br/>Conservez cette clé précieusement.`;
    }}catch(e){{document.getElementById('nc_result').textContent='❌ Erreur: '+e;}}
}}

async function addRdEntry(){{
    const data={{
        category:document.getElementById('rd_cat').value,
        title:document.getElementById('rd_title').value,
        description:document.getElementById('rd_desc').value,
        hours:parseFloat(document.getElementById('rd_hours').value),
        technical_details:document.getElementById('rd_tech').value,
        results:document.getElementById('rd_results').value,
    }};
    try{{await fetch('/api/v1/rd/log',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(data)}});
    document.getElementById('rd_title').value='';document.getElementById('rd_desc').value='';
    document.getElementById('rd_tech').value='';document.getElementById('rd_results').value='';
    loadRdLog();
    }}catch(e){{}}
}}

async function loadRdLog(){{
    try{{const r=await fetch('/api/v1/rd/log');const d=await r.json();
    const el=document.getElementById('rdEntries');
    if(!d.entries.length){{el.innerHTML='<div style="color:#94a3b8;">Aucune entrée</div>';return;}}
    el.innerHTML=`<div style="color:#34d399;margin-bottom:12px;">${{d.summary}}</div>`+
    d.entries.slice(0,20).map(e=>`<div style="background:#0f1f2e;padding:12px;border-radius:8px;margin-bottom:8px;border-left:3px solid #38bdf8;">
        <div style="display:flex;justify-content:space-between;"><strong style="color:#38bdf8;">${{e.title}}</strong><span style="color:#94a3b8;font-size:0.8rem;">${{e.date}} · ${{e.hours}}h · ${{e.category}}</span></div>
        <div style="color:#cbd5e1;font-size:0.85rem;margin-top:4px;">${{e.description}}</div>
    </div>`).join('');
    }}catch(e){{}}
}}

function exportRd(){{window.location.href='/api/v1/rd/export?format=csv';}}

function tick(){{document.getElementById('clock').textContent=new Date().toLocaleTimeString('fr-CA',{{hour:'2-digit',minute:'2-digit'}});}}
loadPlatformStats();tick();setInterval(loadPlatformStats,10000);setInterval(tick,1000);
</script>
</body>
</html>"""

# ============================================================
# SANTÉ DU SERVEUR
# ============================================================
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "novalis-platform",
        "version": VERSION,
        "architecture": "multi-tenant-saas",
        "twilio_configured": bool(TWILIO_ACCOUNT_SID),
        "claude_configured": bool(ANTHROPIC_API_KEY),
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
