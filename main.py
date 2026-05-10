"""
NOVALIS - Agence IA / Plateforme SaaS (V5.0)
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
import html as html_module
import hashlib
import uuid
import secrets
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, HTTPException, Depends, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import aiosqlite
import anthropic
from twilio.rest import Client as TwilioClient
from twilio.twiml.messaging_response import MessagingResponse
from twilio.twiml.voice_response import VoiceResponse, Gather
from twilio.request_validator import RequestValidator
import requests as http_requests
import asyncio
import re
import smtplib
import math
import tempfile
import hmac
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# ============================================================
# CONFIGURATION
# ============================================================
load_dotenv()

# Clés API plateforme
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE = os.getenv("TWILIO_PHONE", "")
OWNER_PHONE = os.getenv("OWNER_PHONE", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")  # Sarah (FR)

# Admin plateforme
ADMIN_USER = os.getenv("ADMIN_USER", "admin")
_GENERATED_ADMIN_PASS = secrets.token_urlsafe(14)
ADMIN_PASS = os.getenv("ADMIN_PASS", _GENERATED_ADMIN_PASS)
PLATFORM_SECRET = os.getenv("PLATFORM_SECRET", secrets.token_hex(32))

# CORS
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

# Facebook
FB_VERIFY_TOKEN = os.getenv("FB_VERIFY_TOKEN", "novalis_verify_token")
FB_APP_SECRET   = os.getenv("FB_APP_SECRET", "")

# Base de données
DB_PATH = os.getenv("DATABASE_PATH", "novalis.db")

# Email (SMTP optionnel)
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "noreply@novalis.ai")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "novalisproia@gmail.com")

# Stripe (facturation abonnements — optionnel)
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_STARTER = os.getenv("STRIPE_PRICE_STARTER", "")
STRIPE_PRICE_PRO = os.getenv("STRIPE_PRICE_PRO", "")
STRIPE_PRICE_ENTERPRISE = os.getenv("STRIPE_PRICE_ENTERPRISE", "")
APP_URL = os.getenv("APP_URL", "")

# Vapi (agent vocal)
VAPI_API_KEY = os.getenv("VAPI_API_KEY", "")
VAPI_WEBHOOK_SECRET = os.getenv("VAPI_WEBHOOK_SECRET", "")

stripe = None
if STRIPE_SECRET_KEY:
    try:
        import stripe as _stripe
        _stripe.api_key = STRIPE_SECRET_KEY
        stripe = _stripe
        logging.getLogger("novalis").info("Stripe billing activé")
    except ImportError:
        logging.getLogger("novalis").warning("stripe package non installé — billing désactivé")

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("novalis")

# Version
VERSION = "6.0"

# Landing page HTML — lu depuis le fichier source pour éviter la duplication
def _load_landing_html() -> str:
    html_path = os.path.join(os.path.dirname(__file__), "landing.html")
    try:
        with open(html_path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return "<h1>Novalis — Agence IA</h1><p>Site en construction</p>"

LANDING_HTML = _load_landing_html()

# ============================================================
# APPLICATION FASTAPI
# ============================================================
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Novalis — Agence IA",
    description="Agence d'intelligence artificielle — automatisation sur mesure pour entreprises",
    version=VERSION,
    docs_url="/docs",
    redoc_url="/redoc"
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS != ["*"] else ["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key"],
)

# Serve React build assets (JS, CSS, images) — mounted before API routes so /assets/* is served
_FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(_FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(_FRONTEND_DIST, "assets")), name="assets")

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
                fb_page_id TEXT DEFAULT '',
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

        # === BASE DE CONNAISSANCES PAR CLIENT ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS knowledge_base (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                kb_type TEXT DEFAULT 'faq',
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id)
            )
        """)

        # === CAMPAGNES SMS/WHATSAPP ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS campaigns (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                name TEXT NOT NULL,
                message TEXT NOT NULL,
                channel TEXT DEFAULT 'sms',
                contacts TEXT DEFAULT '[]',
                status TEXT DEFAULT 'draft',
                scheduled_at TEXT DEFAULT '',
                sent_count INTEGER DEFAULT 0,
                delivered_count INTEGER DEFAULT 0,
                response_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id)
            )
        """)

        # === WEBHOOKS SORTANTS (intégrations CRM) ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS client_webhooks (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                url TEXT NOT NULL,
                events TEXT DEFAULT '["new_appointment","transfer_requested","new_message"]',
                secret TEXT NOT NULL,
                is_active INTEGER DEFAULT 1,
                last_triggered TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id)
            )
        """)

        # === RAPPORTS IA HEBDOMADAIRES ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS weekly_reports (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                week_start TEXT NOT NULL,
                summary TEXT NOT NULL,
                highlights TEXT DEFAULT '',
                recommendations TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id)
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

        # === RAG — CHUNKS DE CONNAISSANCES ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS knowledge_chunks (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                kb_id TEXT NOT NULL,
                chunk_text TEXT NOT NULL,
                chunk_index INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id)
            )
        """)
        # FTS5 pour recherche sémantique rapide
        await db.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts
            USING fts5(chunk_text, content=knowledge_chunks, content_rowid=rowid, tokenize='unicode61')
        """)

        # === ANALYTICS PAR CONVERSATION ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS conversation_analytics (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                conv_id TEXT NOT NULL UNIQUE,
                channel TEXT DEFAULT 'sms',
                message_count INTEGER DEFAULT 0,
                resolved INTEGER DEFAULT 0,
                escalated INTEGER DEFAULT 0,
                avg_sentiment REAL DEFAULT 0.0,
                first_response_ms INTEGER DEFAULT 0,
                date TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id)
            )
        """)

        # === RÈGLES D'ESCALADE INTELLIGENTES ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS escalation_rules (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                rule_type TEXT NOT NULL,
                rule_value TEXT NOT NULL,
                action TEXT DEFAULT 'notify',
                is_active INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id)
            )
        """)

        # === IDEMPOTENCE WEBHOOKS ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS processed_webhooks (
                message_sid TEXT PRIMARY KEY,
                created_at TEXT NOT NULL
            )
        """)

        # === AUDIO VOIX TEMPORAIRE (ElevenLabs) ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS voice_audio (
                id TEXT PRIMARY KEY,
                audio_bytes BLOB NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS vapi_calls (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL DEFAULT '',
                caller_phone TEXT DEFAULT '',
                caller_name TEXT DEFAULT '',
                call_intent TEXT DEFAULT '',
                resolution TEXT DEFAULT '',
                summary TEXT DEFAULT '',
                follow_up_required INTEGER DEFAULT 0,
                follow_up_note TEXT DEFAULT '',
                recording_url TEXT DEFAULT '',
                duration_seconds INTEGER DEFAULT 0,
                sentiment TEXT DEFAULT '',
                success_evaluation TEXT DEFAULT '',
                raw_payload TEXT DEFAULT '',
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

        # Migrations pour installations existantes
        migrations = [
            "ALTER TABLE clients ADD COLUMN fb_page_id TEXT DEFAULT ''",
            "ALTER TABLE clients ADD COLUMN stripe_customer_id TEXT DEFAULT ''",
            "ALTER TABLE clients ADD COLUMN portal_token TEXT DEFAULT ''",
            "ALTER TABLE clients ADD COLUMN portal_token_expires_at TEXT DEFAULT ''",
            "ALTER TABLE clients ADD COLUMN onboarding_step INTEGER DEFAULT 0",
            "ALTER TABLE messages ADD COLUMN sentiment_score REAL DEFAULT 0.0",
            "ALTER TABLE messages ADD COLUMN language TEXT DEFAULT 'fr'",
            "ALTER TABLE clients ADD COLUMN trial_expires_at TEXT DEFAULT ''",
            "ALTER TABLE clients ADD COLUMN trial_warning_sent INTEGER DEFAULT 0",
        ]
        for migration in migrations:
            try:
                await db.execute(migration)
                await db.commit()
            except Exception:
                pass  # Colonne déjà présente

        # Index pour les nouvelles tables
        await db.execute("CREATE INDEX IF NOT EXISTS idx_kb_client ON knowledge_base(client_id, is_active)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_campaigns_client ON campaigns(client_id, status)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_webhooks_client ON client_webhooks(client_id, is_active)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_chunks_client ON knowledge_chunks(client_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ca_client ON conversation_analytics(client_id, date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_escalation_client ON escalation_rules(client_id, is_active)")

        await db.commit()
        logger.info("Base de données V6.0 (agence IA premium) initialisée")


async def appointment_reminder_task():
    """Tâche background : envoie des rappels SMS 24h avant chaque rendez-vous."""
    while True:
        try:
            await asyncio.sleep(3600)  # Toutes les heures
            if not twilio_client:
                continue

            tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
            async with aiosqlite.connect(DB_PATH) as db:
                db.row_factory = aiosqlite.Row
                cursor = await db.execute("""
                    SELECT a.*, c.business_name, c.twilio_phone
                    FROM appointments a
                    JOIN clients c ON a.client_id = c.id
                    WHERE a.date = ? AND a.status = 'confirmed' AND a.customer_phone != ''
                    AND c.status = 'active'
                """, (tomorrow,))
                appointments = await cursor.fetchall()

            for appt in appointments:
                appt = dict(appt)
                try:
                    msg = (f"📅 Rappel — Votre rendez-vous chez {appt['business_name']} "
                           f"est demain le {appt['date']} à {appt['time']}."
                           f"{' Service: ' + appt['service'] if appt['service'] else ''} "
                           f"Pour annuler, répondez ANNULER.")
                    twilio_client.messages.create(
                        body=msg,
                        from_=appt["twilio_phone"],
                        to=appt["customer_phone"]
                    )
                    logger.info(f"Rappel RDV envoyé à {appt['customer_phone']}")
                except Exception as e:
                    logger.error(f"Erreur rappel RDV {appt['id']}: {e}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Erreur tâche rappels: {e}")

@app.on_event("startup")
async def startup():
    if not os.getenv("ADMIN_PASS"):
        logger.warning(f"⚠️  ADMIN_PASS non défini. Mot de passe généré pour cette session : {ADMIN_PASS}")
    if ALLOWED_ORIGINS == ["*"] and os.getenv("RAILWAY_ENVIRONMENT"):
        logger.warning("⚠️  CORS ouvert (*) en production. Définissez ALLOWED_ORIGINS dans Railway.")
    if not ANTHROPIC_API_KEY:
        logger.warning("⚠️  ANTHROPIC_API_KEY non définie — les réponses IA seront désactivées.")
    if not TWILIO_ACCOUNT_SID:
        logger.warning("⚠️  Twilio non configuré — SMS/Voix désactivés.")
    # SQLite WAL mode — bien meilleure performance en production (concurrent reads/writes)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA cache_size=10000")
        await db.execute("PRAGMA synchronous=NORMAL")
        await db.execute("PRAGMA temp_store=MEMORY")
    await init_db()
    await seed_service_catalog()
    asyncio.create_task(appointment_reminder_task())
    asyncio.create_task(weekly_report_task())
    asyncio.create_task(trial_monitor_task())
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
    """Vérifie si on est dans les heures d'ouverture selon la chaîne fournie.
    Format attendu : 'Lundi-Vendredi 9h-17h', '7j/7 8h-22h', 'Lun-Sam 10h-18h', etc.
    """
    # Heure locale du serveur (idéalement America/Montreal)
    now = datetime.now()

    h = (hours_str or "").lower().strip()

    # Extraire la plage horaire : "9h-17h", "9h30-17h", "9-17"
    time_match = re.search(r'(\d{1,2})h?\s*[-à]\s*(\d{1,2})h?', h)
    open_h = int(time_match.group(1)) if time_match else 9
    close_h = int(time_match.group(2)) if time_match else 17

    # Ouvert tous les jours ?
    if any(x in h for x in ["7j", "7/7", "tous les jours", "24h"]):
        return open_h <= now.hour < close_h

    # Samedi inclus ?
    includes_saturday = any(x in h for x in ["samedi", "sam."])
    # Dimanche inclus ?
    includes_sunday = any(x in h for x in ["dimanche", "dim."])

    max_weekday = 4  # lundi-vendredi par défaut
    if includes_sunday:
        max_weekday = 6
    elif includes_saturday:
        max_weekday = 5

    return now.weekday() <= max_weekday and open_h <= now.hour < close_h

# ============================================================
# AUTHENTIFICATION
# ============================================================
async def verify_admin(credentials: HTTPBasicCredentials = Depends(security)):
    user_ok = secrets.compare_digest(credentials.username.encode(), ADMIN_USER.encode())
    pass_ok = secrets.compare_digest(credentials.password.encode(), ADMIN_PASS.encode())
    if not (user_ok and pass_ok):
        raise HTTPException(status_code=401, detail="Authentification échouée",
                            headers={"WWW-Authenticate": "Basic"})
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

def validate_twilio_signature(request_url: str, params: dict, signature: str) -> bool:
    """Valide la signature Twilio. Fail-secure: rejette si token absent."""
    if not TWILIO_AUTH_TOKEN:
        return False
    validator = RequestValidator(TWILIO_AUTH_TOKEN)
    return validator.validate(request_url, params, signature)

async def send_email(to: str, subject: str, body: str):
    """Envoie un email via SMTP si configuré."""
    if not SMTP_HOST or not SMTP_USER:
        return
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to
        msg.attach(MIMEText(body, "html", "utf-8"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM, [to], msg.as_string())
        logger.info(f"Email envoyé à {to}")
    except Exception as e:
        logger.error(f"Erreur email: {e}")

async def provision_twilio_number(preferred_area_code: str = "819") -> Optional[str]:
    """Achète automatiquement un numéro Twilio local et configure les webhooks."""
    if not twilio_client or not APP_URL:
        return None
    try:
        # Chercher un numéro disponible dans l'area code préféré
        numbers = twilio_client.available_phone_numbers("CA").local.list(
            area_code=preferred_area_code, sms_enabled=True, voice_enabled=True, limit=1
        )
        if not numbers:
            # Fallback: n'importe quel numéro canadien
            numbers = twilio_client.available_phone_numbers("CA").local.list(
                sms_enabled=True, voice_enabled=True, limit=1
            )
        if not numbers:
            return None
        purchased = twilio_client.incoming_phone_numbers.create(
            phone_number=numbers[0].phone_number,
            sms_url=f"{APP_URL}/sms/incoming",
            sms_method="POST",
            voice_url=f"{APP_URL}/voice/incoming",
            voice_method="POST",
        )
        logger.info(f"Numéro Twilio acheté automatiquement : {purchased.phone_number}")
        return purchased.phone_number
    except Exception as e:
        logger.error(f"Erreur achat numéro Twilio: {e}")
        return None

async def is_trial_active(client: dict) -> bool:
    """Retourne True si le client est en trial valide."""
    expires = client.get("trial_expires_at", "")
    if not expires:
        return False
    try:
        return datetime.fromisoformat(expires) > datetime.now()
    except Exception:
        return False

async def check_and_notify_trial_expiry():
    """Tâche de fond — envoie emails J-2 et expiration trial."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM clients WHERE trial_expires_at != '' AND status = 'active' AND plan = 'trial'"
        )
        clients = await cursor.fetchall()
    for c in clients:
        c = dict(c)
        expires = c.get("trial_expires_at", "")
        if not expires:
            continue
        try:
            exp_dt = datetime.fromisoformat(expires)
        except Exception:
            continue
        days_left = (exp_dt - datetime.now()).days
        portal_url = f"{APP_URL}/portal?key={c['api_key']}" if APP_URL else f"/portal?key={c['api_key']}"
        pricing_url = f"{APP_URL}/#pricing" if APP_URL else "/#pricing"
        if days_left <= 2 and not c.get("trial_warning_sent"):
            asyncio.create_task(send_email(
                to=c["owner_email"],
                subject="⏳ Votre essai Novalis IA se termine dans 2 jours",
                body=f"""<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#090C0F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <div style="border-bottom:1px solid rgba(168,104,68,0.3);padding-bottom:24px;margin-bottom:32px;">
    <p style="margin:0;font-size:0.7rem;letter-spacing:0.2em;text-transform:uppercase;color:#A86844;">Novalis IA</p>
  </div>
  <h1 style="color:#EDE8DF;font-size:1.6rem;font-weight:400;margin:0 0 8px;font-style:italic;">Votre essai se termine bientôt</h1>
  <p style="color:#4A5260;font-size:1rem;line-height:1.6;margin:0 0 24px;">
    Bonjour {html_module.escape(c['owner_name'])}, il vous reste <strong style="color:#EDE8DF;">2 jours</strong> sur votre essai gratuit Novalis IA.
    Pour continuer à recevoir et répondre automatiquement à vos clients, choisissez un plan.
  </p>
  <div style="text-align:center;margin:32px 0;">
    <a href="{pricing_url}" style="display:inline-block;background:#A86844;color:#EDE8DF;text-decoration:none;padding:14px 36px;font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;border:1px solid #C4895A;">
      Voir les plans →
    </a>
  </div>
  <p style="color:#4A5260;font-size:0.78rem;">Questions ? <a href="mailto:{ADMIN_EMAIL}" style="color:#A86844;">{ADMIN_EMAIL}</a></p>
</div></body></html>"""
            ))
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute("UPDATE clients SET trial_warning_sent = 1 WHERE id = ?", (c["id"],))
                await db.commit()
        elif days_left <= 0:
            asyncio.create_task(send_email(
                to=c["owner_email"],
                subject="Votre essai Novalis IA est terminé — continuez maintenant",
                body=f"""<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#090C0F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <div style="border-bottom:1px solid rgba(168,104,68,0.3);padding-bottom:24px;margin-bottom:32px;">
    <p style="margin:0;font-size:0.7rem;letter-spacing:0.2em;text-transform:uppercase;color:#A86844;">Novalis IA</p>
  </div>
  <h1 style="color:#EDE8DF;font-size:1.6rem;font-weight:400;margin:0 0 8px;font-style:italic;">Votre essai est terminé</h1>
  <p style="color:#4A5260;font-size:1rem;line-height:1.6;margin:0 0 24px;">
    Bonjour {html_module.escape(c['owner_name'])}, votre essai gratuit de 7 jours est maintenant terminé.
    Choisissez un plan pour réactiver votre assistant IA et continuer à servir vos clients automatiquement.
  </p>
  <div style="text-align:center;margin:32px 0;">
    <a href="{pricing_url}" style="display:inline-block;background:#A86844;color:#EDE8DF;text-decoration:none;padding:14px 36px;font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;border:1px solid #C4895A;">
      Choisir mon plan →
    </a>
  </div>
  <p style="color:#4A5260;font-size:0.78rem;">Des questions ? On vous rappelle gratuitement — <a href="mailto:{ADMIN_EMAIL}" style="color:#A86844;">{ADMIN_EMAIL}</a></p>
</div></body></html>"""
            ))

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
                      intent: str = None, response_time_ms: int = 0, tokens_used: int = 0,
                      sentiment_score: float = 0.0, language: str = "fr"):
    msg_id = generate_id("msg")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO messages (id, conversation_id, client_id, role, content, intent,
               response_time_ms, tokens_used, sentiment_score, language, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (msg_id, conv_id, client_id, role, content, intent,
             response_time_ms, tokens_used, sentiment_score, language, now)
        )
        await db.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conv_id))
        await db.execute("UPDATE clients SET messages_used_month = messages_used_month + 1 WHERE id = ?", (client_id,))
        await db.commit()

async def _get_message_count(conv_id: str) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM messages WHERE conversation_id = ?", (conv_id,))
        row = await cursor.fetchone()
    return row[0] if row else 0


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

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 80) -> List[str]:
    """Découpe le texte en chunks avec chevauchement pour le RAG."""
    paragraphs = [p.strip() for p in re.split(r'\n{1,}', text) if p.strip()]
    chunks, current = [], ""
    for para in paragraphs:
        if len(current) + len(para) + 1 <= chunk_size:
            current = (current + "\n" + para).strip()
        else:
            if current:
                chunks.append(current)
            overlap_text = current[-overlap:] if len(current) > overlap else current
            current = (overlap_text + "\n" + para).strip() if overlap_text else para
    if current:
        chunks.append(current)
    return chunks if chunks else [text[:chunk_size]]


async def index_knowledge_chunks(client_id: str, kb_id: str, content: str):
    """Chunk et indexe un document KB dans FTS5 pour le RAG."""
    chunks = chunk_text(content)
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        # Supprimer anciens chunks de ce document
        await db.execute("DELETE FROM knowledge_chunks WHERE kb_id = ?", (kb_id,))
        for i, chunk in enumerate(chunks):
            chunk_id = generate_id("ck")
            await db.execute(
                "INSERT INTO knowledge_chunks (id, client_id, kb_id, chunk_text, chunk_index, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (chunk_id, client_id, kb_id, chunk, i, now)
            )
            # Mise à jour incrémentale FTS5 (O(1) vs O(n) pour rebuild)
            try:
                await db.execute(
                    "INSERT INTO knowledge_fts(rowid, chunk_text) SELECT rowid, chunk_text FROM knowledge_chunks WHERE id = ?",
                    (chunk_id,)
                )
            except Exception:
                pass
        await db.commit()


async def search_knowledge_rag(client_id: str, query: str, top_k: int = 4) -> str:
    """Recherche sémantique FTS5 dans la base de connaissances d'un client."""
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            # Préparer la requête FTS5 (échapper les caractères spéciaux)
            fts_query = " ".join([f'"{w}"' for w in query.split()[:8] if len(w) > 2])
            if not fts_query:
                raise ValueError("query vide")
            cursor = await db.execute("""
                SELECT kc.chunk_text
                FROM knowledge_fts fts
                JOIN knowledge_chunks kc ON fts.rowid = kc.rowid
                WHERE knowledge_fts MATCH ? AND kc.client_id = ?
                ORDER BY rank
                LIMIT ?
            """, (fts_query, client_id, top_k))
            rows = await cursor.fetchall()
            if rows:
                return "\n---\n".join(r[0] for r in rows)
        except Exception:
            pass
        # Fallback : recherche LIKE sur mots-clés
        words = [w for w in query.lower().split() if len(w) > 3][:5]
        if not words:
            return ""
        conds = " OR ".join(["LOWER(chunk_text) LIKE ?" for _ in words])
        cursor = await db.execute(
            f"SELECT chunk_text FROM knowledge_chunks WHERE ({conds}) AND client_id = ? LIMIT ?",
            [f"%{w}%" for w in words] + [client_id, top_k]
        )
        rows = await cursor.fetchall()
        return "\n---\n".join(r[0] for r in rows)


async def analyze_sentiment(text: str) -> float:
    """Analyse le sentiment d'un message. Retourne -1.0 (négatif) à 1.0 (positif)."""
    neg_kw = ["terrible","nul","incompétent","arnaque","remboursement","scandaleux",
              "honteux","mécontent","fâché","furieux","dégoûté","catastrophe","mensonge",
              "horrible","inacceptable","pourri","incompétence","ridicule"]
    pos_kw = ["excellent","parfait","merci","super","génial","très bien","satisfait",
              "bravo","fantastique","adorable","merci beaucoup","magnifique","impressionnant"]
    text_lower = text.lower()
    neg = sum(1 for k in neg_kw if k in text_lower)
    pos = sum(1 for k in pos_kw if k in text_lower)
    if neg >= 2: return -0.8
    if neg == 1 and pos == 0: return -0.4
    if pos >= 1 and neg == 0: return 0.7
    if not claude_client: return 0.0
    try:
        resp = claude_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=5,
            messages=[{"role": "user", "content":
                f"Rate sentiment -10 to 10 (integer only):\n{text[:200]}"}]
        )
        return max(-1.0, min(1.0, float(resp.content[0].text.strip()) / 10.0))
    except Exception:
        return 0.0


def detect_language(text: str) -> str:
    """Détecte la langue du message (fr/en)."""
    en_words = ["hello","hi","help","please","thank","thanks","what","when","where",
                "how","can you","i need","i want","do you","good morning","good evening",
                "sorry","excuse me","yes","no"]
    text_lower = text.lower()
    en_score = sum(1 for w in en_words if w in text_lower)
    return "en" if en_score >= 1 else "fr"


async def summarize_conversation(conv_id: str) -> str:
    """Génère un résumé de la conversation pour le handoff humain."""
    history = await get_recent_history(conv_id, limit=20)
    if not history:
        return "Aucun message."
    transcript = "\n".join([
        f"{'Client' if m['role'] == 'client' else 'IA'}: {m['content']}"
        for m in history
    ])
    if not claude_client:
        return transcript[:400]
    try:
        resp = claude_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=180,
            messages=[{"role": "user", "content":
                f"Résume en 2-3 phrases: problème principal, ton du client, action requise.\n\n{transcript[:1500]}"}]
        )
        return resp.content[0].text.strip()
    except Exception:
        return transcript[:300]


async def should_auto_escalate(client_id: str, sentiment: float, intent: str,
                                message_count: int, message: str) -> bool:
    """Détermine si la conversation doit être escaladée automatiquement."""
    if sentiment <= -0.7:
        return True
    if intent in ["complaint", "urgent"] and message_count >= 3:
        return True
    if intent == "transfer_human":
        return True
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM escalation_rules WHERE client_id = ? AND is_active = 1",
            (client_id,)
        )
        rules = [dict(r) for r in await cursor.fetchall()]
    for rule in rules:
        rtype, rval = rule["rule_type"], rule["rule_value"]
        if rtype == "sentiment_threshold" and sentiment <= float(rval):
            return True
        elif rtype == "keyword" and rval.lower() in message.lower():
            return True
        elif rtype == "message_count" and message_count >= int(rval):
            return True
    return False


async def track_conversation_analytics(client_id: str, conv_id: str, channel: str,
                                        sentiment: float, escalated: bool, response_ms: int):
    """Enregistre ou met à jour les analytics d'une conversation."""
    today = datetime.now().strftime("%Y-%m-%d")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT id, message_count, avg_sentiment FROM conversation_analytics WHERE conv_id = ?",
            (conv_id,)
        )
        row = await cursor.fetchone()
        if row:
            old_id, count, old_sent = row
            new_count = count + 1
            new_sent = (old_sent * count + sentiment) / new_count
            await db.execute(
                "UPDATE conversation_analytics SET message_count=?, avg_sentiment=?, escalated=? WHERE id=?",
                (new_count, new_sent, 1 if escalated else 0, old_id)
            )
        else:
            await db.execute(
                """INSERT INTO conversation_analytics
                   (id,client_id,conv_id,channel,message_count,resolved,escalated,
                    avg_sentiment,first_response_ms,date,created_at)
                   VALUES (?,?,?,?,1,0,?,?,?,?,?)""",
                (generate_id("ca"), client_id, conv_id, channel,
                 1 if escalated else 0, sentiment, response_ms, today, now)
            )
        await db.commit()


async def generate_elevenlabs_audio(text: str, voice_id: str = None) -> Optional[bytes]:
    """Synthétise la parole via ElevenLabs. Retourne bytes audio/mpeg ou None."""
    if not ELEVENLABS_API_KEY:
        return None
    vid = voice_id or ELEVENLABS_VOICE_ID
    try:
        resp = http_requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{vid}",
            headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
            json={"text": text, "model_id": "eleven_multilingual_v2",
                  "voice_settings": {"stability": 0.5, "similarity_boost": 0.8}},
            timeout=10
        )
        if resp.status_code == 200:
            return resp.content
    except Exception as e:
        logger.warning(f"ElevenLabs TTS erreur: {e}")
    return None


async def get_client_knowledge_base(client_id: str) -> str:
    """Récupère la base de connaissances active d'un client."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT title, content, kb_type FROM knowledge_base WHERE client_id = ? AND is_active = 1 ORDER BY kb_type, created_at",
            (client_id,)
        )
        rows = await cursor.fetchall()
    if not rows:
        return ""
    sections = []
    for title, content, kb_type in rows:
        sections.append(f"[{title}]\n{content}")
    return "\n\n".join(sections)


async def get_system_prompt(client: Dict, query: str = "", language: str = "fr") -> str:
    now = datetime.now()
    days_fr = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
    current_day = days_fr[now.weekday()]

    hours_note = ""
    if not is_within_hours(client.get("hours", "")):
        hours_note = "\n- ⚠️ NOUS SOMMES ACTUELLEMENT FERMÉS. Propose de rappeler le prochain jour ouvrable."

    custom = client.get("custom_prompt", "")
    custom_section = f"\n\nINSTRUCTIONS SPÉCIALES DU PROPRIÉTAIRE :\n{custom}" if custom else ""

    # RAG : recherche les chunks pertinents pour la question courante
    if query:
        rag_context = await search_knowledge_rag(client["id"], query)
    else:
        rag_context = ""

    # Fallback sur KB complète si RAG vide
    if not rag_context:
        kb_full = await get_client_knowledge_base(client["id"])
        kb_section = f"\n\nBASE DE CONNAISSANCES :\n{kb_full}" if kb_full else ""
    else:
        kb_section = f"\n\nINFORMATIONS PERTINENTES (extraites de votre base de connaissances) :\n{rag_context}"

    # Instruction de langue
    if language == "en":
        lang_rule = "The customer is writing in English. Respond naturally in English while keeping your helpful, warm persona. Use Canadian English."
        lang_preamble = "LANGUAGE RULE: " + lang_rule
    else:
        lang_preamble = "Réponds TOUJOURS en français québécois naturel et chaleureux. Utilise le vouvoiement."

    return f"""Tu es l'assistant virtuel de "{client['business_name']}" ({client.get('business_type', 'Commerce')}) situé à {client.get('address', 'Québec, Canada')}.

INFORMATIONS SUR L'ENTREPRISE :
- Services et prix : {client.get('services', 'Services variés')}
- Heures d'ouverture : {client.get('hours', 'Lundi-Vendredi 9h-17h')}
- Adresse : {client.get('address', '')}
- Infos additionnelles : {client.get('info', '')}

CONTEXTE ACTUEL :
- Nous sommes {current_day} le {now.strftime('%d/%m/%Y')} à {now.strftime('%Hh%M')}.{hours_note}{kb_section}

RÈGLES ABSOLUES :
1. {lang_preamble}
2. SMS / Voix : maximum 2-3 phrases. Direct et utile.
3. Pour les rendez-vous : demande date, heure préférée et service voulu
4. Prix en dollars canadiens ($). Toujours précis sur les prix si connus.
5. Ne révèle JAMAIS que tu es une IA — tu es un(e) assistant(e) du commerce
6. Pour les urgences ou plaintes : empathie immédiate, propose un rappel humain
7. Si tu ne connais pas la réponse : réponds honnêtement que tu vas vérifier
8. Utilise les informations pertinentes fournies ci-dessus pour répondre avec précision
9. Termine toujours par une question ou un appel à l'action pertinent{custom_section}"""


def select_model(message: str, intent: str, history_length: int) -> str:
    """Sélectionne Haiku ou Sonnet selon la complexité de la conversation."""
    # Sonnet pour les cas qui nécessitent plus de nuance
    if (len(message) > 200 or
            intent in ["complaint", "urgent"] or
            history_length > 8 or
            any(w in message.lower() for w in ["problème", "mécontent", "remboursement", "juridique", "avocat"])):
        return "claude-sonnet-4-6"
    # Haiku pour tout le reste (rapide, économique)
    return "claude-haiku-4-5-20251001"


async def generate_response(client: Dict, conv_id: str, message: str,
                            intent: str = "general", max_retries: int = 3) -> tuple:
    """Génère une réponse IA. Retourne (response, response_time_ms, tokens_used)."""
    if not claude_client:
        return ("Merci pour votre message ! Nous allons vous répondre très bientôt.", 0, 0)

    history = await get_recent_history(conv_id, limit=12)
    messages_payload = []
    for msg in history:
        messages_payload.append({
            "role": "user" if msg["role"] == "client" else "assistant",
            "content": msg["content"]
        })
    messages_payload.append({"role": "user", "content": message})

    language = detect_language(message)
    model = select_model(message, intent, len(history))
    system_text = await get_system_prompt(client, query=message, language=language)
    system_payload = [{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}]

    start_time = datetime.now()
    for attempt in range(max_retries):
        try:
            response = claude_client.messages.create(
                model=model,
                max_tokens=400,
                system=system_payload,
                messages=messages_payload,
                extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"}
            )
            elapsed = (datetime.now() - start_time).total_seconds() * 1000
            usage = response.usage
            tokens = usage.input_tokens + usage.output_tokens
            cache_hit = getattr(usage, "cache_read_input_tokens", 0) or 0
            if cache_hit:
                logger.debug(f"Cache hit: {cache_hit} tokens économisés (client {client['id']}, modèle {model})")
            return (response.content[0].text, int(elapsed), tokens)
        except Exception as e:
            logger.warning(f"Claude API ({model}) tentative #{attempt + 1}: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
            else:
                elapsed = (datetime.now() - start_time).total_seconds() * 1000
                return ("Merci pour votre message ! Un membre de notre équipe va vous répondre sous peu.", int(elapsed), 0)

# ============================================================
# ALERTES AU PROPRIÉTAIRE
# ============================================================
async def notify_owner(client: Dict, customer_phone: str, message: str, intent: str,
                       conv_id: str = "", sentiment: float = 0.0):
    if not twilio_client or not client.get("owner_phone") or not client.get("twilio_phone"):
        return
    if intent not in ["urgent", "rdv", "complaint", "transfer_human"]:
        return
    try:
        emoji = {"urgent": "🚨", "rdv": "📅", "complaint": "⚠️", "transfer_human": "👤"}.get(intent, "📢")
        sentiment_note = ""
        if sentiment <= -0.5:
            sentiment_note = " 😠 CLIENT INSATISFAIT"
        elif sentiment >= 0.5:
            sentiment_note = " 😊"
        summary = ""
        if conv_id and intent in ["complaint", "transfer_human", "urgent"]:
            try:
                summary = await summarize_conversation(conv_id)
                summary = f"\nRésumé: {summary[:200]}"
            except Exception:
                pass
        alert = (f"{emoji} NOVALIS - {intent.upper()}{sentiment_note}\n"
                 f"Commerce: {client['business_name']}\n"
                 f"Client: {customer_phone}\n"
                 f"Message: {message[:100]}{summary}")
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
    message_sid = form.get("MessageSid", "")

    # Signature Twilio — validation avec URL publique (Railway proxy)
    if TWILIO_AUTH_TOKEN:
        signature = request.headers.get("X-Twilio-Signature", "")
        forwarded_proto = request.headers.get("X-Forwarded-Proto", "https")
        forwarded_host = request.headers.get("X-Forwarded-Host", "") or request.headers.get("Host", "")
        if forwarded_host:
            public_url = f"{forwarded_proto}://{forwarded_host}{request.url.path}"
        elif APP_URL:
            public_url = APP_URL.rstrip("/") + str(request.url.path)
        else:
            public_url = str(request.url)
        if not validate_twilio_signature(public_url, dict(form), signature):
            raise HTTPException(status_code=403, detail="Signature Twilio invalide")

    # Idempotence : ignorer les doublons de webhook
    if message_sid:
        async with aiosqlite.connect(DB_PATH) as db:
            cur = await db.execute("SELECT 1 FROM processed_webhooks WHERE message_sid = ?", (message_sid,))
            if await cur.fetchone():
                return Response(content="", media_type="text/xml")
            await db.execute("INSERT OR IGNORE INTO processed_webhooks (message_sid, created_at) VALUES (?, ?)",
                             (message_sid, datetime.now().isoformat()))
            await db.commit()

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
        twiml.message("Bonjour ! Je suis l'assistant Novalis IA. Comment puis-je vous aider aujourd'hui ?")
        return Response(content=str(twiml), media_type="text/xml")

    # Vérifier expiration du trial
    if client.get("plan") == "trial" and client.get("trial_expires_at"):
        try:
            if datetime.fromisoformat(client["trial_expires_at"]) < datetime.now():
                twiml = MessagingResponse()
                twiml.message("Votre essai gratuit Novalis IA est terminé. Visitez novalisia.ca pour continuer.")
                return Response(content=str(twiml), media_type="text/xml")
        except Exception:
            pass

    # Vérifier la limite mensuelle (0 = illimité)
    if client["max_messages_month"] > 0 and client["messages_used_month"] >= client["max_messages_month"]:
        twiml = MessagingResponse()
        twiml.message("Merci pour votre message ! Veuillez contacter directement le commerce.")
        return Response(content=str(twiml), media_type="text/xml")

    body = sanitize_input(body)
    conv_id = await get_or_create_conversation(client["id"], from_number, "sms")
    intent = detect_intent(body)
    lang = detect_language(body)

    # Analyse sentiment + escalade intelligente (en parallèle)
    sentiment, msg_count_row = await asyncio.gather(
        analyze_sentiment(body),
        _get_message_count(conv_id)
    )
    msg_count = msg_count_row

    # Vérifier si escalade automatique nécessaire
    escalate = await should_auto_escalate(client["id"], sentiment, intent, msg_count, body)
    if escalate and intent not in ["transfer_human", "rdv"]:
        intent = "transfer_human"

    await update_daily_stats(client["id"], intent)
    await add_message(conv_id, client["id"], "client", body, intent, sentiment_score=sentiment, language=lang)

    # Générer réponse IA avec RAG + langue
    ai_response, response_ms, tokens = await generate_response(client, conv_id, body, intent)
    await add_message(conv_id, client["id"], "agent", ai_response, response_time_ms=response_ms, tokens_used=tokens)

    # Tracker analytics conversation
    asyncio.create_task(track_conversation_analytics(
        client["id"], conv_id, "sms", sentiment, escalate, response_ms
    ))

    # Alerter le propriétaire (avec résumé si escalade)
    await notify_owner(client, from_number, body, intent, conv_id=conv_id, sentiment=sentiment)

    # Gérer les rendez-vous détectés
    if intent == "rdv":
        await create_appointment_from_intent(client["id"], from_number, body)

    twiml = MessagingResponse()
    twiml.message(ai_response)
    return Response(content=str(twiml), media_type="text/xml")

# ============================================================
# WEBHOOKS TWILIO - WHATSAPP (MULTI-TENANT)
# ============================================================
@app.post("/whatsapp/incoming")
async def handle_incoming_whatsapp(request: Request):
    """Webhook Twilio WhatsApp — même logique que SMS."""
    form = await request.form()
    signature = request.headers.get("X-Twilio-Signature", "")
    if TWILIO_AUTH_TOKEN and not validate_twilio_signature(str(request.url), dict(form), signature):
        raise HTTPException(status_code=403, detail="Signature Twilio invalide")

    from_number = form.get("From", "").replace("whatsapp:", "").strip()
    to_number = form.get("To", "").replace("whatsapp:", "").strip()
    body = sanitize_input(form.get("Body", "").strip())

    if not body:
        return Response(content="", media_type="text/xml")

    client = await get_client_by_phone(to_number)
    if not client:
        twiml = MessagingResponse()
        twiml.message("Merci pour votre message. Ce service n'est pas encore configuré.")
        return Response(content=str(twiml), media_type="text/xml")

    if client["messages_used_month"] >= client["max_messages_month"]:
        twiml = MessagingResponse()
        twiml.message("Merci pour votre message ! Veuillez contacter directement le commerce.")
        return Response(content=str(twiml), media_type="text/xml")

    conv_id = await get_or_create_conversation(client["id"], from_number, "whatsapp")
    intent = detect_intent(body)
    await update_daily_stats(client["id"], intent)
    await add_message(conv_id, client["id"], "client", body, intent)

    ai_response, response_ms, tokens = await generate_response(client, conv_id, body, intent)
    await add_message(conv_id, client["id"], "agent", ai_response, response_time_ms=response_ms, tokens_used=tokens)
    await notify_owner(client, from_number, body, intent)

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
    signature = request.headers.get("X-Twilio-Signature", "")
    public_url = (APP_URL.rstrip("/") + str(request.url.path)) if APP_URL else str(request.url)
    if TWILIO_AUTH_TOKEN and not validate_twilio_signature(public_url, dict(form), signature):
        raise HTTPException(status_code=403, detail="Signature Twilio invalide")
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

    lang = detect_language(speech)
    voice_lang = "en-US" if lang == "en" else "fr-CA"
    voice_name = "Polly.Joanna" if lang == "en" else "Polly.Gabrielle"

    conv_id = await get_or_create_conversation(client["id"], from_number, "voice")
    intent = detect_intent(speech)
    sentiment = await analyze_sentiment(speech)
    msg_count = await _get_message_count(conv_id)

    escalate = await should_auto_escalate(client["id"], sentiment, intent, msg_count, speech)
    if escalate and intent not in ["transfer_human", "rdv"]:
        intent = "transfer_human"

    await update_daily_stats(client["id"], intent)
    await add_message(conv_id, client["id"], "client", speech, intent, sentiment_score=sentiment, language=lang)

    ai_response, response_ms, tokens = await generate_response(client, conv_id, speech, intent)
    await add_message(conv_id, client["id"], "agent", ai_response, response_time_ms=response_ms, tokens_used=tokens)
    await notify_owner(client, from_number, speech, intent, conv_id=conv_id, sentiment=sentiment)
    asyncio.create_task(track_conversation_analytics(
        client["id"], conv_id, "voice", sentiment, escalate, response_ms
    ))

    # Utiliser ElevenLabs si configuré (voix naturelle), sinon Polly
    gather = Gather(input="speech", action="/voice/respond", method="POST",
                    language=voice_lang, speechTimeout="auto", timeout=5)
    if ELEVENLABS_API_KEY and APP_URL:
        audio_bytes = await generate_elevenlabs_audio(ai_response)
        if audio_bytes:
            audio_id = generate_id("aud")
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute(
                    "INSERT INTO voice_audio (id, audio_bytes, created_at) VALUES (?, ?, ?)",
                    (audio_id, audio_bytes, datetime.now().isoformat())
                )
                await db.commit()
            gather.play(f"{APP_URL}/audio/{audio_id}")
            response.append(gather)
            farewell = "Thank you for calling!" if lang == "en" else "Merci d'avoir appelé !"
            response.say(farewell, voice=voice_name, language=voice_lang)
            return Response(content=str(response), media_type="text/xml")

    gather.say(ai_response, voice=voice_name, language=voice_lang)
    response.append(gather)
    farewell = "Thank you for calling. Have a great day!" if lang == "en" else "Merci d'avoir appelé. Bonne journée !"
    response.say(farewell, voice=voice_name, language=voice_lang)
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
    raw_body = await request.body()
    if FB_APP_SECRET:
        sig_header = request.headers.get("X-Hub-Signature", "")
        expected = "sha1=" + hmac.new(FB_APP_SECRET.encode(), raw_body, "sha1").hexdigest()
        if not hmac.compare_digest(sig_header, expected):
            raise HTTPException(status_code=403, detail="Signature Facebook invalide")
    data = json.loads(raw_body)
    for entry in data.get("entry", []):
        page_id = entry.get("id", "")
        for event in entry.get("messaging", []):
            sender_id = event.get("sender", {}).get("id", "")
            message = event.get("message", {}).get("text", "")
            if not message:
                continue
            message = sanitize_input(message)
            # Routage multi-tenant : trouver le client par son fb_page_id
            async with aiosqlite.connect(DB_PATH) as db:
                db.row_factory = aiosqlite.Row
                cursor = await db.execute(
                    "SELECT * FROM clients WHERE fb_page_id = ? AND status = 'active'",
                    (page_id,)
                )
                client_row = await cursor.fetchone()
            if not client_row:
                logger.warning(f"Messenger: aucun client pour la page {page_id}")
                continue
            client = dict(client_row)

            phone_key = f"messenger_{sender_id}"
            conv_id = await get_or_create_conversation(client["id"], phone_key, "messenger")
            intent = detect_intent(message)
            await update_daily_stats(client["id"], intent)
            await add_message(conv_id, client["id"], "client", message, intent)
            ai_response, response_ms, tokens = await generate_response(client, conv_id, message, intent)
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
    portal_token = secrets.token_urlsafe(32)
    now = datetime.now().isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO clients (id, business_name, business_type, services, hours, address, info,
                               owner_name, owner_email, owner_phone, twilio_phone, fb_page_token,
                               fb_page_id, api_key, portal_token, plan, status, custom_prompt, language, max_messages_month,
                               created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 'fr-CA', ?, ?, ?)
        """, (
            client_id, data["business_name"], data.get("business_type", "Commerce"),
            data.get("services", ""), data.get("hours", "Lundi-Vendredi 9h-17h"),
            data.get("address", ""), data.get("info", ""),
            data["owner_name"], data["owner_email"],
            data.get("owner_phone", ""), data.get("twilio_phone", ""),
            data.get("fb_page_token", ""), data.get("fb_page_id", ""), api_key, portal_token,
            data.get("plan", "starter"), data.get("custom_prompt", ""),
            data.get("max_messages_month", 500), now, now
        ))
        await db.commit()

    portal_url = f"/portal?t={portal_token}"
    return {
        "id": client_id,
        "api_key": api_key,
        "portal_token": portal_token,
        "portal_url": portal_url,
        "business_name": data["business_name"],
        "status": "active",
        "message": f"Client créé. API: {api_key} | Portail: {portal_url}"
    }

@app.get("/api/v1/clients")
async def list_clients(username: str = Depends(verify_admin)):
    """Liste tous les clients."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, business_name, business_type, owner_name, owner_email, plan, status, twilio_phone, api_key, messages_used_month, max_messages_month, created_at FROM clients ORDER BY created_at DESC"
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
                      "fb_page_id", "plan", "status", "custom_prompt", "max_messages_month"]

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

@app.patch("/api/v1/me/profile")
async def update_my_profile(request: Request, client: dict = Depends(verify_api_key)):
    """Met à jour le profil de l'entreprise (accessible au client)."""
    data = await request.json()
    allowed = ["business_name", "business_type", "hours", "owner_phone", "services", "address", "info", "language", "custom_prompt"]
    updates = {k: v for k, v in data.items() if k in allowed and isinstance(v, str)}
    if not updates:
        raise HTTPException(400, "Aucun champ valide fourni")
    updates["updated_at"] = datetime.now().isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [client["id"]]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE clients SET {set_clause} WHERE id = ?", values)
        await db.commit()
    return {"status": "updated", "fields": list(updates.keys())}


@app.post("/api/v1/me/onboarding/complete")
async def complete_onboarding(client: dict = Depends(verify_api_key)):
    """Marque l'onboarding comme complété."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE clients SET onboarding_step = 4, status = CASE WHEN status = 'inquiry' THEN 'active' ELSE status END, updated_at = ? WHERE id = ?",
            (datetime.now().isoformat(), client["id"])
        )
        await db.commit()
    return {"status": "onboarding_complete"}


@app.post("/api/v1/me/portal-token")
async def generate_portal_token(client: dict = Depends(verify_api_key)):
    """Génère ou renouvelle le token d'accès au portail (30 jours)."""
    tok = secrets.token_urlsafe(32)
    expires_at = (datetime.now() + timedelta(days=30)).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE clients SET portal_token = ?, portal_token_expires_at = ? WHERE id = ?",
            (tok, expires_at, client["id"])
        )
        await db.commit()
    portal_url = f"{APP_URL}/portal?t={tok}" if APP_URL else f"/portal?t={tok}"
    return {"token": tok, "portal_url": portal_url, "expires_at": expires_at}

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

@app.post("/api/v1/me/appointments")
async def create_my_appointment(request: Request, client: dict = Depends(verify_api_key)):
    """Crée un rendez-vous pour le client authentifié."""
    data = await request.json()
    if not data.get("date") or not data.get("time"):
        raise HTTPException(status_code=400, detail="Champs requis: date, time")
    appt_id = generate_id("appt")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO appointments (id, client_id, customer_phone, customer_name, service,
               date, time, duration_min, status, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)""",
            (appt_id, client["id"], data.get("customer_phone", ""), data.get("customer_name", ""),
             data.get("service", ""), data["date"], data["time"],
             data.get("duration_min", 60), data.get("notes", ""), now, now)
        )
        await db.commit()
    return {"id": appt_id, "status": "confirmed"}

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

        plan_map = {"starter": 497, "pro": 1497, "agence": 1497, "enterprise": 2500, "trial": 0}
        plan_cost = plan_map.get(client.get("plan", "starter"), 497)
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
            "plan_cost": "Essai gratuit 7 jours" if client.get("plan") == "trial" else f"{plan_cost}$/mois",
            "roi_ratio": f"{roi_ratio}x" if plan_cost > 0 else "—",
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
@limiter.limit("5/minute")
async def submit_inquiry(request: Request):
    """Formulaire de soumission publique — pas besoin d'auth."""
    data = await request.json()

    # Accepte les deux conventions de nommage (formulaire HTML vs API directe)
    name = data.get("name", "").strip()
    email = data.get("email", "").strip()
    description = data.get("description") or data.get("message", "")
    service_type = data.get("service_type") or data.get("service_interest", "custom")

    if not name or not email or not description:
        raise HTTPException(status_code=400, detail="Champs requis: name, email, et description (ou message)")
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Adresse courriel invalide")

    now = datetime.now().isoformat()
    client_id = generate_id("client")
    api_key = generate_api_key()
    proj_id = generate_id("proj")

    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT id, api_key FROM clients WHERE owner_email = ?", (email,))
        existing = await cursor.fetchone()
        if existing:
            client_id = existing[0]
            api_key = existing[1]
            twilio_number = None
        else:
            trial_expires = (datetime.now() + timedelta(days=7)).isoformat()
            await db.execute(
                """INSERT INTO clients (id, business_name, owner_name, owner_email, owner_phone,
                   api_key, plan, status, created_at, updated_at, business_type, services, hours, address, info,
                   twilio_phone, fb_page_token, fb_page_id, custom_prompt, language, max_messages_month, messages_used_month,
                   trial_expires_at, trial_warning_sent)
                   VALUES (?, ?, ?, ?, ?, ?, 'trial', 'active', ?, ?, '', '', '', '', '', '', '', '', '', 'fr-CA', 200, 0, ?, 0)""",
                (client_id, data.get("business_name", name), name, email,
                 data.get("phone", ""), api_key, now, now, trial_expires)
            )
            await db.commit()
            # Acheter un numéro Twilio automatiquement (en arrière-plan)
            twilio_number = await provision_twilio_number("819")
            if twilio_number:
                await db.execute("UPDATE clients SET twilio_phone = ? WHERE id = ?", (twilio_number, client_id))
                await db.commit()
                logger.info(f"Numéro Twilio {twilio_number} assigné à {email}")

        await db.execute(
            """INSERT INTO projects (id, client_id, title, description, service_type, status, priority,
               budget, quote_amount, deliverables, notes, progress, created_at, updated_at,
               start_date, deadline, completed_date, paid_amount)
               VALUES (?, ?, ?, ?, ?, 'inquiry', 'normal', ?, 0, '', '', 0, ?, ?, '', '', '', 0)""",
            (proj_id, client_id, f"Demande: {service_type}", description, service_type,
             data.get("budget", ""), now, now)
        )
        await db.commit()

    logger.info(f"Nouvelle demande de {name} ({email}) — service: {service_type} — trial 7 jours activé")

    onboarding_url = f"{APP_URL}/onboarding?key={api_key}" if APP_URL else f"/onboarding?key={api_key}"
    # Échapper les entrées utilisateur avant injection dans HTML
    h_name         = html_module.escape(name)
    h_service_type = html_module.escape(str(service_type))
    h_description  = html_module.escape(str(description))
    h_email        = html_module.escape(email)
    twilio_section = f"""
  <div style="background:rgba(168,104,68,0.08);border:0.5px solid rgba(168,104,68,0.3);padding:20px;margin:24px 0;">
    <p style="margin:0 0 8px;font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:#A86844;">Votre numéro IA</p>
    <p style="margin:0;font-size:1.4rem;color:#EDE8DF;font-family:monospace;">{twilio_number}</p>
    <p style="margin:8px 0 0;font-size:0.8rem;color:#4A5260;">Partagez ce numéro à vos clients — ils peuvent déjà vous texter et l'IA répondra.</p>
  </div>""" if twilio_number else ""

    # Email de bienvenue — branding Novalis copper/obsidian
    asyncio.create_task(send_email(
        to=email,
        subject=f"Bienvenue chez Novalis IA — Configurez votre assistant maintenant",
        body=f"""<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#090C0F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">

  <!-- Header -->
  <div style="border-bottom:1px solid rgba(168,104,68,0.3);padding-bottom:24px;margin-bottom:32px;">
    <p style="margin:0;font-size:0.7rem;letter-spacing:0.2em;text-transform:uppercase;color:#A86844;">Novalis IA</p>
  </div>

  <!-- Body -->
  <h1 style="color:#EDE8DF;font-size:1.9rem;font-weight:400;margin:0 0 8px;font-style:italic;">Bonjour {h_name},</h1>
  <p style="color:#4A5260;margin:0 0 16px;font-size:1rem;line-height:1.6;">
    Votre <strong style="color:#EDE8DF;">essai gratuit de 7 jours</strong> est maintenant actif.<br>
    Configurez votre assistant IA en 3 minutes et commencez à recevoir des réponses automatiques dès aujourd'hui.
  </p>
  {twilio_section}

  <!-- CTA Principal -->
  <div style="text-align:center;margin:32px 0;">
    <a href="{onboarding_url}"
       style="display:inline-block;background:#A86844;color:#EDE8DF;text-decoration:none;
              padding:14px 36px;font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;
              border:1px solid #C4895A;">
      Configurer mon assistant →
    </a>
  </div>

  <!-- Steps -->
  <div style="border:0.5px solid rgba(168,104,68,0.2);padding:24px;margin:24px 0;">
    <p style="margin:0 0 16px;font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:#A86844;">Ce qui vous attend</p>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <span style="color:#A86844;font-size:0.7rem;margin-top:2px;min-width:16px;">01</span>
        <p style="margin:0;color:#EDE8DF;font-size:0.85rem;">Profil de votre entreprise — nom, heures, services</p>
      </div>
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <span style="color:#A86844;font-size:0.7rem;margin-top:2px;min-width:16px;">02</span>
        <p style="margin:0;color:#EDE8DF;font-size:0.85rem;">Base de connaissances — collez votre FAQ, catalogue, politiques</p>
      </div>
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <span style="color:#A86844;font-size:0.7rem;margin-top:2px;min-width:16px;">03</span>
        <p style="margin:0;color:#EDE8DF;font-size:0.85rem;">Accès à votre portail — analytics, conversations, gestion</p>
      </div>
    </div>
  </div>

  <!-- Reference -->
  <p style="color:#4A5260;font-size:0.78rem;margin:16px 0 0;">Référence : <span style="color:#EDE8DF;font-family:monospace;">{proj_id}</span></p>
  <p style="color:#4A5260;font-size:0.78rem;margin:4px 0 0;">Questions ? Écrivez-nous à <a href="mailto:{ADMIN_EMAIL}" style="color:#A86844;">{ADMIN_EMAIL}</a></p>

  <!-- Footer -->
  <div style="border-top:0.5px solid rgba(237,232,223,0.08);margin-top:40px;padding-top:20px;">
    <p style="color:#4A5260;font-size:0.72rem;margin:0;">Novalis IA · Québec · <a href="{APP_URL or ''}/portal?key={api_key}" style="color:#A86844;">Accès portail</a></p>
  </div>
</div>
</body></html>"""
    ))

    # Email de notification à l'admin
    asyncio.create_task(send_email(
        to=ADMIN_EMAIL,
        subject=f"🔔 Nouvelle demande : {name} — {service_type}",
        body=f"""<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#090C0F;color:#EDE8DF;padding:24px;">
<h2 style="color:#A86844;margin-top:0;">Nouvelle demande</h2>
<p><b>Nom :</b> {h_name}</p>
<p><b>Email :</b> {h_email}</p>
<p><b>Service :</b> {h_service_type}</p>
<p><b>Description :</b> {h_description}</p>
<p><b>Clé API :</b> <code style="background:rgba(168,104,68,0.1);color:#C4895A;padding:2px 6px;">{api_key}</code></p>
<p><a href="{APP_URL or ''}/onboarding?key={api_key}" style="color:#A86844;">Lien onboarding client</a></p>
</div>"""
    ))

    # SMS de notification à l'owner
    if twilio_client and TWILIO_PHONE and OWNER_PHONE:
        try:
            twilio_client.messages.create(
                body=f"🔔 Nouvelle demande Novalis!\nNom: {name}\nEmail: {email}\nService: {service_type}\nMessage: {description[:100]}",
                from_=TWILIO_PHONE,
                to=OWNER_PHONE
            )
        except Exception as e:
            logger.warning(f"SMS owner non envoyé: {e}")

    return {
        "status": "received",
        "project_id": proj_id,
        "message": "Merci ! Nous avons reçu votre demande et vous contacterons sous 24h.",
        "api_key": api_key
    }

# ============================================================
# TEST SMS (debug)
# ============================================================
@app.get("/api/v1/test-sms")
async def test_sms(username: str = Depends(verify_admin)):
    result = {
        "twilio_configured": bool(twilio_client),
        "twilio_phone": TWILIO_PHONE or "MANQUANT",
        "owner_phone": OWNER_PHONE or "MANQUANT",
    }
    if twilio_client and TWILIO_PHONE and OWNER_PHONE:
        try:
            msg = twilio_client.messages.create(
                body="Test SMS Novalis — configuration OK!",
                from_=TWILIO_PHONE,
                to=OWNER_PHONE
            )
            result["sms_status"] = "envoyé"
            result["sid"] = msg.sid
        except Exception as e:
            result["sms_status"] = "erreur"
            result["error"] = str(e)
    else:
        result["sms_status"] = "variables manquantes"
    return result

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

        # MRR calculation (cohérent avec landing page)
        cursor = await db.execute("SELECT plan, COUNT(*) FROM clients WHERE status = 'active' GROUP BY plan")
        plans = await cursor.fetchall()
        prices = {"starter": 497, "pro": 1497, "agence": 1497, "enterprise": 2500}
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
@app.get("/admin", response_class=HTMLResponse)
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
                        <div><label>Facebook Page ID</label><input id="nc_fb_page_id" placeholder="ex: 1234567890"/></div>
                        <div><label>FB Page Access Token</label><input id="nc_fb_token" type="password" placeholder="EAABw..."/></div>
                        <div><label>Max messages / mois</label><input id="nc_max_msgs" type="number" value="500" min="100"/></div>
                    </div>
                    <label>Services et prix</label><textarea id="nc_services" rows="3" placeholder="Coupe homme: 25$, Coupe femme: 45$..."></textarea>
                    <label>Infos supplémentaires</label><textarea id="nc_info" rows="2"></textarea>
                    <label>Prompt personnalisé (optionnel — override du prompt standard)</label><textarea id="nc_custom_prompt" rows="2" placeholder="Laissez vide pour utiliser le prompt standard..."></textarea>
                    <label>Plan</label><select id="nc_plan"><option value="starter">Starter (497$/mois — 500 msg)</option><option value="pro">Pro (1 497$/mois — 2 000 msg)</option><option value="enterprise">Enterprise (2 500$/mois — illimité)</option></select>
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
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div class="client-name">${{c.business_name}}</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
                <span class="badge ${{c.status}}">${{c.status}}</span>
                <span class="badge ${{c.plan}}">${{c.plan}}</span>
                <button class="btn btn-sm" onclick="getPortalLink('${{c.id}}')" title="Copier lien portail">🔗 Portail</button>
                <button class="btn btn-sm" style="background:#1e3a5f;color:#a855f7;" onclick="openEditModal('${{c.id}}')" title="Modifier">✏️</button>
                <button class="btn btn-sm" style="background:${{c.status==='active'?'rgba(239,68,68,0.12)':'rgba(52,211,153,0.12)'}};color:${{c.status==='active'?'#ef4444':'#34d399'}};" onclick="toggleStatus('${{c.id}}','${{c.status}}')">${{c.status==='active'?'⏸':'▶'}}</button>
            </div>
        </div>
        <div class="client-meta">${{c.owner_name}} · ${{c.owner_email}} · ${{c.twilio_phone||'—'}} · ${{c.messages_used_month}}/${{c.max_messages_month}} msg</div>
        <div style="font-size:0.7rem;color:#475569;margin-top:3px;">ID: ${{c.id}} · Créé: ${{c.created_at?.slice(0,10)||'—'}}</div>
    </div>`).join('');
    }}catch(e){{console.error(e);}}
}}

async function getPortalLink(id){{
    try{{
        const c=await fetch('/api/v1/clients/'+id).then(r=>r.json());
        const url=window.location.origin+'/portal?t='+c.portal_token;
        await navigator.clipboard.writeText(url).catch(()=>{{}});
        alert('✅ Lien copié dans le presse-papier :\n'+url);
    }}catch(e){{alert('Erreur: '+e);}}
}}

async function openEditModal(id){{
    try{{
        const c=await fetch('/api/v1/clients/'+id).then(r=>r.json());
        document.getElementById('em_id').value=c.id;
        document.getElementById('em_name').value=c.business_name||'';
        document.getElementById('em_type').value=c.business_type||'';
        document.getElementById('em_owner').value=c.owner_name||'';
        document.getElementById('em_email').value=c.owner_email||'';
        document.getElementById('em_phone').value=c.owner_phone||'';
        document.getElementById('em_twilio').value=c.twilio_phone||'';
        document.getElementById('em_address').value=c.address||'';
        document.getElementById('em_hours').value=c.hours||'';
        document.getElementById('em_services').value=c.services||'';
        document.getElementById('em_info').value=c.info||'';
        document.getElementById('em_custom_prompt').value=c.custom_prompt||'';
        document.getElementById('em_fb_page_id').value=c.fb_page_id||'';
        document.getElementById('em_max_msgs').value=c.max_messages_month||500;
        document.getElementById('em_plan').value=c.plan||'starter';
        document.getElementById('em_apikey').textContent=c.api_key||'';
        document.getElementById('em_result').textContent='';
        document.getElementById('editModalOverlay').style.display='flex';
    }}catch(e){{alert('Erreur: '+e);}}
}}

function closeEditModal(){{document.getElementById('editModalOverlay').style.display='none';}}

async function saveClientEdit(){{
    const id=document.getElementById('em_id').value;
    const data={{
        business_name:document.getElementById('em_name').value,
        business_type:document.getElementById('em_type').value,
        owner_name:document.getElementById('em_owner').value,
        owner_email:document.getElementById('em_email').value,
        owner_phone:document.getElementById('em_phone').value,
        twilio_phone:document.getElementById('em_twilio').value,
        address:document.getElementById('em_address').value,
        hours:document.getElementById('em_hours').value,
        services:document.getElementById('em_services').value,
        info:document.getElementById('em_info').value,
        custom_prompt:document.getElementById('em_custom_prompt').value,
        fb_page_id:document.getElementById('em_fb_page_id').value,
        max_messages_month:parseInt(document.getElementById('em_max_msgs').value)||500,
        plan:document.getElementById('em_plan').value,
    }};
    try{{
        const r=await fetch('/api/v1/clients/'+id,{{method:'PUT',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(data)}});
        if(r.ok){{
            document.getElementById('em_result').innerHTML='<span style="color:#34d399;">✓ Sauvegardé !</span>';
            setTimeout(()=>{{closeEditModal();loadClients();}},1200);
        }}else{{
            const e=await r.json();
            document.getElementById('em_result').textContent='❌ '+(e.detail||'Erreur');
        }}
    }}catch(e){{document.getElementById('em_result').textContent='❌ Erreur réseau';}}
}}

async function toggleStatus(id,status){{
    const newStatus=status==='active'?'inactive':'active';
    if(!confirm((newStatus==='inactive'?'Désactiver':'Réactiver')+' ce client ?'))return;
    await fetch('/api/v1/clients/'+id,{{method:'PUT',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{status:newStatus}})}}).catch(()=>{{}});
    loadClients();
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
        fb_page_id:document.getElementById('nc_fb_page_id').value,
        fb_page_token:document.getElementById('nc_fb_token').value,
        custom_prompt:document.getElementById('nc_custom_prompt').value,
        max_messages_month:parseInt(document.getElementById('nc_max_msgs').value)||500,
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

<!-- MODAL MODIFIER CLIENT -->
<div id="editModalOverlay" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.75);align-items:flex-start;justify-content:center;padding:60px 16px 40px;overflow-y:auto;">
    <div style="background:#1a2332;border:1px solid #1e3a5f;border-radius:16px;padding:28px;max-width:640px;width:100%;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h3 style="color:#38bdf8;margin:0;">✏️ Modifier le client</h3>
            <button onclick="closeEditModal()" style="background:transparent;border:none;color:#94a3b8;font-size:2rem;cursor:pointer;line-height:1;padding:0 4px;">×</button>
        </div>
        <input id="em_id" type="hidden"/>
        <div class="form-grid">
            <div><label>Nom du commerce</label><input id="em_name"/></div>
            <div><label>Type</label><input id="em_type"/></div>
            <div><label>Propriétaire</label><input id="em_owner"/></div>
            <div><label>Email</label><input id="em_email" type="email"/></div>
            <div><label>Tél propriétaire</label><input id="em_phone"/></div>
            <div><label>Numéro Twilio</label><input id="em_twilio"/></div>
            <div><label>Adresse</label><input id="em_address"/></div>
            <div><label>Heures d'ouverture</label><input id="em_hours"/></div>
            <div><label>Facebook Page ID</label><input id="em_fb_page_id"/></div>
            <div><label>Max msg / mois</label><input id="em_max_msgs" type="number"/></div>
        </div>
        <label>Services et prix</label><textarea id="em_services" rows="3"></textarea>
        <label>Infos supplémentaires</label><textarea id="em_info" rows="2"></textarea>
        <label>Prompt personnalisé</label><textarea id="em_custom_prompt" rows="2" placeholder="Laissez vide pour le prompt standard"></textarea>
        <label>Plan</label>
        <select id="em_plan" style="margin-bottom:14px;">
            <option value="starter">Starter (497$/mois)</option>
            <option value="pro">Pro (1 497$/mois)</option>
            <option value="enterprise">Enterprise (2 500$/mois)</option>
        </select>
        <div style="background:#0f1f2e;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:0.8rem;word-break:break-all;">
            <span style="color:#64748b;">Clé API : </span><code id="em_apikey" style="color:#fbbf24;"></code>
        </div>
        <div style="display:flex;gap:12px;">
            <button class="btn" onclick="saveClientEdit()">Enregistrer</button>
            <button class="btn" style="background:#334155;color:#94a3b8;" onclick="closeEditModal()">Annuler</button>
        </div>
        <div id="em_result" style="margin-top:10px;font-size:0.9rem;"></div>
    </div>
</div>
</body>
</html>"""

# ============================================================
# KNOWLEDGE BASE — Base de connaissances par client
# ============================================================
@app.get("/api/v1/me/knowledge-base")
async def get_my_knowledge_base(client: dict = Depends(verify_api_key)):
    """Liste la base de connaissances du client."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM knowledge_base WHERE client_id = ? ORDER BY kb_type, created_at",
            (client["id"],)
        )
        return [dict(r) for r in await cursor.fetchall()]

@app.post("/api/v1/me/knowledge-base")
async def add_knowledge_entry(request: Request, client: dict = Depends(verify_api_key)):
    """Ajoute une entrée à la base de connaissances (FAQ, menu, politique...)."""
    data = await request.json()
    if not data.get("title") or not data.get("content"):
        raise HTTPException(status_code=400, detail="title et content requis")
    if len(data["content"]) > 5000:
        raise HTTPException(status_code=400, detail="Contenu trop long (max 5000 caractères)")
    kb_id = generate_id("kb")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO knowledge_base (id, client_id, title, content, kb_type, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
            (kb_id, client["id"], data["title"], data["content"], data.get("kb_type", "faq"), now, now)
        )
        await db.commit()
    # Indexer pour RAG
    asyncio.create_task(index_knowledge_chunks(client["id"], kb_id, data["content"]))
    return {"id": kb_id, "status": "created", "chunks": len(chunk_text(data["content"]))}

@app.put("/api/v1/me/knowledge-base/{kb_id}")
async def update_knowledge_entry(kb_id: str, request: Request, client: dict = Depends(verify_api_key)):
    data = await request.json()
    allowed = ["title", "content", "kb_type", "is_active"]
    updates, values = [], []
    for f in allowed:
        if f in data:
            updates.append(f"{f} = ?")
            values.append(data[f])
    if not updates:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    updates.append("updated_at = ?")
    values.extend([datetime.now().isoformat(), kb_id, client["id"]])
    async with aiosqlite.connect(DB_PATH) as db:
        set_clause = ", ".join(updates)
        await db.execute(f"UPDATE knowledge_base SET {set_clause} WHERE id = ? AND client_id = ?", values)
        await db.commit()
    return {"status": "updated"}

@app.delete("/api/v1/me/knowledge-base/{kb_id}")
async def delete_knowledge_entry(kb_id: str, client: dict = Depends(verify_api_key)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM knowledge_base WHERE id = ? AND client_id = ?", (kb_id, client["id"]))
        await db.commit()
    return {"status": "deleted"}

# ============================================================
# CAMPAGNES SMS/WHATSAPP PROACTIVES
# ============================================================
@app.get("/api/v1/me/campaigns")
async def get_my_campaigns(client: dict = Depends(verify_api_key)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC", (client["id"],)
        )
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            try:
                d["contacts"] = json.loads(d["contacts"])
            except Exception:
                d["contacts"] = []
            result.append(d)
        return result

@app.post("/api/v1/me/campaigns")
async def create_campaign(request: Request, client: dict = Depends(verify_api_key)):
    data = await request.json()
    if not data.get("name") or not data.get("message"):
        raise HTTPException(status_code=400, detail="name et message requis")
    contacts = data.get("contacts", [])
    if len(contacts) > 1000:
        raise HTTPException(status_code=400, detail="Maximum 1000 contacts par campagne")
    camp_id = generate_id("camp")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO campaigns (id, client_id, name, message, channel, contacts, status, scheduled_at, sent_count, delivered_count, response_count, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, 0, 0, 0, ?, ?)""",
            (camp_id, client["id"], data["name"], data["message"],
             data.get("channel", "sms"), json.dumps(contacts),
             data.get("scheduled_at", ""), now, now)
        )
        await db.commit()
    return {"id": camp_id, "status": "created", "contacts_count": len(contacts)}

@app.post("/api/v1/me/campaigns/{camp_id}/send")
async def send_campaign_endpoint(camp_id: str, client: dict = Depends(verify_api_key)):
    if not twilio_client or not client.get("twilio_phone"):
        raise HTTPException(status_code=400, detail="Twilio non configuré")
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM campaigns WHERE id = ? AND client_id = ?", (camp_id, client["id"]))
        camp = await cursor.fetchone()
        if not camp:
            raise HTTPException(status_code=404, detail="Campagne non trouvée")
        camp = dict(camp)
        if camp["status"] not in ("draft", "scheduled"):
            raise HTTPException(status_code=400, detail=f"Statut invalide: {camp['status']}")
    asyncio.create_task(_execute_campaign(camp, client))
    contacts_count = len(json.loads(camp["contacts"]))
    return {"status": "sending", "message": f"Envoi en cours vers {contacts_count} contacts"}

async def _execute_campaign(camp: dict, client: dict):
    contacts = json.loads(camp["contacts"])
    channel = camp["channel"]
    sent = 0
    from_number = client["twilio_phone"]
    if channel == "whatsapp":
        from_number = f"whatsapp:{from_number}"
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE campaigns SET status = 'sending', updated_at = ? WHERE id = ?",
                        (datetime.now().isoformat(), camp["id"]))
        await db.commit()
    for phone in contacts:
        try:
            to = f"whatsapp:{phone}" if channel == "whatsapp" else phone
            twilio_client.messages.create(body=camp["message"], from_=from_number, to=to)
            sent += 1
            await asyncio.sleep(0.1)
        except Exception as e:
            logger.error(f"Campagne {camp.get('id','?')} — erreur {phone}: {e}")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE campaigns SET status = 'completed', sent_count = ?, updated_at = ? WHERE id = ?",
                        (sent, datetime.now().isoformat(), camp["id"]))
        await db.commit()
    logger.info(f"Campagne {camp.get('id','?')} terminée: {sent}/{len(contacts)}")

@app.delete("/api/v1/me/campaigns/{camp_id}")
async def delete_campaign(camp_id: str, client: dict = Depends(verify_api_key)):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT status FROM campaigns WHERE id = ? AND client_id = ?", (camp_id, client["id"]))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Campagne non trouvée")
        if row[0] not in ("draft", "cancelled"):
            raise HTTPException(status_code=400, detail="Seules les campagnes en brouillon peuvent être supprimées")
        await db.execute("DELETE FROM campaigns WHERE id = ?", (camp_id,))
        await db.commit()
    return {"status": "deleted"}

# ============================================================
# WEBHOOKS SORTANTS — Intégrations CRM
# ============================================================
async def trigger_outgoing_webhooks(client_id: str, event: str, payload: dict):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM client_webhooks WHERE client_id = ? AND is_active = 1", (client_id,)
        )
        webhooks = [dict(r) for r in await cursor.fetchall()]
    for wh in webhooks:
        try:
            events = json.loads(wh.get("events", "[]"))
            if event not in events:
                continue
            body = json.dumps({"event": event, "timestamp": datetime.now().isoformat(), "data": payload})
            sig = hashlib.sha256(f"{wh.get('secret','')}{body}".encode()).hexdigest()
            http_requests.post(wh["url"], data=body,
                headers={"Content-Type": "application/json", "X-Novalis-Signature": sig}, timeout=5)
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute("UPDATE client_webhooks SET last_triggered = ? WHERE id = ?",
                                (datetime.now().isoformat(), wh["id"]))
                await db.commit()
        except Exception as e:
            logger.error(f"Webhook {wh.get('id','?')} erreur: {e}")

@app.get("/api/v1/me/webhooks")
async def get_my_webhooks(client: dict = Depends(verify_api_key)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, url, events, is_active, last_triggered, created_at FROM client_webhooks WHERE client_id = ?",
            (client["id"],)
        )
        rows = await cursor.fetchall()
        return [{**dict(r), "events": json.loads(r["events"] or "[]")} for r in rows]

@app.post("/api/v1/me/webhooks")
async def create_webhook(request: Request, client: dict = Depends(verify_api_key)):
    data = await request.json()
    if not data.get("url") or not data["url"].startswith("https://"):
        raise HTTPException(status_code=400, detail="URL HTTPS requise")
    wh_id = generate_id("wh")
    secret = secrets.token_hex(32)
    events = data.get("events", ["new_appointment", "transfer_requested", "new_message"])
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO client_webhooks (id, client_id, url, events, secret, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
            (wh_id, client["id"], data["url"], json.dumps(events), secret, now)
        )
        await db.commit()
    return {"id": wh_id, "secret": secret, "message": "Conservez ce secret — il ne sera plus affiché."}

@app.delete("/api/v1/me/webhooks/{wh_id}")
async def delete_webhook(wh_id: str, client: dict = Depends(verify_api_key)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM client_webhooks WHERE id = ? AND client_id = ?", (wh_id, client["id"]))
        await db.commit()
    return {"status": "deleted"}

# ============================================================
# RAPPORTS IA HEBDOMADAIRES
# ============================================================
async def generate_weekly_report_text(client: dict) -> Optional[str]:
    if not claude_client:
        return None
    week_start = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT SUM(interactions), SUM(rdv_requests), SUM(questions), SUM(complaints), SUM(transfers) FROM stats_daily WHERE client_id = ? AND date >= ?",
            (client["id"], week_start)
        )
        row = await cursor.fetchone()
        total, rdv, questions, complaints, transfers = (row[i] or 0 for i in range(5))
        cursor = await db.execute(
            "SELECT content FROM messages WHERE client_id = ? AND role = 'client' AND timestamp >= ? ORDER BY RANDOM() LIMIT 20",
            (client["id"], f"{week_start}T00:00:00")
        )
        sample_messages = [r[0] for r in await cursor.fetchall()]
    if total == 0:
        return None
    prompt = f"""Génère un rapport hebdomadaire professionnel pour {client['business_name']}.
DONNÉES : {total} interactions, {rdv} RDV, {questions} questions, {complaints} plaintes, {transfers} transferts.
MESSAGES ÉCHANTILLON : {'; '.join(m[:80] for m in sample_messages[:8])}
FORMAT : 1) Résumé (2-3 phrases) 2) Points forts (3 bullets) 3) Recommandation concrète.
Ton professionnel et positif. En français québécois."""
    try:
        response = claude_client.messages.create(
            model="claude-sonnet-4-6", max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.content[0].text
    except Exception as e:
        logger.error(f"Erreur rapport IA: {e}")
        return None

async def trial_monitor_task():
    """Vérifie les trials toutes les 12h — envoie emails J-2 et expiration."""
    while True:
        try:
            await check_and_notify_trial_expiry()
        except Exception as e:
            logger.error(f"Erreur trial monitor: {e}")
        await asyncio.sleep(12 * 3600)  # toutes les 12h

async def weekly_report_task():
    while True:
        try:
            now = datetime.now()
            days_until_sunday = (6 - now.weekday()) % 7
            if days_until_sunday == 0 and now.hour >= 8:
                days_until_sunday = 7
            next_run = now.replace(hour=8, minute=0, second=0) + timedelta(days=days_until_sunday)
            await asyncio.sleep(max((next_run - now).total_seconds(), 60))
            logger.info("Génération des rapports hebdomadaires...")
            week_start = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
            async with aiosqlite.connect(DB_PATH) as db:
                db.row_factory = aiosqlite.Row
                cursor = await db.execute("SELECT * FROM clients WHERE status = 'active' AND plan != 'inquiry'")
                clients = [dict(r) for r in await cursor.fetchall()]
            for client in clients:
                try:
                    summary = await generate_weekly_report_text(client)
                    if not summary:
                        continue
                    report_id = generate_id("rpt")
                    async with aiosqlite.connect(DB_PATH) as db:
                        await db.execute(
                            "INSERT INTO weekly_reports (id, client_id, week_start, summary, highlights, recommendations, created_at) VALUES (?, ?, ?, ?, '', '', ?)",
                            (report_id, client["id"], week_start, summary, datetime.now().isoformat())
                        )
                        await db.commit()
                    if client.get("owner_email"):
                        await send_email(to=client["owner_email"],
                            subject=f"📊 Rapport Novalis — semaine du {week_start}",
                            body=f"<div style='font-family:sans-serif;max-width:640px;margin:0 auto;'><h2 style='color:#38bdf8;'>Rapport hebdomadaire — {client['business_name']}</h2><pre style='white-space:pre-wrap;color:#1e293b;'>{summary}</pre></div>")
                except Exception as e:
                    logger.error(f"Erreur rapport {client['id']}: {e}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Erreur tâche rapports: {e}")
            await asyncio.sleep(3600)

@app.get("/api/v1/me/reports")
async def get_my_reports(client: dict = Depends(verify_api_key)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, week_start, summary, created_at FROM weekly_reports WHERE client_id = ? ORDER BY week_start DESC LIMIT 12",
            (client["id"],)
        )
        return [dict(r) for r in await cursor.fetchall()]

# ============================================================
# ANALYTICS AVANCÉS — SENTIMENT & RÉSOLUTION
# ============================================================
@app.get("/api/v1/me/analytics/advanced")
async def get_advanced_analytics(client: dict = Depends(verify_api_key), days: int = Query(30, le=90)):
    """Analytics avancés : sentiment moyen, taux de résolution, taux d'escalade, temps de réponse."""
    since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Vue d'ensemble conversations
        cursor = await db.execute("""
            SELECT
                COUNT(*) as total_conversations,
                AVG(avg_sentiment) as avg_sentiment,
                SUM(escalated) as escalated_count,
                SUM(resolved) as resolved_count,
                AVG(first_response_ms) as avg_response_ms,
                AVG(message_count) as avg_messages_per_conv
            FROM conversation_analytics
            WHERE client_id = ? AND date >= ?
        """, (client["id"], since))
        overview = dict(await cursor.fetchone() or {})

        # Tendance sentiment par jour (7 derniers jours)
        cursor = await db.execute("""
            SELECT date, AVG(avg_sentiment) as daily_sentiment, COUNT(*) as conversations
            FROM conversation_analytics
            WHERE client_id = ? AND date >= ?
            GROUP BY date ORDER BY date DESC LIMIT 7
        """, (client["id"], since))
        sentiment_trend = [dict(r) for r in await cursor.fetchall()]

        # Distribution des intents
        cursor = await db.execute("""
            SELECT intent, COUNT(*) as count
            FROM messages WHERE client_id = ? AND role = 'client'
            AND timestamp >= ? AND intent IS NOT NULL
            GROUP BY intent ORDER BY count DESC LIMIT 10
        """, (client["id"], (datetime.now() - timedelta(days=days)).isoformat()))
        intent_distribution = [dict(r) for r in await cursor.fetchall()]

        # Messages avec sentiment négatif récents
        cursor = await db.execute("""
            SELECT m.content, m.sentiment_score, m.timestamp, m.language
            FROM messages m
            WHERE m.client_id = ? AND m.role = 'client'
            AND m.sentiment_score <= -0.5
            AND m.timestamp >= ?
            ORDER BY m.timestamp DESC LIMIT 5
        """, (client["id"], (datetime.now() - timedelta(days=days)).isoformat()))
        negative_messages = [dict(r) for r in await cursor.fetchall()]

    total = overview.get("total_conversations") or 0
    escalated = overview.get("escalated_count") or 0
    resolved = overview.get("resolved_count") or 0
    return {
        "period_days": days,
        "total_conversations": total,
        "avg_sentiment": round(overview.get("avg_sentiment") or 0, 3),
        "sentiment_label": "positif" if (overview.get("avg_sentiment") or 0) > 0.2 else
                           ("négatif" if (overview.get("avg_sentiment") or 0) < -0.2 else "neutre"),
        "escalation_rate": round(escalated / total * 100, 1) if total else 0,
        "resolution_rate": round(resolved / total * 100, 1) if total else 0,
        "avg_response_ms": round(overview.get("avg_response_ms") or 0),
        "avg_messages_per_conversation": round(overview.get("avg_messages_per_conv") or 0, 1),
        "sentiment_trend": sentiment_trend,
        "intent_distribution": intent_distribution,
        "recent_negative_messages": negative_messages,
    }


@app.get("/api/v1/me/analytics/sentiment")
async def get_sentiment_trends(client: dict = Depends(verify_api_key), days: int = Query(30, le=90)):
    """Tendances sentiment par canal (sms/voice/whatsapp)."""
    since = (datetime.now() - timedelta(days=days)).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT
                c.channel,
                COUNT(m.id) as message_count,
                AVG(m.sentiment_score) as avg_sentiment,
                SUM(CASE WHEN m.sentiment_score <= -0.5 THEN 1 ELSE 0 END) as negative_count,
                SUM(CASE WHEN m.sentiment_score >= 0.5 THEN 1 ELSE 0 END) as positive_count
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE m.client_id = ? AND m.role = 'client' AND m.timestamp >= ?
            GROUP BY c.channel
        """, (client["id"], since))
        by_channel = [dict(r) for r in await cursor.fetchall()]

        cursor = await db.execute("""
            SELECT language, COUNT(*) as count
            FROM messages
            WHERE client_id = ? AND role = 'client' AND timestamp >= ?
            GROUP BY language
        """, (client["id"], since))
        by_language = [dict(r) for r in await cursor.fetchall()]

    return {"by_channel": by_channel, "by_language": by_language}


# ============================================================
# RÈGLES D'ESCALADE INTELLIGENTES
# ============================================================
@app.get("/api/v1/me/escalation-rules")
async def get_my_escalation_rules(client: dict = Depends(verify_api_key)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM escalation_rules WHERE client_id = ? ORDER BY created_at",
            (client["id"],)
        )
        return [dict(r) for r in await cursor.fetchall()]


@app.post("/api/v1/me/escalation-rules")
async def create_escalation_rule(request: Request, client: dict = Depends(verify_api_key)):
    """
    Crée une règle d'escalade automatique.
    rule_type: sentiment_threshold | keyword | message_count | intent
    rule_value: ex. "-0.6" | "remboursement" | "5" | "complaint"
    action: notify (défaut) | auto_respond
    """
    data = await request.json()
    rule_type = data.get("rule_type", "").strip()
    rule_value = data.get("rule_value", "").strip()
    action = data.get("action", "notify")
    if rule_type not in ["sentiment_threshold", "keyword", "message_count", "intent"]:
        raise HTTPException(400, "rule_type invalide")
    if not rule_value:
        raise HTTPException(400, "rule_value requis")
    rule_id = generate_id("rule")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO escalation_rules (id,client_id,rule_type,rule_value,action,created_at) VALUES (?,?,?,?,?,?)",
            (rule_id, client["id"], rule_type, rule_value, action, now)
        )
        await db.commit()
    return {"id": rule_id, "rule_type": rule_type, "rule_value": rule_value, "action": action}


@app.delete("/api/v1/me/escalation-rules/{rule_id}")
async def delete_escalation_rule(rule_id: str, client: dict = Depends(verify_api_key)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM escalation_rules WHERE id = ? AND client_id = ?",
            (rule_id, client["id"])
        )
        await db.commit()
    return {"status": "deleted"}


# ============================================================
# ELEVENLABS TTS
# ============================================================
@app.post("/api/v1/tts")
async def text_to_speech_endpoint(request: Request, client: dict = Depends(verify_api_key)):
    """Synthèse vocale ElevenLabs (requiert ELEVENLABS_API_KEY)."""
    data = await request.json()
    text = data.get("text", "").strip()[:500]
    voice_id = data.get("voice_id", ELEVENLABS_VOICE_ID)
    if not text:
        raise HTTPException(400, "text requis")
    if not ELEVENLABS_API_KEY:
        raise HTTPException(503, "ElevenLabs non configuré (ajoutez ELEVENLABS_API_KEY)")
    audio = await generate_elevenlabs_audio(text, voice_id)
    if not audio:
        raise HTTPException(500, "Erreur génération audio")
    return Response(content=audio, media_type="audio/mpeg",
                    headers={"Content-Disposition": "attachment; filename=tts.mp3"})


@app.get("/audio/{audio_id}")
async def serve_voice_audio(audio_id: str):
    """Sert les fichiers audio temporaires pour les appels vocaux ElevenLabs."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT audio_bytes FROM voice_audio WHERE id = ?", (audio_id,))
        row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Audio non trouvé ou expiré")
    asyncio.create_task(_cleanup_old_voice_audio())
    return Response(content=row[0], media_type="audio/mpeg",
                    headers={"Cache-Control": "no-store"})

async def _cleanup_old_voice_audio():
    """Supprime les fichiers audio temporaires de plus de 10 minutes."""
    cutoff = (datetime.now() - timedelta(minutes=10)).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM voice_audio WHERE created_at < ?", (cutoff,))
        await db.commit()


# ============================================================
# DÉMO CHAT PUBLIQUE
# ============================================================
@app.post("/api/v1/demo-chat")
@limiter.limit("15/minute")
async def demo_chat(request: Request):
    """Démo IA publique (sans auth). Utilise Claude Haiku pour répondre aux visiteurs."""
    data = await request.json()
    message = sanitize_input(data.get("message", "").strip()[:300])
    if not message:
        raise HTTPException(400, "message requis")
    if not claude_client:
        lang = detect_language(message)
        fallback = "Our AI is momentarily unavailable. Contact us for a personalized demo." if lang == "en" else "L'IA est momentanément indisponible. Contactez-nous pour une démo personnalisée."
        return {"response": fallback}

    lang = detect_language(message)
    intent = detect_intent(message)

    if lang == "en":
        system_text = (
            "You are the Novalis AI demo assistant — a concise, expert AI for Quebec SMBs. "
            "Answer in 2-3 sentences max, in English. Be specific and helpful. "
            "If asked about pricing: Starter $497/mo, Pro $1,497/mo, Enterprise custom. "
            "If asked about results: first ROI in 22-30 days, -40% to -80% customer service costs. "
            "Encourage them to book a free consultation via the contact form."
        )
    else:
        system_text = (
            "Tu es l'assistant démo de Novalis IA — une IA concise et experte pour les PME québécoises. "
            "Réponds en 2-3 phrases max, en français québécois. Sois précis et utile. "
            "Prix: Starter 497$/mois, Pro 1 497$/mois, Entreprise sur mesure. "
            "Résultats: premier ROI en 22-30 jours, -40% à -80% coûts service client. "
            "Encourage la prise de contact via le formulaire."
        )

    try:
        resp = claude_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            system=system_text,
            messages=[{"role": "user", "content": message}]
        )
        ai_text = resp.content[0].text
    except Exception as e:
        logger.error(f"Demo chat error: {e}")
        ai_text = "Je suis là pour vous aider ! Contactez-nous pour une démo complète personnalisée." if lang != "en" else "I'm here to help! Contact us for a full personalized demo."

    return {"response": ai_text, "intent": intent}


# ============================================================
# ONBOARDING WIZARD
# ============================================================
@app.get("/onboarding", response_class=HTMLResponse)
async def onboarding_wizard(key: str = Query(None), t: str = Query(None)):
    """Assistant de configuration guidée pour les nouveaux clients."""
    # Auth identique au portail
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if t:
            cursor = await db.execute("SELECT * FROM clients WHERE portal_token = ? AND status IN ('active','inquiry')", (t,))
        elif key:
            cursor = await db.execute("SELECT * FROM clients WHERE api_key = ? AND status IN ('active','inquiry')", (key,))
        else:
            return Response(status_code=302, headers={"Location": "/portal"})
        client = await cursor.fetchone()

    if not client:
        return Response(status_code=302, headers={"Location": "/portal"})

    c = dict(client)

    # Générer/récupérer le portal_token pour injecter dans le wizard
    tok = c.get("portal_token") or ""
    if not tok:
        tok = secrets.token_urlsafe(32)
        expires_at = (datetime.now() + timedelta(days=30)).isoformat()
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("UPDATE clients SET portal_token = ?, portal_token_expires_at = ? WHERE id = ?",
                             (tok, expires_at, c["id"]))
            await db.commit()

    bname  = c["business_name"].replace("'", "\\'")
    bphone = (c.get("owner_phone") or "").replace("'", "\\'")
    api_k  = c["api_key"]

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Configuration — Novalis IA</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;1,400&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{{--obsidian:#090C0F;--pearl:#EDE8DF;--copper:#A86844;--copper-light:#C4895A;--slate:#1D2733;--dim:#4A5260;}}
*{{box-sizing:border-box;margin:0;padding:0;}}
body{{background:var(--obsidian);color:var(--pearl);font-family:'DM Sans',system-ui,sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased;}}
.wizard{{max-width:680px;margin:0 auto;padding:3rem 1.5rem;}}
.logo{{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.2rem;color:var(--copper);letter-spacing:0.15em;text-transform:uppercase;margin-bottom:2.5rem;}}
.progress{{display:flex;gap:4px;margin-bottom:2.5rem;}}
.dot{{flex:1;height:2px;background:rgba(237,232,223,0.1);transition:background 0.4s;}}
.dot.active{{background:var(--copper);}}
.dot.done{{background:var(--copper-light);}}
.step{{display:none;}}
.step.active{{display:block;animation:fadeIn 0.3s ease;}}
@keyframes fadeIn{{from{{opacity:0;transform:translateY(8px)}}to{{opacity:1;transform:none}}}}
.step-label{{font-size:0.6rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--copper);margin-bottom:0.75rem;}}
h1{{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:clamp(2rem,5vw,2.8rem);color:var(--pearl);margin-bottom:0.5rem;line-height:1;}}
.sub{{color:var(--dim);font-size:0.9rem;margin-bottom:2rem;}}
label{{display:block;font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--dim);margin-bottom:0.5rem;}}
input,textarea,select{{width:100%;background:rgba(29,39,51,0.6);border:0.5px solid rgba(237,232,223,0.15);color:var(--pearl);padding:0.875rem 1rem;font-family:inherit;font-size:0.9rem;outline:none;transition:border-color 0.2s;margin-bottom:1.25rem;-webkit-appearance:none;appearance:none;}}
input:focus,textarea:focus,select:focus{{border-color:rgba(168,104,68,0.5);}}
textarea{{resize:vertical;min-height:160px;}}
select{{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%234A5260' d='M6 8L1 3h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 1rem center;padding-right:2.5rem;}}
.row{{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}}
@media(max-width:600px){{.row{{grid-template-columns:1fr;}}}}
.btn{{background:var(--copper);color:var(--pearl);border:0.5px solid var(--copper);padding:0.875rem 2rem;font-family:inherit;font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:all 0.2s;display:inline-flex;align-items:center;gap:6px;text-decoration:none;}}
.btn:hover{{background:var(--copper-light);box-shadow:0 0 30px rgba(168,104,68,0.3);}}
.btn:disabled{{opacity:0.5;cursor:not-allowed;}}
.btn-ghost{{background:transparent;border:0.5px solid rgba(237,232,223,0.2);color:var(--pearl);}}
.btn-ghost:hover{{border-color:var(--copper);color:var(--copper-light);box-shadow:none;}}
.actions{{display:flex;justify-content:space-between;align-items:center;margin-top:2rem;gap:1rem;}}
.err{{color:#f87171;font-size:0.8rem;margin-top:-0.75rem;margin-bottom:1rem;min-height:1.2em;}}
.info-box{{background:rgba(168,104,68,0.07);border-left:2px solid var(--copper);padding:1rem 1.25rem;margin-bottom:1.5rem;font-size:0.83rem;color:rgba(237,232,223,0.7);line-height:1.6;}}
.card{{background:rgba(29,39,51,0.8);border:0.5px solid rgba(168,104,68,0.35);padding:1.75rem;margin-top:1.5rem;}}
.api-display{{background:rgba(0,0,0,0.35);border:0.5px solid rgba(168,104,68,0.25);padding:1rem;font-family:monospace;font-size:0.82rem;color:var(--copper-light);word-break:break-all;margin:0.75rem 0 0.25rem;cursor:pointer;transition:border-color 0.2s;}}
.api-display:hover{{border-color:rgba(168,104,68,0.6);}}
.check-list{{margin-top:1.5rem;display:flex;flex-direction:column;gap:0.75rem;}}
.check-item{{display:flex;align-items:flex-start;gap:0.75rem;font-size:0.83rem;color:rgba(237,232,223,0.65);}}
.check-icon{{width:18px;height:18px;border:0.5px solid var(--copper);display:flex;align-items:center;justify-content:center;shrink:0;color:var(--copper);font-size:10px;flex-shrink:0;margin-top:1px;}}
.spinner{{display:inline-block;width:13px;height:13px;border:1.5px solid rgba(237,232,223,0.3);border-top-color:var(--pearl);border-radius:50%;animation:spin 0.6s linear infinite;}}
@keyframes spin{{to{{transform:rotate(360deg)}}}}
</style>
</head>
<body>
<div class="wizard">
  <div class="logo">Novalis IA</div>
  <div class="progress">
    <div class="dot active" id="dot-1"></div>
    <div class="dot" id="dot-2"></div>
    <div class="dot" id="dot-3"></div>
  </div>

  <!-- Étape 1 : Profil -->
  <div class="step active" id="step-1">
    <div class="step-label">Étape 1 sur 3</div>
    <h1>Votre entreprise</h1>
    <p class="sub">Ces informations permettront à votre IA de répondre précisément à vos clients.</p>
    <div class="row">
      <div>
        <label>Nom de l'entreprise *</label>
        <input type="text" id="business_name" placeholder="Ex: Distribution Tremblay inc." />
      </div>
      <div>
        <label>Secteur d'activité</label>
        <select id="business_type">
          <option>Distribution</option><option>Commerce de détail</option>
          <option>Services professionnels</option><option>Immobilier</option>
          <option>Restauration</option><option>Santé</option>
          <option>Finance</option><option>Manufacturier</option><option>Autre</option>
        </select>
      </div>
    </div>
    <div class="row">
      <div>
        <label>Heures d'ouverture</label>
        <input type="text" id="hours" placeholder="Lun-Ven 9h-17h, Sam 10h-14h" />
      </div>
      <div>
        <label>Téléphone (affiché aux clients)</label>
        <input type="text" id="owner_phone" placeholder="+1 514 000-0000" />
      </div>
    </div>
    <label>Services offerts (séparés par des virgules)</label>
    <input type="text" id="services" placeholder="Vente, Livraison express, SAV, Location..." />
    <label>Adresse ou région desservie</label>
    <input type="text" id="address" placeholder="Montréal, QC ou 1234 rue Principale, Laval" />
    <div class="err" id="err-1"></div>
    <div class="actions">
      <span></span>
      <button class="btn" id="btn1" onclick="goStep2()">Continuer →</button>
    </div>
  </div>

  <!-- Étape 2 : Base de connaissances -->
  <div class="step" id="step-2">
    <div class="step-label">Étape 2 sur 3</div>
    <h1>Base de connaissances</h1>
    <p class="sub">Collez les informations que votre IA doit maîtriser pour répondre à vos clients.</p>
    <div class="info-box">
      💡 <strong>Conseil :</strong> Copiez votre FAQ, vos tarifs, vos politiques de retour, vos délais de livraison. Plus vous donnez d'informations, plus votre IA sera précise et autonome.
    </div>
    <label>Informations clés — FAQ, catalogue, procédures, politiques</label>
    <textarea id="kb_content" placeholder="Q: Quels sont vos délais de livraison ?
R: 2-3 jours ouvrables au Québec, 5-7 jours pour le reste du Canada.

Q: Acceptez-vous les retours ?
R: Oui, dans les 30 jours avec preuve d'achat. Contactez le SAV.

Prix de nos forfaits :
- Starter : 497$/mois — 1 assistant, 500 interactions
- Pro : 1 497$/mois — 3 assistants, interactions illimitées
..."></textarea>
    <p style="font-size:0.75rem;color:var(--dim);margin-top:-0.75rem;margin-bottom:1.5rem;">Vous pouvez ajouter d'autres documents (PDF, CSV) depuis votre portail après configuration.</p>
    <div class="err" id="err-2"></div>
    <div class="actions">
      <button class="btn btn-ghost" onclick="showStep(1)">← Retour</button>
      <button class="btn" id="btn2" onclick="goStep3()">Finaliser →</button>
    </div>
  </div>

  <!-- Étape 3 : Confirmé -->
  <div class="step" id="step-3">
    <div class="step-label">Configuration complète</div>
    <h1>Votre IA est prête.</h1>
    <p class="sub">Voici vos accès. Notre équipe vous contactera sous 24h pour connecter vos canaux.</p>
    <div class="card">
      <label>Votre clé API — ne jamais partager</label>
      <div class="api-display" id="key-display" onclick="copyKey()" title="Cliquer pour copier">…</div>
      <p style="font-size:0.7rem;color:var(--dim);">Cliquez pour copier · Accessible à tout moment depuis votre portail</p>
    </div>
    <div class="check-list">
      <div class="check-item"><div class="check-icon">✓</div><span>Profil d'entreprise enregistré</span></div>
      <div class="check-item"><div class="check-icon">✓</div><span>Base de connaissances indexée (recherche sémantique FTS5 active)</span></div>
      <div class="check-item"><div class="check-icon" id="kb-check" style="opacity:0.4">…</div><span>Notre équipe configure vos canaux SMS/Voix/WhatsApp sous 24h</span></div>
    </div>
    <div class="actions" style="margin-top:2.5rem;">
      <span></span>
      <a id="portal-btn" href="/portal" class="btn">Accéder à mon portail →</a>
    </div>
  </div>
</div>

<script>
const TOKEN = '{tok}';
const API_KEY = '{api_k}';
let kbUploaded = false;

document.getElementById('business_name').value = '{bname}';
document.getElementById('owner_phone').value = '{bphone}';
document.getElementById('key-display').textContent = API_KEY;
document.getElementById('portal-btn').href = '/portal?t=' + TOKEN;

function showStep(n) {{
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById('step-' + n).classList.add('active');
  ['dot-1','dot-2','dot-3'].forEach((id, i) => {{
    const d = document.getElementById(id);
    d.className = 'dot' + (i+1 < n ? ' done' : i+1 === n ? ' active' : '');
  }});
  window.scrollTo({{top:0, behavior:'smooth'}});
}}

async function goStep2() {{
  const name = document.getElementById('business_name').value.trim();
  const errEl = document.getElementById('err-1');
  if (!name) {{ errEl.textContent = 'Le nom de votre entreprise est requis.'; return; }}
  errEl.textContent = '';
  const btn = document.getElementById('btn1');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {{
    await fetch('/api/v1/me/profile', {{
      method: 'PATCH',
      headers: {{'Content-Type': 'application/json', 'X-API-Key': API_KEY}},
      body: JSON.stringify({{
        business_name: name,
        business_type: document.getElementById('business_type').value,
        hours: document.getElementById('hours').value,
        owner_phone: document.getElementById('owner_phone').value,
        services: document.getElementById('services').value,
        address: document.getElementById('address').value,
      }})
    }});
  }} catch(e) {{ console.error(e); }}
  btn.disabled = false;
  btn.textContent = 'Continuer →';
  showStep(2);
}}

async function goStep3() {{
  const btn = document.getElementById('btn2');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>&nbsp;Configuration…';
  const content = document.getElementById('kb_content').value.trim();
  if (content) {{
    try {{
      const blob = new Blob([content], {{type: 'text/plain'}});
      const fd = new FormData();
      fd.append('file', blob, 'base-de-connaissances.txt');
      fd.append('title', 'Base de connaissances principale');
      fd.append('kb_type', 'faq');
      const r = await fetch('/api/v1/me/knowledge-base/upload', {{
        method: 'POST', headers: {{'X-API-Key': API_KEY}}, body: fd
      }});
      if (r.ok) {{ kbUploaded = true; }}
    }} catch(e) {{ console.error(e); }}
  }}
  try {{
    await fetch('/api/v1/me/onboarding/complete', {{
      method: 'POST', headers: {{'X-API-Key': API_KEY}}
    }});
  }} catch(e) {{ console.error(e); }}
  if (kbUploaded || content) {{
    document.getElementById('kb-check').textContent = '✓';
    document.getElementById('kb-check').style.opacity = '1';
  }}
  btn.disabled = false;
  btn.textContent = 'Finaliser →';
  showStep(3);
}}

function copyKey() {{
  navigator.clipboard.writeText(API_KEY).then(() => {{
    const el = document.getElementById('key-display');
    const orig = el.textContent;
    el.textContent = '✓ Copié dans le presse-papier';
    setTimeout(() => el.textContent = orig, 1800);
  }});
}}
</script>
</body>
</html>"""

    return HTMLResponse(html)


# ============================================================
# PORTAIL CLIENT
# ============================================================
@app.get("/portal", response_class=HTMLResponse)
async def client_portal(key: str = Query(None), t: str = Query(None)):
    """Portail client — auth par token sécurisé (?t=) ou clé API legacy (?key=)."""
    login_page = """<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Portail — Novalis IA</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,400&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
    <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        :root{--obs:#090C0F;--pearl:#EDE8DF;--cu:#A86844;--cl:#C4895A;--sl:#1D2733;--dim:#4A5260;--b:rgba(168,104,68,0.2);}
        body{font-family:'DM Sans',system-ui,sans-serif;background:var(--obs);color:var(--pearl);display:flex;align-items:center;justify-content:center;min-height:100vh;-webkit-font-smoothing:antialiased;}
        .box{background:rgba(29,39,51,0.9);border:0.5px solid var(--b);padding:48px 40px;max-width:400px;width:90%;text-align:center;backdrop-filter:blur(20px);position:relative;}
        .box::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--cu),transparent);}
        .logo{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:2rem;color:var(--pearl);margin-bottom:4px;letter-spacing:0.05em;}
        .tagline{font-size:0.6rem;letter-spacing:0.25em;text-transform:uppercase;color:var(--cu);margin-bottom:28px;}
        h2{color:var(--pearl);font-size:1.1rem;font-weight:500;margin-bottom:6px;}
        p{color:var(--dim);font-size:0.82rem;margin-bottom:24px;line-height:1.5;}
        input{width:100%;padding:12px 14px;border:0.5px solid var(--b);background:rgba(255,255,255,0.03);color:var(--pearl);font-size:0.9rem;font-family:inherit;margin-bottom:14px;outline:none;transition:border 0.2s;}
        input:focus{border-color:rgba(168,104,68,0.5);}
        input::placeholder{color:var(--dim);}
        button{background:var(--cu);color:var(--obs);border:none;padding:12px 24px;font-family:inherit;font-weight:500;cursor:pointer;width:100%;font-size:0.9rem;transition:background 0.2s;letter-spacing:0.03em;}
        button:hover{background:var(--cl);}
        .hint{margin-top:20px;font-size:0.7rem;color:var(--dim);}
        .hint a{color:var(--cu);text-decoration:none;}
        .hint a:hover{color:var(--cl);}
    </style></head><body>
    <div class="box">
        <div class="logo">Novalis</div>
        <div class="tagline">Intelligence Artificielle</div>
        <h2>Portail client</h2>
        <p>Entrez votre clé d'accès pour consulter votre tableau de bord.</p>
        <input id="k" placeholder="Clé d'accès…" type="password" onkeydown="if(event.key==='Enter')go()"/>
        <button onclick="go()">Accéder</button>
        <p class="hint">Clé perdue ? <a href="mailto:novalisproia@gmail.com">Contactez-nous</a></p>
    </div>
    <script>function go(){const k=document.getElementById('k').value.trim();if(k)window.location.href='/portal?key='+encodeURIComponent(k);}</script>
    </body></html>"""

    if not key and not t:
        return HTMLResponse(login_page, status_code=200)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if t:
            cursor = await db.execute("SELECT * FROM clients WHERE portal_token = ? AND status = 'active'", (t,))
        else:
            cursor = await db.execute("SELECT * FROM clients WHERE api_key = ? AND status = 'active'", (key,))
        client = await cursor.fetchone()

    if not client:
        return HTMLResponse("""<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Accès refusé — Novalis</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'DM Sans',system-ui,sans-serif;background:#090C0F;color:#EDE8DF;display:flex;align-items:center;justify-content:center;min-height:100vh;}div{text-align:center;}h2{font-size:1.2rem;font-weight:500;margin-bottom:8px;}p{color:#4A5260;font-size:0.85rem;}a{color:#A86844;text-decoration:none;}a:hover{color:#C4895A;}</style></head><body><div><h2>Accès refusé</h2><p>Clé invalide ou compte inactif. <a href="/portal">Réessayer</a></p></div></body></html>""", status_code=401)

    c = dict(client)

    # Vérifier expiry du token (30 jours)
    if t:
        expires = c.get("portal_token_expires_at", "")
        if expires:
            try:
                if datetime.fromisoformat(expires) < datetime.now():
                    async with aiosqlite.connect(DB_PATH) as db:
                        await db.execute("UPDATE clients SET portal_token = '', portal_token_expires_at = '' WHERE id = ?", (c["id"],))
                        await db.commit()
                    return Response(status_code=302, headers={"Location": "/portal", "Cache-Control": "no-store"})
            except ValueError:
                pass

    # Rétro-compat: si authentifié par api_key, générer/utiliser le portal_token et rediriger
    if key and not t:
        tok = c.get("portal_token") or ""
        if not tok:
            tok = secrets.token_urlsafe(32)
            expires_at = (datetime.now() + timedelta(days=30)).isoformat()
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute("UPDATE clients SET portal_token = ?, portal_token_expires_at = ? WHERE id = ?",
                                 (tok, expires_at, c["id"]))
                await db.commit()
            c["portal_token"] = tok
        return Response(status_code=302, headers={"Location": f"/portal?t={tok}", "Cache-Control": "no-store"})

    c_api_key = c["api_key"]
    c_api_key_masked = "•" * len(c_api_key)
    portal_tok = t or c.get("portal_token", "")

    # Bannière trial
    trial_exp_date = c.get("trial_expires_at", "")[:10] if c.get("trial_expires_at") else "—"
    trial_banner = (
        f'<div style="background:rgba(168,104,68,0.08);border:0.5px solid rgba(168,104,68,0.35);'
        f'padding:14px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">'
        f'<div><p style="margin:0 0 2px;font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:#A86844;">Essai gratuit</p>'
        f'<p style="margin:0;color:#EDE8DF;font-size:0.85rem;">Votre trial se termine le <strong>{trial_exp_date}</strong> — passez à un plan pour continuer.</p></div>'
        f'<a href="#" onclick="upgradePlan(event,\'starter\')" style="background:#A86844;color:#EDE8DF;text-decoration:none;padding:8px 20px;font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;border:0.5px solid #C4895A;white-space:nowrap;">Choisir un plan →</a>'
        f'</div>'
    ) if c.get("plan") == "trial" else ""

    portal_html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Portail — {c['business_name']} | Novalis</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,400&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root{{--obs:#090C0F;--pearl:#EDE8DF;--cu:#A86844;--cl:#C4895A;--sl:#1D2733;--sl2:#253345;--dim:#4A5260;--b:rgba(168,104,68,0.2);}}
        *{{margin:0;padding:0;box-sizing:border-box;}}
        body{{font-family:'DM Sans',system-ui,sans-serif;background:var(--obs);color:var(--pearl);-webkit-font-smoothing:antialiased;}}
        .layout{{display:flex;min-height:100vh;}}
        .sidebar{{width:236px;background:rgba(29,39,51,0.97);border-right:0.5px solid var(--b);padding:0;position:fixed;height:100vh;overflow-y:auto;display:flex;flex-direction:column;}}
        .sb-logo{{padding:24px 20px 20px;border-bottom:0.5px solid var(--b);}}
        .sb-brand{{font-size:0.65rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--cu);}}
        .sb-biz{{color:var(--pearl);font-size:0.85rem;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;}}
        .sb-plan{{display:inline-block;margin-top:6px;padding:2px 8px;font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;background:rgba(168,104,68,0.12);color:var(--cu);border:0.5px solid rgba(168,104,68,0.3);}}
        nav{{flex:1;padding:12px 0;}}
        .nl{{display:flex;align-items:center;gap:10px;padding:9px 20px;color:var(--dim);text-decoration:none;font-size:0.8rem;font-weight:500;transition:all 0.15s;cursor:pointer;border:none;background:none;width:100%;text-align:left;border-left:2px solid transparent;}}
        .nl:hover{{color:var(--pearl);background:rgba(168,104,68,0.06);}}
        .nl.active{{color:var(--pearl);background:rgba(168,104,68,0.1);border-left-color:var(--cu);}}
        .nl .ico{{width:16px;text-align:center;font-size:0.85rem;}}
        .sb-footer{{padding:16px 20px;border-top:0.5px solid var(--b);font-size:0.7rem;color:var(--dim);}}
        .main{{margin-left:236px;padding:32px;flex:1;max-width:calc(100vw - 236px);}}
        .page{{display:none;animation:fi 0.2s ease;}}.page.active{{display:block;}}
        @keyframes fi{{from{{opacity:0;transform:translateY(6px)}}to{{opacity:1;transform:none}}}}
        .pg-hdr{{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:28px;gap:16px;flex-wrap:wrap;}}
        .pg-title{{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:2rem;color:var(--pearl);line-height:1;}}
        .pg-sub{{color:var(--dim);font-size:0.8rem;margin-top:4px;}}
        .stats-row{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;}}
        .sc{{background:rgba(29,39,51,0.8);border:0.5px solid var(--b);padding:20px;position:relative;}}
        .sc::before{{content:'';position:absolute;top:0;left:0;width:32px;height:1px;background:var(--cu);}}
        .sc-lbl{{color:var(--dim);font-size:0.65rem;text-transform:uppercase;letter-spacing:0.12em;}}
        .sc-val{{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:2rem;color:var(--pearl);margin-top:4px;line-height:1;}}
        .sc-sub{{color:var(--dim);font-size:0.7rem;margin-top:2px;}}
        .card{{background:rgba(29,39,51,0.8);border:0.5px solid var(--b);padding:20px;margin-bottom:14px;position:relative;}}
        .card-title{{font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--cu);margin-bottom:16px;}}
        table{{width:100%;border-collapse:collapse;}}
        th{{color:var(--dim);font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;padding:8px 12px;text-align:left;border-bottom:0.5px solid var(--b);}}
        td{{padding:10px 12px;border-bottom:0.5px solid rgba(237,232,223,0.04);font-size:0.82rem;color:rgba(237,232,223,0.75);}}
        tr:hover td{{background:rgba(168,104,68,0.04);}}
        .badge{{display:inline-block;padding:2px 8px;font-size:0.6rem;letter-spacing:0.08em;text-transform:uppercase;border:0.5px solid;}}
        .bg{{background:rgba(74,195,111,0.1);color:#4ac36f;border-color:rgba(74,195,111,0.3);}}
        .by{{background:rgba(251,191,36,0.1);color:#fbbf24;border-color:rgba(251,191,36,0.3);}}
        .bc{{background:rgba(168,104,68,0.12);color:var(--cu);border-color:rgba(168,104,68,0.3);}}
        .bd{{background:rgba(237,232,223,0.06);color:var(--dim);border-color:rgba(237,232,223,0.15);}}
        .br{{background:rgba(239,68,68,0.1);color:#f87171;border-color:rgba(239,68,68,0.3);}}
        .pb{{height:4px;background:rgba(237,232,223,0.08);margin-top:8px;}}
        .pf{{height:4px;background:var(--cu);transition:width 0.5s;}}
        .insight{{border-left:2px solid var(--cu);padding:10px 14px;margin-bottom:8px;font-size:0.82rem;color:rgba(237,232,223,0.7);background:rgba(168,104,68,0.05);}}
        .roi-val{{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:3rem;color:var(--cl);line-height:1;}}
        .chart-wrap{{position:relative;height:200px;}}
        .chart-wrap-sm{{position:relative;height:160px;}}
        .empty{{text-align:center;padding:32px;color:var(--dim);font-size:0.85rem;}}
        label.lbl{{display:block;font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--dim);margin-bottom:6px;}}
        input.fi,textarea.fi,select.fi{{width:100%;background:rgba(29,39,51,0.6);border:0.5px solid rgba(237,232,223,0.12);color:var(--pearl);padding:10px 12px;font-family:'DM Sans',sans-serif;font-size:0.85rem;outline:none;transition:border-color 0.2s;margin-bottom:12px;-webkit-appearance:none;appearance:none;}}
        input.fi:focus,textarea.fi:focus,select.fi:focus{{border-color:rgba(168,104,68,0.5);}}
        textarea.fi{{resize:vertical;min-height:100px;}}
        select.fi{{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%234A5260' d='M6 8L1 3h10z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;}}
        .btn{{background:var(--cu);color:var(--pearl);border:0.5px solid var(--cu);padding:8px 18px;font-family:'DM Sans',sans-serif;font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:all 0.2s;display:inline-flex;align-items:center;gap:6px;}}
        .btn:hover{{background:var(--cl);box-shadow:0 0 20px rgba(168,104,68,0.25);}}
        .btn:disabled{{opacity:0.4;cursor:not-allowed;}}
        .btn-sm{{padding:5px 12px;font-size:0.65rem;}}
        .btn-ghost{{background:transparent;border:0.5px solid rgba(237,232,223,0.2);color:var(--pearl);}}
        .btn-ghost:hover{{border-color:var(--cu);color:var(--cl);box-shadow:none;}}
        .btn-danger{{background:transparent;border:0.5px solid rgba(239,68,68,0.4);color:#f87171;}}
        .btn-danger:hover{{background:rgba(239,68,68,0.1);box-shadow:none;}}
        .api-box{{background:rgba(0,0,0,0.3);border:0.5px solid rgba(168,104,68,0.25);padding:12px;font-family:monospace;font-size:0.8rem;color:var(--cl);word-break:break-all;cursor:pointer;}}
        .api-box:hover{{border-color:rgba(168,104,68,0.5);}}
        .row2{{display:grid;grid-template-columns:1fr 1fr;gap:12px;}}
        .sent-pos{{color:#4ac36f;}} .sent-neg{{color:#f87171;}} .sent-neu{{color:var(--dim);}}
        .spinner{{display:inline-block;width:12px;height:12px;border:1.5px solid rgba(237,232,223,0.2);border-top-color:var(--pearl);border-radius:50%;animation:sp 0.6s linear infinite;}}
        @keyframes sp{{to{{transform:rotate(360deg)}}}}
        @media(max-width:900px){{.sidebar{{width:100%;height:auto;position:static;}}.main{{margin-left:0;padding:16px;max-width:100%;}}.row2{{grid-template-columns:1fr;}}}}
    </style>
</head>
<body>
<div class="layout">
  <div class="sidebar">
    <div class="sb-logo">
      <div class="sb-brand">Novalis IA</div>
      <div class="sb-biz">{c['business_name']}</div>
      <div class="sb-plan">{c['plan']}</div>
    </div>
    <nav>
      <button class="nl active" onclick="nav(this,'dashboard')"><span class="ico">▦</span> Tableau de bord</button>
      <button class="nl" onclick="nav(this,'conversations')"><span class="ico">◎</span> Conversations</button>
      <button class="nl" onclick="nav(this,'analytics')"><span class="ico">◈</span> Analytics sentiment</button>
      <button class="nl" onclick="nav(this,'escalation')"><span class="ico">⚡</span> Règles d'escalade</button>
      <button class="nl" onclick="nav(this,'appointments')"><span class="ico">◷</span> Rendez-vous</button>
      <button class="nl" onclick="nav(this,'projects')"><span class="ico">◫</span> Projets</button>
      <button class="nl" onclick="nav(this,'knowledge')"><span class="ico">◉</span> Base de connaissances</button>
      <button class="nl" onclick="nav(this,'campaigns')"><span class="ico">◈</span> Campagnes</button>
      <button class="nl" onclick="nav(this,'webhooks')"><span class="ico">◌</span> Intégrations</button>
      <button class="nl" onclick="nav(this,'reports')"><span class="ico">◐</span> Rapports IA</button>
      <button class="nl" onclick="nav(this,'roi')"><span class="ico">◑</span> ROI</button>
      <button class="nl" onclick="nav(this,'settings')"><span class="ico">◎</span> Mon compte</button>
    </nav>
    <div class="sb-footer">Novalis IA · {c['owner_email']}</div>
  </div>
  <div class="main">


    <!-- DASHBOARD -->
    <div class="page active" id="page-dashboard">
      <div class="pg-hdr">
        <div><div class="pg-title">Tableau de bord</div><div class="pg-sub">30 derniers jours</div></div>
      </div>
      {trial_banner}
      <div class="stats-row" id="statsRow"><div class="sc" style="grid-column:1/-1;color:var(--dim);">Chargement…</div></div>
      <div class="row2">
        <div class="card"><div class="card-title">Activité quotidienne</div><div class="chart-wrap"><canvas id="chartAct"></canvas></div></div>
        <div class="card"><div class="card-title">Humeur des clients</div><div class="chart-wrap"><canvas id="chartSent"></canvas></div></div>
      </div>
      <div class="card"><div class="card-title">Utilisation du plan</div><div id="usageSection"></div></div>
    </div>

    <!-- CONVERSATIONS -->
    <div class="page" id="page-conversations">
      <div class="pg-hdr"><div><div class="pg-title">Conversations</div></div></div>
      <div class="card">
        <table>
          <thead><tr><th>Contact</th><th>Canal</th><th>Dernière activité</th><th>Messages</th><th>Sentiment</th><th></th></tr></thead>
          <tbody id="convsTable"><tr><td colspan="6" class="empty">Chargement…</td></tr></tbody>
        </table>
      </div>
      <div class="card" id="convDetail" style="display:none;">
        <div class="card-title" id="convDetailTitle">Conversation</div>
        <div id="convMessages" style="max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;"></div>
      </div>
    </div>

    <!-- ANALYTICS -->
    <div class="page" id="page-analytics">
      <div class="pg-hdr"><div><div class="pg-title">Analytics sentiment</div><div class="pg-sub">Indicateurs IA avancés</div></div></div>
      <div class="stats-row" id="analyticsStats"><div class="sc" style="grid-column:1/-1;color:var(--dim);">Chargement…</div></div>
      <div class="row2">
        <div class="card"><div class="card-title">Distribution des intentions</div><div class="chart-wrap-sm"><canvas id="chartIntent"></canvas></div></div>
        <div class="card"><div class="card-title">Sentiment par canal</div><div id="sentByChannel"></div></div>
      </div>
    </div>

    <!-- ESCALADE -->
    <div class="page" id="page-escalation">
      <div class="pg-hdr"><div><div class="pg-title">Règles d'escalade</div><div class="pg-sub">Transfert automatique vers votre équipe</div></div></div>
      <div class="card">
        <div class="card-title">Ajouter une règle</div>
        <div class="row2">
          <div>
            <label class="lbl">Type de règle</label>
            <select id="esc_type" class="fi" onchange="updateEscPlaceholder()">
              <option value="sentiment_threshold">Sentiment négatif (seuil)</option>
              <option value="keyword">Mot-clé critique</option>
              <option value="message_count">Nombre de messages</option>
              <option value="intent">Intention détectée</option>
            </select>
          </div>
          <div>
            <label class="lbl" id="esc_val_lbl">Valeur seuil (ex: -0.6)</label>
            <input id="esc_val" class="fi" placeholder="-0.6" />
          </div>
        </div>
        <button class="btn" onclick="addEscRule()">Ajouter la règle</button>
        <div id="esc_msg" style="margin-top:10px;font-size:0.8rem;"></div>
      </div>
      <div class="card">
        <div class="card-title">Règles actives</div>
        <div id="escList"><div class="empty">Chargement…</div></div>
      </div>
    </div>

    <!-- RENDEZ-VOUS -->
    <div class="page" id="page-appointments">
      <div class="pg-hdr">
        <div><div class="pg-title">Rendez-vous</div></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="filterAppts('')">Tous</button>
          <button class="btn btn-ghost btn-sm" onclick="filterAppts('pending')">En attente</button>
          <button class="btn btn-ghost btn-sm" onclick="filterAppts('confirmed')">Confirmés</button>
        </div>
      </div>
      <div class="card">
        <table>
          <thead><tr><th>Date / Heure</th><th>Client</th><th>Service</th><th>Statut</th><th></th></tr></thead>
          <tbody id="apptsTable"><tr><td colspan="5" class="empty">Chargement…</td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- PROJETS -->
    <div class="page" id="page-projects">
      <div class="pg-hdr"><div><div class="pg-title">Mes projets</div></div></div>
      <div id="projectsList"></div>
    </div>

    <!-- KNOWLEDGE BASE -->
    <div class="page" id="page-knowledge">
      <div class="pg-hdr"><div><div class="pg-title">Base de connaissances</div><div class="pg-sub">Tout ce que vous ajoutez ici, votre IA le maîtrisera.</div></div></div>
      <div class="row2">
        <div>
          <div class="card">
            <div class="card-title">Saisie manuelle</div>
            <label class="lbl">Type</label>
            <select id="kb_type" class="fi">
              <option value="faq">FAQ</option><option value="menu">Catalogue / Prix</option>
              <option value="policy">Politiques</option><option value="team">Équipe</option><option value="custom">Autre</option>
            </select>
            <label class="lbl">Titre</label>
            <input id="kb_title" class="fi" placeholder="Ex: Nos tarifs 2026" />
            <label class="lbl">Contenu</label>
            <textarea id="kb_content" class="fi" placeholder="Collez votre FAQ, catalogue, politiques..."></textarea>
            <button class="btn" onclick="addKbEntry()">Ajouter</button>
          </div>
          <div class="card">
            <div class="card-title">Upload fichier</div>
            <p style="font-size:0.8rem;color:var(--dim);margin-bottom:12px;">Formats acceptés : .txt, .pdf, .csv, .md</p>
            <label class="lbl">Titre du document</label>
            <input id="kb_file_title" class="fi" placeholder="Ex: Catalogue produits 2026" />
            <label class="lbl">Fichier</label>
            <input type="file" id="kb_file" accept=".txt,.pdf,.csv,.md" class="fi" style="padding:6px;" />
            <button class="btn" id="btn_upload" onclick="uploadKbFile()" style="margin-top:4px;">Uploader le fichier</button>
            <div id="upload_msg" style="margin-top:8px;font-size:0.8rem;"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Entrées indexées</div>
          <div id="kbList"><div class="empty">Chargement…</div></div>
        </div>
      </div>
    </div>

    <!-- CAMPAGNES -->
    <div class="page" id="page-campaigns">
      <div class="pg-hdr"><div><div class="pg-title">Campagnes</div><div class="pg-sub">SMS et WhatsApp proactifs</div></div></div>
      <div class="row2">
        <div class="card">
          <div class="card-title">Nouvelle campagne</div>
          <label class="lbl">Nom</label><input id="camp_name" class="fi" placeholder="Ex: Promo été 2026" />
          <label class="lbl">Canal</label>
          <select id="camp_channel" class="fi"><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select>
          <label class="lbl">Message</label>
          <textarea id="camp_message" class="fi" placeholder="Bonjour ! Profitez de notre spécial…"></textarea>
          <div id="charCount" style="color:var(--dim);font-size:0.7rem;margin-top:-8px;margin-bottom:10px;">0 / 160</div>
          <label class="lbl">Numéros (un par ligne)</label>
          <textarea id="camp_contacts" class="fi" placeholder="+15141234567&#10;+14381234567"></textarea>
          <button class="btn" onclick="createCampaign()">Créer la campagne</button>
        </div>
        <div class="card">
          <div class="card-title">Mes campagnes</div>
          <div id="campList"><div class="empty">Chargement…</div></div>
        </div>
      </div>
    </div>

    <!-- WEBHOOKS -->
    <div class="page" id="page-webhooks">
      <div class="pg-hdr"><div><div class="pg-title">Intégrations</div><div class="pg-sub">Webhooks vers votre CRM</div></div></div>
      <div class="row2">
        <div class="card">
          <div class="card-title">Ajouter un webhook</div>
          <label class="lbl">URL HTTPS</label>
          <input id="wh_url" class="fi" placeholder="https://votre-crm.com/webhook/novalis" />
          <label class="lbl">Événements</label>
          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
            <label style="font-size:0.8rem;color:var(--pearl);display:flex;align-items:center;gap:6px;"><input type="checkbox" id="ev_appt" checked> Nouveau RDV</label>
            <label style="font-size:0.8rem;color:var(--pearl);display:flex;align-items:center;gap:6px;"><input type="checkbox" id="ev_transfer" checked> Transfert</label>
            <label style="font-size:0.8rem;color:var(--pearl);display:flex;align-items:center;gap:6px;"><input type="checkbox" id="ev_msg"> Nouveau message</label>
          </div>
          <button class="btn" onclick="createWebhook()">Ajouter</button>
          <div id="wh_result" style="margin-top:12px;"></div>
        </div>
        <div class="card">
          <div class="card-title">Webhooks actifs</div>
          <div id="whList"><div class="empty">Chargement…</div></div>
        </div>
      </div>
    </div>

    <!-- RAPPORTS IA -->
    <div class="page" id="page-reports">
      <div class="pg-hdr"><div><div class="pg-title">Rapports IA</div><div class="pg-sub">Généré automatiquement chaque dimanche</div></div></div>
      <div id="reportsList"><div class="empty">Chargement…</div></div>
    </div>

    <!-- ROI -->
    <div class="page" id="page-roi">
      <div class="pg-hdr"><div><div class="pg-title">Rapport ROI</div><div class="pg-sub">30 derniers jours</div></div></div>
      <div id="roiContent"><div class="empty">Chargement…</div></div>
    </div>

    <!-- SETTINGS -->
    <div class="page" id="page-settings">
      <div class="pg-hdr"><div><div class="pg-title">Mon compte</div></div></div>
      <div class="row2">
        <div>
          <div class="card">
            <div class="card-title">Profil de l'entreprise</div>
            <label class="lbl">Nom de l'entreprise</label>
            <input id="s_bname" class="fi" value="{c['business_name']}" />
            <label class="lbl">Secteur</label>
            <input id="s_btype" class="fi" value="{c.get('business_type','')}" placeholder="Distribution, Retail…" />
            <label class="lbl">Heures d'ouverture</label>
            <input id="s_hours" class="fi" value="{c.get('hours','')}" placeholder="Lun-Ven 9h-17h" />
            <label class="lbl">Téléphone (affiché aux clients)</label>
            <input id="s_phone" class="fi" value="{c.get('owner_phone','')}" placeholder="+1 514 000-0000" />
            <label class="lbl">Services offerts</label>
            <input id="s_services" class="fi" value="{c.get('services','')}" placeholder="Vente, Livraison, SAV…" />
            <label class="lbl">Adresse</label>
            <input id="s_addr" class="fi" value="{c.get('address','')}" placeholder="Montréal, QC" />
            <button class="btn" id="btn_save_profile" onclick="saveProfile()">Enregistrer</button>
            <div id="save_msg" style="margin-top:8px;font-size:0.8rem;"></div>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="card-title">Informations du compte</div>
            <table>
              <tr><td style="color:var(--dim);padding:8px 0;font-size:0.8rem;">Propriétaire</td><td style="font-size:0.8rem;">{c['owner_name']}</td></tr>
              <tr><td style="color:var(--dim);padding:8px 0;font-size:0.8rem;">Courriel</td><td style="font-size:0.8rem;">{c['owner_email']}</td></tr>
              <tr><td style="color:var(--dim);padding:8px 0;font-size:0.8rem;">Plan</td><td><span class="badge bc">{c['plan'].upper()}</span></td></tr>
              <tr><td style="color:var(--dim);padding:8px 0;font-size:0.8rem;">Statut</td><td><span class="badge bg">Actif</span></td></tr>
            </table>
          </div>
          <div class="card">
            <div class="card-title">Clé API</div>
            <p style="font-size:0.78rem;color:var(--dim);margin-bottom:10px;">Ne jamais partager. Cliquez pour afficher et copier.</p>
            <div class="api-box" id="apiKeyDisplay" onclick="revealKey()" title="Cliquer pour afficher / copier">{c_api_key_masked}</div>
          </div>
          <div class="card">
            <div class="card-title">Support</div>
            <p style="font-size:0.82rem;color:var(--dim);">Pour toute question : <a href="mailto:{ADMIN_EMAIL}" style="color:var(--cu);">{ADMIN_EMAIL}</a></p>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>

<script>
const API_KEY = '{c_api_key}';
const H = {{'X-API-Key': API_KEY}};
let charts = {{}};

async function upgradePlan(e, plan) {{
  e.preventDefault();
  const r = await fetch('/api/v1/checkout/'+plan, {{method:'POST',headers:{{'X-API-Key':API_KEY}}}});
  if(r.ok){{const d=await r.json();window.location.href=d.checkout_url;}}
  else alert('Erreur — contactez novalisproia@gmail.com');
}}
function nav(btn, name) {{
  document.querySelectorAll('.nl').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('page-'+name).classList.add('active');
  const loaders = {{dashboard:loadDashboard,conversations:loadConversations,analytics:loadAnalytics,
    escalation:loadEscalation,appointments:()=>loadAppointments(''),projects:loadProjects,
    knowledge:loadKnowledgeBase,campaigns:loadCampaigns,webhooks:loadWebhooks,
    reports:loadReports,roi:loadRoi}};
  if(loaders[name]) loaders[name]();
}}

function mkChart(id, cfg) {{
  if(charts[id]) charts[id].destroy();
  const ctx = document.getElementById(id);
  if(!ctx) return;
  charts[id] = new Chart(ctx, cfg);
}}

const CU = 'rgba(168,104,68,';
const GR = 'rgba(237,232,223,0.04)';

async function loadDashboard() {{
  const [me, stats] = await Promise.all([
    fetch('/api/v1/me',{{headers:H}}).then(r=>r.json()),
    fetch('/api/v1/me/stats?days=30',{{headers:H}}).then(r=>r.json())
  ]);
  const s = stats.summary;
  document.getElementById('statsRow').innerHTML = `
    <div class="sc"><div class="sc-lbl">Interactions</div><div class="sc-val">${{s.total_interactions}}</div><div class="sc-sub">30 jours</div></div>
    <div class="sc"><div class="sc-lbl">RDV gérés</div><div class="sc-val">${{s.rdv_requests}}</div><div class="sc-sub">automatiquement</div></div>
    <div class="sc"><div class="sc-lbl">Heures sauvées</div><div class="sc-val">${{s.estimated_hours_saved}}</div><div class="sc-sub">estimé</div></div>
    <div class="sc"><div class="sc-lbl">Valeur créée</div><div class="sc-val">${{s.estimated_value_saved}}</div><div class="sc-sub">ce mois</div></div>`;
  const pct = Math.min(100, Math.round(me.messages_used/Math.max(me.messages_limit||1,1)*100));
  document.getElementById('usageSection').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <span style="font-size:0.85rem;">${{me.messages_used}} / ${{me.messages_limit===0?'∞':me.messages_limit}} messages</span>
      <span class="badge bc">${{me.plan.toUpperCase()}}</span>
    </div>
    <div class="pb"><div class="pf" style="width:${{pct}}%"></div></div>
    <div style="font-size:0.7rem;color:var(--dim);margin-top:6px;">${{pct}}% utilisé ce mois</div>`;
  const daily = stats.daily||[];
  mkChart('chartAct',{{type:'bar',data:{{
    labels:daily.map(d=>d.date.slice(5)),
    datasets:[{{data:daily.map(d=>d.interactions),backgroundColor:CU+'0.5)',borderColor:CU+'0.9)',borderWidth:1,borderRadius:2}}]
  }},options:{{responsive:true,maintainAspectRatio:false,plugins:{{legend:{{display:false}}}},
    scales:{{x:{{ticks:{{color:'#4A5260',font:{{size:9}}}},grid:{{color:GR}}}},y:{{ticks:{{color:'#4A5260'}},grid:{{color:GR}},beginAtZero:true}}}}
  }}}});
  // Sentiment trend
  try {{
    const sa = await fetch('/api/v1/me/analytics/sentiment',{{headers:H}}).then(r=>r.json());
    const sd = sa.daily_sentiment||[];
    mkChart('chartSent',{{type:'line',data:{{
      labels:sd.map(d=>d.date?.slice(5)||''),
      datasets:[{{data:sd.map(d=>d.avg_sentiment||0),borderColor:CU+'0.9)',backgroundColor:CU+'0.1)',fill:true,tension:0.4,pointRadius:2}}]
    }},options:{{responsive:true,maintainAspectRatio:false,plugins:{{legend:{{display:false}}}},
      scales:{{x:{{ticks:{{color:'#4A5260',font:{{size:9}}}},grid:{{color:GR}}}},
               y:{{ticks:{{color:'#4A5260'}},grid:{{color:GR}},min:-1,max:1}}}}
    }}}});
  }} catch(e) {{}}
}}

async function loadConversations() {{
  const rows = await fetch('/api/v1/me/conversations',{{headers:H}}).then(r=>r.json()).catch(()=>[]);
  const chIcon = {{sms:'SMS',voice:'Voix',messenger:'Messenger',whatsapp:'WA'}};
  const sentFmt = s => s===undefined||s===null?'—':s>0.2?`<span class="sent-pos">▲ ${{s.toFixed(2)}}</span>`:s<-0.2?`<span class="sent-neg">▼ ${{s.toFixed(2)}}</span>`:`<span class="sent-neu">— ${{s.toFixed(2)}}</span>`;
  document.getElementById('convsTable').innerHTML = rows.length ? rows.map(r=>`
    <tr>
      <td>${{r.phone}}</td>
      <td><span class="badge bd">${{chIcon[r.channel]||r.channel}}</span></td>
      <td style="font-size:0.75rem;">${{r.last_activity?.slice(0,16).replace('T',' ')||'—'}}</td>
      <td>${{r.message_count}}</td>
      <td>${{sentFmt(r.avg_sentiment)}}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="loadConvDetail('${{r.id}}','${{r.phone}}')">Voir →</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty">Aucune conversation pour l\'instant.</td></tr>';
}}

async function loadConvDetail(id, phone) {{
  const msgs = await fetch(`/api/v1/me/conversations/${{id}}`,{{headers:H}}).then(r=>r.json());
  document.getElementById('convDetailTitle').textContent = `${{phone}}`;
  document.getElementById('convMessages').innerHTML = msgs.map(m=>`
    <div style="display:flex;${{m.role==='agent'?'justify-content:flex-end;':''}}">
      <div style="max-width:78%;background:${{m.role==='agent'?'rgba(168,104,68,0.15)':'rgba(29,39,51,0.9)'}};border:0.5px solid ${{m.role==='agent'?'rgba(168,104,68,0.3)':'rgba(237,232,223,0.08)'}};padding:10px 14px;">
        <div style="font-size:0.82rem;color:var(--pearl);line-height:1.5;">${{m.content}}</div>
        <div style="font-size:0.65rem;color:var(--dim);margin-top:4px;">${{m.timestamp?.slice(0,16).replace('T',' ')}} · ${{m.role}}</div>
      </div>
    </div>`).join('');
  document.getElementById('convDetail').style.display='block';
  document.getElementById('convMessages').scrollTop=99999;
}}

async function loadAnalytics() {{
  try {{
    const [adv, sent] = await Promise.all([
      fetch('/api/v1/me/analytics/advanced',{{headers:H}}).then(r=>r.json()),
      fetch('/api/v1/me/analytics/sentiment',{{headers:H}}).then(r=>r.json())
    ]);
    const ov = adv.overview||{{}};
    document.getElementById('analyticsStats').innerHTML = `
      <div class="sc"><div class="sc-lbl">Taux escalade</div><div class="sc-val">${{(ov.escalation_rate||0).toFixed(1)}}%</div></div>
      <div class="sc"><div class="sc-lbl">Taux résolution</div><div class="sc-val">${{(ov.resolution_rate||0).toFixed(1)}}%</div></div>
      <div class="sc"><div class="sc-lbl">Sentiment moyen</div><div class="sc-val" style="color:${{(ov.avg_sentiment||0)>0?'#4ac36f':'#f87171'}}">${{(ov.avg_sentiment||0).toFixed(2)}}</div></div>
      <div class="sc"><div class="sc-lbl">Conversations</div><div class="sc-val">${{ov.total_conversations||0}}</div></div>`;
    // Intent pie
    const intents = adv.intent_distribution||{{}};
    const iKeys = Object.keys(intents);
    const colors = ['${{CU}}0.8)','${{CU}}0.5)','rgba(196,137,90,0.7)','rgba(74,82,96,0.8)','rgba(237,232,223,0.3)'];
    mkChart('chartIntent',{{type:'doughnut',data:{{
      labels:iKeys,datasets:[{{data:iKeys.map(k=>intents[k]),backgroundColor:colors,borderWidth:0}}]
    }},options:{{responsive:true,maintainAspectRatio:false,
      plugins:{{legend:{{position:'right',labels:{{color:'#4A5260',font:{{size:10}},boxWidth:10}}}}}}
    }}}});
    // Sentiment by channel
    const byChannel = sent.by_channel||{{}};
    document.getElementById('sentByChannel').innerHTML = Object.keys(byChannel).length ?
      Object.entries(byChannel).map(([ch,v])=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:0.5px solid rgba(237,232,223,0.06);">
          <span style="font-size:0.82rem;">${{ch}}</span>
          <span style="font-size:0.9rem;color:${{v>0?'#4ac36f':v<-0.1?'#f87171':'var(--dim)'}};font-family:monospace;">${{v.toFixed(3)}}</span>
        </div>`).join('') : '<div class="empty">Pas encore de données.</div>';
  }} catch(e) {{ document.getElementById('analyticsStats').innerHTML='<div class="sc" style="grid-column:1/-1;color:var(--dim);">Données insuffisantes — revenez après quelques conversations.</div>'; }}
}}

async function loadEscalation() {{
  const rules = await fetch('/api/v1/me/escalation-rules',{{headers:H}}).then(r=>r.json()).catch(()=>[]);
  const typeLabel = {{sentiment_threshold:'Sentiment ≤',keyword:'Mot-clé :',message_count:'N° messages ≥',intent:'Intention :'}};
  document.getElementById('escList').innerHTML = rules.length ? rules.map(r=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:0.5px solid rgba(237,232,223,0.06);">
      <div>
        <span style="font-size:0.82rem;color:var(--pearl);">${{typeLabel[r.rule_type]||r.rule_type}} <strong style="color:var(--cu);">${{r.rule_value}}</strong></span>
        <span class="badge ${{r.is_active?'bg':'bd'}}" style="margin-left:8px;">${{r.is_active?'Active':'Inactive'}}</span>
      </div>
      <button class="btn btn-danger btn-sm" onclick="delEscRule('${{r.id}}')">Supprimer</button>
    </div>`).join('') : '<div class="empty">Aucune règle. Ajoutez-en une pour automatiser les escalades.</div>';
}}
function updateEscPlaceholder() {{
  const t = document.getElementById('esc_type').value;
  const lbl = document.getElementById('esc_val_lbl');
  const inp = document.getElementById('esc_val');
  const map = {{sentiment_threshold:['Valeur seuil (ex: -0.6)','-0.6'],keyword:['Mot-clé critique','annuler'],message_count:['Nb messages (ex: 10)','10'],intent:['Intention (ex: complaint)','complaint']}};
  lbl.textContent=map[t][0]; inp.placeholder=map[t][1];
}}
async function addEscRule() {{
  const data={{rule_type:document.getElementById('esc_type').value,rule_value:document.getElementById('esc_val').value}};
  if(!data.rule_value){{document.getElementById('esc_msg').textContent='Valeur requise.';return;}}
  const r = await fetch('/api/v1/me/escalation-rules',{{method:'POST',headers:{{...H,'Content-Type':'application/json'}},body:JSON.stringify(data)}});
  if(r.ok){{document.getElementById('esc_val').value='';document.getElementById('esc_msg').style.color='#4ac36f';document.getElementById('esc_msg').textContent='✓ Règle ajoutée.';loadEscalation();}}
  else{{document.getElementById('esc_msg').style.color='#f87171';document.getElementById('esc_msg').textContent='Erreur.';}}
}}
async function delEscRule(id) {{
  if(!confirm('Supprimer cette règle ?'))return;
  await fetch('/api/v1/me/escalation-rules/'+id,{{method:'DELETE',headers:H}});
  loadEscalation();
}}

async function loadAppointments(status) {{
  const rows = await fetch('/api/v1/me/appointments'+(status?'?status='+status:''),{{headers:H}}).then(r=>r.json()).catch(()=>[]);
  const sb={{pending:'by',confirmed:'bg',cancelled:'bd',completed:'bc'}};
  const sl={{pending:'En attente',confirmed:'Confirmé',cancelled:'Annulé',completed:'Terminé'}};
  document.getElementById('apptsTable').innerHTML = rows.length ? rows.map(r=>`
    <tr>
      <td>${{r.date}} ${{r.time}}</td>
      <td>${{r.customer_name||r.customer_phone||'—'}}</td>
      <td>${{r.service||'—'}}</td>
      <td><span class="badge ${{sb[r.status]||'bd'}}">${{sl[r.status]||r.status}}</span></td>
      <td>${{r.status==='pending'?`<button class="btn btn-sm" onclick="confirmAppt('${{r.id}}')">Confirmer</button>`:''}}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="empty">Aucun rendez-vous.</td></tr>';
}}
function filterAppts(s){{loadAppointments(s);}}
async function confirmAppt(id){{
  await fetch('/api/v1/me/appointments/'+id,{{method:'PUT',headers:{{...H,'Content-Type':'application/json'}},body:JSON.stringify({{status:'confirmed'}})}});
  loadAppointments('');
}}

async function loadProjects() {{
  const projs = await fetch('/api/v1/me/projects',{{headers:H}}).then(r=>r.json()).catch(()=>[]);
  const sc={{inquiry:'bd',in_progress:'bc',review:'by',completed:'bg',cancelled:'bd'}};
  const sl={{inquiry:'Demande reçue',in_progress:'En cours',review:'En révision',completed:'Terminé',cancelled:'Annulé'}};
  document.getElementById('projectsList').innerHTML = projs.length ? projs.map(p=>`
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        <div>
          <div style="font-weight:500;font-size:0.95rem;">${{p.title}}</div>
          <div style="color:var(--dim);font-size:0.75rem;margin-top:2px;">${{p.service_type}} · ${{p.created_at?.slice(0,10)}}</div>
        </div>
        <span class="badge ${{sc[p.status]||'bd'}}">${{sl[p.status]||p.status}}</span>
      </div>
      ${{p.description?`<p style="color:rgba(237,232,223,0.55);font-size:0.82rem;margin-bottom:12px;">${{p.description.slice(0,200)}}</p>`:''}}
      <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--dim);margin-bottom:4px;"><span>Progression</span><span>${{p.progress||0}}%</span></div>
      <div class="pb"><div class="pf" style="width:${{p.progress||0}}%"></div></div>
    </div>`).join('') : '<div class="card empty">Aucun projet en cours.</div>';
}}

async function loadKnowledgeBase() {{
  const entries = await fetch('/api/v1/me/knowledge-base',{{headers:H}}).then(r=>r.json()).catch(()=>[]);
  const tl={{faq:'FAQ',menu:'Catalogue',policy:'Politiques',team:'Équipe',custom:'Autre'}};
  document.getElementById('kbList').innerHTML = entries.length ? entries.map(e=>`
    <div style="padding:12px 0;border-bottom:0.5px solid rgba(237,232,223,0.06);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div><span style="font-size:0.85rem;font-weight:500;">${{e.title}}</span> <span class="badge bc" style="margin-left:6px;">${{tl[e.kb_type]||e.kb_type}}</span></div>
        <button class="btn btn-danger btn-sm" onclick="deleteKbEntry('${{e.id}}')">×</button>
      </div>
      <div style="color:var(--dim);font-size:0.78rem;margin-top:6px;">${{e.content.slice(0,120)}}${{e.content.length>120?'…':''}}</div>
    </div>`).join('') : '<div class="empty">Aucune entrée — ajoutez votre FAQ pour que l\'IA soit précise.</div>';
}}
async function addKbEntry() {{
  const data={{title:document.getElementById('kb_title').value,content:document.getElementById('kb_content').value,kb_type:document.getElementById('kb_type').value}};
  if(!data.title||!data.content){{alert('Titre et contenu requis');return;}}
  const r=await fetch('/api/v1/me/knowledge-base',{{method:'POST',headers:{{...H,'Content-Type':'application/json'}},body:JSON.stringify(data)}});
  if(r.ok){{document.getElementById('kb_title').value='';document.getElementById('kb_content').value='';loadKnowledgeBase();}}
  else{{alert((await r.json()).detail||'Erreur');}}
}}
async function uploadKbFile() {{
  const title=document.getElementById('kb_file_title').value.trim();
  const file=document.getElementById('kb_file').files[0];
  const msg=document.getElementById('upload_msg');
  if(!file){{msg.textContent='Choisissez un fichier.';return;}}
  const btn=document.getElementById('btn_upload');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span>';
  const fd=new FormData();
  fd.append('file',file,file.name);
  fd.append('title',title||file.name);
  fd.append('kb_type','custom');
  const r=await fetch('/api/v1/me/knowledge-base/upload',{{method:'POST',headers:H,body:fd}});
  btn.disabled=false;btn.textContent='Uploader le fichier';
  if(r.ok){{msg.style.color='#4ac36f';msg.textContent='✓ Fichier indexé.';document.getElementById('kb_file').value='';loadKnowledgeBase();}}
  else{{msg.style.color='#f87171';msg.textContent='Erreur upload.';}}
}}
async function deleteKbEntry(id){{
  if(!confirm('Supprimer ?'))return;
  await fetch('/api/v1/me/knowledge-base/'+id,{{method:'DELETE',headers:H}});
  loadKnowledgeBase();
}}

document.addEventListener('DOMContentLoaded',()=>{{
  const m=document.getElementById('camp_message');
  if(m)m.addEventListener('input',()=>document.getElementById('charCount').textContent=m.value.length+' / 160');
}});
async function loadCampaigns() {{
  const camps=await fetch('/api/v1/me/campaigns',{{headers:H}}).then(r=>r.json()).catch(()=>[]);
  const sl={{draft:'Brouillon',sending:'Envoi…',completed:'Terminée',cancelled:'Annulée'}};
  const sb={{draft:'bd',sending:'by',completed:'bg',cancelled:'bd'}};
  document.getElementById('campList').innerHTML=camps.length?camps.map(c=>`
    <div style="padding:12px 0;border-bottom:0.5px solid rgba(237,232,223,0.06);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div><span style="font-weight:500;font-size:0.85rem;">${{c.name}}</span> <span class="badge bd" style="margin-left:6px;">${{c.channel}}</span> <span class="badge ${{sb[c.status]}}" style="margin-left:4px;">${{sl[c.status]||c.status}}</span></div>
        ${{c.status==='draft'?`<button class="btn btn-sm" onclick="sendCampaign('${{c.id}}')">▶ Envoyer</button>`:''}}
      </div>
      <div style="color:var(--dim);font-size:0.75rem;margin-top:6px;">${{c.message.slice(0,80)}}… · ${{c.sent_count}} envoyés</div>
    </div>`).join('') : '<div class="empty">Aucune campagne.</div>';
}}
async function createCampaign(){{
  const contacts=document.getElementById('camp_contacts').value.split('\\n').map(s=>s.trim()).filter(Boolean);
  const data={{name:document.getElementById('camp_name').value,message:document.getElementById('camp_message').value,channel:document.getElementById('camp_channel').value,contacts}};
  if(!data.name||!data.message){{alert('Nom et message requis');return;}}
  const r=await fetch('/api/v1/me/campaigns',{{method:'POST',headers:{{...H,'Content-Type':'application/json'}},body:JSON.stringify(data)}});
  const d=await r.json();
  if(r.ok){{alert('Campagne créée pour '+d.contacts_count+' contacts.');loadCampaigns();}}
  else{{alert(d.detail||'Erreur');}}
}}
async function sendCampaign(id){{
  if(!confirm('Envoyer maintenant ?'))return;
  const r=await fetch('/api/v1/me/campaigns/'+id+'/send',{{method:'POST',headers:H}});
  alert((await r.json()).message||'Envoi lancé');loadCampaigns();
}}

async function loadWebhooks(){{
  const whs=await fetch('/api/v1/me/webhooks',{{headers:H}}).then(r=>r.json()).catch(()=>[]);
  document.getElementById('whList').innerHTML=whs.length?whs.map(w=>`
    <div style="padding:12px 0;border-bottom:0.5px solid rgba(237,232,223,0.06);">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div style="word-break:break-all;font-size:0.8rem;color:var(--cu);">${{w.url}}</div>
        <button class="btn btn-danger btn-sm" onclick="deleteWebhook('${{w.id}}')">×</button>
      </div>
      <div style="font-size:0.72rem;color:var(--dim);margin-top:4px;">${{(w.events||[]).join(', ')}} · Dernier: ${{w.last_triggered?w.last_triggered.slice(0,16):'—'}}</div>
    </div>`).join('') : '<div class="empty">Aucun webhook.</div>';
}}
async function createWebhook(){{
  const events=[];
  if(document.getElementById('ev_appt').checked)events.push('new_appointment');
  if(document.getElementById('ev_transfer').checked)events.push('transfer_requested');
  if(document.getElementById('ev_msg').checked)events.push('new_message');
  const r=await fetch('/api/v1/me/webhooks',{{method:'POST',headers:{{...H,'Content-Type':'application/json'}},body:JSON.stringify({{url:document.getElementById('wh_url').value,events}})}});
  const d=await r.json();
  if(r.ok){{document.getElementById('wh_result').innerHTML=`<div style="border-left:2px solid var(--cu);padding:8px 12px;font-size:0.8rem;margin-top:10px;"><strong style="color:#4ac36f;">✓ Webhook créé</strong><br><span style="color:var(--dim);">Secret :</span> <code style="color:var(--cu);word-break:break-all;">${{d.secret}}</code></div>`;document.getElementById('wh_url').value='';loadWebhooks();}}
  else{{alert(d.detail||'Erreur');}}
}}
async function deleteWebhook(id){{if(!confirm('Supprimer ?'))return;await fetch('/api/v1/me/webhooks/'+id,{{method:'DELETE',headers:H}});loadWebhooks();}}

async function loadReports(){{
  const reps=await fetch('/api/v1/me/reports',{{headers:H}}).then(r=>r.json()).catch(()=>[]);
  document.getElementById('reportsList').innerHTML=reps.length?reps.map(r=>`
    <div class="card">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
        <div class="card-title">Semaine du ${{r.week_start}}</div>
        <span style="font-size:0.72rem;color:var(--dim);">${{r.created_at?.slice(0,10)||''}}</span>
      </div>
      <div style="white-space:pre-wrap;font-size:0.82rem;line-height:1.7;color:rgba(237,232,223,0.7);">${{r.summary}}</div>
    </div>`).join('') :
  '<div class="card empty">Aucun rapport disponible. Votre premier rapport sera généré dimanche prochain.</div>';
}}

async function loadRoi(){{
  const roi=await fetch('/api/v1/me/roi',{{headers:H}}).then(r=>r.json()).catch(()=>({{}}));
  const r=roi.roi||{{}};const i=roi.interactions||{{}};
  document.getElementById('roiContent').innerHTML=`
    <div class="stats-row">
      <div class="sc"><div class="sc-lbl">Interactions</div><div class="sc-val">${{i.total||0}}</div></div>
      <div class="sc"><div class="sc-lbl">RDV automatisés</div><div class="sc-val">${{i.rdv_requests||0}}</div></div>
      <div class="sc"><div class="sc-lbl">Heures sauvées</div><div class="sc-val">${{r.hours_saved||0}}</div></div>
      <div class="sc"><div class="sc-lbl">Appels évités</div><div class="sc-val">${{r.calls_avoided||0}}</div></div>
    </div>
    <div class="card" style="margin-bottom:14px;">
      <div class="card-title">Retour sur investissement</div>
      <div class="roi-val">${{r.roi_ratio||'—'}}</div>
      <div style="color:var(--dim);font-size:0.82rem;margin-top:8px;">Économies estimées : <span style="color:#4ac36f;">${{r.estimated_savings||'—'}}</span> ce mois</div>
    </div>
    <div class="card">${{(roi.insights||[]).map(ins=>`<div class="insight">${{ins}}</div>`).join('')||'<div class="empty">Pas encore de données.</div>'}}</div>`;
}}

async function saveProfile(){{
  const btn=document.getElementById('btn_save_profile');
  const msg=document.getElementById('save_msg');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span>';
  const r=await fetch('/api/v1/me/profile',{{method:'PATCH',headers:{{...H,'Content-Type':'application/json'}},body:JSON.stringify({{
    business_name:document.getElementById('s_bname').value,
    business_type:document.getElementById('s_btype').value,
    hours:document.getElementById('s_hours').value,
    owner_phone:document.getElementById('s_phone').value,
    services:document.getElementById('s_services').value,
    address:document.getElementById('s_addr').value,
  }})}});
  btn.disabled=false;btn.textContent='Enregistrer';
  if(r.ok){{msg.style.color='#4ac36f';msg.textContent='✓ Profil mis à jour.';}}
  else{{msg.style.color='#f87171';msg.textContent='Erreur.';}}
}}

function revealKey(){{
  const el=document.getElementById('apiKeyDisplay');
  if(el.textContent.includes('•')){{el.textContent=API_KEY;navigator.clipboard.writeText(API_KEY).catch(()=>{{}});}}
  else{{el.textContent='{c_api_key_masked}';}}
}}

loadDashboard();
</script>
</body>
</html>"""
    return HTMLResponse(portal_html)

# ============================================================
# SSE — Mises à jour temps réel pour le portail
# ============================================================
from fastapi.responses import StreamingResponse

@app.get("/api/v1/me/stream")
async def client_event_stream(request: Request, client: dict = Depends(verify_api_key)):
    """Server-Sent Events — détecte nouveaux messages et RDV en temps réel."""
    client_id = client["id"]

    async def generator():
        last_ts = datetime.now().isoformat()
        ping_count = 0
        while True:
            if await request.is_disconnected():
                break
            try:
                async with aiosqlite.connect(DB_PATH) as db:
                    db.row_factory = aiosqlite.Row
                    cur = await db.execute(
                        "SELECT COUNT(*) as n FROM messages WHERE client_id=? AND timestamp>? AND role='client'",
                        (client_id, last_ts)
                    )
                    new_msgs = (await cur.fetchone())["n"]
                    cur = await db.execute(
                        "SELECT COUNT(*) as n FROM appointments WHERE client_id=? AND created_at>?",
                        (client_id, last_ts)
                    )
                    new_appts = (await cur.fetchone())["n"]

                last_ts = datetime.now().isoformat()
                ping_count += 1
                payload = json.dumps({"type": "update", "new_messages": new_msgs,
                                      "new_appointments": new_appts, "ping": ping_count})
                yield f"data: {payload}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type':'error','msg':str(e)})}\n\n"
            await asyncio.sleep(15)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"}
    )

# ============================================================
# UPLOAD FICHIERS — Base de connaissances (TXT, CSV, PDF)
# ============================================================
from fastapi import UploadFile, File, Form as FastForm

@app.post("/api/v1/me/knowledge-base/upload")
async def upload_kb_file(
    title: str = FastForm(...),
    kb_type: str = FastForm("custom"),
    file: UploadFile = File(...),
    client: dict = Depends(verify_api_key)
):
    """Importe un fichier TXT, CSV ou PDF dans la base de connaissances."""
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 5 Mo)")

    fname = (file.filename or "").lower()
    ext = fname.rsplit(".", 1)[-1] if "." in fname else ""

    if ext in ("txt", "text", "csv", "md"):
        text = raw.decode("utf-8", errors="replace")
    elif ext == "pdf":
        try:
            import pypdf
            import io as _io
            reader = pypdf.PdfReader(_io.BytesIO(raw))
            text = "\n".join(p.extract_text() or "" for p in reader.pages)
        except ImportError:
            raise HTTPException(status_code=400, detail="pypdf non installé. Envoyez un fichier TXT.")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Impossible de lire le PDF: {e}")
    else:
        raise HTTPException(status_code=400, detail="Formats acceptés: TXT, CSV, MD, PDF")

    text = text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Aucun texte extractible du fichier")
    if len(text) > 10_000:
        text = text[:10_000]

    kb_id = generate_id("kb")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO knowledge_base (id, client_id, title, content, kb_type, is_active, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)",
            (kb_id, client["id"], title, text, kb_type, now, now)
        )
        await db.commit()

    # Indexer les chunks pour le RAG (en arrière-plan)
    asyncio.create_task(index_knowledge_chunks(client["id"], kb_id, text))
    chunks_count = len(chunk_text(text))

    return {"id": kb_id, "title": title, "chars": len(text),
            "chunks_indexed": chunks_count,
            "message": f"Fichier importé et indexé ({chunks_count} segments RAG)"}

# ============================================================
# GOOGLE CALENDAR — Génération de liens 'Ajouter au calendrier'
# ============================================================
def make_gcal_link(title: str, date: str, time_str: str, duration_min: int = 60, description: str = "") -> str:
    """Génère un lien Google Calendar pour un rendez-vous."""
    from urllib.parse import quote
    try:
        start = datetime.strptime(f"{date} {time_str}", "%Y-%m-%d %H:%M")
        end = start + timedelta(minutes=duration_min)
        fmt = "%Y%m%dT%H%M%S"
        return (f"https://calendar.google.com/calendar/render?action=TEMPLATE"
                f"&text={quote(title)}&dates={start.strftime(fmt)}/{end.strftime(fmt)}"
                f"&details={quote(description)}")
    except Exception:
        return ""

@app.get("/api/v1/me/appointments/{appt_id}/gcal")
async def get_gcal_link(appt_id: str, client: dict = Depends(verify_api_key)):
    """Retourne un lien Google Calendar pour un rendez-vous."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM appointments WHERE id=? AND client_id=?", (appt_id, client["id"]))
        appt = await cur.fetchone()
    if not appt:
        raise HTTPException(status_code=404, detail="Rendez-vous introuvable")
    appt = dict(appt)
    title = f"RDV — {appt.get('service','') or 'Rendez-vous'} chez {client['business_name']}"
    url = make_gcal_link(title, appt["date"], appt["time"], appt.get("duration_min", 60),
                         appt.get("notes", ""))
    return {"gcal_url": url}

# ============================================================
# OG IMAGE — Image de prévisualisation sociale (SVG dynamique)
# ============================================================
@app.get("/og-image.svg")
async def og_image():
    """SVG dynamique pour og:image (réseaux sociaux, partage de lien)."""
    svg = """<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#060a12"/>
      <stop offset="100%" stop-color="#0d1520"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#34d399"/>
    </linearGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="60"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="200" cy="150" r="300" fill="rgba(56,189,248,0.08)" filter="url(#blur)"/>
  <circle cx="1000" cy="480" r="250" fill="rgba(168,85,247,0.07)" filter="url(#blur)"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="none" stroke="rgba(56,189,248,0.12)" stroke-width="1"/>
  <text x="600" y="220" font-family="Inter,system-ui,sans-serif" font-weight="900" font-size="96" fill="url(#accent)" text-anchor="middle">NOVALIS</text>
  <text x="600" y="300" font-family="Inter,system-ui,sans-serif" font-weight="400" font-size="32" fill="#94a3b8" text-anchor="middle">Agence d&#8217;intelligence artificielle · Qu&#233;bec</text>
  <line x1="480" y1="340" x2="720" y2="340" stroke="rgba(56,189,248,0.3)" stroke-width="1"/>
  <text x="600" y="400" font-family="Inter,system-ui,sans-serif" font-size="26" fill="#64748b" text-anchor="middle">SMS · WhatsApp · Voix · Messenger · Automatisation</text>
  <text x="600" y="510" font-family="Inter,system-ui,sans-serif" font-weight="600" font-size="22" fill="#38bdf8" text-anchor="middle">novalis.ai · novalisproia@gmail.com</text>
</svg>"""
    return Response(content=svg, media_type="image/svg+xml",
                    headers={"Cache-Control": "public, max-age=86400"})

# ============================================================
# STRIPE — Facturation abonnements (optionnel)
# ============================================================
@app.post("/api/v1/checkout/{plan}")
@limiter.limit("5/minute")
async def create_checkout_session(plan: str, request: Request, client: dict = Depends(verify_api_key)):
    """Crée une session de paiement Stripe pour un plan d'abonnement."""
    if not stripe:
        raise HTTPException(status_code=503, detail="Facturation Stripe non configurée sur cette instance")

    price_map = {
        "starter": STRIPE_PRICE_STARTER,
        "pro": STRIPE_PRICE_PRO,
        "enterprise": STRIPE_PRICE_ENTERPRISE,
    }
    price_id = price_map.get(plan)
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Plan invalide: {plan}. Valides: starter, pro, enterprise")

    try:
        base_url = APP_URL or str(request.base_url).rstrip("/")
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{base_url}/portal?key={client['api_key']}&upgraded=1",
            cancel_url=f"{base_url}/#pricing",
            customer_email=client["owner_email"],
            metadata={"client_id": client["id"], "plan": plan},
        )
        return {"checkout_url": session.url}
    except Exception as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail="Erreur de paiement — contactez le support")


@app.post("/stripe/webhook")
async def handle_stripe_webhook(request: Request):
    """Webhook Stripe — met à jour le plan client après paiement ou annulation."""
    if not stripe:
        return {"status": "disabled"}

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logger.warning(f"Stripe webhook signature invalide: {e}")
        raise HTTPException(status_code=400, detail="Signature invalide")

    event_type = event.get("type", "")
    data = event.get("data", {}).get("object", {})

    plan_limits = {"starter": 500, "pro": 2000, "enterprise": 0}  # 0 = illimité

    if event_type == "checkout.session.completed":
        client_id = data.get("metadata", {}).get("client_id")
        plan = data.get("metadata", {}).get("plan")
        stripe_customer = data.get("customer", "")
        if client_id and plan:
            max_msgs = plan_limits.get(plan, 500)
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute(
                    """UPDATE clients SET plan = ?, stripe_customer_id = ?, status = 'active',
                       trial_expires_at = '', max_messages_month = ?, updated_at = ? WHERE id = ?""",
                    (plan, stripe_customer, max_msgs, datetime.now().isoformat(), client_id)
                )
                await db.commit()
                db.row_factory = aiosqlite.Row
                cur = await db.execute("SELECT * FROM clients WHERE id = ?", (client_id,))
                c = dict(await cur.fetchone())
            logger.info(f"Client {client_id} → plan {plan} activé via Stripe ({max_msgs} msg/mois)")
            plan_names = {"starter": "Starter — 497$/mois", "pro": "Pro — 1 497$/mois", "enterprise": "Entreprise"}
            asyncio.create_task(send_email(
                to=c["owner_email"],
                subject=f"✓ Bienvenue sur le plan {plan.capitalize()} — Novalis IA",
                body=f"""<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#090C0F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <div style="border-bottom:1px solid rgba(168,104,68,0.3);padding-bottom:20px;margin-bottom:28px;">
    <p style="margin:0;font-size:0.65rem;letter-spacing:0.2em;text-transform:uppercase;color:#A86844;">Novalis IA</p>
  </div>
  <h1 style="color:#EDE8DF;font-size:1.6rem;font-weight:400;margin:0 0 12px;font-style:italic;">Paiement confirmé !</h1>
  <p style="color:#4A5260;font-size:0.95rem;line-height:1.7;margin:0 0 20px;">
    Votre plan <strong style="color:#EDE8DF;">{plan_names.get(plan, plan)}</strong> est maintenant actif.
    Votre assistant IA continue de répondre à vos clients 24/7.
  </p>
  <div style="text-align:center;margin:28px 0;">
    <a href="{APP_URL or ''}/portal?key={c['api_key']}" style="display:inline-block;background:#A86844;color:#EDE8DF;text-decoration:none;padding:12px 32px;font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;border:1px solid #C4895A;">
      Accéder à mon portail →
    </a>
  </div>
  <p style="color:#4A5260;font-size:0.78rem;">Questions ? <a href="mailto:{ADMIN_EMAIL}" style="color:#A86844;">{ADMIN_EMAIL}</a></p>
</div></body></html>"""
            ))

    elif event_type == "customer.subscription.deleted":
        stripe_customer = data.get("customer", "")
        if stripe_customer:
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute(
                    "UPDATE clients SET plan = 'trial', max_messages_month = 0, status = 'active', updated_at = ? WHERE stripe_customer_id = ?",
                    (datetime.now().isoformat(), stripe_customer)
                )
                await db.commit()
            logger.info(f"Abonnement annulé — customer Stripe {stripe_customer}")

    return {"status": "ok"}


@app.get("/api/v1/billing/portal")
async def billing_portal(request: Request, client: dict = Depends(verify_api_key)):
    """Génère un lien vers le portail de gestion d'abonnement Stripe."""
    if not stripe:
        raise HTTPException(status_code=503, detail="Facturation non configurée")
    customer_id = client.get("stripe_customer_id", "")
    if not customer_id:
        raise HTTPException(status_code=400, detail="Aucun abonnement Stripe actif pour ce compte")
    try:
        base_url = APP_URL or str(request.base_url).rstrip("/")
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{base_url}/portal?key={client['api_key']}",
        )
        return {"portal_url": session.url}
    except Exception as e:
        logger.error(f"Stripe billing portal error: {e}")
        raise HTTPException(status_code=500, detail="Erreur Stripe — contactez le support")


# ============================================================
# GRANIT COM — CONFIGURATEUR MARQUEURS
# ============================================================
@app.get("/marker-config", response_class=HTMLResponse)
async def marker_config():
    path = os.path.join(_FRONTEND_DIST, "marker-config.html")
    if os.path.isfile(path):
        return FileResponse(path, media_type="text/html")
    raise HTTPException(status_code=404)


@app.get("/granitecom-pricing", response_class=HTMLResponse)
async def granitecom_pricing():
    path = os.path.join(_FRONTEND_DIST, "granitecom-pricing.html")
    if os.path.isfile(path):
        return FileResponse(path, media_type="text/html")
    raise HTTPException(status_code=404)


@app.get("/chatbot-ia-quebec", response_class=HTMLResponse)
async def seo_chatbot():
    return FileResponse(os.path.join(_FRONTEND_DIST, "chatbot-ia-quebec.html"), media_type="text/html")

@app.get("/automatisation-ia-pme-quebec", response_class=HTMLResponse)
async def seo_automatisation():
    return FileResponse(os.path.join(_FRONTEND_DIST, "automatisation-ia-pme-quebec.html"), media_type="text/html")

@app.get("/agent-vocal-ia-quebec", response_class=HTMLResponse)
async def seo_agent_vocal():
    return FileResponse(os.path.join(_FRONTEND_DIST, "agent-vocal-ia-quebec.html"), media_type="text/html")


@app.get("/pet-marker-config", response_class=HTMLResponse)
async def pet_marker_config():
    path = os.path.join(_FRONTEND_DIST, "pet-marker-config.html")
    if os.path.isfile(path):
        return FileResponse(path, media_type="text/html")
    raise HTTPException(status_code=404)


@app.post("/api/marker-orders")
async def create_marker_order(request: Request):
    data = await request.json()
    required = ["line1", "customer_name", "customer_email", "customer_address"]
    for field in required:
        if not data.get(field, "").strip():
            raise HTTPException(status_code=422, detail=f"Champ requis manquant: {field}")

    order_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS marker_orders (
                id TEXT PRIMARY KEY,
                client_id TEXT DEFAULT 'granitecom',
                model TEXT,
                font TEXT,
                line1 TEXT,
                line2 TEXT,
                line3 TEXT,
                customer_name TEXT,
                customer_email TEXT,
                customer_phone TEXT,
                customer_address TEXT,
                status TEXT DEFAULT 'new',
                created_at TEXT
            )
        """)
        await db.execute(
            """INSERT INTO marker_orders
               (id,client_id,model,font,line1,line2,line3,customer_name,customer_email,customer_phone,customer_address,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (order_id, data.get("client_id","granitecom"),
             data.get("model",""), data.get("font",""),
             data.get("line1",""), data.get("line2",""), data.get("line3",""),
             data["customer_name"], data["customer_email"],
             data.get("customer_phone",""), data["customer_address"], now)
        )
        await db.commit()

    if SMTP_HOST:
        try:
            msg = MIMEMultipart()
            msg["From"] = SMTP_FROM
            msg["To"] = ADMIN_EMAIL
            msg["Subject"] = f"[Granit Com] Nouvelle commande marqueur — {data['customer_name']}"
            body = (f"Commande #{order_id[:8]}\n\n"
                    f"Modèle : {data.get('model')}\nPolice : {data.get('font')}\n"
                    f"Ligne 1 : {data.get('line1')}\nLigne 2 : {data.get('line2')}\nLigne 3 : {data.get('line3')}\n\n"
                    f"Client : {data['customer_name']}\nCourriel : {data['customer_email']}\n"
                    f"Téléphone : {data.get('customer_phone','—')}\nAdresse : {data['customer_address']}")
            msg.attach(MIMEText(body, "plain"))
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
                s.starttls()
                s.login(SMTP_USER, SMTP_PASS)
                s.send_message(msg)
        except Exception as e:
            logger.error(f"Email commande marqueur: {e}")

    return {"order_id": order_id, "status": "received"}


@app.get("/api/marker-orders")
async def list_marker_orders(credentials: HTTPBasicCredentials = Depends(verify_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM marker_orders ORDER BY created_at DESC")
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


# ============================================================
# VAPI — WEBHOOKS AGENT VOCAL
# ============================================================
@app.post("/vapi/webhook")
async def vapi_webhook(request: Request):
    """Reçoit les événements Vapi : tool-calls (sendCallSummary, bookAppointment) et end-of-call-report."""
    if VAPI_WEBHOOK_SECRET:
        sig = request.headers.get("x-vapi-signature", "")
        body = await request.body()
        expected = hmac.new(VAPI_WEBHOOK_SECRET.encode(), body, digestmod="sha256").hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(status_code=401, detail="Invalid signature")
        data = json.loads(body)
    else:
        data = await request.json()

    msg = data.get("message", {})
    msg_type = msg.get("type", "")

    if msg_type == "tool-calls":
        results = []
        for tool_call in msg.get("toolCallList", []):
            fn = tool_call.get("function", {})
            name = fn.get("name", "")
            args = fn.get("arguments", {})
            call_id = tool_call.get("id", "")

            if name == "sendCallSummary":
                call_record_id = str(uuid.uuid4())
                caller_phone = msg.get("call", {}).get("customer", {}).get("number", "")
                now = datetime.utcnow().isoformat()
                async with aiosqlite.connect(DB_PATH) as db:
                    await db.execute(
                        """INSERT INTO vapi_calls
                           (id, client_id, caller_phone, caller_name, call_intent, resolution,
                            summary, follow_up_required, follow_up_note, raw_payload, created_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                        (call_record_id, args.get("client_id", ""), caller_phone,
                         args.get("caller_name", ""), args.get("call_intent", ""),
                         args.get("resolution", ""), args.get("summary", ""),
                         1 if args.get("follow_up_required") else 0,
                         args.get("follow_up_note", ""), json.dumps(args), now)
                    )
                    await db.commit()

                if args.get("follow_up_required") and SMTP_HOST:
                    try:
                        asyncio.create_task(_send_followup_email(args, caller_phone))
                    except Exception:
                        pass

                results.append({"toolCallId": call_id, "result": "Résumé enregistré."})

            elif name == "bookAppointment":
                appt_id = str(uuid.uuid4())
                now = datetime.utcnow().isoformat()
                caller_phone = args.get("caller_phone", msg.get("call", {}).get("customer", {}).get("number", ""))
                async with aiosqlite.connect(DB_PATH) as db:
                    await db.execute(
                        """INSERT INTO appointments
                           (id, client_id, customer_name, customer_phone, customer_email,
                            date, time, service, status, notes, created_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                        (appt_id, args.get("client_id", ""),
                         args.get("caller_name", ""), caller_phone,
                         args.get("caller_email", ""),
                         args.get("preferred_date", ""), args.get("preferred_time", ""),
                         args.get("appointment_type", ""), "confirmed",
                         args.get("notes", ""), now)
                    )
                    await db.commit()

                if args.get("caller_email") and SMTP_HOST:
                    try:
                        asyncio.create_task(_send_booking_confirmation(args))
                    except Exception:
                        pass

                results.append({"toolCallId": call_id, "result": f"Rendez-vous confirmé pour le {args.get('preferred_date')} à {args.get('preferred_time')}."})

        return {"results": results}

    elif msg_type == "end-of-call-report":
        call = msg.get("call", {})
        artifact = msg.get("artifact", {})
        analysis = msg.get("analysis", {})
        call_id = call.get("id", str(uuid.uuid4()))
        now = datetime.utcnow().isoformat()
        start = call.get("startedAt", now)
        end = call.get("endedAt", now)
        try:
            duration = int((datetime.fromisoformat(end.replace("Z","")) - datetime.fromisoformat(start.replace("Z",""))).total_seconds())
        except Exception:
            duration = 0
        structured = analysis.get("structuredData", {})
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                """INSERT OR IGNORE INTO vapi_calls
                   (id, caller_phone, call_intent, resolution, summary, follow_up_required,
                    recording_url, duration_seconds, sentiment, success_evaluation, raw_payload, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (call_id,
                 call.get("customer", {}).get("number", ""),
                 structured.get("caller_intent", ""),
                 structured.get("resolution", ""),
                 analysis.get("summary", artifact.get("summary", "")),
                 1 if structured.get("follow_up_required") else 0,
                 artifact.get("recordingUrl", ""),
                 duration,
                 structured.get("sentiment_client", ""),
                 analysis.get("successEvaluation", ""),
                 json.dumps(msg)[:4000],
                 now)
            )
            await db.commit()
        return {"status": "ok"}

    return {"status": "ignored"}


async def _send_followup_email(args: dict, caller_phone: str):
    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM
        msg["To"] = ADMIN_EMAIL
        msg["Subject"] = f"[Novalis] Suivi requis — Appel de {args.get('caller_name', caller_phone)}"
        body = (f"Intent: {args.get('call_intent')}\n"
                f"Résolution: {args.get('resolution')}\n"
                f"Résumé: {args.get('summary')}\n\n"
                f"NOTE: {args.get('follow_up_note')}")
        msg.attach(MIMEText(body, "plain"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)
    except Exception as e:
        logger.error(f"Email suivi Vapi: {e}")


async def _send_booking_confirmation(args: dict):
    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM
        msg["To"] = args["caller_email"]
        msg["Subject"] = "Confirmation de votre rendez-vous"
        body = (f"Bonjour {args.get('caller_name')},\n\n"
                f"Votre rendez-vous est confirmé :\n"
                f"Date : {args.get('preferred_date')}\n"
                f"Heure : {args.get('preferred_time')}\n"
                f"Service : {args.get('appointment_type')}\n\n"
                f"À bientôt !")
        msg.attach(MIMEText(body, "plain"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.send_message(msg)
    except Exception as e:
        logger.error(f"Email confirmation RDV Vapi: {e}")


@app.get("/vapi/calls")
async def list_vapi_calls(
    credentials: HTTPBasicCredentials = Depends(verify_admin),
    limit: int = Query(50, le=200),
    follow_up_only: bool = Query(False)
):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        q = "SELECT * FROM vapi_calls"
        params = []
        if follow_up_only:
            q += " WHERE follow_up_required = 1"
        q += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        cursor = await db.execute(q, params)
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


# ============================================================
# LANDING PAGE PUBLIQUE
# ============================================================
@app.get("/sitemap.xml")
async def sitemap():
    path = os.path.join(_FRONTEND_DIST, "sitemap.xml")
    if os.path.isfile(path):
        return FileResponse(path, media_type="application/xml")
    return Response(status_code=404)

@app.get("/robots.txt")
async def robots():
    path = os.path.join(_FRONTEND_DIST, "robots.txt")
    if os.path.isfile(path):
        return FileResponse(path, media_type="text/plain")
    return Response(status_code=404)

@app.get("/favicon.svg")
async def favicon():
    path = os.path.join(_FRONTEND_DIST, "favicon.svg")
    if os.path.isfile(path):
        return FileResponse(path, media_type="image/svg+xml")
    return Response(status_code=404)

@app.get("/", response_class=HTMLResponse)
async def landing_page():
    """Sert le build React s'il existe, sinon la landing HTML statique."""
    react_index = os.path.join(_FRONTEND_DIST, "index.html")
    if os.path.isfile(react_index):
        return FileResponse(react_index)
    return LANDING_HTML

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
