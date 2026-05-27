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
import urllib.parse as _urlparse
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
PLATFORM_SECRET = os.getenv("PLATFORM_SECRET") or secrets.token_hex(32)
if not os.getenv("PLATFORM_SECRET"):
    import sys
    print("⚠️  AVERTISSEMENT: PLATFORM_SECRET non défini — les sessions expireront à chaque redémarrage. Définissez PLATFORM_SECRET en variable d'environnement.", file=sys.stderr)

# CORS
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

# Facebook
FB_VERIFY_TOKEN = os.getenv("FB_VERIFY_TOKEN", "novalis_verify_token")
FB_APP_SECRET   = os.getenv("FB_APP_SECRET", "")

# Base de données
DB_PATH = os.getenv("DATABASE_PATH", "novalis.db")

# Email — Resend (prioritaire) ou SMTP fallback
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "elliot@novalisia.ca")
FROM_NAME = os.getenv("FROM_NAME", "Elliot Pelletier — Novalis IA")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "") or SMTP_USER
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "novalisproia@gmail.com")

# Google Places API (découverte PMEs)
GOOGLE_PLACES_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY", "")

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
VERSION = "8.4"

# In-memory state for background refresh job
_refresh_job = {"running": False, "saved": 0, "done": False, "error": "", "started_at": ""}

_sent_emails_session: set = set()  # emails envoyés depuis le dernier démarrage (anti-doublon)
_claude_semaphore: asyncio.Semaphore = asyncio.Semaphore(20)  # max 20 appels Claude simultanés

from collections import deque
_discovery_events: deque = deque(maxlen=300)  # flux live des découvertes PME
_discovery_listeners: list = []  # clients SSE connectés


def _emit_discovery(event_type: str, **kwargs):
    """Enregistre un événement de découverte et notifie les clients SSE connectés."""
    city = kwargs.get("city", "")
    if city and city in _CITY_COORDS:
        kwargs["lat"] = _CITY_COORDS[city][0]
        kwargs["lng"] = _CITY_COORDS[city][1]
    evt = {"type": event_type, "ts": datetime.now().strftime("%H:%M:%S"), **kwargs}
    _discovery_events.appendleft(evt)
    dead = []
    for q in _discovery_listeners:
        try:
            q.put_nowait(evt)
        except Exception:
            dead.append(q)
    for q in dead:
        try:
            _discovery_listeners.remove(q)
        except ValueError:
            pass

_auto_outreach = {
    "enabled": False,
    "sent_today": 0,
    "last_reset": "",
    "daily_limit": 30,
    "interval_minutes": 20,
    "last_sent_at": "",
    "last_prospect": "",
    "total_sent": 0,
}

_ADMIN_JS_RAW = r"""
window.addEventListener('error',function(e){{
    var n=document.getElementById('admin-notice');
    if(n){{n.textContent='⚠️ JS Error: '+e.message+' — ligne '+e.lineno;n.style.display='block';n.style.borderColor='#ef4444';n.style.color='#ef4444';}}
}});
document.getElementById('clock').textContent='v{VERSION}';
function showView(v){{
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.view').forEach(x=>{{x.style.display='none';}});
    const ni=document.querySelector('.nav-item[data-view="'+v+'"]');
    if(ni)ni.classList.add('active');
    const vEl=document.getElementById(v);
    if(vEl)vEl.style.display='block';
    if(v==='clients')loadClients();
    if(v==='rdlog')loadRdLog();
    if(v==='prospects')loadProspects();
    if(v==='decouverte'){{loadSuggestions();loadAutoOutreachStatus();initRadar();}}
    if(v==='v_pipeline')loadPipeline();
    if(v==='v_carte'){{initCarteView();}}
}}

async function loadPlatformStats(){{
    try{{const r=await fetch('/api/v1/platform/stats');const d=await r.json();
    document.getElementById('pClients').textContent=d.active_clients;
    document.getElementById('pConvs').textContent=d.total_conversations;
    document.getElementById('pMsgs').textContent=d.total_messages;
    document.getElementById('pAppts').textContent=d.total_appointments;
    document.getElementById('pToday').textContent=d.today_interactions;
    document.getElementById('pMrr').textContent=d.mrr;
    const nl=d.new_leads||0;
    const el=document.getElementById('pLeads');
    el.textContent=nl;
    if(nl>0){{el.classList.add('has-leads');}}else{{el.classList.remove('has-leads');}}
    }}catch(e){{}}
    // Show SMTP status
    fetch('/api/admin/smtp-status').then(r=>r.json()).then(d=>{{
        const dashView=document.getElementById('dashboard');
        if(!dashView)return;
        if(dashView.querySelector('.smtp-warn'))dashView.querySelector('.smtp-warn').remove();
        const warn=document.createElement('div');
        warn.className='smtp-warn';
        if(!d.configured){{
            warn.style.cssText='background:#7c3aed22;border:1px solid #7c3aed55;border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:0.85rem;color:#a78bfa;';
            warn.innerHTML='⚠️ <b>SMTP non configuré</b> — Ajoutez <code>SMTP_HOST=smtp.gmail.com</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> dans Railway Variables. <a href="https://support.google.com/mail/answer/185833" target="_blank" style="color:#c4b5fd;">Guide Gmail →</a>';
        }}else{{
            warn.style.cssText='background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.2);border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:0.85rem;color:#34d399;display:flex;align-items:center;justify-content:space-between;gap:12px;';
            warn.innerHTML='✅ <b>SMTP configuré</b> — '+d.user+' <button onclick="testSmtp(this)" style="background:#065f46;color:#34d399;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:0.82rem;margin-left:8px;">📧 Envoyer email test</button>';
        }}
        dashView.prepend(warn);
    }}).catch(()=>{{}});
}}

function timeAgo(iso){{
    const diff=Date.now()-new Date(iso).getTime();
    const m=Math.floor(diff/60000);
    if(m<60)return m+'min';
    const h=Math.floor(m/60);
    if(h<24)return h+'h';
    return Math.floor(h/24)+'j';
}}

async function loadLeads(){{
    try{{
        const r=await fetch('/api/v1/leads');
        const d=await r.json();
        const l=document.getElementById('leadsList');
        if(!d.length){{
            l.innerHTML='<div class="no-leads">✅ Aucun nouveau lead — tout a été traité</div>';
            return;
        }}
        l.innerHTML=d.map(c=>{{
            const phone=c.owner_phone||'';
            const waNum=phone.replace(/[^0-9]/g,'');
            const waMsg=encodeURIComponent("Bonjour "+c.owner_name+", je contacte de la part de l’équipe Novalis IA. Vous avez rempli notre formulaire sur novalisia.ca. Êtes-vous disponible pour un appel de 15 minutes ?");
            const svc=c.service_type||'non précisé';
            const msg=(c.message||'').slice(0,180);
            const ago=timeAgo(c.created_at);
            return `<div class="lead-card">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                    <div>
                        <div class="lead-name">${{c.business_name}}</div>
                        <div class="lead-meta">${{c.owner_name}} · ${{c.owner_email}}${{phone?' · '+phone:''}}</div>
                        <div style="margin-top:4px;"><span class="badge" style="background:rgba(251,146,60,0.12);color:#fb923c;border:0.5px solid rgba(251,146,60,0.3);font-size:0.68rem;">${{svc}}</span></div>
                    </div>
                    <div style="color:#475569;font-size:0.72rem;white-space:nowrap;">⏱ ${{ago}}</div>
                </div>
                ${{msg?'<div class="lead-msg">'+msg+'</div>':''}}
                <div class="lead-actions">
                    <a class="action-btn btn-email" href="mailto:${{c.owner_email}}?subject=Suite à votre demande — Novalis IA&body=Bonjour ${{c.owner_name}},%0D%0A%0D%0AMerci de votre intérêt pour Novalis IA...">✉ Email</a>
                    ${{phone&&waNum?'<a class="action-btn btn-wa" href="https://wa.me/'+waNum+'?text='+waMsg+'" target="_blank">💬 WhatsApp</a>':''}}
                    ${{phone?'<a class="action-btn btn-call" href="tel:'+phone+'">📞 Appeler</a>':''}}
                    <button class="action-btn btn-portal" onclick="getPortalLink('${{c.id}}')">🔗 Portail</button>
                </div>
            </div>`;
        }}).join('');
    }}catch(e){{console.error(e);}}
}}

const PROSPECT_STATUS_LABELS = {{
    new:'🆕 Nouveau', email1_sent:'📧 Email 1', email2_sent:'📧 Email 2', email3_sent:'📧 Email 3',
    replied:'💬 Répondu', meeting:'📅 Réunion', converted:'✅ Converti', not_interested:'❌ Pas intéressé'
}};
function _sectorBlocks(p) {{
    const ind = (p.industry||'').toLowerCase();
    const biz = p.business_name||p.name;
    const nom = p.name.split(' ')[0];
    const cityRef = p.city ? ' à '+p.city : '';
    if(ind.includes('salon')||ind.includes('spa')) return {{
        hook1: `Est-ce que vos clientes réservent encore par téléphone chez ${{biz}}${{cityRef}} ?`,
        body1: `Chaque appel manqué, c'est un rendez-vous perdu — et souvent une cliente qui appelle ailleurs. Notre agent IA décroche à votre place 24h/24, propose les créneaux disponibles et confirme le RDV automatiquement. En bonus, il envoie un rappel la veille pour réduire les no-shows de 40 %.`,
        hook2: `Suite à mon dernier message — une question rapide pour ${{biz}} :`,
        body2: `Combien d'appels manquez-vous par semaine quand vous êtes avec une cliente ? Même 2 ou 3 appels manqués par jour, c'est 400 à 600 $/semaine en rendez-vous perdus.\n\nNotre agent vocal IA règle exactement ce problème — il décroche chaque appel, prend le RDV et envoie un rappel automatique. Aucune ligne supplémentaire, aucun changement de numéro.`,
        hook3: `Dernier message de ma part — Novalis IA`,
        body3: `Je ne veux pas être intrusif. Si les appels manqués et la gestion des RDV ne sont pas un enjeu prioritaire pour ${{biz}} en ce moment, je comprends.\n\nSi jamais la situation change, l'essai gratuit de 7 jours reste ouvert sur novalisia.ca — on peut configurer votre agent en 48h.`
    }};
    if(ind.includes('garage')||ind.includes('auto')||ind.includes('mécanique')||ind.includes('mecanique')) return {{
        hook1: `${{biz}}${{cityRef}} — avez-vous le temps de répondre à chaque appel pendant les interventions ?`,
        body1: `Techniciens sous les voitures, service en cours, téléphone qui sonne : les appels pour "est-ce que mon véhicule est prêt ?", "quel est le prix pour...", "avez-vous de la disponibilité ?" — personne pour répondre.\n\nNotre agent IA décroche chaque appel, confirme l'état des véhicules, répond aux questions courantes et prend les rendez-vous. Votre équipe reste concentrée sur les vrais travaux — et aucun client ne reste sans réponse.`,
        hook2: `Re: Appels entrants — ${{biz}}`,
        body2: `Suite à mon dernier message — une précision :\n\nNotre agent vocal apprend les spécificités de votre garage (délais typiques, prix moyens, spécialisations) et répond dans votre ton. Les garages avec qui on travaille rapportent -45 % d'appels sans réponse dès les premières semaines.\n\nDisponible pour une démo de 15 minutes ?`,
        hook3: `Dernier message — Novalis IA`,
        body3: `C'est mon dernier message. Si l'automatisation des appels entrants n'est pas une priorité pour ${{biz}} en ce moment, je comprends tout à fait.\n\nL'essai gratuit de 7 jours reste disponible sur novalisia.ca si jamais. Bonne continuation.`
    }};
    if(ind.includes('restaurant')||ind.includes('traiteur')||ind.includes('café')||ind.includes('cafe')||ind.includes('resto')) return {{
        hook1: `${{biz}}${{cityRef}} — combien d'appels pour réserver passent dans le vide aux heures de pointe ?`,
        body1: `Quand le service bat son plein, personne ne peut décrocher. Résultat : des réservations perdues, des questions sur le menu ou les heures sans réponse.\n\nNotre agent IA gère les réservations 24h/24, confirme les disponibilités, répond aux questions fréquentes et envoie des rappels automatiques pour réduire les no-shows. Le tout en français québécois, dans le ton de votre établissement.`,
        hook2: `Re: Réservations et no-shows — ${{biz}}`,
        body2: `Suite à mon dernier message — les restaurants avec qui on travaille constatent en moyenne 35 % moins de no-shows grâce aux rappels automatiques.\n\nL'agent prend aussi les réservations de groupe et répond aux questions sur les allergènes, le stationnement, les heures — sans que votre équipe de salle lève le petit doigt.\n\n15 minutes pour voir une démo ?`,
        hook3: `Dernier message — Novalis IA`,
        body3: `C'est mon dernier message. Si l'automatisation des réservations n'est pas une priorité pour ${{biz}} en ce moment, c'est parfaitement correct.\n\nnovalisia.ca — essai gratuit 7 jours si jamais. Bonne continuation.`
    }};
    if(ind.includes('immob')) return {{
        hook1: `Combien de leads vous passent entre les doigts chaque semaine chez ${{biz}}${{cityRef}} ?`,
        body1: `En immobilier, la vitesse de réponse fait la différence. Un lead qui attend plus de 5 minutes a 10x moins de chances de convertir.\n\nNotre agent IA qualifie vos leads entrants en temps réel — acheteur ou vendeur, budget, secteur recherché — et transfère les dossiers chauds à votre équipe avec un résumé complet. Les suivis automatiques s'occupent du reste.`,
        hook2: `Re: Leads entrants — une donnée pour ${{biz}}`,
        body2: `74 % des acheteurs immobiliers choisissent le premier courtier qui leur répond. Avec notre agent IA, votre équipe est "disponible" même à 22h un dimanche.\n\nJe peux vous montrer exactement comment ça fonctionnerait pour votre marché${{cityRef}} — 15 minutes suffisent.`,
        hook3: `Dernier message — Novalis IA`,
        body3: `C'est mon dernier message. Si l'automatisation des leads n'est pas une priorité pour ${{biz}} en ce moment, je comprends tout à fait.\n\nL'essai gratuit de 7 jours reste ouvert sur novalisia.ca si jamais l'intérêt revient.`
    }};
    if(ind.includes('marketing')||ind.includes('design')) return {{
        hook1: `Vos clients PME ont besoin d'IA — et ${{biz}} pourrait être leur point d'entrée`,
        body1: `Chez Novalis IA, on développe des agents IA pour PME québécoises (service client, prise de RDV, qualification de prospects).\n\nOn cherche des agences partenaires${{cityRef}} pour offrir nos solutions à leurs clients PME sous forme de service géré — revenu récurrent sans coût de développement de votre côté.\n\nÇa ressemble à quelque chose qui pourrait intéresser ${{biz}} et vos clients ?`,
        hook2: `Re: Partenariat revendeur — Novalis IA × ${{biz}}`,
        body2: `Suite à mon dernier message — pour être concret :\n\nLe modèle est simple : vous vendez nos agents IA à vos clients PME à votre propre tarif, on s'occupe de la configuration et du support. Vous gardez la marge, vos clients ont un service IA clé en main.\n\nPlusieurs agences québécoises nous ont rejoints pour ajouter cette corde à leur arc. Ça vous intéresse d'en parler 15 minutes ?`,
        hook3: `Dernier message — Novalis IA`,
        body3: `Je ne veux pas insister. Si un partenariat revendeur IA ne cadre pas avec la direction de ${{biz}} en ce moment, c'est parfaitement correct.\n\nSi la situation évolue, on est sur novalisia.ca — bonne continuation !`
    }};
    if(ind.includes('clinique')||ind.includes('santé')||ind.includes('sante')||ind.includes('dentaire')||ind.includes('physio')||ind.includes('chiro')||ind.includes('pharmacie')) return {{
        hook1: `Gérer la prise de RDV${{cityRef}} sans engager de personnel supplémentaire`,
        body1: `Novalis IA déploie des agents IA spécialisés en prise de rendez-vous pour cliniques privées — conformes à la Loi 25, données hébergées au Canada.\n\nVotre agent répond aux appels 24h/24, propose les créneaux disponibles selon chaque praticien, confirme le RDV et envoie un rappel automatique. Aucun appel manqué, aucune liste d'attente téléphonique.`,
        hook2: `Re: Prise de RDV automatisée — ${{biz}}`,
        body2: `Suite à mon dernier message — une précision importante :\n\nNotre agent peut gérer plusieurs praticiens avec des calendriers distincts depuis un seul système. Vos patients n'ont pas à savoir qu'ils parlent à une IA — la voix est naturelle, en français québécois.\n\n15 minutes pour voir une démo de ce que ça donnerait concrètement pour ${{biz}} ?`,
        hook3: `Dernier message — Novalis IA`,
        body3: `C'est mon dernier message. Si l'automatisation de la prise de RDV n'est pas une priorité pour ${{biz}} en ce moment, je comprends.\n\nL'essai gratuit 7 jours reste disponible sur novalisia.ca si jamais. Bonne continuation.`
    }};
    // Défaut — PME générale
    return {{
        hook1: `Vos clients vous appellent encore pour les mêmes questions chez ${{biz}}${{cityRef}} ?`,
        body1: `Novalis IA aide les PME à automatiser les réponses aux questions récurrentes — heures d'ouverture, disponibilités, statut des dossiers, prix courants.\n\nVotre agent IA répond 24h/24, dans votre ton, sans jamais inventer d'information. Votre équipe se concentre sur les tâches à valeur ajoutée.`,
        hook2: `Re: Automatisation des réponses clients — ${{biz}}`,
        body2: `Suite à mon dernier message — une donnée concrète :\n\nNos clients reçoivent en moyenne 40 % de moins d'appels routiniers dans les 30 premiers jours. C'est 3 à 6 heures/semaine récupérées par employé.\n\nJe peux vous montrer comment ça fonctionnerait pour ${{biz}} en 15 minutes. Disponible cette semaine ?`,
        hook3: `Dernier message — Novalis IA`,
        body3: `Je ne veux pas être intrusif — c'est mon dernier message.\n\nSi l'automatisation des réponses clients n'est pas une priorité pour ${{biz}} en ce moment, je comprends tout à fait. L'essai gratuit reste ouvert sur novalisia.ca.\n\nBonne continuation.`
    }};
}}

const EMAIL_TEMPLATES = {{
    email1: (p) => {{
        const s = _sectorBlocks(p);
        const biz = p.business_name||p.name;
        return `Objet : ${{s.hook1}}\n\nBonjour ${{p.name.split(' ')[0]}},\n\n${{s.hook1}}\n\n${{s.body1}}\n\nJe propose un essai gratuit de 7 jours — aucune carte de crédit, aucun engagement. On configure tout en 48h.\n\nÇa vous intéresserait qu'on en parle 15 minutes cette semaine ?\n\nÉquipe Novalis\nnovalisia.ca | +1 819 342-2290\n\n---\nPour vous désabonner, répondez "Non merci".`;
    }},
    email2: (p) => {{
        const s = _sectorBlocks(p);
        return `Objet : ${{s.hook2}}\n\nBonjour ${{p.name.split(' ')[0]}},\n\n${{s.body2}}\n\nÉquipe Novalis\nnovalisia.ca | +1 819 342-2290\n\n---\nPour vous désabonner, répondez "Non merci".`;
    }},
    email3: (p) => {{
        const s = _sectorBlocks(p);
        return `Objet : ${{s.hook3}}\n\nBonjour ${{p.name.split(' ')[0]}},\n\n${{s.body3}}\n\nÉquipe Novalis\nnovalisia.ca`;
    }}
}};

let allProspects = [];

async function loadProspects(){{
    try{{
        const r = await fetch('/api/v1/prospects');
        allProspects = await r.json();
        renderProspects();
    }}catch(e){{console.error(e);}}
}}

function renderProspects(){{
    const filter = document.getElementById('pFilterStatus')?.value||'';
    const list = filter ? allProspects.filter(p=>p.status===filter) : allProspects;
    const l = document.getElementById('prospectList');
    if(!list.length){{l.innerHTML='<div style="color:#94a3b8;text-align:center;padding:20px;">Aucun prospect'+(filter?' avec ce statut':'')+' — cliquez ➕ pour en ajouter</div>';return;}}
    // Stats strip
    const stats={{new:0,email1_sent:0,email2_sent:0,email3_sent:0,replied:0,meeting:0,converted:0,not_interested:0}};
    allProspects.forEach(p=>{{if(stats[p.status]!==undefined)stats[p.status]++;}});
    const strip=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
      ${{Object.entries(stats).filter(([,v])=>v>0).map(([k,v])=>`<span class="badge ${{k}}">${{PROSPECT_STATUS_LABELS[k]||k}} ${{v}}</span>`).join('')}}
    </div>`;
    l.innerHTML = strip + list.map(p=>`<div class="client-card" style="border-left:3px solid ${{p.status==='converted'?'#34d399':p.status==='replied'||p.status==='meeting'?'#a855f7':'#1e3a5f'}};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          <div>
            <div class="client-name">${{p.business_name||p.name}}</div>
            <div class="client-meta">${{p.name}} · ${{p.email}}${{p.phone?' · '+p.phone:''}}${{p.coworking?' · 🏢 '+p.coworking:''}}${{p.industry?' · '+p.industry:''}}</div>
            ${{p.notes?'<div style="font-size:0.75rem;color:#64748b;margin-top:4px;font-style:italic;">'+p.notes+'</div>':''}}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
            <span class="badge ${{p.status}}">${{PROSPECT_STATUS_LABELS[p.status]||p.status}}</span>
            <div style="font-size:0.65rem;color:#475569;">${{p.email1_sent_at?'E1:'+p.email1_sent_at.slice(0,10):''}} ${{p.email2_sent_at?'E2:'+p.email2_sent_at.slice(0,10):''}} ${{p.email3_sent_at?'E3:'+p.email3_sent_at.slice(0,10):''}}</div>
          </div>
        </div>
        <div class="lead-actions" style="margin-top:10px;">
          ${{p.status==='new'?`<button class="action-btn btn-email" onclick="showEmailTemplate('${{p.id}}',1)">📧 Email 1</button>`:''}}\
          ${{p.status==='email1_sent'?`<button class="action-btn btn-email" onclick="showEmailTemplate('${{p.id}}',2)">📧 Email 2</button>`:''}}\
          ${{p.status==='email2_sent'?`<button class="action-btn btn-email" onclick="showEmailTemplate('${{p.id}}',3)">📧 Email 3</button>`:''}}\
          <select onchange="updateProspectStatus('${{p.id}}',this.value);this.value=''" style="background:#1e3a5f;border:none;color:#94a3b8;padding:4px 8px;border-radius:4px;font-size:0.72rem;cursor:pointer;">
            <option value="">Changer statut…</option>
            ${{Object.entries(PROSPECT_STATUS_LABELS).map(([k,v])=>`<option value="${{k}}">${{v}}</option>`).join('')}}
          </select>
          <button class="action-btn" style="background:rgba(239,68,68,0.1);color:#ef4444;" onclick="deleteProspect('${{p.id}}')">✕</button>
        </div>
    </div>`).join('');
}}

async function updateProspectStatus(id, status){{
    if(!status)return;
    const now = new Date().toISOString();
    const patch = {{status}};
    if(status==='email1_sent')patch.email1_sent_at=now;
    if(status==='email2_sent')patch.email2_sent_at=now;
    if(status==='email3_sent')patch.email3_sent_at=now;
    if(status==='replied')patch.replied_at=now;
    if(status==='converted')patch.converted_at=now;
    await fetch('/api/v1/prospects/'+id,{{method:'PUT',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(patch)}});
    await loadProspects();
}}

async function deleteProspect(id){{
    if(!confirm('Supprimer ce prospect ?'))return;
    await fetch('/api/v1/prospects/'+id,{{method:'DELETE'}});
    await loadProspects();
}}

function showEmailTemplate(id, num){{
    const p = allProspects.find(x=>x.id===id);
    if(!p)return;
    const tpl = EMAIL_TEMPLATES['email'+num](p);
    document.getElementById('emailTplContent').value = tpl;
    document.getElementById('emailTplModal').style.display='flex';
    document.getElementById('emailTplTitle').textContent = 'Modèle Email '+num+' — '+( p.business_name||p.name);
    document.getElementById('emailTplId').value = id;
    document.getElementById('emailTplNum').value = num;
}}

function copyEmailTpl(){{
    const ta = document.getElementById('emailTplContent');
    ta.select();navigator.clipboard.writeText(ta.value).then(()=>{{
        const btn=document.getElementById('copyTplBtn');btn.textContent='✅ Copié !';
        setTimeout(()=>{{btn.textContent='📋 Copier';}},2000);
    }});
}}

async function markEmailSent(){{
    const id=document.getElementById('emailTplId').value;
    const num=parseInt(document.getElementById('emailTplNum').value);
    const statusMap={{1:'email1_sent',2:'email2_sent',3:'email3_sent'}};
    await updateProspectStatus(id, statusMap[num]);
    document.getElementById('emailTplModal').style.display='none';
}}

async function sendEmailViaNovalis(){{
    const id=document.getElementById('emailTplId').value;
    const num=parseInt(document.getElementById('emailTplNum').value);
    const body=document.getElementById('emailTplContent').value;
    const btn=document.getElementById('sendNovalisBtn');
    btn.textContent='Envoi en cours…';btn.disabled=true;
    try{{
        const r=await fetch('/api/v1/prospects/'+id+'/send-email',{{
            method:'POST',
            headers:{{'Content-Type':'application/json'}},
            credentials:'include',
            body:JSON.stringify({{email_num:num,body}})
        }});
        if(r.ok){{
            btn.textContent='✅ Envoyé !';
            setTimeout(()=>{{document.getElementById('emailTplModal').style.display='none';loadProspects();}},1500);
        }}else{{
            const d=await r.json();
            btn.textContent='❌ Erreur';
            showNotice(d.detail||'Erreur SMTP',true);
            setTimeout(()=>{{btn.textContent='🚀 Envoyer via Novalis';btn.disabled=false;}},2000);
        }}
    }}catch(e){{btn.textContent='❌ Erreur réseau';btn.disabled=false;}}
}}

async function importProspectsCsv(input){{
    if(!input.files.length)return;
    const text=await input.files[0].text();
    const r=await fetch('/api/v1/prospects/import',{{
        method:'POST',
        headers:{{'Content-Type':'text/csv'}},
        credentials:'include',
        body:text
    }});
    if(r.ok){{
        const d=await r.json();
        showNotice(`✅ Import réussi — ${{d.added}} ajouté(s), ${{d.skipped}} ignoré(s) (doublons ou manquants)`,false);
        await loadProspects();
    }}else{{
        showNotice('❌ Erreur import CSV',true);
    }}
    input.value='';
}}

async function seedProspects(){{
    const btn=document.getElementById('seedBtn');
    btn.disabled=true;btn.textContent='⏳ Chargement…';
    const r=await fetch('/api/v1/prospects/seed',{{method:'POST',credentials:'include'}});
    if(r.ok){{
        const d=await r.json();
        showNotice('✅ '+d.added+' prospect(s) ajouté(s), '+d.skipped+' déjà existant(s)',false);
        await loadProspects();
    }}else{{
        showNotice('❌ Erreur lors du chargement',true);
    }}
    btn.disabled=false;btn.textContent='🌱 Charger prospects initiaux';
}}

async function sendEmail1ToAll(){{
    const newProspects = allProspects.filter(p=>p.status==='new');
    if(!newProspects.length){{showNotice('Aucun prospect avec statut "Nouveau"',true);return;}}
    const names=newProspects.map(p=>p.business_name||p.name).join(', ');
    if(!confirm('Envoyer Email 1 a '+newProspects.length+' prospect(s) : '+names))return;
    const btn=document.getElementById('sendAllBtn');
    btn.disabled=true;btn.textContent='⏳ Envoi en cours…';
    let ok=0,fail=0;
    for(const p of newProspects){{
        try{{
            const r=await fetch('/api/v1/prospects/'+p.id+'/send-email',{{
                method:'POST',
                headers:{{'Content-Type':'application/json'}},
                credentials:'include',
                body:JSON.stringify({{email_num:1}})
            }});
            if(r.ok) ok++; else fail++;
        }}catch(e){{fail++;}}
        await new Promise(res=>setTimeout(res,800));
    }}
    btn.disabled=false;btn.textContent='📤 Email 1 à tous les nouveaux';
    showNotice('✅ '+ok+' email(s) envoyé(s)'+(fail?' — ❌ '+fail+' échec(s)':''),fail>0);
    await loadProspects();
}}

function openAddProspect(){{document.getElementById('addProspectModal').style.display='flex';}}
function closeAddProspect(){{document.getElementById('addProspectModal').style.display='none';}}

async function saveProspect(){{
    const data={{
        name: document.getElementById('ap_name').value.trim(),
        business_name: document.getElementById('ap_biz').value.trim(),
        email: document.getElementById('ap_email').value.trim(),
        phone: document.getElementById('ap_phone').value.trim(),
        coworking: document.getElementById('ap_cw').value.trim(),
        industry: document.getElementById('ap_industry').value,
        notes: document.getElementById('ap_notes').value.trim(),
    }};
    if(!data.name||!data.email){{showNotice('Nom et courriel requis',true);return;}}
    const r=await fetch('/api/v1/prospects',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(data)}});
    if(r.ok){{closeAddProspect();['ap_name','ap_biz','ap_email','ap_phone','ap_cw','ap_notes'].forEach(id=>{{document.getElementById(id).value='';}});await loadProspects();}}
    else showNotice('Erreur — vérifiez les champs',true);
}}

function showNotice(msg,isErr){{
    const d=document.getElementById('admin-notice');
    d.textContent=msg;d.style.display='block';
    d.style.borderColor=isErr?'#ef4444':'#34d399';d.style.color=isErr?'#ef4444':'#34d399';
    d.style.fontSize='0.92rem';d.style.padding='14px 22px';
    clearTimeout(d._timer);
    d._timer=setTimeout(()=>{{d.style.display='none';}},15000);
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
        const n=document.getElementById('admin-notice');
        if(n){{n.textContent='✓ Lien copié : '+url;n.style.display='block';setTimeout(()=>n.style.display='none',5000);}}
    }}catch(e){{console.error('getPortalLink:',e);}}
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
    }}catch(e){{console.error('openEditModal:',e);}}
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

// ── GÉNÉRATEUR D'EMAILS ──
let genEmails = {{1:'',2:'',3:''}};
let genCurrentTab = 1;

function initGenerateur(){{}}

function selectCity(city){{
    document.getElementById('gen_city').value = city;
    document.querySelectorAll('.city-btn').forEach(b=>{{
        const active = b.dataset.city === city;
        b.style.background = active ? 'rgba(56,189,248,0.25)' : 'rgba(56,189,248,0.08)';
        b.style.color = active ? '#38bdf8' : '#64748b';
        b.style.borderColor = active ? '#38bdf8' : '#1e3a5f';
    }});
}}

function clearCityBtns(){{
    document.querySelectorAll('.city-btn').forEach(b=>{{
        b.style.background='rgba(56,189,248,0.08)';
        b.style.color='#64748b';
        b.style.borderColor='#1e3a5f';
    }});
}}

function generateEmails(){{
    const city = document.getElementById('gen_city').value.trim();
    const industry = document.getElementById('gen_industry').value;
    const biz = document.getElementById('gen_biz').value.trim();
    const contactName = document.getElementById('gen_name').value.trim();
    const email = document.getElementById('gen_email_addr').value.trim();
    const phone = document.getElementById('gen_phone').value.trim();
    const notes = document.getElementById('gen_notes').value.trim();
    if(!biz){{showNotice("Nom de l'entreprise requis",true);return;}}
    const p = {{
        name: contactName || ('Équipe '+biz),
        business_name: biz,
        email, phone, industry,
        coworking: city,
        city,
        notes,
    }};
    genEmails[1] = EMAIL_TEMPLATES.email1(p);
    genEmails[2] = EMAIL_TEMPLATES.email2(p);
    genEmails[3] = EMAIL_TEMPLATES.email3(p);
    document.getElementById('gen_preview').style.display = 'block';
    document.getElementById('gen_saved_notice').style.display = 'none';
    showGenTab(1);
    setTimeout(()=>document.getElementById('gen_preview').scrollIntoView({{behavior:'smooth',block:'start'}}),50);
}}

function showGenTab(n){{
    genCurrentTab = n;
    document.getElementById('gen_email_content').value = genEmails[n];
    [1,2,3].forEach(i=>{{
        const btn = document.getElementById('tab_e'+i);
        btn.style.background = i===n ? 'rgba(56,189,248,0.2)' : '#1e3a5f';
        btn.style.color = i===n ? '#38bdf8' : '#64748b';
    }});
}}

function copyGenEmail(){{
    const ta = document.getElementById('gen_email_content');
    ta.select();
    navigator.clipboard.writeText(ta.value).then(()=>{{
        showNotice('📋 Email '+genCurrentTab+' copié !',false);
    }}).catch(()=>{{
        document.execCommand('copy');
        showNotice('📋 Email '+genCurrentTab+' copié !',false);
    }});
}}

async function saveGenProspect(){{
    const name = document.getElementById('gen_name').value.trim();
    const biz = document.getElementById('gen_biz').value.trim();
    const email = document.getElementById('gen_email_addr').value.trim();
    if(!email){{showNotice('Courriel requis pour enregistrer',true);return;}}
    const data = {{
        name: name || ('Équipe '+biz),
        business_name: biz,
        email,
        phone: document.getElementById('gen_phone').value.trim(),
        coworking: document.getElementById('gen_city').value.trim(),
        industry: document.getElementById('gen_industry').value,
        notes: document.getElementById('gen_notes').value.trim(),
    }};
    const r = await fetch('/api/v1/prospects',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(data)}});
    if(r.ok){{
        document.getElementById('gen_saved_notice').style.display='inline';
        showNotice('✅ Prospect enregistré dans Prospection !',false);
    }} else {{
        showNotice('❌ Erreur — courriel déjà existant ?',true);
    }}
}}

function tick(){{document.getElementById('clock').textContent=new Date().toLocaleTimeString('fr-CA',{{hour:'2-digit',minute:'2-digit'}});}}
// Init: hide all views, show only dashboard
document.querySelectorAll('.view').forEach(x=>{{x.style.display='none';}});
const _dv=document.getElementById('dashboard');if(_dv)_dv.style.display='block';
loadPlatformStats();loadLeads();loadEmailStats();tick();setInterval(loadPlatformStats,30000);setInterval(tick,1000);
setInterval(()=>{{if(document.getElementById('decouverte')&&document.getElementById('decouverte').style.display!=='none')loadAutoOutreachStatus();}},30000);

// === AUTO-OUTREACH ENGINE ===
async function loadAutoOutreachStatus(){{
    try{{
        const r=await fetch('/api/admin/auto-outreach/status');
        const d=await r.json();
        const panel=document.getElementById('outreach_panel');
        if(!panel)return;
        const on=d.enabled;
        panel.innerHTML=
            '<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">'
            +'<div>'
            +'<div style="font-size:0.75rem;color:#94a3b8;margin-bottom:6px;">PROSPECTION AUTOMATIQUE</div>'
            +'<button onclick="toggleAutoOutreach()" style="padding:10px 28px;border-radius:8px;border:none;cursor:pointer;font-size:1rem;font-weight:700;background:'+(on?'#16a34a':'#334155')+';color:'+(on?'#fff':'#94a3b8')+';transition:all 0.2s;">'
            +(on?'● EN MARCHE':'○ ARRÊTÉE')+'</button>'
            +'</div>'
            +'<div style="display:flex;gap:24px;flex-wrap:wrap;">'
            +'<div><div style="font-size:0.7rem;color:#64748b;">Envoyés aujourd\'hui</div><div style="font-size:1.4rem;font-weight:800;color:#34d399;">'+d.sent_today+' / '+d.daily_limit+'</div></div>'
            +'<div><div style="font-size:0.7rem;color:#64748b;">Total envoyés</div><div style="font-size:1.4rem;font-weight:800;color:#38bdf8;">'+d.total_sent+'</div></div>'
            +'<div><div style="font-size:0.7rem;color:#64748b;">Dernier envoi</div><div style="font-size:0.85rem;font-weight:600;color:#e2e8f0;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(d.last_prospect||'—')+'</div></div>'
            +'</div>'
            +'<div><div style="font-size:0.7rem;color:#64748b;">Prospects prêts</div><div style="font-size:1.4rem;font-weight:800;color:'+(d.prospects_ready>0?'#f59e0b':'#ef4444')+';">'+d.prospects_ready+'</div></div>'
            +'<div><div style="font-size:0.7rem;color:#64748b;">Banque</div><div style="font-size:1.4rem;font-weight:800;color:#a78bfa;">'+d.bank_ready+'</div></div>'
            +'</div>'
            +'<div style="font-size:0.75rem;margin-top:4px;padding:6px 10px;border-radius:6px;background:rgba(255,255,255,0.04);">'
            +(d.resend_configured?'<span style="color:#34d399;">✓ Resend</span>':'<span style="color:#ef4444;">✗ Resend non configuré</span>')
            +' &nbsp;|&nbsp; '
            +(d.smtp_configured?'<span style="color:#34d399;">✓ SMTP</span>':'<span style="color:#64748b;">— SMTP</span>')
            +' &nbsp;|&nbsp; '
            +(d.google_places_configured?'<span style="color:#34d399;">✓ Google Places</span>':'<span style="color:#ef4444;">✗ Google Places manquant — AUCUNE DÉCOUVERTE</span>')
            +' &nbsp;|&nbsp; <span style="color:#94a3b8;">From: '+d.from_email+'</span>'
            +'</div>'
            +(on?'<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><span style="font-size:0.78rem;color:#34d399;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.2);border-radius:6px;padding:6px 12px;">🤖 Envoie automatiquement toutes les '+d.interval_minutes+' min</span><button onclick="sendNow(this)" style="background:#1e40af;color:#93c5fd;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:0.82rem;font-weight:600;">⚡ Envoyer maintenant</button><button onclick="forceGenerate(this)" style="background:#7c3aed;color:#e9d5ff;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:0.82rem;font-weight:600;">🔧 Forcer génération</button><button onclick="testEmail(this)" style="background:#065f46;color:#6ee7b7;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:0.82rem;font-weight:600;">📧 Test Email</button></div>':'')
            +'</div>';
    }}catch(e){{}}
}}
async function forceGenerate(btn){{
    const orig=btn.textContent;btn.textContent='⏳ Génération...';btn.disabled=true;
    try{{
        const r=await fetch('/api/admin/auto-outreach/force-generate',{{method:'POST'}});
        const d=await r.json();
        if(r.ok){{
            showNotice('✅ '+d.fixed+' prospects prêts à envoyer ('+d.skipped+' ignorés). Cliquez ⚡ Envoyer maintenant.',false);
            loadAutoOutreachStatus();loadSuggestions();
        }}else{{showNotice('❌ '+(d.detail||'Erreur'),true);}}
    }}catch(e){{showNotice('❌ '+e.message,true);}}
    btn.textContent=orig;btn.disabled=false;
}}
async function sendNow(btn){{
    const orig=btn.textContent;btn.textContent='⏳...';btn.disabled=true;
    try{{
        const r=await fetch('/api/admin/auto-outreach/send-now',{{method:'POST'}});
        const d=await r.json();
        if(r.ok){{
            const sent=d.sent||[];const errs=d.errors||[];
            let msg='';
            if(sent.length)msg+='✅ Envoyé: '+sent.join(', ')+'. ';
            if(errs.length)msg+='⚠️ Erreurs: '+errs.join(' | ')+'. ';
            if(!sent.length&&!errs.length)msg='⚠️ Aucun prospect prêt (new:'+d.total_new+', avec email:'+d.with_email+', prêts:'+d.ready_to_send+')';
            showNotice(msg||'Done',errs.length>0&&!sent.length);
            loadAutoOutreachStatus();
            loadSuggestions();
        }}else{{showNotice('❌ '+(d.detail||'Erreur'),true);}}
    }}catch(e){{showNotice('❌ '+e.message,true);}}
    btn.textContent=orig;btn.disabled=false;
}}
async function testEmail(btn){{
    const orig=btn.textContent;btn.textContent='⏳...';btn.disabled=true;
    try{{
        const r=await fetch('/api/admin/test-email',{{method:'POST'}});
        const d=await r.json();
        if(r.ok){{showNotice('✅ Test envoyé! '+d.detail,false);}}
        else{{showNotice('❌ Erreur: '+(d.detail||JSON.stringify(d)),true);}}
    }}catch(e){{showNotice('❌ '+e.message,true);}}
    btn.textContent=orig;btn.disabled=false;
}}
async function debugBatch(btn){{
    const orig=btn.textContent; btn.textContent='⏳ Diagnostic...'; btn.disabled=true;
    const el=document.getElementById('disc_test_result');
    try{{
        const r=await fetch('/api/admin/debug-batch',{{method:'POST'}});
        const d=await r.json();
        const steps=d.steps||[];
        el.innerHTML='<br>'+steps.map(s=>'<div style="font-family:monospace;font-size:0.78rem;color:'+(s.includes('ERREUR')?'#ef4444':s.includes('OK')?'#34d399':'#94a3b8')+';">'+escH(s)+'</div>').join('')+(d.error?'<div style="color:#ef4444;font-weight:600;">❌ '+escH(d.error)+'</div>':'');
        el.style.color='#94a3b8';
        loadAutoOutreachStatus();
    }}catch(e){{el.textContent='❌ '+e.message;}}
    btn.textContent=orig; btn.disabled=false;
}}
async function toggleAutoOutreach(){{
    await fetch('/api/admin/auto-outreach/toggle',{{method:'POST'}});
    await loadAutoOutreachStatus();
}}

async function testDiscovery(btn){{
    const orig=btn.textContent; btn.textContent='⏳ Test en cours...'; btn.disabled=true;
    const el=document.getElementById('disc_test_result');
    try{{
        const r=await fetch('/api/admin/test-discovery',{{method:'POST'}});
        const d=await r.json();
        const gp=d.google_places||[];
        const ddg=d.ddg||[];
        let msg='';
        if(gp.length)msg+='✅ Google Places: '+gp.length+' résultats ('+d.city+' / '+d.industry+'). Ex: '+gp[0].name;
        else msg+='❌ Google Places: 0 résultats — '+d.gp_raw_status;
        if(d.ddg_error)msg+=' | DDG: '+d.ddg_error;
        else if(ddg.length)msg+=' | DDG: '+ddg.length+' ok';
        else msg+=' | DDG: 0';
        if(d.error)msg='❌ Erreur: '+d.error;
        el.textContent=msg; el.style.color=gp.length?'#34d399':'#ef4444';
    }}catch(e){{el.textContent='❌ '+e.message; el.style.color='#ef4444';}}
    btn.textContent=orig; btn.disabled=false;
}}

// === DÉCOUVERTE AUTOMATIQUE DE PMEs ===
let discProspects=[];
async function testSmtp(btn){{
    const orig=btn.textContent;
    btn.textContent='⏳ Test en cours...';btn.disabled=true;
    try{{
        const r=await fetch('/api/admin/smtp-test',{{method:'POST'}});
        const d=await r.json();
        if(r.ok){{showNotice('✅ '+d.message,false);}}
        else{{showNotice('❌ '+d.detail,true);}}
    }}catch(e){{showNotice('❌ Erreur réseau: '+e.message,true);}}
    btn.textContent=orig;btn.disabled=false;
}}
// === RADAR EN DIRECT ===
let _radarES=null;
let _radarCount=0;

function initRadar(){{
    if(_radarES&&_radarES.readyState!==2)return; // already connected
    const dot=document.getElementById('radar_dot');
    const status=document.getElementById('radar_status');
    if(dot)dot.style.background='#fbbf24';
    if(status)status.textContent='— connexion...';
    _radarES=new EventSource('/api/admin/discovery-stream');
    _radarES.onopen=function(){{
        if(dot)dot.style.background='#34d399';
        if(dot){{dot.style.animation='radarPulse 1.5s ease-in-out infinite';}}
        if(status)status.textContent='— en direct';
    }};
    _radarES.onerror=function(){{
        if(dot){{dot.style.background='#ef4444';dot.style.animation='none';}}
        if(status)status.textContent='— reconnexion...';
        setTimeout(initRadar, 4000);
    }};
    _radarES.onmessage=function(e){{
        try{{
            const evt=JSON.parse(e.data);
            appendRadarRow(evt);
        }}catch(err){{}}
    }};
}}

function appendRadarRow(evt){{
    const feed=document.getElementById('radar_feed');
    if(!feed)return;
    // Remove placeholder
    const ph=feed.querySelector('[data-placeholder]');
    if(ph)ph.remove();
    _radarCount++;
    const row=document.createElement('div');
    row.style.cssText='padding:5px 16px;border-bottom:1px solid #0f1e35;display:flex;gap:10px;align-items:flex-start;animation:radarSlide 0.3s ease;';
    const typeColors={{
        searching:'#38bdf8', found:'#a78bfa', scraped:'#94a3b8',
        saved:'#34d399', no_result:'#475569', scraping:'#fbbf24'
    }};
    const typeLabels={{
        searching:'SCAN', found:'SITE', scraped:'ANALYSE',
        saved:'AJOUTÉ', no_result:'VIDE', scraping:'SCRAPING'
    }};
    const col=typeColors[evt.type]||'#64748b';
    const lbl=typeLabels[evt.type]||evt.type.toUpperCase();
    let detail='';
    if(evt.type==='searching'){{
        detail='<span style="color:#cbd5e1;">'+escH(evt.industry)+' — <span style="color:#38bdf8;">'+escH(evt.city)+'</span></span>';
    }}else if(evt.type==='found'){{
        detail='<span style="color:#a78bfa;">'+escH((evt.title||evt.url||'').substring(0,55))+'</span><span style="color:#334155;"> '+escH(evt.city)+'</span>';
    }}else if(evt.type==='scraped'){{
        const emailBadge=evt.has_email?'<span style="color:#fbbf24;">✉ '+escH(evt.email)+'</span>':'<span style="color:#334155;">sans email</span>';
        detail='<span style="color:#e2e8f0;">'+escH((evt.name||'').substring(0,40))+'</span> '+emailBadge+' <span style="color:#475569;">score:'+evt.web_score+'</span>';
    }}else if(evt.type==='saved'){{
        const emailBadge=evt.has_email?'<span style="color:#fbbf24;">✉</span> ':'';
        detail=emailBadge+'<span style="color:#34d399;font-weight:600;">'+escH((evt.name||'').substring(0,40))+'</span> <span style="color:#475569;">'+escH(evt.city)+' · '+escH(evt.industry)+'</span>';
    }}else if(evt.type==='scraping'){{
        detail='<span style="color:#fbbf24;">'+evt.count+' sites</span> <span style="color:#475569;">'+escH(evt.city)+' — '+escH(evt.industry)+'</span>';
    }}else if(evt.type==='no_result'){{
        detail='<span style="color:#475569;">Aucun résultat — '+escH(evt.city)+' / '+escH(evt.industry)+'</span>';
    }}
    row.innerHTML='<span style="color:#334155;min-width:52px;">'+escH(evt.ts||'')+'</span>'
        +'<span style="color:'+col+';min-width:70px;font-weight:700;">'+lbl+'</span>'
        +'<span>'+detail+'</span>';
    feed.insertBefore(row, feed.firstChild);
    // Keep max 120 rows
    while(feed.children.length>120)feed.removeChild(feed.lastChild);
}}

function clearRadar(){{
    const feed=document.getElementById('radar_feed');
    if(feed){{feed.innerHTML='<div data-placeholder style="color:#334155;padding:8px 16px;text-align:center;">Effacé — en attente de la prochaine découverte...</div>';}}
    _radarCount=0;
}}

function escH(s){{if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}}

async function loadSuggestions(){{
    const stats=document.getElementById('sugg_stats');
    if(stats)stats.textContent='Chargement...';
    try{{
        const r=await fetch('/api/admin/suggestions');
        const data=await r.json();
        discProspects=data.suggestions||[];
        const counts=data.counts||{{}};
        const n=counts.new||0;const c=counts.contacted||0;const d=counts.dismissed||0;
        const withEmail=(data.suggestions||[]).filter(s=>s.email).length;
        const bankCount=data.bank_count||0;
        if(stats)stats.innerHTML='<b>'+n+'</b> en attente &nbsp;·&nbsp; <b style="color:#34d399;">'+withEmail+'</b> avec email &nbsp;·&nbsp; <span style="color:#94a3b8;font-size:0.85em;">banque: '+bankCount+'</span> &nbsp;·&nbsp; <b>'+c+'</b> contactés';
        renderSuggestions(discProspects,counts);
    }}catch(e){{
        if(stats)stats.textContent='Erreur: '+e.message;
    }}
}}
let _refreshPollTimer=null;
async function refreshSuggestions(){{
    const btn=document.getElementById('sugg_refresh_btn');
    const stats=document.getElementById('sugg_stats');
    if(btn){{btn.disabled=true;btn.textContent='⏳ Démarrage...';}}
    try{{
        const r=await fetch('/api/admin/suggestions/refresh',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:'{{}}'}});
        const data=await r.json();
        if(data.already_running){{
            if(stats)stats.textContent='⏳ Recherche déjà en cours...';
            _pollRefreshStatus();return;
        }}
        if(!data.started){{showNotice('❌ Impossible de démarrer',true);if(btn){{btn.disabled=false;btn.textContent='🔄 Refresh — nouvelles PMEs';}}return;}}
        if(stats)stats.textContent='🔍 Recherche PMEs au Québec... (0 trouvées)';
        _pollRefreshStatus();
    }}catch(e){{
        showNotice('❌ Erreur réseau: '+e.message,true);
        if(btn){{btn.disabled=false;btn.textContent='🔄 Refresh — nouvelles PMEs';}}
    }}
}}
function _pollRefreshStatus(){{
    if(_refreshPollTimer)clearInterval(_refreshPollTimer);
    let dots=0;
    _refreshPollTimer=setInterval(async()=>{{
        const stats=document.getElementById('sugg_stats');
        const btn=document.getElementById('sugg_refresh_btn');
        try{{
            const r=await fetch('/api/admin/suggestions/refresh/status');
            const d=await r.json();
            dots=(dots+1)%4;
            const dot='.'.repeat(dots+1);
            if(!d.done){{
                if(stats)stats.textContent='🔍 Analyse en cours'+dot+' ('+d.saved+' trouvées)';
                return;
            }}
            clearInterval(_refreshPollTimer);_refreshPollTimer=null;
            if(d.error){{showNotice('❌ Erreur: '+d.error,true);}}
            else{{
                discProspects=d.suggestions||[];
                const counts=d.counts||{{}};
                const n=counts.new||0;const c=counts.contacted||0;const dism=counts.dismissed||0;
                const withEmail=(d.suggestions||[]).filter(s=>s.email).length;
                if(stats)stats.innerHTML='<b>'+n+'</b> en attente &nbsp;·&nbsp; <b style="color:#34d399;">'+withEmail+'</b> avec email &nbsp;·&nbsp; <b>'+c+'</b> contactés &nbsp;·&nbsp; <b>'+dism+'</b> ignorés';
                renderSuggestions(discProspects,counts);
                const sv=d.saved||0;const bk=d.bank_count||0;
                if(sv>0){{showNotice('✅ '+sv+' nouvelles PMEs ajoutées ! (banque: '+bk+' restantes)',false);}}
                else{{showNotice('⏳ Banque en remplissage automatique — réessayez dans ~2 min. (banque actuelle: '+bk+')',true);}}
            }}
            if(btn){{btn.disabled=false;btn.textContent='🔄 Refresh — nouvelles PMEs';}}
        }}catch(e){{
            clearInterval(_refreshPollTimer);_refreshPollTimer=null;
            showNotice('❌ Erreur polling: '+e.message,true);
            if(btn){{btn.disabled=false;btn.textContent='🔄 Refresh — nouvelles PMEs';}}
        }}
    }},2500);
}}
async function suggestionAction(id,action,i){{
    const card=document.getElementById('sugg_card_'+i);
    if(card){{card.style.opacity='0.4';card.style.pointerEvents='none';}}
    try{{
        await fetch('/api/admin/suggestions/action',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{id,action}})}});
        await loadSuggestions();
    }}catch(e){{showNotice('❌ Erreur',true);}}
}}
async function sendEmailToAll(){{
    const withEmail=discProspects.filter(p=>p.email&&p.emails_generated&&(!p.sent_emails||!p.sent_emails.includes(1)));
    if(withEmail.length===0){{showNotice('Aucune PME avec email disponible',true);return;}}
    if(!confirm('Envoyer Email 1 à '+withEmail.length+' PME(s) ?\n\n'+withEmail.map(p=>p.name+' — '+p.email).join('\n')))return;
    let sent=0,failed=0;
    for(const p of withEmail){{
        try{{
            const idx=discProspects.indexOf(p);
            const e=(p.generated_emails||{{}})['email1']||{{}};
            if(!e.subject||!e.body)continue;
            const r=await fetch('/api/admin/send-prospect-email',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{to:p.email,subject:e.subject,body:e.body,prospect_id:p.id}})}});
            if(r.ok){{sent++;if(!p.sent_emails)p.sent_emails=[];p.sent_emails.push(1);}}
            else if(r.status===503){{
                const url='mailto:'+p.email+'?subject='+encodeURIComponent(e.subject)+'&body='+encodeURIComponent(e.body);
                window.open(url,'_blank');sent++;
            }}else failed++;
        }}catch(ex){{failed++;}}
        await new Promise(r=>setTimeout(r,500));// small delay between sends
    }}
    renderSuggestions(discProspects,{{}});
    showNotice('✅ '+sent+' emails envoyés'+(failed?' ('+failed+' échecs)':'')+'!',false);
}}
function renderSuggestions(list,counts){{
    const el=document.getElementById('sugg_results');
    if(!el)return;
    if(!list||!list.length){{
        el.innerHTML='<div class="panel" style="color:#94a3b8;text-align:center;padding:32px;"><div style="font-size:2rem;margin-bottom:12px;">✅</div><div style="font-size:1rem;color:#e2e8f0;margin-bottom:8px;">Toutes les suggestions ont été traitées !</div><div style="color:#64748b;font-size:0.85rem;margin-bottom:16px;">Cliquez sur Refresh pour obtenir de nouvelles PMEs à contacter au Québec.</div><button class="btn" onclick="refreshSuggestions()">🔄 Chercher de nouvelles PMEs</button></div>';
        return;
    }}
    el.innerHTML=list.map((p,i)=>{{
        const eq=p.email_quality;
        const badge=eq==='site'||eq==='contact-page'
            ?'<span style="background:rgba(52,211,153,0.15);color:#34d399;padding:2px 8px;border-radius:10px;font-size:0.7rem;margin-left:6px;">✅ Email trouvé</span>'
            :'<span style="background:rgba(245,158,11,0.15);color:#f59e0b;padding:2px 8px;border-radius:10px;font-size:0.7rem;margin-left:6px;">⚠️ Email manquant</span>';
        const emailRow=p.email
            ?'<div style="color:#38bdf8;font-size:0.82rem;margin-top:4px;">'+p.email+badge+'</div>'
            :'<div style="margin-top:4px;">'+badge+'</div>';
        const ns=p.generated_emails&&p.generated_emails.need_score?p.generated_emails.need_score:null;
        const needBadge=ns?'<span style="background:rgba(52,211,153,0.12);color:#34d399;padding:2px 8px;border-radius:10px;font-size:0.7rem;margin-left:6px;border:1px solid rgba(52,211,153,0.25);">🎯 Besoin '+ns+'/10</span>':'';
        const webScore=p.web_score||5;
        const webBadge=webScore<=2
            ?'<span style="background:rgba(239,68,68,0.12);color:#f87171;padding:2px 8px;border-radius:10px;font-size:0.7rem;margin-left:6px;border:1px solid rgba(239,68,68,0.2);">🖥️ Site à refaire</span>'
            :(webScore<=3?'<span style="background:rgba(245,158,11,0.1);color:#f59e0b;padding:2px 8px;border-radius:10px;font-size:0.7rem;margin-left:6px;">🖥️ Site vieillissant</span>':'');
        const webIssuePills=(p.web_issues&&p.web_issues.length&&webScore<=3
            ?'<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">'+(p.web_issues.map(iss=>'<span style="background:rgba(239,68,68,0.08);color:#f87171;padding:2px 10px;border-radius:10px;font-size:0.7rem;">'+iss+'</span>').join(''))+'</div>'
            :'');
        const ratingBadge=p.rating?'<span style="background:rgba(251,191,36,0.15);color:#fbbf24;padding:2px 8px;border-radius:10px;font-size:0.7rem;margin-right:6px;">⭐ '+p.rating+(p.review_count?' · '+p.review_count:'')+'</span>':'';
        const painPills=(p.pain_points&&p.pain_points.length
            ?'<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">'+(p.pain_points.map(pp=>'<span style="background:rgba(124,58,237,0.12);color:#a78bfa;padding:2px 10px;border-radius:10px;font-size:0.72rem;border:1px solid rgba(124,58,237,0.2);">⚠ '+pp+'</span>').join(''))+'</div>'
            :'');
        const insightsBlock=(p.insights||ratingBadge||painPills||webIssuePills
            ?'<div style="margin-top:10px;background:#0a0e17;border-radius:8px;padding:10px 12px;border-left:3px solid #7c3aed;">'
                +(ratingBadge?'<div style="margin-bottom:6px;">'+ratingBadge+'</div>':'')
                +(p.insights?'<div style="color:#94a3b8;font-size:0.8rem;line-height:1.5;margin-bottom:4px;">💡 '+p.insights+'</div>':'')
                +painPills+webIssuePills
            +'</div>'
            :'');
        const e1=p.generated_emails&&p.generated_emails.email1?p.generated_emails.email1:null;
        const preview=e1?'<div style="margin-top:10px;background:#0f1f2e;border-radius:8px;padding:10px;font-size:0.8rem;"><div style="color:#fbbf24;margin-bottom:4px;">📧 '+e1.subject+'</div><div style="color:#94a3b8;">'+(e1.body||'').substring(0,140)+'...</div></div>':'';
        const sendBtn=p.email&&p.emails_generated?'<button class="btn" style="padding:6px 12px;font-size:0.78rem;background:#7c3aed;" onclick="sendDiscEmail('+i+',1)">📤 Envoyer</button>':'';
        const refonteBtn=p.email&&p.has_refonte?'<button class="btn" style="padding:6px 12px;font-size:0.78rem;background:#dc2626;" onclick="openDiscRefonte('+i+')">🖥️ Pitch refonte</button>':'';
        const viewBtn=p.emails_generated?'<button class="btn" style="padding:6px 12px;font-size:0.78rem;background:#0ea5e9;" onclick="openDiscEmail('+i+',1)">📨 Voir emails</button>':'';
        const proposalBtn='<button class="btn proposal-btn" style="padding:6px 12px;font-size:0.78rem;background:#0f766e;" onclick="generateProposal('+i+')">📄 Proposition</button>';
        const addEmailBtn=!p.email?'<button class="btn" style="padding:6px 12px;font-size:0.78rem;background:#334155;color:#94a3b8;" onclick="addDiscEmail('+i+')">✏️ Ajouter email</button>':'';
        return '<div class="panel" id="sugg_card_'+i+'" style="margin-bottom:12px;">'
            +'<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">'
            +'<div style="flex:1;min-width:200px;">'
            +'<div style="font-weight:600;color:#e2e8f0;font-size:1rem;">'+p.name+needBadge+webBadge+'</div>'
            +'<div style="color:#64748b;font-size:0.78rem;margin-top:2px;">'+p.city+' · '+p.industry+'</div>'
            +emailRow
            +(p.phone?'<div style="color:#94a3b8;font-size:0.78rem;margin-top:2px;">📞 '+p.phone+'</div>':'')
            +'<div style="margin-top:4px;"><a href="'+p.website+'" target="_blank" style="color:#38bdf8;font-size:0.75rem;">'+p.website.replace(/^https?:\/\//,'').substring(0,60)+'</a></div>'
            +'</div>'
            +'<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;">'
            +viewBtn+refonteBtn+sendBtn+proposalBtn+addEmailBtn
            +'</div>'
            +'</div>'
            +insightsBlock+preview
            +'<div class="sugg-actions" style="margin-top:12px;display:flex;gap:8px;border-top:1px solid #1e3a5f;padding-top:10px;">'
            +'<button class="btn" style="padding:6px 16px;font-size:0.82rem;background:#16a34a;" onclick="suggestionAction(\''+p.id+'\',\'contacted\','+i+')">✓ Contacté</button>'
            +'<button class="btn" style="padding:6px 16px;font-size:0.82rem;background:#334155;color:#94a3b8;" onclick="suggestionAction(\''+p.id+'\',\'dismissed\','+i+')">✗ Ignorer</button>'
            +'<button class="btn" style="padding:6px 16px;font-size:0.82rem;background:#0ea5e9;opacity:0.85;" onclick="saveDiscProspect('+i+')">💾 Sauvegarder</button>'
            +'</div>'
            +'</div>';
    }}).join('');
}}

let discEmailIdx=-1,discEmailTab=1;
function openDiscEmail(i,tab){{
    discEmailIdx=i;discEmailTab=tab||1;
    document.getElementById('discEmailModal').style.display='flex';
    renderDiscEmailModal();
}}
function renderDiscEmailModal(){{
    if(discEmailIdx<0)return;
    const p=discProspects[discEmailIdx];
    const isRefonte=discEmailTab==='refonte';
    const e=isRefonte
        ?(p.generated_emails&&p.generated_emails.email_refonte)||{{}}
        :(p.generated_emails||{{}})[''+'email'+discEmailTab]||{{}};
    document.getElementById('disc_em_name').textContent=p.name+(isRefonte?' — Refonte site':'');
    document.getElementById('disc_em_subj').value=e.subject||'';
    document.getElementById('disc_em_body').value=e.body||'';
    [1,2,3].forEach(n=>{{
        const t=document.getElementById('disc_tab_'+n);
        if(t)t.style.background=n===discEmailTab?'#0ea5e9':'#1e3a5f';
    }});
    const tr=document.getElementById('disc_tab_refonte');
    if(tr){{
        tr.style.display=p.has_refonte?'inline-block':'none';
        tr.style.background=isRefonte?'#dc2626':'#1e3a5f';
        tr.style.color=isRefonte?'white':'#94a3b8';
    }}
    const sb=document.getElementById('disc_send_modal_btn');
    if(sb){{
        const key=isRefonte?'refonte':discEmailTab;
        const sent=p.sent_emails&&p.sent_emails.includes(key);
        sb.disabled=sent;sb.textContent=sent?'✅ Envoyé':'📤 Envoyer';
        sb.style.background=sent?'#16a34a':(isRefonte?'#dc2626':'#7c3aed');sb.style.opacity=sent?'0.65':'1';
    }}
}}
function switchDiscTab(n){{discEmailTab=n;renderDiscEmailModal();}}
function openDiscRefonte(i){{openDiscEmail(i,'refonte');}}
async function sendDiscEmail(i,emailNum){{
    const p=discProspects[i];
    if(!p.email){{showNotice("Ajoutez d'abord le courriel avec ✏️",true);return;}}
    const isRefonte=emailNum==='refonte';
    const e=isRefonte
        ?((p.generated_emails&&p.generated_emails.email_refonte)||{{}})
        :((p.generated_emails||{{}})[''+'email'+emailNum]||{{}});
    if(!e.subject||!e.body){{showNotice('Email non disponible',true);return;}}
    try{{
        const r=await fetch('/api/admin/send-prospect-email',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{to:p.email,subject:e.subject,body:e.body,prospect_id:p.id}})}});
        const data=await r.json();
        if(r.ok){{
            if(!p.sent_emails)p.sent_emails=[];
            p.sent_emails.push(emailNum);
            showNotice('✅ Courriel envoyé à '+p.email+' !',false);
            renderSuggestions(discProspects,{{}});
            if(discEmailIdx===i)renderDiscEmailModal();
        }}else if(r.status===503){{
            const mailtoUrl='mailto:'+p.email+'?subject='+encodeURIComponent(e.subject)+'&body='+encodeURIComponent(e.body);
            window.open(mailtoUrl,'_blank');
            showNotice('📧 Ouverture dans votre client email — SMTP non configuré dans Railway',false);
        }}else{{
            showNotice('❌ '+(data.detail||'Erreur SMTP — vérifiez SMTP_HOST dans Railway'),true);
        }}
    }}catch(ex){{showNotice('❌ Erreur réseau',true);}}
}}
async function sendDiscEmailFromModal(){{await sendDiscEmail(discEmailIdx,discEmailTab);}}
function copyDiscEmail(){{
    const s=document.getElementById('disc_em_subj').value;
    const b=document.getElementById('disc_em_body').value;
    navigator.clipboard.writeText('Objet: '+s+'\\n\\n'+b);
    showNotice('📋 Email copié !',false);
}}
function addDiscEmail(i){{
    const email=prompt('Entrez le courriel de '+discProspects[i].name+' :');
    if(email&&email.includes('@')){{discProspects[i].email=email;discProspects[i].email_quality='manual';renderSuggestions(discProspects,{{}});}}
}}
async function saveDiscProspect(i){{
    const p=discProspects[i];
    if(!p.email){{showNotice('Aucun email — cliquez ✏️ pour en ajouter un',true);return;}}
    const body={{name:p.name.split(' ')[0]||p.name,business_name:p.name,email:p.email,phone:p.phone||'',coworking:p.city,industry:p.industry,notes:'Via Découverte IA — '+p.website}};
    const r=await fetch('/api/v1/prospects',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(body)}});
    if(r.ok){{showNotice('✅ '+p.name+' sauvegardé dans Prospection !',false);if(discEmailIdx===i)document.getElementById('discEmailModal').style.display='none';}}
    else showNotice('❌ Déjà existant ou erreur',true);
}}

// === PIPELINE / KANBAN ===
async function loadPipeline(){{
    try{{
        const r=await fetch('/api/admin/pipeline');
        if(!r.ok){{showNotice('❌ Erreur chargement pipeline',true);return;}}
        const data=await r.json();
        const cols=[
            {{key:'new',label:'Découverts',color:'#38bdf8'}},
            {{key:'contacted',label:'Contactés',color:'#a855f7'}},
            {{key:'interested',label:'Intéressés',color:'#f59e0b'}},
            {{key:'client',label:'Clients',color:'#34d399'}},
        ];
        const grid=document.getElementById('pipeline_grid');
        if(!grid)return;
        grid.innerHTML=cols.map(col=>{{
            const items=data[col.key]||[];
            const cards=items.map(p=>{{
                const emailHtml=p.email
                    ?'<div style="color:#34d399;font-size:0.75rem;margin-top:3px;">✉ '+p.email+'</div>'
                    :'<div style="color:#475569;font-size:0.75rem;margin-top:3px;">— pas d\'email</div>';
                const intBtn=col.key==='contacted'
                    ?'<button onclick="markInterested(\''+p.id+'\')" style="margin-top:6px;background:rgba(245,158,11,0.15);color:#f59e0b;border:1px solid rgba(245,158,11,0.3);border-radius:6px;padding:3px 10px;font-size:0.72rem;cursor:pointer;width:100%;">✋ Marquer Intéressé</button>'
                    :'';
                return '<div style="background:#0f1f2e;border-radius:8px;padding:10px 12px;margin-bottom:8px;border-left:3px solid '+col.color+';">'
                    +'<div style="font-weight:600;color:#e2e8f0;font-size:0.88rem;">'+p.name+'</div>'
                    +'<div style="color:#64748b;font-size:0.75rem;margin-top:2px;">'+p.city+' · '+p.industry+'</div>'
                    +emailHtml+intBtn
                    +'</div>';
            }}).join('');
            return '<div style="flex:1;min-width:200px;background:#1a2332;border-radius:12px;padding:14px;border:1px solid #1e3a5f;">'
                +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
                +'<div style="font-weight:700;color:'+col.color+';font-size:0.9rem;">'+col.label+'</div>'
                +'<span style="background:rgba(255,255,255,0.07);color:#94a3b8;border-radius:20px;padding:2px 10px;font-size:0.78rem;">'+items.length+'</span>'
                +'</div>'
                +(cards||'<div style="color:#475569;font-size:0.8rem;text-align:center;padding:16px 0;">—</div>')
                +'</div>';
        }}).join('');
    }}catch(e){{showNotice('❌ Erreur: '+e.message,true);}}
}}

async function markInterested(id){{
    try{{
        await fetch('/api/admin/suggestions/action',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{id,action:'interested'}})}});
        await loadPipeline();
        showNotice('✅ Statut mis à jour: Intéressé',false);
    }}catch(e){{showNotice('❌ Erreur',true);}}
}}

// === GÉNÉRATEUR DE PROPOSITION ===
async function generateProposal(i){{
    const p=discProspects[i];
    if(!p)return;
    const btn=document.querySelector('#sugg_card_'+i+' .proposal-btn');
    if(btn){{btn.textContent='⏳ Génération...';btn.disabled=true;}}
    try{{
        const r=await fetch('/api/admin/generate-proposal',{{
            method:'POST',
            headers:{{'Content-Type':'application/json'}},
            body:JSON.stringify({{prospect_id:p.id}})
        }});
        const data=await r.json();
        if(!r.ok){{showNotice('❌ '+(data.detail||'Erreur génération'),true);return;}}
        document.getElementById('proposalModalName').textContent=p.name;
        document.getElementById('proposalContent').value=data.proposal||'';
        document.getElementById('proposalModal').style.display='flex';
    }}catch(e){{showNotice('❌ Erreur réseau',true);}}
    finally{{if(btn){{btn.textContent='📄 Proposition';btn.disabled=false;}}}}
}}

function copyProposal(){{
    const ta=document.getElementById('proposalContent');
    ta.select();
    navigator.clipboard.writeText(ta.value).then(()=>{{
        const btn=document.getElementById('copyProposalBtn');
        btn.textContent='✅ Copié !';
        setTimeout(()=>{{btn.textContent='📋 Copier';}},2000);
    }}).catch(()=>{{document.execCommand('copy');showNotice('📋 Copié !',false);}});
}}

// === EMAIL STATS (DASHBOARD) ===
async function loadEmailStats(){{
    try{{
        const r=await fetch('/api/admin/email-stats');
        if(!r.ok)return;
        const d=await r.json();
        const el=document.getElementById('emailStatsRow');
        if(!el)return;
        el.innerHTML=
            '<div class="stat-card"><div class="stat-label">📧 Emails envoyés</div><div class="stat-value">'+d.sent+'</div></div>'
            +'<div class="stat-card"><div class="stat-label">🔄 Relances envoyées</div><div class="stat-value">'+d.followups+'</div></div>'
            +'<div class="stat-card" style="border-color:#f59e0b44;"><div class="stat-label" style="color:#f59e0b;">✋ Intéressés</div><div class="stat-value">'+d.interested+'<span style="font-size:0.65rem;color:#94a3b8;margin-left:4px;">'+d.response_rate+'%</span></div></div>'
            +'<div class="stat-card" style="border-color:#34d39944;"><div class="stat-label" style="color:#34d399;">🏆 Clients</div><div class="stat-value">'+d.clients+'</div></div>';
    }}catch(e){{}}
}}

// === CARTE EN DIRECT ===
let _carteMap = null;
let _carteES2 = null;
let _carteMarkers = {{}};
let _carteStats = {{searching:0,found:0,scraped:0,saved:0,email:0}};
let _carteInitialized = false;

function initCarteView() {{
    if (_carteInitialized) {{ reconnectCarteES(); return; }}
    _carteInitialized = true;
    // Load Leaflet CSS + JS dynamically
    if (!document.getElementById('leaflet-css')) {{
        const lc = document.createElement('link');
        lc.id = 'leaflet-css';
        lc.rel = 'stylesheet';
        lc.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(lc);
    }}
    if (!window.L) {{
        const ls = document.createElement('script');
        ls.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        ls.onload = () => {{ initLeafletMap(); initCarteES(); }};
        document.body.appendChild(ls);
    }} else {{
        initLeafletMap();
        initCarteES();
    }}
}}

function initLeafletMap() {{
    if (_carteMap) return;
    _carteMap = L.map('qc_map', {{
        center: [46.5, -72.5],
        zoom: 6,
        zoomControl: true,
        attributionControl: false
    }});
    L.tileLayer('https://{{s}}.basemaps.cartocdn.com/dark_all/{{z}}/{{x}}/{{y}}{{r}}.png', {{
        maxZoom: 14
    }}).addTo(_carteMap);
    // Add city base markers
    const cities = {{
        'Montréal':[45.5017,-73.5673],'Laval':[45.6066,-73.7124],
        'Longueuil':[45.5315,-73.5185],'Brossard':[45.4604,-73.4727],
        'Québec':[46.8139,-71.2080],'Sherbrooke':[45.4042,-71.8929],
        'Gatineau':[45.4765,-75.7013],'Saguenay':[48.4284,-71.0618],
        'Trois-Rivières':[46.3430,-72.5425],'Lévis':[46.8035,-71.1783],
        'Drummondville':[45.8836,-72.4839],'Saint-Jérôme':[45.7858,-74.0034],
        'Repentigny':[45.7395,-73.4590],'Terrebonne':[45.7002,-73.6453],
    }};
    Object.entries(cities).forEach(([city,[lat,lng]]) => {{
        const m = L.circleMarker([lat,lng], {{
            radius:8, fillColor:'#1e3a5f', color:'#38bdf8',
            weight:1.5, fillOpacity:0.9
        }}).addTo(_carteMap);
        m.bindTooltip(`<b style="color:#38bdf8">${{city}}</b>`, {{permanent:false,className:'carte-tooltip'}});
        _carteMarkers[city] = {{base:m, pins:[]}};
    }});
}}

function initCarteES() {{
    if (_carteES2 && _carteES2.readyState !== 2) return;
    const dot = document.getElementById('carte_dot');
    const status = document.getElementById('carte_status');
    if (dot) dot.style.background = '#fbbf24';
    if (status) status.textContent = '— connexion...';
    _carteES2 = new EventSource('/api/admin/discovery-stream');
    _carteES2.onopen = function() {{
        if (dot) {{ dot.style.background = '#34d399'; dot.style.animation = 'radarPulse 1.5s infinite'; }}
        if (status) status.textContent = '— en direct';
    }};
    _carteES2.onerror = function() {{
        if (dot) {{ dot.style.background = '#ef4444'; dot.style.animation = 'none'; }}
        if (status) status.textContent = '— reconnexion...';
        setTimeout(initCarteES, 4000);
    }};
    _carteES2.onmessage = function(e) {{
        try {{ handleCarteEvent(JSON.parse(e.data)); }} catch(err) {{}}
    }};
}}

function reconnectCarteES() {{
    if (!_carteES2 || _carteES2.readyState === 2) initCarteES();
}}

function handleCarteEvent(evt) {{
    const lat = evt.lat, lng = evt.lng;
    if (evt.type === 'searching') {{
        _carteStats.searching++;
        document.getElementById('cs_searching').textContent = _carteStats.searching;
        if (lat && lng && _carteMap) {{
            const pulse = L.circleMarker([lat,lng], {{
                radius:18, fillColor:'#38bdf8', color:'#38bdf8',
                weight:0, fillOpacity:0.15
            }}).addTo(_carteMap);
            const inner = L.circleMarker([lat,lng], {{
                radius:6, fillColor:'#38bdf8', color:'#fff',
                weight:1.5, fillOpacity:1
            }}).addTo(_carteMap);
            inner.bindPopup(`<div style="color:#0a0e17;font-size:12px;"><b>🔍 Scan en cours</b><br>${{escH(evt.city)}}<br><i>${{escH(evt.industry)}}</i></div>`);
            const city = evt.city;
            if (_carteMarkers[city]) _carteMarkers[city].pins.push(pulse, inner);
            setTimeout(() => {{ try {{ _carteMap.removeLayer(pulse); }} catch(e){{}} }}, 15000);
        }}
    }} else if (evt.type === 'found') {{
        _carteStats.found++;
        document.getElementById('cs_found').textContent = _carteStats.found;
        if (lat && lng && _carteMap) {{
            const dot = L.circleMarker([lat,lng+Math.random()*0.05-0.025], {{
                radius:4, fillColor:'#a78bfa', color:'transparent',
                weight:0, fillOpacity:0.7
            }}).addTo(_carteMap);
            setTimeout(() => {{ try {{ _carteMap.removeLayer(dot); }} catch(e){{}} }}, 20000);
        }}
    }} else if (evt.type === 'scraped') {{
        _carteStats.scraped++;
        document.getElementById('cs_scraped').textContent = _carteStats.scraped;
        if (evt.has_email) {{
            _carteStats.email++;
            document.getElementById('cs_email').textContent = _carteStats.email;
        }}
        if (lat && lng && _carteMap) {{
            const col = evt.has_email ? '#fbbf24' : '#475569';
            const dot = L.circleMarker([lat+Math.random()*0.04-0.02, lng+Math.random()*0.04-0.02], {{
                radius:5, fillColor:col, color:'transparent',
                weight:0, fillOpacity:0.8
            }}).addTo(_carteMap);
            dot.bindTooltip(`${{escH(evt.name||'')}}<br>${{evt.has_email?'✉ '+escH(evt.email):'sans email'}}`, {{className:'carte-tooltip'}});
            setTimeout(() => {{ try {{ _carteMap.removeLayer(dot); }} catch(e){{}} }}, 60000);
        }}
    }} else if (evt.type === 'saved') {{
        _carteStats.saved++;
        document.getElementById('cs_saved').textContent = _carteStats.saved;
        if (lat && lng && _carteMap) {{
            const marker = L.circleMarker([lat+Math.random()*0.06-0.03, lng+Math.random()*0.06-0.03], {{
                radius:7, fillColor:'#34d399', color:'#fff',
                weight:1.5, fillOpacity:1
            }}).addTo(_carteMap);
            marker.bindPopup(`<div style="color:#0a0e17;font-size:12px;min-width:160px;">
                <b style="color:#059669">${{escH(evt.name||'')}}</b><br>
                ${{escH(evt.city)}} · ${{escH(evt.industry)}}<br>
                ${{evt.has_email ? '<span style="color:#d97706">✉ '+escH(evt.email)+'</span>' : '<span style="color:#6b7280">sans email</span>'}}<br>
                Score site: ${{evt.web_score}}/10 · Besoin: ${{evt.need_score}}/10
            </div>`);
        }}
        addPmeCard(evt);
    }}
}}

function addPmeCard(evt) {{
    const container = document.getElementById('pme_cards');
    if (!container) return;
    const ph = container.querySelector('[data-placeholder]');
    if (ph) ph.remove();
    const scoreColor = (evt.web_score <= 3) ? '#ef4444' : (evt.web_score <= 6) ? '#fbbf24' : '#34d399';
    const needColor = (evt.need_score >= 7) ? '#34d399' : (evt.need_score >= 5) ? '#fbbf24' : '#94a3b8';
    const card = document.createElement('div');
    card.style.cssText = 'background:#0a1628;border:1px solid #1e3a5f;border-radius:10px;padding:12px;margin-bottom:8px;animation:radarSlide 0.3s ease;border-left:3px solid #34d399;';
    card.innerHTML = `
        <div style="font-weight:700;color:#e2e8f0;font-size:0.85rem;margin-bottom:4px;">${{escH((evt.name||'').substring(0,35))}}</div>
        <div style="font-size:0.72rem;color:#64748b;margin-bottom:8px;">${{escH(evt.city)}} · ${{escH(evt.industry)}}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
            ${{evt.has_email ? `<span style="background:rgba(251,191,36,0.15);color:#fbbf24;border-radius:4px;padding:2px 7px;font-size:0.68rem;">✉ email</span>` : `<span style="background:rgba(71,85,105,0.3);color:#475569;border-radius:4px;padding:2px 7px;font-size:0.68rem;">sans email</span>`}}
            <span style="background:rgba(56,189,248,0.1);color:#38bdf8;border-radius:4px;padding:2px 7px;font-size:0.68rem;">${{escH(evt.destination==='prospect_bank'?'banque':'suggestions')}}</span>
        </div>
        <div style="display:flex;gap:12px;">
            <div style="flex:1;">
                <div style="font-size:0.65rem;color:#475569;margin-bottom:3px;">Site web</div>
                <div style="background:#0f1f2e;border-radius:4px;height:6px;overflow:hidden;">
                    <div style="height:100%;width:${{(evt.web_score||0)*10}}%;background:${{scoreColor}};border-radius:4px;transition:width 0.5s;"></div>
                </div>
                <div style="font-size:0.65rem;color:${{scoreColor}};margin-top:2px;">${{evt.web_score}}/10</div>
            </div>
            <div style="flex:1;">
                <div style="font-size:0.65rem;color:#475569;margin-bottom:3px;">Besoin IA</div>
                <div style="background:#0f1f2e;border-radius:4px;height:6px;overflow:hidden;">
                    <div style="height:100%;width:${{(evt.need_score||0)*10}}%;background:${{needColor}};border-radius:4px;transition:width 0.5s;"></div>
                </div>
                <div style="font-size:0.65rem;color:${{needColor}};margin-top:2px;">${{evt.need_score}}/10</div>
            </div>
        </div>`;
    container.insertBefore(card, container.firstChild);
    while (container.children.length > 40) container.removeChild(container.lastChild);
}}

function clearCarteMarkers() {{
    if (_carteMap) {{
        Object.values(_carteMarkers).forEach(m => {{
            (m.pins||[]).forEach(p => {{ try {{ _carteMap.removeLayer(p); }} catch(e){{}} }});
            m.pins = [];
        }});
    }}
    _carteStats = {{searching:0,found:0,scraped:0,saved:0,email:0}};
    ['cs_searching','cs_found','cs_scraped','cs_saved','cs_email'].forEach(id => {{
        const el = document.getElementById(id); if(el) el.textContent='0';
    }});
    const c = document.getElementById('pme_cards');
    if(c) c.innerHTML = '<div data-placeholder style="color:#334155;text-align:center;padding:24px;font-size:0.8rem;">Effacé — en attente...</div>';
}}
"""

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

        # === PROSPECTION COMMERCIALE ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS prospects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                business_name TEXT DEFAULT '',
                email TEXT NOT NULL,
                phone TEXT DEFAULT '',
                coworking TEXT DEFAULT '',
                industry TEXT DEFAULT '',
                status TEXT DEFAULT 'new',
                notes TEXT DEFAULT '',
                email1_sent_at TEXT DEFAULT '',
                email2_sent_at TEXT DEFAULT '',
                email3_sent_at TEXT DEFAULT '',
                replied_at TEXT DEFAULT '',
                converted_at TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
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
            "ALTER TABLE clients ADD COLUMN trial_day3_sent INTEGER DEFAULT 0",
        ]
        for migration in migrations:
            try:
                await db.execute(migration)
                await db.commit()
            except Exception as _me:
                if "already exists" not in str(_me).lower() and "duplicate column" not in str(_me).lower():
                    logger.warning(f"Migration: {_me}")

        # Index pour les nouvelles tables
        await db.execute("CREATE INDEX IF NOT EXISTS idx_kb_client ON knowledge_base(client_id, is_active)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_campaigns_client ON campaigns(client_id, status)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_webhooks_client ON client_webhooks(client_id, is_active)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_chunks_client ON knowledge_chunks(client_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ca_client ON conversation_analytics(client_id, date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_escalation_client ON escalation_rules(client_id, is_active)")

        # === COMMANDES MARQUEURS GRANIT COM ===
        await db.execute("""
            CREATE TABLE IF NOT EXISTS marker_orders (
                id TEXT PRIMARY KEY,
                client_id TEXT DEFAULT 'granitecom',
                model TEXT,
                font TEXT,
                line1 TEXT,
                line2 TEXT,
                line3 TEXT,
                line4 TEXT,
                special_instructions TEXT,
                status TEXT DEFAULT 'pending',
                created_at TEXT NOT NULL
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS prospect_suggestions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                website TEXT DEFAULT '',
                city TEXT DEFAULT '',
                industry TEXT DEFAULT '',
                email TEXT DEFAULT '',
                email_quality TEXT DEFAULT 'none',
                phone TEXT DEFAULT '',
                web_score INTEGER DEFAULT 5,
                web_issues TEXT DEFAULT '[]',
                insights TEXT DEFAULT '',
                pain_points TEXT DEFAULT '[]',
                rating TEXT DEFAULT '',
                review_count TEXT DEFAULT '',
                generated_emails TEXT DEFAULT '{}',
                has_refonte INTEGER DEFAULT 0,
                status TEXT DEFAULT 'new',
                search_key TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS prospect_bank (
                id TEXT PRIMARY KEY,
                name TEXT, website TEXT, city TEXT, industry TEXT,
                email TEXT DEFAULT '', email_quality TEXT DEFAULT 'none', phone TEXT DEFAULT '',
                web_score INTEGER DEFAULT 5, web_issues TEXT DEFAULT '[]',
                insights TEXT DEFAULT '', pain_points TEXT DEFAULT '[]',
                rating TEXT DEFAULT '', review_count TEXT DEFAULT '',
                generated_emails TEXT DEFAULT '{}', has_refonte INTEGER DEFAULT 0,
                status TEXT DEFAULT 'ready',
                search_key TEXT DEFAULT '', created_at TEXT, updated_at TEXT
            )
        """)

        await db.commit()

        # Key-value settings table (persists across restarts)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        # Add new columns (each in its own try so one failure doesn't skip the rest)
        for _col_sql in [
            "ALTER TABLE prospect_suggestions ADD COLUMN email_sent_at TEXT DEFAULT ''",
            "ALTER TABLE prospect_suggestions ADD COLUMN followup_sent_at TEXT DEFAULT ''",
            "ALTER TABLE prospect_suggestions ADD COLUMN sms_sent_at TEXT DEFAULT ''",
            "ALTER TABLE prospect_suggestions ADD COLUMN brand_meta TEXT DEFAULT '{}'",
            "ALTER TABLE prospect_bank ADD COLUMN brand_meta TEXT DEFAULT '{}'",
            "ALTER TABLE prospect_bank ADD COLUMN email_sent_at TEXT DEFAULT ''",
        ]:
            try:
                await db.execute(_col_sql)
                await db.commit()
            except Exception:
                pass  # column already exists

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

async def _followup_loop():
    """Send follow-up emails 3 days after initial contact if no response."""
    await asyncio.sleep(300)  # 5 min after startup
    while True:
        try:
            three_days_ago = (datetime.now() - timedelta(days=3)).isoformat()
            async with aiosqlite.connect(DB_PATH) as db:
                db.row_factory = aiosqlite.Row
                cursor = await db.execute(
                    """SELECT * FROM prospect_suggestions
                       WHERE email_sent_at != '' AND email_sent_at < ?
                         AND (followup_sent_at IS NULL OR followup_sent_at = '')
                         AND status = 'contacted' AND email != ''
                       LIMIT 5""",
                    (three_days_ago,)
                )
                prospects = [dict(r) for r in await cursor.fetchall()]

            for p in prospects:
                try:
                    if not claude_client:
                        continue
                    prompt = f"""Génère un court email de relance (suivi) pour une PME qui n'a pas répondu à notre premier email il y a 3 jours.

PME: {p['name']} | {p['city']} | {p['industry']}

Règles STRICTES:
- Objet: court et naturel (ex: "Re: {p['name']}", "Toujours intéressé?")
- Corps: MAX 40 mots, ton humain, rappel discret qu'on avait écrit, demande si intéressé
- PAS de formules corporatives
- Signature: — L'équipe Novalis IA | novalisia.ca

Réponds UNIQUEMENT avec ce JSON:
{{"subject": "...", "body": "..."}}"""

                    loop = asyncio.get_event_loop()
                    response = await loop.run_in_executor(
                        None,
                        lambda: claude_client.messages.create(
                            model="claude-haiku-4-5-20251001",
                            max_tokens=300,
                            messages=[{"role": "user", "content": prompt}]
                        )
                    )
                    raw = response.content[0].text.strip()
                    if "```json" in raw:
                        raw = raw.split("```json")[1].split("```")[0].strip()
                    email_data = json.loads(raw)
                    subject = email_data.get("subject", f"Relance — {p['name']}")
                    body = email_data.get("body", "")

                    if body and (RESEND_API_KEY or (SMTP_HOST and SMTP_USER)):
                        html_body = "<div style='font-family:sans-serif;font-size:15px;line-height:1.7;color:#222;max-width:600px;'>" + body.replace("\n", "<br>") + "</div>"
                        await send_email(p['email'], subject, html_body)
                        now = datetime.now().isoformat()
                        async with aiosqlite.connect(DB_PATH) as db:
                            await db.execute(
                                "UPDATE prospect_suggestions SET followup_sent_at=?, updated_at=? WHERE id=?",
                                (now, now, p['id'])
                            )
                            await db.commit()
                        logging.info(f"Follow-up envoyé à {p['name']} ({p['email']})")
                except Exception as e:
                    logging.error(f"Follow-up error for {p.get('name','?')}: {e}")
        except Exception as e:
            logging.error(f"Followup loop error: {e}")
        await asyncio.sleep(6 * 3600)  # check every 6 hours


async def _auto_outreach_loop():
    """Autonomous engine: discover PMEs → send emails → follow-up. Runs forever."""
    await asyncio.sleep(90)  # wait for server startup
    while True:
        try:
            if not _auto_outreach["enabled"] or (not RESEND_API_KEY and (not SMTP_HOST or not SMTP_USER)):
                await asyncio.sleep(60)
                continue

            # Reset daily counter at midnight
            today = datetime.now().strftime("%Y-%m-%d")
            if _auto_outreach["last_reset"] != today:
                _auto_outreach["sent_today"] = 0
                _auto_outreach["last_reset"] = today

            if _auto_outreach["sent_today"] >= _auto_outreach["daily_limit"]:
                # Daily limit reached — wait until midnight
                now = datetime.now()
                tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=5, second=0)
                wait_secs = (tomorrow - now).total_seconds()
                logging.info(f"Auto-outreach: daily limit reached ({_auto_outreach['sent_today']}). Waiting until tomorrow.")
                await asyncio.sleep(max(wait_secs, 300))
                continue

            # Get uncontacted PMEs with emails, prioritize those with verified emails
            async with aiosqlite.connect(DB_PATH) as db:
                db.row_factory = aiosqlite.Row
                cursor = await db.execute("""
                    SELECT * FROM prospect_suggestions
                    WHERE status='new'
                      AND email != '' AND email IS NOT NULL
                      AND (email_sent_at IS NULL OR email_sent_at = '')
                      AND generated_emails IS NOT NULL AND generated_emails != '{}'
                    ORDER BY
                        CASE WHEN email_quality IN ('verified','direct') THEN 0 ELSE 1 END,
                        web_score ASC
                    LIMIT 3
                """)
                prospects = [dict(r) for r in await cursor.fetchall()]

            if not prospects:
                # Try to generate emails for prospects that have email but no generated_emails
                async with aiosqlite.connect(DB_PATH) as db:
                    db.row_factory = aiosqlite.Row
                    cursor = await db.execute("""
                        SELECT * FROM prospect_suggestions
                        WHERE status='new' AND email != '' AND email IS NOT NULL
                          AND (email_sent_at IS NULL OR email_sent_at = '')
                          AND (generated_emails IS NULL OR generated_emails = '{}')
                        LIMIT 5
                    """)
                    missing_emails = [dict(r) for r in await cursor.fetchall()]
                if missing_emails:
                    logging.info(f"Auto-outreach: génération emails pour {len(missing_emails)} prospects...")
                    for p in missing_emails:
                        try:
                            biz = {
                                "name": p["name"], "city": p["city"], "industry": p["industry"],
                                "website": p["website"], "email": p["email"],
                                "web_score": p.get("web_score", 5),
                                "web_issues": json.loads(p.get("web_issues") or "[]"),
                                "site_text": "", "research": {
                                    "rating": p.get("rating", ""),
                                    "review_count": p.get("review_count", ""),
                                    "snippets": p.get("insights", "")
                                }
                            }
                            emails = await _generate_prospect_emails_claude(biz)
                            if emails and emails.get("email1") and not emails.get("skip"):
                                now = datetime.now().isoformat()
                                async with aiosqlite.connect(DB_PATH) as db:
                                    await db.execute(
                                        "UPDATE prospect_suggestions SET generated_emails=?, updated_at=? WHERE id=?",
                                        (json.dumps(emails, ensure_ascii=False), now, p["id"])
                                    )
                                    await db.commit()
                                logging.info(f"Auto-outreach: emails générés pour {p['name']}")
                            else:
                                logging.warning(f"Auto-outreach: skip/vide pour {p['name']} — skip={emails.get('skip')}")
                        except Exception as e:
                            logging.error(f"Auto-outreach generate error: {e}")
                    await asyncio.sleep(10)
                    continue  # loop again to pick up newly generated emails
                # Still nothing — trigger PARALLEL discoveries to rebuild pipeline fast
                logging.info("Auto-outreach: pipeline vide → 4 découvertes parallèles lancées")
                tasks = [_auto_discover_batch(max_new=10, save_to_bank=True) for _ in range(4)]
                asyncio.create_task(asyncio.gather(*tasks, return_exceptions=True))
                asyncio.create_task(_run_refresh_job())
                await asyncio.sleep(30)
                continue

            for p in prospects:
                if _auto_outreach["sent_today"] >= _auto_outreach["daily_limit"]:
                    break
                if not _auto_outreach["enabled"]:
                    break
                try:
                    emails = json.loads(p.get("generated_emails") or "{}")
                    email1 = emails.get("email1", {})
                    if not email1.get("subject") or not email1.get("body"):
                        continue

                    # Add CASL-compliant unsubscribe link + preview personnalisé
                    unsubscribe_url = f"https://novalisia.ca/unsubscribe?id={p['id']}"
                    _slug = _slugify(p.get("name", "entreprise"))
                    preview_url = f"https://novalisia.ca/preview/{_slug}/{p['id']}"
                    body_text = email1["body"].replace("{PROSPECT_ID}", f"{_slug}/{p['id']}")
                    html_body = _build_prospect_email_html(body_text, preview_url, unsubscribe_url, p.get("name", ""))

                    # Triple vérification anti-doublon
                    email_addr = p["email"].strip().lower()
                    if email_addr in _sent_emails_session:
                        logging.warning(f"Auto-outreach: doublon session ignoré → {email_addr}")
                        continue
                    async with aiosqlite.connect(DB_PATH) as db:
                        chk = await db.execute(
                            "SELECT COUNT(*) FROM prospect_suggestions WHERE LOWER(email)=? AND email_sent_at != '' AND email_sent_at IS NOT NULL",
                            (email_addr,)
                        )
                        already_sent = (await chk.fetchone())[0]
                    if already_sent:
                        logging.warning(f"Auto-outreach: déjà contacté en DB ignoré → {email_addr}")
                        async with aiosqlite.connect(DB_PATH) as db:
                            await db.execute("UPDATE prospect_suggestions SET status='contacted', updated_at=? WHERE id=?", (datetime.now().isoformat(), p["id"]))
                            await db.commit()
                        continue

                    await send_email(p["email"], email1["subject"], html_body)
                    _sent_emails_session.add(email_addr)

                    now = datetime.now().isoformat()
                    async with aiosqlite.connect(DB_PATH) as db:
                        await db.execute(
                            "UPDATE prospect_suggestions SET email_sent_at=?, status='contacted', updated_at=? WHERE id=? AND (email_sent_at IS NULL OR email_sent_at='')",
                            (now, now, p["id"])
                        )
                        await db.commit()

                    _auto_outreach["sent_today"] += 1
                    _auto_outreach["total_sent"] += 1
                    _auto_outreach["last_sent_at"] = now
                    _auto_outreach["last_prospect"] = f"{p['name']} ({p['city']})"
                    logging.info(f"Auto-outreach ✓ {p['name']} <{p['email']}> — {_auto_outreach['sent_today']}/{_auto_outreach['daily_limit']} today")

                    await asyncio.sleep(45)  # 45s between sends (anti-spam)

                except Exception as e:
                    logging.error(f"Auto-outreach send error for {p.get('name', '?')}: {e}")

        except Exception as e:
            logging.error(f"Auto-outreach loop error: {e}")

        # Wait interval_minutes before next batch
        # If bank is getting low, trigger background refill proactively
        try:
            async with aiosqlite.connect(DB_PATH) as db:
                c = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE status='new' AND email != '' AND (email_sent_at IS NULL OR email_sent_at='')")
                remaining = (await c.fetchone())[0]
                c2 = await db.execute("SELECT COUNT(*) FROM prospect_bank WHERE status='ready'")
                bank_remaining = (await c2.fetchone())[0]
            if remaining < 5 or bank_remaining < 10:
                logging.info(f"Auto-outreach: pipeline bas ({remaining} prospects, {bank_remaining} banque) → refill proactif")
                tasks = [_auto_discover_batch(max_new=10, save_to_bank=True) for _ in range(3)]
                asyncio.create_task(asyncio.gather(*tasks, return_exceptions=True))
                if bank_remaining > 0:
                    asyncio.create_task(_run_refresh_job())
        except Exception:
            pass
        await asyncio.sleep(_auto_outreach["interval_minutes"] * 60)


@app.on_event("startup")
async def startup():
    # Always log admin credentials clearly so they can be recovered from Railway logs
    logger.warning(f"🔑 ADMIN LOGIN → utilisateur: '{ADMIN_USER}'  mot de passe: '{ADMIN_PASS}'")
    if not os.getenv("ADMIN_PASS"):
        logger.warning(f"⚠️  ADMIN_PASS non défini — fixez-le dans Railway Variables pour qu'il ne change plus.")
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
    # Restore auto-outreach state from DB (survives restarts)
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT value FROM app_settings WHERE key='auto_outreach_enabled'")
        row = await cursor.fetchone()
        if row and row[0] == "1":
            _auto_outreach["enabled"] = True
            logger.info("Auto-outreach: état restauré → EN MARCHE")
        elif row is None and (RESEND_API_KEY or (SMTP_HOST and SMTP_USER)):
            # First boot with email configured — auto-enable
            _auto_outreach["enabled"] = True
            await db.execute("INSERT OR REPLACE INTO app_settings (key,value) VALUES ('auto_outreach_enabled','1')")
            await db.commit()
            logger.info("Auto-outreach: activé automatiquement (email configuré)")
        # Charger tous les emails déjà contactés pour éviter les doublons
        c = await db.execute("SELECT LOWER(email) FROM prospect_suggestions WHERE email_sent_at != '' AND email_sent_at IS NOT NULL AND email != ''")
        for (em,) in await c.fetchall():
            _sent_emails_session.add(em)
        logger.info(f"Anti-doublon: {len(_sent_emails_session)} emails déjà contactés chargés")
    await seed_service_catalog()
    asyncio.create_task(appointment_reminder_task())
    asyncio.create_task(weekly_report_task())
    asyncio.create_task(trial_monitor_task())
    asyncio.create_task(_bank_builder_loop())
    asyncio.create_task(_followup_loop())
    asyncio.create_task(_auto_outreach_loop())
    asyncio.create_task(_sms_outreach_loop())
    asyncio.create_task(_fix_missing_emails_on_startup())
    asyncio.create_task(_auto_suggestions_loop())
    asyncio.create_task(_fast_bank_fill_on_startup())
    asyncio.create_task(_cleanup_duplicate_prospects())
    asyncio.create_task(_outreach_watchdog())
    logger.info(f"Novalis V{VERSION} démarré — Agence IA")


async def _fix_missing_emails_on_startup():
    """Au démarrage: génère les emails template pour tous les prospects bloqués (generated_emails vide)."""
    await asyncio.sleep(15)
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT * FROM prospect_suggestions
                WHERE status='new' AND email != '' AND email IS NOT NULL
                  AND (email_sent_at IS NULL OR email_sent_at = '')
                  AND (generated_emails IS NULL OR generated_emails = '{}')
                LIMIT 30
            """)
            stuck = [dict(r) for r in await cursor.fetchall()]
        if not stuck:
            return
        logger.info(f"Startup fix: {len(stuck)} prospects bloqués sans email — génération template...")
        fixed = 0
        for p in stuck:
            try:
                biz = {
                    "name": p["name"], "city": p["city"], "industry": p["industry"],
                    "website": p.get("website", ""), "email": p["email"],
                    "web_score": p.get("web_score", 5),
                    "web_issues": json.loads(p.get("web_issues") or "[]"),
                    "site_text": "", "research": {
                        "rating": p.get("rating", ""),
                        "review_count": p.get("review_count", ""),
                        "snippets": p.get("insights", "")
                    }
                }
                emails = await _generate_prospect_emails_claude(biz)
                if emails and emails.get("email1") and not emails.get("skip"):
                    now = datetime.now().isoformat()
                    async with aiosqlite.connect(DB_PATH) as db:
                        await db.execute(
                            "UPDATE prospect_suggestions SET generated_emails=?, updated_at=? WHERE id=?",
                            (json.dumps(emails, ensure_ascii=False), now, p["id"])
                        )
                        await db.commit()
                    fixed += 1
                    await asyncio.sleep(1)
            except Exception as e:
                logger.error(f"Startup fix error for {p.get('name')}: {e}")
        logger.info(f"Startup fix: {fixed}/{len(stuck)} prospects corrigés")
    except Exception as e:
        logger.error(f"Startup fix error: {e}")


async def _outreach_watchdog():
    """Watchdog: si aucun email envoyé depuis 2h et outreach actif → rebuild complet du pipeline."""
    await asyncio.sleep(120)
    while True:
        try:
            await asyncio.sleep(30 * 60)  # vérifie toutes les 30 minutes
            if not _auto_outreach["enabled"]:
                continue
            last_sent = _auto_outreach.get("last_sent_at", "")
            if not last_sent:
                idle_hours = 3
            else:
                try:
                    last_dt = datetime.fromisoformat(last_sent)
                    idle_hours = (datetime.now() - last_dt).total_seconds() / 3600
                except Exception:
                    idle_hours = 3

            if idle_hours >= 2:
                logger.warning(f"Watchdog: aucun email depuis {idle_hours:.1f}h → rebuild pipeline forcé")
                tasks = [_auto_discover_batch(max_new=10, save_to_bank=True) for _ in range(6)]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                added = sum(r for r in results if isinstance(r, int))
                logger.info(f"Watchdog: +{added} PMEs ajoutées")
                asyncio.create_task(_run_refresh_job())
        except Exception as e:
            logger.error(f"Outreach watchdog error: {e}")


async def _sms_outreach_loop():
    """Envoie des SMS de prospection aux PMEs avec numéro de téléphone (via Twilio)."""
    await asyncio.sleep(180)  # 3 min après démarrage
    sms_sent_today = 0
    last_reset = datetime.now().strftime("%Y-%m-%d")
    SMS_DAILY_LIMIT = 20

    while True:
        try:
            today = datetime.now().strftime("%Y-%m-%d")
            if last_reset != today:
                sms_sent_today = 0
                last_reset = today

            if not twilio_client or not TWILIO_PHONE:
                await asyncio.sleep(3600)
                continue
            if sms_sent_today >= SMS_DAILY_LIMIT:
                await asyncio.sleep(3600)
                continue

            async with aiosqlite.connect(DB_PATH) as db:
                db.row_factory = aiosqlite.Row
                cursor = await db.execute("""
                    SELECT * FROM prospect_suggestions
                    WHERE status='new'
                      AND phone != '' AND phone IS NOT NULL
                      AND (sms_sent_at IS NULL OR sms_sent_at = '')
                      AND (email_sent_at IS NULL OR email_sent_at = '')
                    ORDER BY web_score ASC
                    LIMIT 3
                """)
                prospects = [dict(r) for r in await cursor.fetchall()]

            for p in prospects:
                if sms_sent_today >= SMS_DAILY_LIMIT:
                    break
                try:
                    name = p.get("name", "votre entreprise")
                    city = p.get("city", "Québec")
                    industry = p.get("industry", "votre secteur")
                    phone = p.get("phone", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
                    if not phone.startswith("+"):
                        phone = "+1" + phone.lstrip("1")
                    sms_body = (
                        f"Bonjour! C'est l'équipe Novalis IA. "
                        f"J'aide les {industry} au Québec à automatiser leur service client et gagner 8-10h/semaine. "
                        f"Premier mois gratuit. Ça vous intéresse? novalisia.ca"
                    )
                    await asyncio.to_thread(
                        twilio_client.messages.create,
                        body=sms_body, from_=TWILIO_PHONE, to=phone
                    )
                    now = datetime.now().isoformat()
                    async with aiosqlite.connect(DB_PATH) as db:
                        await db.execute(
                            "UPDATE prospect_suggestions SET sms_sent_at=?, updated_at=? WHERE id=?",
                            (now, now, p["id"])
                        )
                        await db.commit()
                    sms_sent_today += 1
                    logger.info(f"SMS ✓ {name} ({phone}) — {sms_sent_today}/{SMS_DAILY_LIMIT}")
                    await asyncio.sleep(60)
                except Exception as e:
                    logger.error(f"SMS outreach error {p.get('name')}: {e}")

        except Exception as e:
            logger.error(f"SMS outreach loop error: {e}")

        await asyncio.sleep(2 * 3600)  # toutes les 2 heures


async def _cleanup_duplicate_prospects():
    """Au démarrage: supprime les entrées en double (même email) causées par des insertions parallèles passées."""
    await asyncio.sleep(10)
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            for table in ("prospect_bank", "prospect_suggestions"):
                # Keep only the oldest row per email, delete all others
                await db.execute(f"""
                    DELETE FROM {table}
                    WHERE email != '' AND email IS NOT NULL
                      AND id NOT IN (
                          SELECT id FROM {table}
                          WHERE email != '' AND email IS NOT NULL
                          GROUP BY LOWER(email)
                          HAVING id = MIN(id)
                      )
                """)
            await db.commit()
        logger.info("Cleanup: doublons d'email supprimés des tables prospects")
    except Exception as e:
        logger.error(f"Cleanup duplicate error: {e}")


async def _fast_bank_fill_on_startup():
    """Au démarrage: si la banque est vide, lance 8 découvertes en parallèle immédiatement."""
    await asyncio.sleep(5)
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute("SELECT COUNT(*) FROM prospect_bank WHERE status='ready'")
            count = (await cursor.fetchone())[0]
        if count < 20:
            logger.info(f"Startup: banque critique ({count}) → 8 découvertes parallèles lancées")
            tasks = [_auto_discover_batch(max_new=10, save_to_bank=True) for _ in range(8)]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            added = sum(r for r in results if isinstance(r, int))
            logger.info(f"Startup fast fill: +{added} PMEs ajoutées à la banque")
    except Exception as e:
        logger.error(f"Fast bank fill error: {e}")


async def _auto_suggestions_loop():
    """Remplit automatiquement les suggestions depuis la banque — aucun clic requis."""
    await asyncio.sleep(30)
    while True:
        try:
            async with aiosqlite.connect(DB_PATH) as db:
                c1 = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE status='new' AND email != '' AND (email_sent_at IS NULL OR email_sent_at='')")
                suggestions_count = (await c1.fetchone())[0]
                c2 = await db.execute("SELECT COUNT(*) FROM prospect_bank WHERE status='ready'")
                bank_count = (await c2.fetchone())[0]

            if suggestions_count < 15 and bank_count > 0:
                logger.info(f"Auto-suggestions: {suggestions_count} prêts, {bank_count} en banque → remplissage")
                await _run_refresh_job()

            elif suggestions_count < 5 and bank_count == 0:
                # Pipeline complètement vide → 5 découvertes parallèles
                logger.info("Auto-suggestions: pipeline vide → 5 découvertes parallèles")
                tasks = [_auto_discover_batch(max_new=10, save_to_bank=True) for _ in range(5)]
                asyncio.create_task(asyncio.gather(*tasks, return_exceptions=True))

            elif suggestions_count < 8 and bank_count < 5:
                # Bas partout → 3 découvertes parallèles
                tasks = [_auto_discover_batch(max_new=10, save_to_bank=True) for _ in range(3)]
                asyncio.create_task(asyncio.gather(*tasks, return_exceptions=True))

        except Exception as e:
            logger.error(f"Auto-suggestions loop error: {e}")

        await asyncio.sleep(60)  # vérifie toutes les 60 secondes


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


@app.post("/api/admin-recover")
async def admin_recover(request: Request):
    """Reset admin password using Anthropic API key as proof of ownership."""
    global ADMIN_PASS
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(400, "JSON invalide")
    provided_key = data.get("api_key", "").strip()
    new_pass = data.get("new_pass", "").strip()
    if not provided_key or not new_pass:
        raise HTTPException(400, "api_key et new_pass requis")
    if len(new_pass) < 6:
        raise HTTPException(400, "new_pass doit faire au moins 6 caractères")
    if not ANTHROPIC_API_KEY or not secrets.compare_digest(provided_key.encode(), ANTHROPIC_API_KEY.encode()):
        raise HTTPException(403, "Clé invalide")
    ADMIN_PASS = new_pass
    logger.warning(f"🔑 Mot de passe admin réinitialisé via /api/admin-recover → '{ADMIN_PASS}'")
    return {"ok": True, "message": f"Mot de passe mis à jour. Connectez-vous avec: {ADMIN_USER} / {new_pass}"}

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
    """Envoie via Resend (prioritaire) ou SMTP fallback. Lève une exception si l'envoi échoue."""
    last_error = None

    # === RESEND (prioritaire) ===
    if RESEND_API_KEY:
        def _send_resend():
            import urllib.request, urllib.error
            reply_to = os.getenv("REPLY_TO_EMAIL", "novalisproia@gmail.com")
            payload = json.dumps({
                "from": f"{FROM_NAME} <{FROM_EMAIL}>",
                "to": [to],
                "reply_to": reply_to,
                "subject": subject,
                "html": body,
                "tags": [{"name": "source", "value": "novalis-outreach"}],
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=payload,
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                    "User-Agent": "novalis-mailer/1.0",
                    "Accept": "application/json",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    result = json.loads(resp.read())
                logger.info(f"Resend ✓ {to} — id:{result.get('id','?')}")
            except urllib.error.HTTPError as e:
                body_err = e.read().decode("utf-8", errors="ignore")
                raise RuntimeError(f"Resend HTTP {e.code}: {body_err}") from e
        try:
            await asyncio.to_thread(_send_resend)
            return  # succès Resend
        except Exception as e:
            last_error = e
            logger.error(f"Resend erreur: {e}")
            if not SMTP_HOST or not SMTP_USER:
                raise RuntimeError(f"Resend échec et SMTP non configuré: {e}") from e

    # === SMTP fallback ===
    if not SMTP_HOST or not SMTP_USER:
        raise RuntimeError("Aucune méthode d'envoi configurée (ni Resend ni SMTP)")
    def _send_smtp():
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to
        msg.attach(MIMEText(body, "html", "utf-8"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM, [to], msg.as_string())
        logger.info(f"SMTP ✓ {to}")
    await asyncio.to_thread(_send_smtp)  # laisse l'exception remonter

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
        h_name = html_module.escape(c['owner_name'])
        # Day 3 mid-trial tips email (fires when 3-4 days remain = day 3-4 of trial)
        if 3 <= days_left <= 4 and not c.get("trial_day3_sent"):
            asyncio.create_task(send_email(
                to=c["owner_email"],
                subject=f"3 façons de tirer le maximum de votre essai Novalis IA",
                body=f"""<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#090C0F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <div style="border-bottom:1px solid rgba(168,104,68,0.3);padding-bottom:24px;margin-bottom:32px;">
    <p style="margin:0;font-size:0.7rem;letter-spacing:0.2em;text-transform:uppercase;color:#A86844;">Novalis IA</p>
  </div>
  <h1 style="color:#EDE8DF;font-size:1.7rem;font-weight:400;margin:0 0 8px;font-style:italic;">Bonjour {h_name},</h1>
  <p style="color:#4A5260;font-size:0.95rem;line-height:1.7;margin:0 0 28px;">
    Vous êtes à mi-chemin de votre essai gratuit. Voici les 3 choses qui font la différence entre un assistant IA qui génère des résultats et un qui reste sous-utilisé.
  </p>
  <div style="display:flex;flex-direction:column;gap:16px;margin-bottom:32px;">
    <div style="border:0.5px solid rgba(168,104,68,0.25);padding:20px;">
      <p style="margin:0 0 6px;font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:#A86844;">01 — Base de connaissances</p>
      <p style="margin:0;color:#EDE8DF;font-size:0.9rem;line-height:1.6;">Ajoutez vos services, vos prix et votre FAQ dans le portail. Plus votre assistant en sait sur vous, plus ses réponses sont précises.</p>
    </div>
    <div style="border:0.5px solid rgba(168,104,68,0.25);padding:20px;">
      <p style="margin:0 0 6px;font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:#A86844;">02 — Intégration site ou téléphone</p>
      <p style="margin:0;color:#EDE8DF;font-size:0.9rem;line-height:1.6;">L'assistant est plus efficace là où vos clients vous contactent déjà. Partagez votre numéro Novalis avec quelques clients et observez les premières interactions.</p>
    </div>
    <div style="border:0.5px solid rgba(168,104,68,0.25);padding:20px;">
      <p style="margin:0 0 6px;font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:#A86844;">03 — Rapport de conversations</p>
      <p style="margin:0;color:#EDE8DF;font-size:0.9rem;line-height:1.6;">Dans le portail, l'onglet <em>Conversations</em> vous montre exactement ce que vos clients demandent. Ces données valent souvent autant que l'assistant lui-même.</p>
    </div>
  </div>
  <div style="text-align:center;margin:32px 0;">
    <a href="{portal_url}"
       style="display:inline-block;background:#A86844;color:#EDE8DF;text-decoration:none;
              padding:14px 36px;font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;
              border:1px solid #C4895A;">
      Accéder à mon portail →
    </a>
  </div>
  <p style="color:#4A5260;font-size:0.82rem;line-height:1.6;">
    Il vous reste encore <strong style="color:#EDE8DF;">{days_left} jours</strong> d'essai gratuit.
    Si vous avez des questions, répondez directement à cet email — l'équipe Novalis vous répond personnellement.
  </p>
  <div style="border-top:0.5px solid rgba(237,232,223,0.08);margin-top:40px;padding-top:20px;">
    <p style="color:#4A5260;font-size:0.72rem;margin:0;">Novalis IA · Québec · <a href="{portal_url}" style="color:#A86844;">Accès portail</a></p>
  </div>
</div>
</body></html>"""
            ))
            async with aiosqlite.connect(DB_PATH) as db2:
                await db2.execute("UPDATE clients SET trial_day3_sent = 1 WHERE id = ?", (c["id"],))
                await db2.commit()
        if days_left <= 2 and not c.get("trial_warning_sent"):
            asyncio.create_task(send_email(
                to=c["owner_email"],
                subject=f"Il reste 48h — continuez sans interruption",
                body=f"""<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#090C0F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
  <div style="border-bottom:1px solid rgba(168,104,68,0.3);padding-bottom:24px;margin-bottom:32px;">
    <p style="margin:0;font-size:0.7rem;letter-spacing:0.2em;text-transform:uppercase;color:#A86844;">Novalis IA</p>
  </div>
  <h1 style="color:#EDE8DF;font-size:1.7rem;font-weight:400;margin:0 0 8px;font-style:italic;">Bonjour {h_name},</h1>
  <p style="color:#4A5260;font-size:0.95rem;line-height:1.7;margin:0 0 24px;">
    Votre essai gratuit se termine dans <strong style="color:#EDE8DF;">48 heures</strong>.
    Après ça, votre assistant IA sera mis en pause et vos clients ne recevront plus de réponse automatique.
  </p>
  <div style="background:rgba(168,104,68,0.06);border:0.5px solid rgba(168,104,68,0.3);padding:24px;margin-bottom:28px;">
    <p style="margin:0 0 12px;font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:#A86844;">Plan Starter — 497$/mois</p>
    <p style="margin:0 0 6px;color:#EDE8DF;font-size:0.9rem;">✓ 1 assistant IA configuré pour votre business</p>
    <p style="margin:0 0 6px;color:#EDE8DF;font-size:0.9rem;">✓ Jusqu'à 500 interactions/mois</p>
    <p style="margin:0 0 6px;color:#EDE8DF;font-size:0.9rem;">✓ Intégration site ou téléphone</p>
    <p style="margin:0;color:#EDE8DF;font-size:0.9rem;">✓ Tableau de bord + rapport mensuel</p>
  </div>
  <div style="text-align:center;margin:28px 0;">
    <a href="{pricing_url}"
       style="display:inline-block;background:#A86844;color:#EDE8DF;text-decoration:none;
              padding:14px 40px;font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;
              border:1px solid #C4895A;">
      Choisir mon plan →
    </a>
    <p style="margin:12px 0 0;color:#4A5260;font-size:0.75rem;">Aucun engagement · Annulable en tout temps</p>
  </div>
  <p style="color:#4A5260;font-size:0.82rem;line-height:1.6;">
    Une question avant de décider ? Répondez à cet email ou écrivez-nous sur
    <a href="https://wa.me/18193422290" style="color:#A86844;">WhatsApp</a> — notre équipe répond en moins de 2h.
  </p>
  <div style="border-top:0.5px solid rgba(237,232,223,0.08);margin-top:40px;padding-top:20px;">
    <p style="color:#4A5260;font-size:0.72rem;margin:0;">Novalis IA · Québec · <a href="{portal_url}" style="color:#A86844;">Accès portail</a></p>
  </div>
</div>
</body></html>"""
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
        resp = await asyncio.to_thread(
            claude_client.messages.create,
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
    en_single = {"hello","hi","help","please","thank","thanks","what","when","where",
                 "how","can","yes","no","sorry","good","morning","evening","okay","ok"}
    en_phrases = ["i need","i want","do you","good morning","good evening","excuse me",
                  "can you","thank you","how can","how do","would you","could you"]
    text_lower = text.lower()
    words = set(re.sub(r"[^\w\s]", " ", text_lower).split())
    score = sum(1 for w in en_single if w in words)
    score += sum(2 for p in en_phrases if p in text_lower)
    return "en" if score >= 3 else "fr"


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
        resp = await asyncio.to_thread(
            claude_client.messages.create,
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
            "SELECT title, content, kb_type FROM knowledge_base WHERE client_id = ? AND is_active = 1 ORDER BY kb_type, created_at LIMIT 8",
            (client_id,)
        )
        rows = await cursor.fetchall()
    if not rows:
        return ""
    sections = []
    for title, content, kb_type in rows:
        sections.append(f"[{title}]\n{content[:2000]}")
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
        lang_rule = "The customer is writing in English. Respond naturally in English while keeping your helpful, warm persona. Use Canadian English. Keep a relaxed yet professional tone — no slang."
        lang_preamble = "LANGUAGE RULE: " + lang_rule
    else:
        lang_preamble = "Réponds TOUJOURS en français québécois. Ton décontracté mais professionnel — évite les argots (yo, tsé, genre, faque, bin). Utilise le vouvoiement. Chaleureux et clair."

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
            response = await asyncio.to_thread(
                claude_client.messages.create,
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
@limiter.limit("120/minute")
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
@limiter.limit("120/minute")
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

    if client["max_messages_month"] > 0 and client["messages_used_month"] >= client["max_messages_month"]:
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
@limiter.limit("120/minute")
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
        expected = "sha1=" + hmac.new(FB_APP_SECRET.encode(), raw_body, hashlib.sha1).hexdigest()
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
                    _fb_token = client["fb_page_token"]
                    _fb_payload = {"recipient": {"id": sender_id}, "message": {"text": ai_response}}
                    await asyncio.to_thread(
                        http_requests.post,
                        "https://graph.facebook.com/v18.0/me/messages",
                        params={"access_token": _fb_token},
                        json=_fb_payload,
                        timeout=8
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
# PROSPECTION COMMERCIALE
# ============================================================
PROSPECT_STATUSES = ["new", "email1_sent", "email2_sent", "email3_sent", "replied", "meeting", "converted", "not_interested"]

@app.get("/api/v1/prospects")
async def list_prospects(username: str = Depends(verify_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM prospects ORDER BY created_at DESC")
        return [dict(r) for r in await cursor.fetchall()]

@app.post("/api/v1/prospects")
async def create_prospect(request: Request, username: str = Depends(verify_admin)):
    data = await request.json()
    if not data.get("email") or not data.get("name"):
        raise HTTPException(status_code=400, detail="name et email requis")
    now = datetime.now().isoformat()
    pid = generate_id("prospect")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO prospects (id, name, business_name, email, phone, coworking, industry,
               status, notes, email1_sent_at, email2_sent_at, email3_sent_at,
               replied_at, converted_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, '', '', '', '', ?, ?)""",
            (pid, data["name"], data.get("business_name",""), data["email"],
             data.get("phone",""), data.get("coworking",""), data.get("industry",""),
             data.get("notes",""), now, now)
        )
        await db.commit()
    return {"id": pid, "status": "created"}

@app.put("/api/v1/prospects/{pid}")
async def update_prospect(pid: str, request: Request, username: str = Depends(verify_admin)):
    data = await request.json()
    allowed = ["name","business_name","email","phone","coworking","industry","status","notes",
               "email1_sent_at","email2_sent_at","email3_sent_at","replied_at","converted_at"]
    updates, values = [], []
    for f in allowed:
        if f in data:
            updates.append(f"{f} = ?")
            values.append(data[f])
    if not updates:
        raise HTTPException(status_code=400, detail="Aucun champ valide")
    values += [datetime.now().isoformat(), pid]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE prospects SET {', '.join(updates)}, updated_at = ? WHERE id = ?", values)
        await db.commit()
    return {"status": "updated"}

@app.delete("/api/v1/prospects/{pid}")
async def delete_prospect(pid: str, username: str = Depends(verify_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM prospects WHERE id = ?", (pid,))
        await db.commit()
    return {"status": "deleted"}

@app.get("/api/v1/prospects/export")
async def export_prospects(username: str = Depends(verify_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM prospects ORDER BY created_at DESC")
        rows = [dict(r) for r in await cursor.fetchall()]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Nom","Entreprise","Courriel","Téléphone","Co-working","Secteur","Statut","Notes","Email1","Email2","Email3","Répondu","Converti","Créé"])
    for r in rows:
        writer.writerow([r["name"],r["business_name"],r["email"],r["phone"],r["coworking"],
                         r["industry"],r["status"],r["notes"],r["email1_sent_at"][:10] if r["email1_sent_at"] else "",
                         r["email2_sent_at"][:10] if r["email2_sent_at"] else "",
                         r["email3_sent_at"][:10] if r["email3_sent_at"] else "",
                         r["replied_at"][:10] if r["replied_at"] else "",
                         r["converted_at"][:10] if r["converted_at"] else "",
                         r["created_at"][:10]])
    return Response(content=output.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=prospects_novalis.csv"})

@app.post("/api/v1/prospects/{pid}/send-email")
async def send_prospect_email(pid: str, request: Request, username: str = Depends(verify_admin)):
    """Envoie un email de prospection via SMTP Novalis."""
    data = await request.json()
    email_num = int(data.get("email_num", 1))
    custom_body = data.get("body", "").strip()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM prospects WHERE id = ?", (pid,))
        p = await cursor.fetchone()
    if not p:
        raise HTTPException(status_code=404, detail="Prospect introuvable")
    p = dict(p)

    name = p["name"].split()[0] if p["name"] else p["name"]
    biz = p["business_name"] or p["name"]
    industry = (p.get("industry") or "").lower()

    def _sector_copy(n: int) -> tuple[str, str]:
        """Returns (subject, body) based on industry and email number."""
        if "salon" in industry or "spa" in industry:
            if n == 1:
                hook = f"Est-ce que vos clientes réservent encore par téléphone chez {biz} ?"
                body = f"""Bonjour {name},

{hook}

Chaque appel manqué, c'est un rendez-vous perdu — et souvent une cliente qui appelle ailleurs. Notre agent IA décroche à votre place 24h/24, propose les créneaux disponibles et confirme le RDV automatiquement. En bonus, il envoie un rappel la veille pour réduire les no-shows de 40 %.

Je propose un essai gratuit de 7 jours — aucune carte de crédit, aucun engagement. On configure tout en 48h.

Ça vous intéresserait qu'on en parle 15 minutes cette semaine ?

Équipe Novalis
novalisia.ca | +1 819 342-2290

---
Pour vous désabonner, répondez "Non merci"."""
                return hook, body
            elif n == 2:
                hook = f"Suite à mon dernier message — une question rapide pour {biz}"
                body = f"""Bonjour {name},

Combien d'appels manquez-vous par semaine quand vous êtes avec une cliente ? Même 2 ou 3 appels manqués par jour, c'est 400 à 600 $/semaine en rendez-vous perdus.

Notre agent vocal IA règle exactement ce problème — il décroche chaque appel, prend le RDV et envoie un rappel automatique. Aucune ligne supplémentaire, aucun changement de numéro.

Si vous avez 15 minutes cette semaine, je peux vous faire une démo en direct.

Équipe Novalis
novalisia.ca | +1 819 342-2290

---
Pour vous désabonner, répondez "Non merci"."""
                return hook, body
            else:
                return "Dernier message — Novalis IA", f"""Bonjour {name},

Je ne veux pas être intrusif — c'est mon dernier message.

Si les appels manqués et la gestion des RDV ne sont pas un enjeu prioritaire pour {biz} en ce moment, je comprends tout à fait.

Si jamais la situation change, l'essai gratuit de 7 jours reste ouvert sur novalisia.ca.

Bonne continuation,
Équipe Novalis
novalisia.ca"""

        elif "immob" in industry:
            if n == 1:
                hook = f"Combien de leads vous passent entre les doigts chaque semaine chez {biz} ?"
                body = f"""Bonjour {name},

En immobilier, la vitesse de réponse fait la différence. Un lead qui attend plus de 5 minutes a 10x moins de chances de convertir.

Notre agent IA qualifie vos leads entrants en temps réel — acheteur ou vendeur, budget, secteur recherché — et transfère les dossiers chauds à votre équipe avec un résumé complet. Les suivis automatiques s'occupent du reste.

Je propose un essai gratuit de 7 jours — aucune carte de crédit, aucun engagement. On configure tout en 48h.

Ça vous intéresserait qu'on en parle 15 minutes cette semaine ?

Équipe Novalis
novalisia.ca | +1 819 342-2290

---
Pour vous désabonner, répondez "Non merci"."""
                return hook, body
            elif n == 2:
                hook = f"Re: Leads entrants — une donnée pour {biz}"
                body = f"""Bonjour {name},

74 % des acheteurs immobiliers choisissent le premier courtier qui leur répond. Avec notre agent IA, votre équipe est "disponible" même à 22h un dimanche.

Je peux vous montrer exactement comment ça fonctionnerait pour votre marché en Estrie — 15 minutes suffisent.

Équipe Novalis
novalisia.ca | +1 819 342-2290

---
Pour vous désabonner, répondez "Non merci"."""
                return hook, body
            else:
                return "Dernier message — Novalis IA", f"""Bonjour {name},

C'est mon dernier message. Si l'automatisation des leads n'est pas une priorité pour {biz} en ce moment, je comprends tout à fait.

L'essai gratuit de 7 jours reste ouvert sur novalisia.ca si jamais l'intérêt revient.

Bonne continuation,
Équipe Novalis
novalisia.ca"""

        elif "marketing" in industry or "design" in industry:
            if n == 1:
                hook = f"Vos clients PME ont besoin d'IA — et {biz} pourrait être leur point d'entrée"
                body = f"""Bonjour {name},

Chez Novalis IA, on développe des agents IA pour PME québécoises (service client, prise de RDV, qualification de prospects).

On cherche des agences partenaires en Estrie pour offrir nos solutions à leurs clients PME sous forme de service géré — revenu récurrent sans coût de développement de votre côté.

Ça ressemble à quelque chose qui pourrait intéresser {biz} et vos clients ?

Équipe Novalis
novalisia.ca | +1 819 342-2290

---
Pour vous désabonner, répondez "Non merci"."""
                return hook, body
            elif n == 2:
                hook = f"Re: Partenariat revendeur — Novalis IA × {biz}"
                body = f"""Bonjour {name},

Suite à mon dernier message — pour être concret :

Le modèle est simple : vous vendez nos agents IA à vos clients PME à votre propre tarif, on s'occupe de la configuration et du support. Vous gardez la marge, vos clients ont un service IA clé en main.

Plusieurs agences québécoises nous ont rejoints pour ajouter cette corde à leur arc. Ça vous intéresse d'en parler 15 minutes ?

Équipe Novalis
novalisia.ca | +1 819 342-2290

---
Pour vous désabonner, répondez "Non merci"."""
                return hook, body
            else:
                return "Dernier message — Novalis IA", f"""Bonjour {name},

Je ne veux pas insister. Si un partenariat revendeur IA ne cadre pas avec la direction de {biz} en ce moment, c'est parfaitement correct.

Si la situation évolue, on est sur novalisia.ca — bonne continuation !

Équipe Novalis
novalisia.ca"""

        elif "clinique" in industry or "santé" in industry or "sante" in industry:
            if n == 1:
                hook = f"Gérer la prise de RDV sur plusieurs cliniques sans engager de personnel supplémentaire"
                body = f"""Bonjour {name},

Novalis IA déploie des agents IA spécialisés en prise de rendez-vous pour cliniques privées — conformes à la Loi 25, données hébergées au Canada.

Votre agent répond aux appels 24h/24, propose les créneaux disponibles selon chaque clinique et praticien, confirme le RDV et envoie un rappel automatique. Aucun appel manqué, aucune liste d'attente téléphonique.

Je propose un essai gratuit de 7 jours — aucune carte de crédit, aucun engagement.

Ça vous intéresserait qu'on en parle 15 minutes cette semaine ?

Équipe Novalis
novalisia.ca | +1 819 342-2290

---
Pour vous désabonner, répondez "Non merci"."""
                return hook, body
            elif n == 2:
                hook = f"Re: Prise de RDV automatisée — {biz}"
                body = f"""Bonjour {name},

Suite à mon dernier message — une précision importante pour votre contexte multi-sites :

Notre agent peut gérer plusieurs cliniques avec des calendriers distincts depuis un seul système. Vos patients n'ont pas à savoir qu'ils parlent à une IA — la voix est naturelle, en français québécois.

15 minutes pour voir une démo de ce que ça donnerait concrètement pour votre réseau ?

Équipe Novalis
novalisia.ca | +1 819 342-2290

---
Pour vous désabonner, répondez "Non merci"."""
                return hook, body
            else:
                return "Dernier message — Novalis IA", f"""Bonjour {name},

C'est mon dernier message. Si l'automatisation de la prise de RDV n'est pas une priorité pour {biz} en ce moment, je comprends.

L'essai gratuit 7 jours reste disponible sur novalisia.ca si jamais. Bonne continuation.

Équipe Novalis
novalisia.ca"""

        else:  # Cabinet comptable / juridique / défaut
            if n == 1:
                hook = f"Vos clients vous appellent encore pour les mêmes questions chez {biz} ?"
                body = f"""Bonjour {name},

Novalis IA aide les cabinets comptables à automatiser les réponses aux questions récurrentes de leurs clients — délais de production, documents requis, statut de déclarations, heures d'ouverture.

Votre agent IA répond 24h/24, dans le ton de votre cabinet, sans jamais inventer d'information. Votre équipe se concentre sur les dossiers à valeur ajoutée.

Je propose un essai gratuit de 7 jours — aucune carte de crédit, aucun engagement. On configure tout en 48h.

Ça vous intéresserait qu'on en parle 15 minutes cette semaine ?

Équipe Novalis
novalisia.ca | +1 819 342-2290

---
Pour vous désabonner, répondez "Non merci"."""
                return hook, body
            elif n == 2:
                hook = f"Re: Automatisation des réponses clients — {biz}"
                body = f"""Bonjour {name},

Suite à mon dernier message — une donnée concrète :

Nos clients en cabinet reçoivent en moyenne 40 % de moins d'appels routiniers dans les 30 premiers jours. C'est 3 à 6 heures/semaine récupérées par employé.

Je peux vous montrer comment ça fonctionnerait pour {biz} en 15 minutes. Disponible cette semaine ?

Équipe Novalis
novalisia.ca | +1 819 342-2290

---
Pour vous désabonner, répondez "Non merci"."""
                return hook, body
            else:
                return "Dernier message — Novalis IA", f"""Bonjour {name},

Je ne veux pas être intrusif — c'est mon dernier message.

Si l'automatisation des réponses clients n'est pas une priorité pour {biz} en ce moment, je comprends tout à fait.

L'essai gratuit reste ouvert sur novalisia.ca. Bonne continuation.

Équipe Novalis
novalisia.ca"""

    subject, custom_body_generated = _sector_copy(email_num)
    if not custom_body:
        custom_body = custom_body_generated

    # Convertit texte brut → HTML simple
    body_lines = custom_body.split("\n")
    body_html_parts = "".join(
        f'<p style="color:#EDE8DF;font-size:0.9rem;line-height:1.7;margin:0 0 14px;">{html_module.escape(line) if line.strip() else "<br>"}</p>'
        for line in body_lines
    )
    html_body = f"""<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#090C0F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 24px;">
  <div style="border-bottom:1px solid rgba(168,104,68,0.3);padding-bottom:20px;margin-bottom:28px;">
    <p style="margin:0;font-size:0.65rem;letter-spacing:0.2em;text-transform:uppercase;color:#A86844;">Novalis IA · Sherbrooke, Québec</p>
  </div>
  {body_html_parts}
</div></body></html>"""

    try:
        await send_email(to=p["email"], subject=subject, body=html_body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur SMTP: {e}")

    now = datetime.now().isoformat()
    field_map = {1: "email1_sent_at", 2: "email2_sent_at", 3: "email3_sent_at"}
    status_map = {1: "email1_sent", 2: "email2_sent", 3: "email3_sent"}
    field = field_map[email_num]
    new_status = status_map[email_num]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE prospects SET {field} = ?, status = ?, updated_at = ? WHERE id = ?",
                         (now, new_status, now, pid))
        await db.commit()
    return {"status": "sent", "to": p["email"], "subject": subject}

@app.post("/api/v1/prospects/import")
async def import_prospects_csv(request: Request, username: str = Depends(verify_admin)):
    """Import CSV de prospects. Colonnes: Nom,Entreprise,Courriel,Téléphone,Co-working,Secteur,Notes"""
    body = await request.body()
    content = body.decode("utf-8-sig").strip()
    reader = csv.DictReader(io.StringIO(content))
    added, skipped = 0, 0
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        for row in reader:
            email = (row.get("Courriel") or row.get("email") or "").strip()
            name = (row.get("Nom") or row.get("name") or "").strip()
            if not email or not name:
                skipped += 1
                continue
            # Skip duplicates
            cur = await db.execute("SELECT id FROM prospects WHERE email = ?", (email,))
            if await cur.fetchone():
                skipped += 1
                continue
            pid = generate_id("prospect")
            await db.execute(
                """INSERT INTO prospects (id, name, business_name, email, phone, coworking, industry,
                   status, notes, email1_sent_at, email2_sent_at, email3_sent_at,
                   replied_at, converted_at, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, '', '', '', '', '', ?, ?)""",
                (pid, name, row.get("Entreprise","").strip(), email,
                 row.get("Téléphone","").strip(), row.get("Co-working","").strip(),
                 row.get("Secteur","").strip(), row.get("Notes","").strip(), now, now)
            )
            added += 1
        await db.commit()
    return {"added": added, "skipped": skipped}

@app.post("/api/v1/prospects/seed")
async def seed_prospects(username: str = Depends(verify_admin)):
    """Insère les 8 prospects initiaux Sherbrooke/Estrie si pas déjà présents."""
    initial = [
        ("Camille", "Euphorik Salon", "soyez@euphorik.ca", "819-566-4949", "Sherbrooke Centre-ville", "Salon / Spa", "Propriétaire depuis 6 ans — 3025 King Ouest. Haute volume clients. Prise de RDV manuelle."),
        ("Laurence", "Lodace Beauté", "info@lodacebeaute.ca", "819-791-1441", "Wellington Nord Sherbrooke", "Salon / Spa", "Fondatrice — 76 rue Wellington Nord. Salon premium."),
        ("Martin Ouzilleau", "Pacifique Marketing", "info@pacifiquemarketing.com", "819-868-1711", "Magog (Estrie)", "Marketing / Design", "Président et fondateur — agence 33 ans d'histoire. Partenaire revendeur potentiel."),
        ("Équipe Roux & Bachand", "Roux & Bachand Immobilier", "info@rouxetbachand.com", "819-640-8888", "Sherbrooke Ouest", "Immobilier", "Équipe eXp — 2194 King O. Leads entrants + suivis = use case fort."),
        ("Lyne Desautels", "Clinique CMIE", "info@clinique-cmie.com", "", "Réseau Québec", "Clinique / Santé", "Fondatrice — réseau multi-sites Magog+. Prise de RDV = cas parfait."),
        ("Équipe SBF", "SBF CPA Sherbrooke", "info@sbf-cpa.ca", "819-820-9530", "Sherbrooke", "Cabinet comptable / Juridique", "Cabinet CPA — 2984 rue Des Chênes. Clients PME."),
        ("Équipe DBL", "DBL Comptabilité & Gestion", "info@dblcompta.com", "819-580-7669", "Sherbrooke", "Cabinet comptable / Juridique", "Cabinet comptable Sherbrooke et Québec."),
        ("Équipe Otantik", "Otantik Marketing", "info@otantikmarketing.com", "", "Sherbrooke", "Marketing / Design", "Agence numérique — équipe de 9. Partenaire revendeur potentiel."),
        # Nouveaux prospects — analyse marché mai 2026
        ("Équipe Coiffurium", "Le Coiffurium", "info@coiffurium.ca", "819-563-5663", "Centre Sherbrooke (540 Belvédère S)", "Salon / Spa", "~60 ans d'existence. Prix Choix Consommateur 2024. Salon mixte, ouvert 7 jours. Forte fréquentation = beaucoup d'appels manqués pendant les services."),
        ("Équipe REPÈR CPA", "REPÈR CPA", "info@repercpa.ca", "819-822-0491", "2355 King Ouest bureau 10, Sherbrooke", "Cabinet comptable / Juridique", "Cabinet passionné d'innovation. Questions récurrentes clients en saison d'impôt = cas parfait pour agent IA FAQ. 40% moins d'appels routiniers potentiel."),
        ("Dr. Katherine Bergeron", "Chiro Estrie", "info@chiroestrie.ca", "819-481-0273", "Sherbrooke + Bromptonville (2 sites)", "Clinique / Santé", "3 chiropraticiens, 2 cliniques. Utilise Jane App. Appels pendant traitements = appels manqués. Multi-sites = agent IA idéal pour coordonner les RDV."),
        ("Caroline Nadeau", "Prisme Immobilier", "info@prismeimmobilier.com", "819-821-0000", "4756 Boul. Bourque #203, Rock Forest", "Immobilier", "Caroline Nadeau + Ghislain Cloutier, ~30 ans d'exp. Courtage intégré immobilier + hypothèque. Leads le soir/week-end = réponse rapide critique pour conversion."),
        ("Équipe PMC Mécanique", "PMC Mécanique", "garage@pmcmecanique.com", "819-791-0717", "2850 King Est, Sherbrooke", "Garage / Auto", "4.8/5 Google avec 382+ avis. 15 ans en affaires. Spécialiste VÉ (Tesla, Hyundai, etc.). L-V 7h30-17h. Volume élevé d'appels routiniers (est-ce prêt, prix, disponibilité)."),
    ]
    added, skipped = 0, 0
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        for (name, biz, email, phone, cw, industry, notes) in initial:
            cur = await db.execute("SELECT id FROM prospects WHERE email = ?", (email,))
            if await cur.fetchone():
                skipped += 1
                continue
            pid = generate_id("prospect")
            await db.execute(
                """INSERT INTO prospects (id, name, business_name, email, phone, coworking, industry,
                   status, notes, email1_sent_at, email2_sent_at, email3_sent_at,
                   replied_at, converted_at, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, '', '', '', '', '', ?, ?)""",
                (pid, name, biz, email, phone, cw, industry, notes, now, now)
            )
            added += 1
        await db.commit()
    return {"added": added, "skipped": skipped}

@app.post("/api/v1/prospects/send-all-email1")
async def send_all_email1(username: str = Depends(verify_admin)):
    """Envoie Email 1 à tous les prospects avec statut 'new'."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM prospects WHERE status = 'new'")
        prospects = [dict(r) for r in await cursor.fetchall()]

    results = []
    for p in prospects:
        try:
            name = p["name"].split()[0] if p["name"] else p["name"]
            biz = p["business_name"] or p["name"]
            industry = (p.get("industry") or "").lower()

            # Re-use _sector_copy logic inline (same as send_prospect_email)
            import importlib
            # Just call the endpoint logic via a fake request
            pid = p["id"]
            now = datetime.now().isoformat()

            # Build email using same sector logic — duplicate the call
            from fastapi import Request as FRequest
            class _Req:
                async def json(self): return {"email_num": 1}
            # Actually just build and send directly here
            name_first = p["name"].split()[0] if p["name"] else p["name"]
            biz_name = p["business_name"] or p["name"]
            ind = (p.get("industry") or "").lower()

            def _build(n, nm, bz, industry_str):
                if "salon" in industry_str or "spa" in industry_str:
                    if n == 1:
                        subj = f"Est-ce que vos clientes réservent encore par téléphone chez {bz} ?"
                        body = f"Bonjour {nm},\n\n{subj}\n\nChaque appel manqué, c'est un rendez-vous perdu — et souvent une cliente qui appelle ailleurs. Notre agent IA décroche à votre place 24h/24, propose les créneaux disponibles et confirme le RDV automatiquement. En bonus, il envoie un rappel la veille pour réduire les no-shows de 40 %.\n\nJe propose un essai gratuit de 7 jours — aucune carte de crédit, aucun engagement. On configure tout en 48h.\n\nÇa vous intéresserait qu'on en parle 15 minutes cette semaine ?\n\nÉquipe Novalis\nnovalisia.ca | +1 819 342-2290\n\n---\nPour vous désabonner, répondez \"Non merci\"."
                        return subj, body
                elif "immob" in industry_str:
                    if n == 1:
                        subj = f"Combien de leads vous passent entre les doigts chaque semaine chez {bz} ?"
                        body = f"Bonjour {nm},\n\nEn immobilier, la vitesse de réponse fait la différence. Un lead qui attend plus de 5 minutes a 10x moins de chances de convertir.\n\nNotre agent IA qualifie vos leads entrants en temps réel — acheteur ou vendeur, budget, secteur recherché — et transfère les dossiers chauds à votre équipe avec un résumé complet. Les suivis automatiques s'occupent du reste.\n\nJe propose un essai gratuit de 7 jours — aucune carte de crédit, aucun engagement.\n\nÇa vous intéresserait qu'on en parle 15 minutes cette semaine ?\n\nÉquipe Novalis\nnovalisia.ca | +1 819 342-2290\n\n---\nPour vous désabonner, répondez \"Non merci\"."
                        return subj, body
                elif "marketing" in industry_str or "design" in industry_str:
                    if n == 1:
                        subj = f"Vos clients PME ont besoin d'IA — et {bz} pourrait être leur point d'entrée"
                        body = f"Bonjour {nm},\n\nChez Novalis IA, on développe des agents IA pour PME québécoises (service client, prise de RDV, qualification de prospects).\n\nOn cherche des agences partenaires en Estrie pour offrir nos solutions à leurs clients PME sous forme de service géré — revenu récurrent sans coût de développement de votre côté.\n\nÇa ressemble à quelque chose qui pourrait intéresser {bz} et vos clients ?\n\nÉquipe Novalis\nnovalisia.ca | +1 819 342-2290\n\n---\nPour vous désabonner, répondez \"Non merci\"."
                        return subj, body
                elif "clinique" in industry_str or "santé" in industry_str or "sante" in industry_str:
                    if n == 1:
                        subj = "Gérer la prise de RDV sur plusieurs cliniques sans engager de personnel supplémentaire"
                        body = f"Bonjour {nm},\n\nNovalis IA déploie des agents IA spécialisés en prise de rendez-vous pour cliniques privées — conformes à la Loi 25, données hébergées au Canada.\n\nVotre agent répond aux appels 24h/24, propose les créneaux disponibles selon chaque clinique et praticien, confirme le RDV et envoie un rappel automatique. Aucun appel manqué, aucune liste d'attente téléphonique.\n\nJe propose un essai gratuit de 7 jours — aucune carte de crédit, aucun engagement.\n\nÇa vous intéresserait qu'on en parle 15 minutes cette semaine ?\n\nÉquipe Novalis\nnovalisia.ca | +1 819 342-2290\n\n---\nPour vous désabonner, répondez \"Non merci\"."
                        return subj, body
                # défaut comptable
                subj = f"Vos clients vous appellent encore pour les mêmes questions chez {bz} ?"
                body = f"Bonjour {nm},\n\nNovalis IA aide les cabinets comptables à automatiser les réponses aux questions récurrentes de leurs clients — délais de production, documents requis, statut de déclarations, heures d'ouverture.\n\nVotre agent IA répond 24h/24, dans le ton de votre cabinet, sans jamais inventer d'information. Votre équipe se concentre sur les dossiers à valeur ajoutée.\n\nJe propose un essai gratuit de 7 jours — aucune carte de crédit, aucun engagement.\n\nÇa vous intéresserait qu'on en parle 15 minutes cette semaine ?\n\nÉquipe Novalis\nnovalisia.ca | +1 819 342-2290\n\n---\nPour vous désabonner, répondez \"Non merci\"."
                return subj, body

            subject, text_body = _build(1, name_first, biz_name, ind)
            tb_lines = text_body.split("\n")
            tb_html = "".join(
                f'<p style="color:#EDE8DF;font-size:0.9rem;line-height:1.7;margin:0 0 14px;">{html_module.escape(ln) if ln.strip() else "<br>"}</p>'
                for ln in tb_lines
            )
            html_body = f"""<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#090C0F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 24px;">
  <div style="border-bottom:1px solid rgba(168,104,68,0.3);padding-bottom:20px;margin-bottom:28px;">
    <p style="margin:0;font-size:0.65rem;letter-spacing:0.2em;text-transform:uppercase;color:#A86844;">Novalis IA · Sherbrooke, Québec</p>
  </div>
  {tb_html}
</div></body></html>"""

            await send_email(to=p["email"], subject=subject, body=html_body)
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute(
                    "UPDATE prospects SET email1_sent_at = ?, status = 'email1_sent', updated_at = ? WHERE id = ?",
                    (now, now, pid)
                )
                await db.commit()
            results.append({"email": p["email"], "status": "sent"})
        except Exception as e:
            results.append({"email": p.get("email","?"), "status": "error", "detail": str(e)})

    sent = sum(1 for r in results if r["status"] == "sent")
    errors = sum(1 for r in results if r["status"] == "error")
    return {"sent": sent, "errors": errors, "results": results}

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
    service_type = data.get("service_type") or data.get("service") or data.get("service_interest", "custom")
    business_name = data.get("business_name") or data.get("business", "")

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
                (client_id, business_name or name, name, email,
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

    # Notify Elliot immediately
    admin_email = os.getenv("ADMIN_EMAIL", "") or os.getenv("SMTP_USER", "")
    if admin_email:
        notif_body = f"""<div style='font-family:sans-serif;font-size:15px;line-height:1.7;color:#222;'>
<h2 style='color:#7c3aed;'>🎉 Nouveau prospect — novalisia.ca</h2>
<p><b>Nom:</b> {name}</p>
<p><b>Courriel:</b> {email}</p>
<p><b>Entreprise:</b> {business_name}</p>
<p><b>Service:</b> {service_type}</p>
<p><b>Description:</b><br>{description}</p>
<p style='margin-top:20px;'><a href='https://novalisia.ca/admin' style='background:#7c3aed;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;'>Voir dans l'admin →</a></p>
</div>"""
        asyncio.create_task(send_email(admin_email, f"🎉 Nouveau prospect: {name} — {business_name}", notif_body))

    # Analyse IA + création assistant Vapi en arrière-plan
    ai_profile = await analyze_inquiry_with_ai(name, str(description), str(service_type))
    vapi_assistant_id = None
    if ai_profile.get("system_prompt"):
        vapi_assistant_id = await create_vapi_assistant(
            client_name=data.get("business_name", name),
            agent_name=ai_profile.get("agent_name", "Sophie"),
            system_prompt=ai_profile["system_prompt"],
            first_message=ai_profile.get("first_message", f"Bonjour, comment puis-je vous aider ?")
        )
        if vapi_assistant_id:
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute("UPDATE clients SET custom_prompt = ? WHERE id = ?",
                                 (ai_profile["system_prompt"], client_id))
                await db.commit()
            logger.info(f"Assistant Vapi créé: {vapi_assistant_id} pour {email}")

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

    # Email de bienvenue — personnalisé par IA si disponible
    agent_name = ai_profile.get("agent_name", "Sophie") if ai_profile else "Sophie"
    email_hook = ai_profile.get("email_hook", f"Votre essai gratuit de 7 jours est maintenant actif.") if ai_profile else f"Votre essai gratuit de 7 jours est maintenant actif."
    pain_points = ai_profile.get("pain_points", "") if ai_profile else ""
    vapi_section = f"""
  <div style="background:rgba(168,104,68,0.08);border:0.5px solid rgba(168,104,68,0.3);padding:20px;margin:24px 0;">
    <p style="margin:0 0 8px;font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:#A86844;">Votre agent IA — {html_module.escape(agent_name)}</p>
    <p style="margin:0 0 12px;color:#EDE8DF;font-size:0.9rem;">L'agent a été configuré spécifiquement pour votre business. Testez-le maintenant :</p>
    <a href="{APP_URL or ''}/onboarding?key={api_key}" style="color:#A86844;font-size:0.85rem;">Accéder à mon portail →</a>
  </div>""" if vapi_assistant_id else ""
    asyncio.create_task(send_email(
        to=email,
        subject=f"{agent_name} est prête — votre agent IA Novalis est configuré",
        body=f"""<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#090C0F;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">

  <div style="border-bottom:1px solid rgba(168,104,68,0.3);padding-bottom:24px;margin-bottom:32px;">
    <p style="margin:0;font-size:0.7rem;letter-spacing:0.2em;text-transform:uppercase;color:#A86844;">Novalis IA</p>
  </div>

  <h1 style="color:#EDE8DF;font-size:1.9rem;font-weight:400;margin:0 0 8px;font-style:italic;">Bonjour {h_name},</h1>
  <p style="color:#4A5260;margin:0 0 16px;font-size:1rem;line-height:1.6;">
    {html_module.escape(email_hook)}<br>
    {f'<strong style="color:#EDE8DF;">{html_module.escape(pain_points)}</strong>' if pain_points else ''}
  </p>
  {vapi_section}
  {twilio_section}

  <div style="text-align:center;margin:32px 0;">
    <a href="{onboarding_url}"
       style="display:inline-block;background:#A86844;color:#EDE8DF;text-decoration:none;
              padding:14px 36px;font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;
              border:1px solid #C4895A;">
      Accéder à mon portail →
    </a>
  </div>

  <div style="border:0.5px solid rgba(168,104,68,0.2);padding:24px;margin:24px 0;">
    <p style="margin:0 0 16px;font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:#A86844;">Prochaines étapes</p>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <span style="color:#A86844;font-size:0.7rem;margin-top:2px;min-width:16px;">01</span>
        <p style="margin:0;color:#EDE8DF;font-size:0.85rem;">Complétez le profil de votre entreprise dans le portail</p>
      </div>
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <span style="color:#A86844;font-size:0.7rem;margin-top:2px;min-width:16px;">02</span>
        <p style="margin:0;color:#EDE8DF;font-size:0.85rem;">Ajoutez votre FAQ et vos services dans la base de connaissances</p>
      </div>
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <span style="color:#A86844;font-size:0.7rem;margin-top:2px;min-width:16px;">03</span>
        <p style="margin:0;color:#EDE8DF;font-size:0.85rem;">Notre équipe vous appelle dans les 24h pour finaliser le déploiement</p>
      </div>
    </div>
  </div>

  <p style="color:#4A5260;font-size:0.78rem;margin:16px 0 0;">Référence : <span style="color:#EDE8DF;font-family:monospace;">{proj_id}</span></p>
  <p style="color:#4A5260;font-size:0.78rem;margin:4px 0 0;">Questions ? <a href="mailto:{ADMIN_EMAIL}" style="color:#A86844;">{ADMIN_EMAIL}</a></p>

  <div style="border-top:0.5px solid rgba(237,232,223,0.08);margin-top:40px;padding-top:20px;">
    <p style="color:#4A5260;font-size:0.72rem;margin:0;">Novalis IA · Québec · <a href="{APP_URL or ''}/portal?key={api_key}" style="color:#A86844;">Accès portail</a></p>
  </div>
</div>
</body></html>"""
    ))

    # Email de notification à l'admin
    ai_summary = ""
    if ai_profile:
        ai_summary = f"""
<div style="background:rgba(168,104,68,0.08);border:0.5px solid rgba(168,104,68,0.3);padding:16px;margin:16px 0;">
  <p style="margin:0 0 8px;color:#A86844;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;">Analyse IA</p>
  <p style="margin:0 0 4px;"><b>Business :</b> {html_module.escape(ai_profile.get('business_type',''))}</p>
  <p style="margin:0 0 4px;"><b>Agent :</b> {html_module.escape(ai_profile.get('agent_name',''))}</p>
  <p style="margin:0 0 4px;"><b>Problème résolu :</b> {html_module.escape(ai_profile.get('pain_points',''))}</p>
  <p style="margin:0;"><b>Assistant Vapi :</b> {vapi_assistant_id or 'non créé'}</p>
</div>"""
    asyncio.create_task(send_email(
        to=ADMIN_EMAIL,
        subject=f"🔔 Nouvelle demande : {name} — {service_type}",
        body=f"""<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#090C0F;color:#EDE8DF;padding:24px;">
<h2 style="color:#A86844;margin-top:0;">Nouvelle demande</h2>
<p><b>Nom :</b> {h_name}</p>
<p><b>Email :</b> {h_email}</p>
<p><b>Service :</b> {h_service_type}</p>
<p><b>Description :</b> {h_description}</p>
{ai_summary}
<p><b>Clé API :</b> <code style="background:rgba(168,104,68,0.1);color:#C4895A;padding:2px 6px;">{api_key}</code></p>
<p><a href="{APP_URL or ''}/onboarding?key={api_key}" style="color:#A86844;">Lien onboarding client</a></p>
</div>"""
    ))

    # SMS de notification à l'owner — nouveau lead entrant
    if twilio_client and TWILIO_PHONE and OWNER_PHONE:
        try:
            biz = business_name.strip()
            phone_lead = data.get("phone", "").strip()
            sms_body = (
                f"🔔 Nouveau lead Novalis !\n"
                f"Nom : {name}" + (f" — {biz}" if biz else "") + "\n"
                f"Courriel : {email}\n"
                + (f"Tél : {phone_lead}\n" if phone_lead else "")
                + f"Service : {service_type}\n"
                f"Message : {str(description)[:120]}"
            )
            await asyncio.to_thread(
                twilio_client.messages.create,
                body=sms_body,
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
# ONBOARDING IA AUTOMATIQUE
# ============================================================

async def analyze_inquiry_with_ai(name: str, description: str, service_type: str) -> dict:
    """Utilise Claude pour analyser la demande et générer un profil client + prompt agent."""
    if not claude_client:
        return {}
    try:
        resp = await asyncio.to_thread(
            claude_client.messages.create,
            model="claude-haiku-4-5-20251001",
            max_tokens=1200,
            messages=[{"role": "user", "content": f"""Analyse cette demande d'un client québécois pour un agent IA.

Nom: {name}
Type de service: {service_type}
Description: {description}

Réponds UNIQUEMENT en JSON valide avec ces champs:
{{
  "business_type": "type de business en 3 mots max",
  "language": "fr" ou "en",
  "agent_name": "prénom féminin québécois pour l'agent",
  "tone": "professionnel" ou "chaleureux" ou "dynamique",
  "key_services": ["service1", "service2", "service3"],
  "pain_points": "problème principal que l'IA va résoudre en 1 phrase",
  "system_prompt": "prompt complet pour l'agent IA (2-3 paragraphes, en français québécois naturel, incluant: rôle, style de communication, ce que l'agent peut faire pour ce client spécifique)",
  "first_message": "premier message que l'agent dit quand il répond (naturel, 1 phrase)",
  "email_hook": "phrase d'accroche personnalisée pour l'email de bienvenue (mentionne leur business spécifique)"
}}"""
            }]
        )
        import json as _json
        text = resp.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return _json.loads(text.strip())
    except Exception as e:
        logger.error(f"Erreur analyse IA: {e}")
        return {}

async def create_vapi_assistant(client_name: str, agent_name: str, system_prompt: str, first_message: str) -> str | None:
    """Crée un assistant Vapi via l'API et retourne son ID."""
    if not VAPI_API_KEY:
        return None
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15) as http:
            r = await http.post(
                "https://api.vapi.ai/assistant",
                headers={"Authorization": f"Bearer {VAPI_API_KEY}", "Content-Type": "application/json"},
                json={
                    "name": f"{agent_name} — {client_name}",
                    "firstMessage": first_message,
                    "firstMessageMode": "assistant-speaks-first",
                    "transcriber": {"provider": "deepgram", "model": "nova-2", "language": "fr-CA", "smartFormat": True},
                    "model": {
                        "provider": "anthropic",
                        "model": "claude-haiku-4-5-20251001",
                        "temperature": 0.7,
                        "maxTokens": 200,
                        "messages": [{"role": "system", "content": system_prompt}]
                    },
                    "voice": {"provider": "11labs", "voiceId": "cgSgspJ2msm6clMCkdW9", "stability": 0.35, "similarityBoost": 0.75},
                    "endCallFunctionEnabled": True,
                    "recordingEnabled": False,
                }
            )
        if r.status_code == 201:
            return r.json().get("id")
        logger.warning(f"Vapi assistant creation: {r.status_code} {r.text[:200]}")
        return None
    except Exception as e:
        logger.error(f"Erreur création assistant Vapi: {e}")
        return None

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

@app.get("/api/v1/test-email")
async def test_email(username: str = Depends(verify_admin)):
    config = {
        "smtp_host": SMTP_HOST or "MANQUANT",
        "smtp_port": SMTP_PORT,
        "smtp_user": SMTP_USER or "MANQUANT",
        "smtp_from": SMTP_FROM or "MANQUANT",
        "admin_email": ADMIN_EMAIL,
        "smtp_pass_set": bool(SMTP_PASS),
    }
    if not SMTP_HOST or not SMTP_USER:
        return {"status": "non_configuré", "config": config}
    try:
        import smtplib
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "✅ Test email Novalis IA"
        msg["From"] = SMTP_FROM
        msg["To"] = ADMIN_EMAIL
        msg.attach(MIMEText("<p>Email de test Novalis IA — tout fonctionne !</p>", "html", "utf-8"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM, [ADMIN_EMAIL], msg.as_string())
        return {"status": "envoyé", "to": ADMIN_EMAIL, "config": config}
    except Exception as e:
        return {"status": "erreur", "error": str(e), "config": config}

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

        # New leads in last 7 days (trial plan, not yet converted)
        since = (datetime.now() - timedelta(days=7)).isoformat()
        cursor = await db.execute(
            "SELECT COUNT(*) FROM clients WHERE plan = 'trial' AND created_at >= ?", (since,)
        )
        new_leads = (await cursor.fetchone())[0]

    return {
        "active_clients": active_clients,
        "total_conversations": total_convs,
        "total_messages": total_msgs,
        "total_appointments": total_appts,
        "today_interactions": today_interactions,
        "mrr": f"{mrr}$",
        "new_leads": new_leads,
        "version": VERSION
    }

@app.get("/api/v1/leads")
async def list_leads(username: str = Depends(verify_admin)):
    """Leads récents — clients trial des 7 derniers jours avec leur demande initiale."""
    since = (datetime.now() - timedelta(days=7)).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT c.id, c.business_name, c.owner_name, c.owner_email, c.owner_phone,
                      c.plan, c.status, c.created_at, c.trial_expires_at,
                      p.service_type, p.description as message
               FROM clients c
               LEFT JOIN projects p ON p.client_id = c.id AND p.status = 'inquiry'
               WHERE c.plan = 'trial' AND c.created_at >= ?
               ORDER BY c.created_at DESC""",
            (since,)
        )
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]

# ============================================================
# PME DISCOVERY — Scraping + IA prospecting engine
# ============================================================

def _google_places_search_sync(city: str, industry: str, max_results: int = 10) -> list:
    """Cherche des PMEs via Google Places API (New v1) — POST textsearch."""
    if not GOOGLE_PLACES_API_KEY:
        return []
    try:
        import urllib.request as _ureq
        results = []
        query = f"{industry} {city} Québec"
        # New Places API (v1) — textsearch
        payload = json.dumps({
            "textQuery": query,
            "languageCode": "fr",
            "regionCode": "CA",
            "maxResultCount": min(max_results, 20),
        }).encode("utf-8")
        req = _ureq.Request(
            "https://places.googleapis.com/v1/places:searchText",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.id",
            },
            method="POST",
        )
        with _ureq.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        for place in data.get("places", [])[:max_results]:
            name = place.get("displayName", {}).get("text", "")
            address = place.get("formattedAddress", "")
            rating = str(place.get("rating", ""))
            reviews = str(place.get("userRatingCount", ""))
            website = place.get("websiteUri", "")
            phone = place.get("nationalPhoneNumber", "")
            results.append({
                "name": name, "url": website, "title": name,
                "phone": phone, "rating": rating, "review_count": reviews,
                "address": address, "source": "google_places",
            })
        logger.info(f"Google Places v1: {len(results)} résultats pour {industry} {city}")
        return results
    except Exception as e:
        logger.error(f"Google Places v1 error: {e}")
        return []


def _ddg_search_sync(query: str, max_results: int = 15) -> list:
    try:
        from bs4 import BeautifulSoup
        url = "https://html.duckduckgo.com/html/?q=" + _urlparse.quote(query) + "&kl=ca-fr"
        headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"}
        r = http_requests.get(url, headers=headers, timeout=8)
        soup = BeautifulSoup(r.text, "html.parser")
        results = []
        for item in soup.select(".result")[:max_results * 2]:
            title_el = item.select_one(".result__title a")
            snip_el = item.select_one(".result__snippet")
            if not title_el:
                continue
            href = title_el.get("href", "")
            if "uddg=" in href:
                href = _urlparse.unquote(href.split("uddg=")[-1].split("&")[0])
            if not href.startswith("http"):
                continue
            results.append({
                "title": title_el.get_text(strip=True),
                "url": href,
                "snippet": snip_el.get_text(strip=True) if snip_el else ""
            })
            if len(results) >= max_results:
                break
        return results
    except Exception as e:
        logging.error(f"DDG search error: {e}")
        return []


def _score_website_quality(html: str, url: str) -> dict:
    """Score 1-5 for website quality. Lower = worse = better rebuild opportunity."""
    score = 5
    issues = []
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        hl = html.lower()

        # HTTPS — critique en 2026
        if not url.startswith("https://"):
            score -= 2; issues.append("Site non sécurisé (pas HTTPS)")

        # Mobile — 80% des clients sont sur mobile
        if not soup.find("meta", attrs={"name": re.compile(r"viewport", re.I)}):
            score -= 2; issues.append("Non adapté aux téléphones mobiles")

        # HTML sémantique moderne
        modern = sum(1 for t in ["<nav", "<header", "<footer", "<section", "<article", "<main"] if t in hl)
        if modern < 2:
            score -= 1; issues.append("Structure HTML désuète (avant 2015)")

        # Mise en page avec tableaux — signe d'un site très vieux
        if hl.count("<table") > 3:
            score -= 2; issues.append("Mise en page avec tableaux HTML")
        elif hl.count("<table") > 1:
            score -= 1; issues.append("Utilise des tableaux pour la mise en page")

        # Contenu insuffisant
        text_len = len(soup.get_text(strip=True))
        if text_len < 300:
            score -= 2; issues.append("Site presque vide (contenu très limité)")
        elif text_len < 700:
            score -= 1; issues.append("Contenu insuffisant pour le SEO")

        # Année du copyright
        m = re.search(r"©\s*(\d{4})", html)
        if m:
            yr = int(m.group(1))
            if yr < 2018:
                score -= 2; issues.append(f"Site non mis à jour depuis {yr}")
            elif yr < 2022:
                score -= 1; issues.append(f"Design vieillissant (dernière MAJ {yr})")

        # Vieux WordPress / CMS obsolètes
        wp_gen = soup.find("meta", attrs={"name": "generator"})
        if wp_gen:
            gen_c = wp_gen.get("content", "").lower()
            if "wordpress" in gen_c:
                mv = re.search(r"wordpress (\d+)\.(\d+)", gen_c)
                if mv and int(mv.group(1)) < 6:
                    score -= 1; issues.append("WordPress non mis à jour")
            elif any(b in gen_c for b in ["joomla", "drupal 7", "drupal 8", "weebly"]):
                score -= 1; issues.append("CMS obsolète")

        # jQuery 1.x — technologie désuète
        if re.search(r'jquery[./_-]1\.[0-8][\._-]', hl):
            score -= 1; issues.append("Technologie obsolète (jQuery 1.x)")

        # Flash (mort depuis 2020)
        if "swfobject" in hl or ".swf" in hl or "flashplayer" in hl:
            score -= 2; issues.append("Utilise Flash (technologie morte)")

        # Pas de formulaire ni lien tel: — difficile de contacter le commerce
        has_form = bool(soup.find("form"))
        has_tel = "tel:" in hl
        if not has_form and not has_tel:
            score -= 1; issues.append("Aucun moyen de contact en ligne")

        # Très peu d'images — site dénudé
        if len(soup.find_all("img")) < 2:
            score -= 1; issues.append("Aucune image / présence visuelle nulle")

        # Frameworks modernes = bonus
        if any(fw in hl for fw in ["tailwind", "react", "vue.js", "next.js", "nuxt", "gatsby", "astro"]):
            score = min(5, score + 1)

    except Exception:
        pass
    return {"score": max(1, min(5, score)), "issues": issues[:5]}


def _extract_structured_content(html: str, soup) -> dict:
    """Extrait heures, adresse, description et services depuis le HTML d'une page."""
    result = {"hours": [], "address": "", "about": "", "services_data": []}
    try:
        import json as _json

        # 1. JSON-LD
        for script_tag in soup.find_all("script", type="application/ld+json"):
            try:
                data = _json.loads(script_tag.string or "")
                # Handle @graph arrays
                entries = data if isinstance(data, list) else [data]
                for entry in entries:
                    if isinstance(entry, dict) and "@graph" in entry:
                        entries = list(entry["@graph"])
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    # Address
                    if not result["address"]:
                        addr_obj = entry.get("address", {})
                        if isinstance(addr_obj, dict):
                            parts = [
                                addr_obj.get("streetAddress", ""),
                                addr_obj.get("addressLocality", ""),
                                addr_obj.get("addressRegion", ""),
                                addr_obj.get("postalCode", ""),
                            ]
                            addr_str = ", ".join(p for p in parts if p)
                            if addr_str:
                                result["address"] = addr_str
                        elif isinstance(addr_obj, str) and addr_obj:
                            result["address"] = addr_obj
                    # Opening hours
                    if not result["hours"]:
                        oh = entry.get("openingHours") or entry.get("openingHoursSpecification", [])
                        if isinstance(oh, str):
                            result["hours"] = [oh]
                        elif isinstance(oh, list):
                            flat = []
                            for item in oh:
                                if isinstance(item, str):
                                    flat.append(item)
                                elif isinstance(item, dict):
                                    days = item.get("dayOfWeek", [])
                                    if isinstance(days, str):
                                        days = [days]
                                    opens = item.get("opens", "")
                                    closes = item.get("closes", "")
                                    if days and opens and closes:
                                        day_names = [d.replace("https://schema.org/", "").replace("http://schema.org/", "") for d in days]
                                        flat.append(f"{', '.join(day_names)}: {opens}–{closes}")
                            result["hours"] = flat[:7]
                    # Description
                    if not result["about"]:
                        desc = entry.get("description", "") or entry.get("disambiguatingDescription", "")
                        if desc and len(desc) > 40:
                            result["about"] = desc[:500]
            except Exception:
                pass

        # 2. Schema.org itemprop meta tags
        if not result["address"]:
            addr_tag = soup.find(attrs={"itemprop": "address"})
            if addr_tag:
                street = soup.find(attrs={"itemprop": "streetAddress"})
                locality = soup.find(attrs={"itemprop": "addressLocality"})
                region = soup.find(attrs={"itemprop": "addressRegion"})
                postal = soup.find(attrs={"itemprop": "postalCode"})
                parts = [
                    (street.get_text(strip=True) if street else ""),
                    (locality.get_text(strip=True) if locality else ""),
                    (region.get_text(strip=True) if region else ""),
                    (postal.get_text(strip=True) if postal else ""),
                ]
                addr_str = ", ".join(p for p in parts if p)
                if addr_str:
                    result["address"] = addr_str
                else:
                    result["address"] = addr_tag.get_text(strip=True)[:200]

        if not result["hours"]:
            oh_tags = soup.find_all(attrs={"itemprop": "openingHours"})
            for tag in oh_tags[:7]:
                val = tag.get("content", "") or tag.get_text(strip=True)
                if val:
                    result["hours"].append(val)

        # 3. Hours regex patterns
        if not result["hours"]:
            text_full = soup.get_text(separator=" ", strip=True)
            hour_patterns = [
                r'(?:Lun|Lundi|Mon|Monday|Mar|Mardi|Tue|Tuesday|Mer|Mercredi|Wed|Wednesday|'
                r'Jeu|Jeudi|Thu|Thursday|Ven|Vendredi|Fri|Friday|Sam|Samedi|Sat|Saturday|'
                r'Dim|Dimanche|Sun|Sunday)[^.;\n]{3,50}(?:\d{1,2}h\d{0,2}|\d{1,2}:\d{2})[^.;\n]{0,30}',
                r'(?:Ouvert|Open)[^.;\n]{5,60}(?:\d{1,2}h|\d{1,2}:\d{2})[^.;\n]{0,40}',
                r'\d{1,2}h(?:\d{2})?\s*[–\-à]\s*\d{1,2}h(?:\d{2})?',
            ]
            found_hours = []
            for pat in hour_patterns:
                matches = re.findall(pat, text_full, re.IGNORECASE)
                for m in matches:
                    m_clean = re.sub(r'\s+', ' ', m).strip()
                    if m_clean and len(m_clean) > 5 and m_clean not in found_hours:
                        found_hours.append(m_clean)
                if found_hours:
                    break
            result["hours"] = found_hours[:7]

        # 4. Address regex
        if not result["address"]:
            text_full = soup.get_text(separator=" ", strip=True)
            addr_pat = (
                r'\d+[\w\-]*\s+(?:rue|avenue|ave|boul(?:evard)?|blvd|chemin|route|rte|'
                r'place|pl|côte|rang|montée|impasse|allée|allee|croissant|carré|square|'
                r'street|st|road|rd|drive|dr|court|ct|way|ln|lane|terrace)'
                r'[^,\n]{2,40},?\s+[A-Za-zÀ-ÿ\s\-]{2,30},?\s*(?:QC|Québec|Quebec|ON|BC|AB)?'
                r'\s*[A-Z]\d[A-Z]\s*\d[A-Z]\d'
            )
            m = re.search(addr_pat, text_full, re.IGNORECASE)
            if m:
                result["address"] = re.sub(r'\s+', ' ', m.group(0)).strip()

        # 5 & 6. About from meta description / og:description
        if not result["about"]:
            meta_desc = soup.find("meta", attrs={"name": "description"})
            if meta_desc and meta_desc.get("content"):
                desc = meta_desc["content"].strip()
                if len(desc) > 40:
                    result["about"] = desc[:500]
        if not result["about"]:
            og_desc = (soup.find("meta", property="og:description") or
                       soup.find("meta", attrs={"name": "og:description"}))
            if og_desc and og_desc.get("content"):
                desc = og_desc["content"].strip()
                if len(desc) > 40:
                    result["about"] = desc[:500]

        # 7. Services from service-related sections
        if not result["services_data"]:
            service_keywords = ["service", "offre", "prestation", "product", "menu", "soin", "traitement"]
            candidates = []
            # Look for sections/divs with service-related classes/ids
            for tag in soup.find_all(["section", "div", "article"]):
                tag_classes = " ".join(tag.get("class", [])).lower()
                tag_id = (tag.get("id", "") or "").lower()
                ctx = tag_classes + " " + tag_id
                if any(kw in ctx for kw in service_keywords):
                    # Grab h2/h3/h4 inside as service names
                    for heading in tag.find_all(["h2", "h3", "h4", "li"], limit=10):
                        h_text = heading.get_text(strip=True)
                        if 3 < len(h_text) < 80 and h_text not in [c["name"] for c in candidates]:
                            # Try to find a description in the next sibling <p>
                            desc_p = heading.find_next_sibling("p")
                            if not desc_p:
                                parent = heading.parent
                                if parent:
                                    desc_p = parent.find("p")
                            desc_text = desc_p.get_text(strip=True)[:200] if desc_p else ""
                            candidates.append({"name": h_text, "desc": desc_text})
                        if len(candidates) >= 6:
                            break
                if len(candidates) >= 6:
                    break
            # Fallback: bare h3 tags anywhere on page
            if not candidates:
                for h3 in soup.find_all("h3", limit=12):
                    h_text = h3.get_text(strip=True)
                    if 3 < len(h_text) < 80:
                        desc_p = h3.find_next_sibling("p")
                        desc_text = desc_p.get_text(strip=True)[:200] if desc_p else ""
                        if h_text not in [c["name"] for c in candidates]:
                            candidates.append({"name": h_text, "desc": desc_text})
                    if len(candidates) >= 6:
                        break
            result["services_data"] = candidates[:6]

    except Exception:
        pass
    return result


def _extract_brand_meta(html: str, base_url: str) -> dict:
    """Extrait couleurs, logo, images et galerie du site de la PME."""
    meta = {"brand_color": "", "accent_color": "", "logo_url": "", "og_image": "",
            "favicon_url": "", "gallery": []}
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")

        # OG image (meilleure image hero disponible)
        og = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "og:image"})
        if og and og.get("content"):
            img_url = og["content"]
            if img_url.startswith("//"):
                img_url = "https:" + img_url
            elif img_url.startswith("/"):
                img_url = base_url.rstrip("/") + img_url
            meta["og_image"] = img_url

        # Favicon / apple-touch-icon
        for rel in [["apple-touch-icon"], ["icon"], ["shortcut icon"]]:
            icon = soup.find("link", rel=rel)
            if icon and icon.get("href"):
                href = icon["href"]
                if href.startswith("//"):
                    href = "https:" + href
                elif not href.startswith("http"):
                    href = base_url.rstrip("/") + "/" + href.lstrip("/")
                meta["favicon_url"] = href
                break

        # Logo dans le HTML
        for attr_val in ["logo", "Logo", "brand", "site-logo", "navbar-brand"]:
            logo = (soup.find("img", {"class": lambda c: c and attr_val.lower() in c.lower() if c else False})
                    or soup.find("img", {"id": lambda i: i and attr_val.lower() in i.lower() if i else False})
                    or soup.find("img", {"alt": lambda a: a and attr_val.lower() in a.lower() if a else False}))
            if logo and logo.get("src"):
                src = logo["src"]
                if src.startswith("//"):
                    src = "https:" + src
                elif not src.startswith("http"):
                    src = base_url.rstrip("/") + "/" + src.lstrip("/")
                if not src.endswith((".svg", ".png", ".jpg", ".webp", ".gif")):
                    continue
                meta["logo_url"] = src
                break

        # Couleurs depuis le CSS inline et les balises style
        style_chunks = [s.string or "" for s in soup.find_all("style") if s.string]
        # Aussi les styles inline du header/nav
        for tag in soup.find_all(["header", "nav"], limit=3):
            style_chunks.append(tag.get("style", ""))
        style_text = " ".join(style_chunks)

        # Variables CSS custom (--primary, --brand, --color-primary…)
        css_vars = re.findall(
            r'--(?:primary|brand|main|accent|color-primary|theme)[-\w]*\s*:\s*(#[0-9a-fA-F]{3,6})',
            style_text, re.I
        )
        if css_vars:
            meta["brand_color"] = css_vars[0] if len(css_vars[0]) == 7 else css_vars[0]
            if len(css_vars) > 1:
                meta["accent_color"] = css_vars[1]

        # Si pas de vars CSS, chercher les hex colors saturées dans les styles
        if not meta["brand_color"]:
            hex_colors = re.findall(r'#([0-9a-fA-F]{6})\b', style_text)
            valid = []
            for h in dict.fromkeys(hex_colors):  # dédoublonnage ordre préservé
                r_, g_, b_ = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
                brightness = (r_ + g_ + b_) / 3
                saturation = max(r_, g_, b_) - min(r_, g_, b_)
                if 20 < brightness < 220 and saturation > 40:
                    valid.append("#" + h)
                if len(valid) >= 2:
                    break
            if valid:
                meta["brand_color"] = valid[0]
                if len(valid) > 1:
                    meta["accent_color"] = valid[1]

        # ── Galerie d'images du site ──────────────────────────────────────────
        _skip = ["logo","icon","badge","payment","visa","mastercard","paypal","facebook",
                 "instagram","twitter","youtube","linkedin","pinterest","yelp","google",
                 "apple","android","sprite","arrow","btn-","star-","rating","map-",
                 "flag","seal","cert","award","loading","spinner","placeholder","blank",
                 "default","noimage","no-image","pixel","tracking","1x1","spacer","separator"]
        _priority_high = ["gallery","galerie","portfolio","slider","carousel","lightbox",
                          "realisations","realisation","projet","photo","work","folio"]
        _priority_med  = ["team","equipe","staff","membre","about","propos","service","before"]
        _seen = {meta["og_image"], meta["logo_url"], ""}
        _candidates = []
        _origin = re.sub(r'(https?://[^/]+).*', r'\1', base_url)
        def _norm(u):
            u = u.strip()
            if u.startswith("//"): return "https:" + u
            if u.startswith("/"): return _origin + u
            if not u.startswith("http"): return _origin + "/" + u.lstrip("/")
            return u

        for img in soup.find_all("img"):
            # Collect src from all known lazy-load patterns
            src = ""
            for attr in ["src","data-src","data-lazy-src","data-original","data-bg",
                         "data-background","data-image","data-thumb","data-url","data-imgurl"]:
                val = img.get(attr, "").strip()
                if val and not val.startswith("data:"):
                    src = val; break
            # Fallback: srcset — take the largest candidate (last entry)
            if not src:
                srcset = img.get("srcset","").strip()
                if srcset:
                    parts = [s.strip().split()[0] for s in srcset.split(",") if s.strip()]
                    if parts: src = parts[-1]
            if not src or src.startswith("data:") or src in _seen:
                continue
            src = _norm(src)
            if src in _seen:
                continue
            src_low = src.lower().split("?")[0]
            if src_low.endswith((".svg", ".ico", ".woff", ".woff2", ".css", ".js")):
                continue
            if any(p in src_low for p in _skip):
                continue
            # Skip explicit small icons (only when both w & h are set and small)
            try:
                w = img.get("width", ""); h = img.get("height", "")
                if w and h:
                    if int(str(w).replace("px","")) < 150 and int(str(h).replace("px","")) < 150:
                        continue
            except (ValueError, TypeError):
                pass
            alt_low = (img.get("alt") or "").lower()
            if any(p in alt_low for p in ["logo","icon","badge","flag"]):
                continue
            # Score by parent container context
            score = 0
            p_el = img.parent
            for _ in range(7):
                if p_el is None or not hasattr(p_el, "get"):
                    break
                ctx = " ".join([
                    " ".join(p_el.get("class", []) if isinstance(p_el.get("class"), list) else [p_el.get("class","") or ""]),
                    p_el.get("id", ""), p_el.name or ""
                ]).lower()
                if any(k in ctx for k in _priority_high):
                    score += 3
                    break
                elif any(k in ctx for k in _priority_med):
                    score += 1
                p_el = getattr(p_el, "parent", None)
            _seen.add(src)
            _candidates.append((score, src))

        # Also scan CSS background-image: url(...) — catches hero/slider images missed by img tags
        _bg_re = re.compile(
            r'background(?:-image)?\s*:\s*url\(\s*["\']?([^"\')\s,]+)["\']?\s*\)',
            re.I
        )
        for m in _bg_re.finditer(html):
            raw_bg = m.group(1).strip()
            if not raw_bg or raw_bg.startswith("data:"): continue
            bg = _norm(raw_bg)
            if bg in _seen: continue
            bg_low = bg.lower().split("?")[0]
            if bg_low.endswith((".svg",".ico",".woff",".css",".js")): continue
            if any(p in bg_low for p in _skip): continue
            _seen.add(bg)
            _candidates.append((1, bg))  # medium priority

        _candidates.sort(reverse=True)
        meta["gallery"] = [url for _, url in _candidates[:10]]
        # Fallback: if still no gallery, promote og_image
        if not meta["gallery"] and meta["og_image"]:
            meta["gallery"] = [meta["og_image"]]
    except Exception:
        pass
    return meta


def _scrape_business_website(url: str) -> dict:
    if not url or not url.startswith("http"):
        return {"email": "", "email_quality": "none", "text": "", "phone": ""}
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Accept-Language": "fr-CA,fr;q=0.9"
    }

    def _extract_emails(html_text):
        # Priority 1: mailto: hrefs (most reliable — business intentionally linked their email)
        mailto_found = re.findall(r'href=["\']mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})', html_text, re.I)
        # Priority 2: plain text emails
        text_found = re.findall(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", html_text)
        found = mailto_found + [e for e in text_found if e not in mailto_found]
        bad = ["example", "sentry", "noreply", "no-reply", "jquery", "schema.org",
               "test.", "wp-", "wordpress", "plugin", "woocommerce", "example.com", ".png", ".jpg",
               "user@domain", "your@email", "email@email", "name@domain", "info@domain",
               "votre@", "votrenom@", "monadresse@", "@domain.com", "@example.", "yourname@",
               "@sentry", "@rollbar", "privacy@", "legal@", "abuse@", "dmca@"]
        return [e for e in found if not any(b in e.lower() for b in bad)]

    try:
        from bs4 import BeautifulSoup
        r = http_requests.get(url, headers=headers, timeout=5, allow_redirects=True)
        html = r.text
        soup = BeautifulSoup(html, "html.parser")

        # Extract structured content BEFORE decomposing nav/footer (they may have hours/address)
        structured = _extract_structured_content(html, soup)

        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()
        text = re.sub(r"\s+", " ", soup.get_text(separator=" ", strip=True)).strip()[:3000]
        emails = _extract_emails(html)
        email = emails[0] if emails else ""
        eq = "site" if email else "none"

        # Use origin only so subpage paths work correctly (e.g. https://ex.com/en/ + /about → https://ex.com/about)
        from urllib.parse import urlparse as _uparse
        _up = _uparse(url)
        base = f"{_up.scheme}://{_up.netloc}"
        web_quality = _score_website_quality(html, url)
        brand_meta = _extract_brand_meta(html, url)

        # Single-pass multi-page scraping: structured content + gallery in one loop
        subpages = ["/a-propos", "/about", "/services", "/notre-equipe",
                    "/nous-joindre", "/contact", "/coordonnees"]
        existing_gallery = set(brand_meta.get("gallery", []))
        for path in subpages:
            try:
                sr = http_requests.get(base + path, headers=headers, timeout=3)
                if sr.status_code != 200:
                    continue
                sub_html = sr.text
                sub_soup = BeautifulSoup(sub_html, "html.parser")
                # Structured content
                sub_struct = _extract_structured_content(sub_html, sub_soup)
                if not structured["hours"] and sub_struct["hours"]:
                    structured["hours"] = sub_struct["hours"]
                if not structured["address"] and sub_struct["address"]:
                    structured["address"] = sub_struct["address"]
                if not structured["about"] and sub_struct["about"]:
                    structured["about"] = sub_struct["about"]
                if not structured["services_data"] and sub_struct["services_data"]:
                    structured["services_data"] = sub_struct["services_data"]
                # Gallery images — même passe, pas de 2e requête
                sub_bm = _extract_brand_meta(sub_html, base)
                for img_url in sub_bm.get("gallery", []):
                    if img_url not in existing_gallery and len(brand_meta["gallery"]) < 12:
                        brand_meta["gallery"].append(img_url)
                        existing_gallery.add(img_url)
                # Email from contact pages
                if not email and path in ("/contact", "/nous-joindre", "/coordonnees", "/about"):
                    ce = _extract_emails(sub_html)
                    if ce:
                        email = ce[0]
                        eq = "contact-page"
            except Exception:
                pass

        # Email fallback on paths not already fetched
        if not email:
            for path in ["/contactez-nous"]:
                try:
                    cr = http_requests.get(base + path, headers=headers, timeout=3)
                    ce = _extract_emails(cr.text)
                    if ce:
                        email = ce[0]
                        eq = "contact-page"
                        break
                except Exception:
                    pass

        phones = re.findall(r"(?:\+?1[\s\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}", text)

        # Merge structured data into brand_meta
        brand_meta["hours"] = structured.get("hours", [])
        brand_meta["address"] = structured.get("address", "")
        brand_meta["about"] = structured.get("about", "")
        brand_meta["services_data"] = structured.get("services_data", [])

        return {
            "email": email, "email_quality": eq, "text": text[:2500],
            "phone": phones[0].strip() if phones else "",
            "web_score": web_quality["score"], "web_issues": web_quality["issues"],
            "brand_meta": brand_meta,
            "structured": structured,
        }
    except Exception as e:
        return {"email": "", "email_quality": "error", "text": "", "phone": "",
                "web_score": 5, "web_issues": [], "error": str(e)}


def _research_business_sync(name: str, city: str) -> dict:
    """Search for online reviews and mentions of a business to identify pain points."""
    try:
        # Search for reviews
        snippets = []
        for query in [f'"{name}" "{city}" avis clients google', f'{name} {city} Quebec']:
            results = _ddg_search_sync(query, 6)
            for r in results:
                s = r.get("snippet", "").strip()
                if s and len(s) > 30:
                    snippets.append(s)

        combined = " | ".join(snippets[:10])

        # Extract rating (4.5/5, 4,5 étoiles, 4.5 stars)
        rating = ""
        review_count = ""
        for s in snippets:
            if not rating:
                m = re.search(r'(\d[\.,]\d)\s*(?:/5|étoile|star|★)', s, re.IGNORECASE)
                if m:
                    rating = m.group(0).strip()
            if not review_count:
                m2 = re.search(r'(\d+)\s*(?:avis|review|évaluation)', s, re.IGNORECASE)
                if m2:
                    review_count = m2.group(1) + " avis"

        return {"snippets": combined[:2000], "rating": rating, "review_count": review_count}
    except Exception as e:
        logging.error(f"Research error for {name}: {e}")
        return {"snippets": "", "rating": "", "review_count": ""}

def _slugify(text: str) -> str:
    import unicodedata
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:40]


def _build_prospect_email_html(plain_body: str, preview_url: str, unsubscribe_url: str, biz_name: str) -> str:
    """Construit un email HTML professionnel depuis le corps texte généré par Claude."""
    import re as _re
    # Retire la ligne du lien brut (👉 novalisia.ca/preview/...)
    clean = _re.sub(r'👉\s*\S*novalisia\.ca/preview/\S+', '', plain_body)
    # Retire la signature Claude (L'équipe Novalis IA...)
    clean = _re.sub(r"\n?L['']équipe Novalis.*", "", clean, flags=_re.S | _re.I).strip()
    # Convertit en paragraphes HTML
    paragraphs = [p.strip() for p in _re.split(r'\n{2,}', clean) if p.strip()]
    paras_html = "\n".join(
        f'<p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.75;">{p.replace(chr(10), "<br>")}</p>'
        for p in paragraphs
    )
    safe_name = biz_name.replace("<", "&lt;").replace(">", "&gt;")
    return f"""<div style="max-width:580px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="background:#0f172a;padding:18px 28px;border-radius:8px 8px 0 0;">
    <span style="color:#f1f5f9;font-size:1rem;font-weight:700;letter-spacing:0.5px;">Novalis IA</span>
    <span style="color:#475569;font-size:0.78rem;margin-left:10px;">Design web · Québec</span>
  </div>
  <div style="padding:30px 28px 20px;background:#ffffff;border:1px solid #e2e8f0;border-top:none;">
    {paras_html}
    <div style="margin:28px 0 8px;text-align:center;">
      <a href="{preview_url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:7px;font-size:0.95rem;font-weight:600;letter-spacing:0.2px;">
        Voir votre nouveau site &rarr;
      </a>
      <div style="margin-top:10px;font-size:0.73rem;color:#94a3b8;">Aperçu conçu spécialement pour <strong>{safe_name}</strong></div>
      <div style="margin-top:8px;font-size:0.73rem;color:#6b7280;font-style:italic;">Ceci est un prototype — nous le personnalisons à votre goût par la suite.</div>
    </div>
  </div>
  <div style="padding:20px 28px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
    <div style="font-size:0.85rem;color:#475569;line-height:1.8;">
      <strong style="color:#1e293b;">Elliot Pelletier</strong><br>
      Fondateur — Novalis IA<br>
      <a href="https://novalisia.ca" style="color:#2563eb;text-decoration:none;">novalisia.ca</a>&nbsp;&nbsp;·&nbsp;&nbsp;novalisproia@gmail.com
    </div>
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:0.68rem;color:#94a3b8;line-height:1.6;">
      Vous recevez ce message car votre entreprise est publiquement accessible en ligne. Nous avons analysé votre site spécifiquement — ce n'est pas un envoi générique.<br>
      <a href="{unsubscribe_url}" style="color:#94a3b8;">Se désabonner</a>
    </div>
  </div>
</div>"""


def _make_template_email(biz: dict) -> dict:
    name = biz.get("name", "votre entreprise")
    city = biz.get("city", "Québec")
    industry = biz.get("industry", "votre domaine")
    web_score = biz.get("web_score", 5)
    web_issues = biz.get("web_issues", [])

    # Angle par industrie pour personnaliser le pain point
    pain_by_industry = {
        "restaurant": ("des commandes ou réservations manquées le soir", "réservations et commandes automatisées 24/7"),
        "salon": ("des rendez-vous manqués ou des no-shows", "prise de RDV automatique et rappels anti no-show"),
        "coiffure": ("des rendez-vous manqués ou des no-shows", "prise de RDV automatique et rappels anti no-show"),
        "clinique": ("des appels manqués et des no-shows", "rappels automatiques et confirmations de RDV"),
        "médecin": ("des appels manqués et des no-shows", "rappels automatiques et confirmations de RDV"),
        "dentiste": ("des rendez-vous oubliés et des no-shows", "rappels SMS automatiques avant chaque RDV"),
        "garage": ("des estimations non suivies et des appels après fermeture", "suivis automatiques et réponses 24/7"),
        "construction": ("des soumissions qui restent sans réponse", "suivis automatiques après chaque soumission"),
        "plombier": ("des appels d'urgence manqués la nuit ou le weekend", "réponse automatique 24/7 même hors-heures"),
        "électricien": ("des appels d'urgence manqués la nuit ou le weekend", "réponse automatique 24/7 même hors-heures"),
        "nettoyage": ("des demandes de soumission sans suivi", "devis automatiques et suivis clients"),
        "avocat": ("des clients qui n'ont pas de réponse rapide", "réponses automatiques et prise de consultation en ligne"),
        "comptable": ("des clients qui attendent des réponses à des questions simples", "assistant IA qui répond aux questions courantes 24/7"),
        "immobilier": ("des leads qui refroidissent avant le premier contact", "suivi automatique de chaque nouvelle demande en moins de 2 minutes"),
    }
    industry_lower = industry.lower()
    pain, solution = next(
        ((v[0], v[1]) for k, v in pain_by_industry.items() if k in industry_lower),
        ("des clients qui n'obtiennent pas de réponse rapide", "réponses automatiques et suivi 24/7")
    )

    site_note = ""
    if web_score <= 2 and web_issues:
        site_note = f" (et votre site actuel a quelques points à améliorer aussi)"

    if web_score <= 2:
        s1 = f"On a imaginé votre nouveau site — {name}"
        b1 = (
            f"Bonjour,\n\n"
            f"On a analysé plusieurs {industry} à {city} — dont le vôtre.\n\n"
            f"Votre site actuel perd probablement des clients, surtout sur mobile. "
            f"On a préparé un aperçu de ce qu'il pourrait devenir :\n\n"
            f"👉 novalisia.ca/preview/{{PROSPECT_ID}}\n\n"
            f"30 secondes pour jeter un œil — qu'en pensez-vous?\n\n"
            f"L'équipe Novalis IA\nnovalisia.ca"
        )
    else:
        s1 = f"On a préparé quelque chose pour {name}"
        b1 = (
            f"Bonjour,\n\n"
            f"En cherchant des {industry} à {city}, on est tombé sur votre entreprise.\n\n"
            f"On a pris le temps d'imaginer ce que votre présence en ligne pourrait donner :\n\n"
            f"👉 novalisia.ca/preview/{{PROSPECT_ID}}\n\n"
            f"Curieux d'avoir votre avis!\n\n"
            f"L'équipe Novalis IA\nnovalisia.ca"
        )

    s2 = f"Re: {name}"
    b2 = (
        f"Bonjour,\n\n"
        f"Je voulais juste m'assurer que vous aviez vu l'aperçu qu'on a préparé pour vous :\n\n"
        f"👉 novalisia.ca/preview/{{PROSPECT_ID}}\n\n"
        f"Est-ce que ça correspond à l'image que vous voulez donner?\n\n"
        f"L'équipe Novalis IA"
    )

    s3 = f"Dernière nouvelle — {name}"
    b3 = (
        f"Bonjour,\n\n"
        f"C'est mon dernier message — promis!\n\n"
        f"Si vous pensez un jour à moderniser votre présence en ligne, on sera là. "
        f"L'aperçu reste disponible ici : novalisia.ca/preview/{{PROSPECT_ID}}\n\n"
        f"Bonne continuation!\n\n"
        f"L'équipe Novalis IA\nnovalisia.ca"
    )

    color_by_industry = {
        "restaurant": "orange", "salon": "purple", "coiffure": "purple",
        "clinique": "blue", "médecin": "blue", "dentiste": "blue",
        "garage": "orange", "construction": "orange", "plombier": "blue",
        "électricien": "yellow", "nettoyage": "green", "avocat": "blue",
        "comptable": "blue", "immobilier": "green",
    }
    color_theme = next((v for k, v in color_by_industry.items() if k in industry_lower), "purple")
    cta_by_industry = {
        "restaurant": "Réserver une table", "salon": "Réserver maintenant",
        "coiffure": "Prendre un rendez-vous", "clinique": "Prendre rendez-vous",
        "garage": "Demander une soumission", "construction": "Demander une soumission",
        "plombier": "Appeler maintenant", "électricien": "Appeler maintenant",
        "immobilier": "Voir les propriétés", "avocat": "Consultation gratuite",
    }
    cta_text = next((v for k, v in cta_by_industry.items() if k in industry_lower), "Nous contacter")
    services_by_industry = {
        "restaurant": ["Menu du jour", "Réservation en ligne", "Commande à emporter", "Événements privés"],
        "salon": ["Coupe & Coiffure", "Coloration", "Soins capillaires", "Réservation en ligne 24/7"],
        "coiffure": ["Coupe femme & homme", "Coloration & mèches", "Traitement & soins", "Réservation en ligne"],
        "clinique": ["Consultation médicale", "Suivi de dossier", "Prise de RDV en ligne", "Résultats d'analyses"],
        "garage": ["Réparation & entretien", "Diagnostic électronique", "Changement de pneus", "Soumission gratuite"],
        "construction": ["Rénovation résidentielle", "Construction neuve", "Soumission gratuite", "Suivi de chantier"],
        "plombier": ["Urgence 24/7", "Installation & remplacement", "Débouchage", "Inspection de plomberie"],
        "immobilier": ["Achat & vente", "Évaluation gratuite", "Courtiers certifiés", "Recherche personnalisée"],
    }
    services = next((v for k, v in services_by_industry.items() if k in industry_lower),
                    ["Service professionnel", "Consultation", "Suivi personnalisé", "Disponible 24/7"])
    return {
        "need_score": 7, "skip": False,
        "insights": f"{name} pourrait bénéficier d'automatisation pour {pain}.",
        "pain_points": [pain, "Temps perdu sur tâches répétitives"],
        "email1": {"subject": s1, "body": b1},
        "email2": {"subject": s2, "body": b2},
        "email3": {"subject": s3, "body": b3},
        "site_preview": {
            "hero_title": f"Le meilleur {industry.lower()} à {city} — disponible 24h/7j",
            "hero_subtitle": f"Service professionnel, réponse rapide et satisfaction garantie à {city}.",
            "services": services,
            "trust_line": f"Des centaines de clients satisfaits à {city} et environs",
            "cta": cta_text,
            "color_theme": color_theme,
            "phone": biz.get("phone", ""),
        },
    }


async def _generate_prospect_emails_claude(biz: dict) -> dict:
    if not claude_client:
        return _make_template_email(biz)
    name = biz.get("name", "")
    city = biz.get("city", "")
    industry = biz.get("industry", "")
    site_text = biz.get("site_text", "")[:1800]
    website = biz.get("website", "")
    research = biz.get("research", {})
    snippets = research.get("snippets", "")[:1200]
    rating = research.get("rating", "")
    review_count = research.get("review_count", "")
    web_score = biz.get("web_score", 5)
    web_issues = biz.get("web_issues", [])
    rating_line = f"Note en ligne: {rating} ({review_count})" if rating else (f"Avis trouvés: {review_count}" if review_count else "")
    web_line = f"Qualité du site: {web_score}/5 — Problèmes détectés: {', '.join(web_issues)}" if web_issues else f"Qualité du site: {web_score}/5"
    refonte_instruction = ""
    refonte_json = ""
    if web_score <= 2:
        refonte_instruction = '\n4. Génère aussi "email_refonte": un courriel proposant une refonte complète de leur site web pour ~1000$ (site moderne, mobile, SEO, livré en 2-3 semaines). Mentionne les problèmes spécifiques de leur site actuel.'
        refonte_json = ',\n  "email_refonte": {{"subject": "...", "body": "..."}}'

    # Extract real structured data from brand_meta
    bm_data = biz.get("brand_meta", {}) if isinstance(biz.get("brand_meta"), dict) else {}
    hours_str = "; ".join(bm_data.get("hours", [])[:3])
    address_str = bm_data.get("address", "")
    about_str = bm_data.get("about", "")[:400]
    services_data = bm_data.get("services_data", [])
    services_str = ", ".join(s["name"] for s in services_data[:8] if isinstance(s, dict) and s.get("name")) if services_data else ""
    brand_color_str = bm_data.get("brand_color", "")
    gallery_count = len(bm_data.get("gallery", []))
    has_logo = bool(bm_data.get("logo_url", ""))
    has_og_image = bool(bm_data.get("og_image", ""))

    prompt = f"""Tu es un expert en design web québécois. Tu analyses des sites PME et crées des aperçus personnalisés pour les convaincre d'acheter une refonte.

═══ DONNÉES DE LA PME ═══
Nom: {name}
Ville: {city} | Secteur: {industry}
Site actuel: {website}
{rating_line}
{web_line}

═══ CE QU'ON A TROUVÉ SUR LEUR SITE ═══
{f"Description/À propos: {about_str}" if about_str else "Aucune description trouvée"}
{f"Services identifiés: {services_str}" if services_str else "Services non structurés sur le site"}
{f"Adresse: {address_str}" if address_str else ""}
{f"Heures: {hours_str}" if hours_str else ""}
{f"Couleur de marque extraite: {brand_color_str}" if brand_color_str else "Aucune couleur de marque détectée"}
Photos trouvées: {gallery_count} image(s) récupérées du site
Logo trouvé: {"Oui" if has_logo else "Non"}
Image principale (og:image): {"Oui" if has_og_image else "Non"}
Texte du site: {site_text[:1200] if site_text else "(site vide ou inaccessible)"}
Mentions/avis en ligne: {snippets[:600] if snippets else "(aucune)"}

---
EXEMPLES D'EMAILS QUI CONVERTISSENT (imite ce style):

EXEMPLE A — Salon bien noté mais site désuet:
Objet: On a travaillé sur votre site — Salon Lumière
Corps:
Bonjour,

87 avis Google et 4.3 étoiles — c'est vraiment bien.

On a pris le temps de préparer un aperçu de ce que votre site pourrait devenir :
👉 novalisia.ca/preview/{{PROSPECT_ID}}

Qu'en pensez-vous?

L'équipe Novalis IA
novalisia.ca

EXEMPLE B — Restaurant sans présence en ligne moderne:
Objet: Un aperçu pour Le Bistro du Port
Corps:
Bonjour,

En cherchant des restaurants à Montréal, on est tombé sur le vôtre.

On a imaginé comment moderniser votre présence en ligne — menu, réservations, image professionnelle :
👉 novalisia.ca/preview/{{PROSPECT_ID}}

Ça vous intéresse?

L'équipe Novalis IA

---
RÈGLES STRICTES — à respecter absolument:
1. MAX 75 mots par email (compter les mots)
2. AUCUNE liste à puces (•, -, *) — jamais
3. JAMAIS "Je suis Elliot, fondateur de..." — pas de présentation formelle
4. JAMAIS "Cordialement", "Je me permets", "Suite à", "J'espère que", "J'ai le plaisir"
5. Commencer par une observation concrète sur CETTE PME (avis, secteur, localisation)
6. TOUJOURS inclure le lien preview comme valeur principale — c'est le cœur du message
7. Finir par UNE seule question courte et douce (pas de pression)
8. Signature: juste "L'équipe Novalis IA" ou "L'équipe Novalis IA\\nnovalisia.ca" — rien d'autre
9. Ton: chaleureux, curieux, utile — on a fait quelque chose pour eux, pas on veut leur vendre
10. Si web_score <= 2: une phrase factuelle sur le mobile (ex: "votre site perd des visiteurs sur mobile")
11. JAMAIS promettre des résultats chiffrés (ex: "réduit les no-shows de 50%") — trop commercial

IMPORTANT pour EMAIL 1: inclure EXACTEMENT ce texte dans le body (le système remplacera {{PROSPECT_ID}} par le vrai ID):
"On a préparé un aperçu de ce que votre présence en ligne pourrait devenir :\n👉 novalisia.ca/preview/{{PROSPECT_ID}}"
Adapte la phrase d'accroche AVANT ce lien selon les données réelles de la PME.

EMAIL 2 (suivi J+4): encore plus court, angle différent (ex: question sur leur image en ligne), rappel du lien
EMAIL 3 (dernier J+10): 2-3 phrases max, pas de pression, porte ouverte, chaleureux — mentionner que le lien reste disponible

ÉTAPE 1 — Évalue le besoin réel (need_score 1-10):
- 8-10: PME avec problème évident (avis négatifs, site désuet, heures limitées, pas de présence en ligne)
- 5-7: PME qui bénéficierait d'automatisation
- 1-4: Business déjà bien digitalisé (skip)

Si need_score < 5: retourne SEULEMENT {{"need_score": X, "skip": true, "reason": "..."}}{refonte_instruction}

{{
  "need_score": X,
  "skip": false,
  "insights": "observation clé sur cette PME en 1 phrase",
  "pain_points": ["Problème précis 1", "Problème précis 2"],
  "email1": {{"subject": "...", "body": "..."}},
  "email2": {{"subject": "...", "body": "..."}},
  "email3": {{"subject": "...", "body": "..."}},
  "site_preview": {{
    "hero_title": "Accroche ULTRA-SPÉCIFIQUE à CE business — utilise leur vrai nom de spécialité, ville, ou signature unique. Ex pour plombier Sorel: 'Urgence plomberie à Sorel-Tracy — on arrive en 1h' ou pour coiffeur: 'Couleurs balayage naturel — Salon {name[:20]}'",
    "hero_subtitle": "1 phrase qui reprend leur vraie valeur ajoutée trouvée sur le site — utilise les vrais mots du site si possible. Max 15 mots.",
    "services": [
      "Service RÉEL et SPÉCIFIQUE #1 — exactement comme ils le nomment sur leur site",
      "Service RÉEL #2 — avec leur terminologie",
      "Service RÉEL #3",
      "Service RÉEL #4 (optionnel)"
    ],
    "trust_line": "Utilise leurs vraies stats: rating {rating}, {review_count} avis, années d'expérience si mentionnées, certifications RBQ/etc. Ex: '4.8 ⭐ · 127 avis Google · Certifié RBQ depuis 2011'",
    "cta": "Bouton CTA adapté à leur secteur — max 3 mots. Ex: 'Appeler', 'Réserver', 'Soumission gratuite', 'Prendre rendez-vous'",
    "color_theme": "Choisis parmi: blue|green|purple|orange|red|yellow — selon la couleur de marque détectée ({brand_color_str or 'inconnue'}) et l'ambiance de leur industrie",
    "phone": "Numéro de téléphone exact trouvé dans le texte du site ou les données — format: 450 555-1234. Laisser vide si introuvable."
  }}{refonte_json}
}}

CRITIQUE — Qualité du site_preview:
- Les services DOIVENT être ceux de CETTE PME spécifique, pas des services génériques
- Le hero_title doit être si spécifique qu'un concurrent ne pourrait pas l'utiliser
- Si le site est vide/inaccessible, base-toi sur le nom de l'entreprise et le secteur pour deviner les services locaux typiques
- La couleur doit refléter l'ambiance réelle du secteur (ex: construction=orange/gris, salon=rose/violet, plomberie=bleu)"""
    try:
        loop = asyncio.get_event_loop()
        async with _claude_semaphore:
            response = await loop.run_in_executor(
                None,
                lambda: claude_client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=2400,
                    messages=[{"role": "user", "content": prompt}]
                )
            )
        raw = response.content[0].text.strip()
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()
        result = json.loads(raw)
        # If Claude says skip but need_score is borderline (4-5), use template instead
        if result.get("skip") and int(result.get("need_score", 0)) >= 4:
            logging.info(f"Claude skip override (score {result.get('need_score')}): using template for {biz.get('name')}")
            return _make_template_email(biz)
        return result
    except Exception as e:
        logging.error(f"Claude email gen error: {e}")
        return _make_template_email(biz)


_DDG_EXCLUDE = {
    # Annuaires & agrégateurs
    "yellowpages", "pagesjaunes", "yelp", "tripadvisor", "foursquare",
    "canada411", "411.ca", "411habitation", "hotfrog", "cylex", "annuaire", "trouve",
    "restaurantguru", "zomato", "opentable", "restomonpays", "gaultmillau",
    "threebestrated", "3bestrated", "bestinhood", "homestars", "houzz",
    "checkatrade", "bark.com", "thumbtack", "angi", "homeadvisor",
    "clutch.co", "goodfirms", "torontobest", "montrealbestrated",
    "pagesjaunes.fr", "411.com", "yellowpages.ca", "canpages",
    "dentistesquebec", "lacliniquemedecin", "local.yahoo", "superpages",
    # Réseaux sociaux
    "facebook", "instagram", "twitter", "linkedin", "youtube",
    "tiktok", "pinterest", "snapchat",
    # Sites d'info / médias / actualités
    "wikipedia", "reddit", "amazon", "ebay", "kijiji", "google",
    "lapresse", "journaldemontreal", "ledevoir", "tvanouvelles",
    "radio-canada", "cbc.ca", "journaldequebec", "beaucemedia",
    "hebdos", "actualites", "nouvelles", "lemonde", "cyberpresse",
    "20minutes", "huffpost", "buzzfeed", "medium.com",
    # Guides & top-listes
    "top7", "top10", "top5", "meilleurs", "guide-michelin", "michelin",
    "lesguidesrestaurants", "resto", "guiderestos",
    # Gouvernement / chambres
    "chambre", "gouvernement", "gouv.qc", "ville.montreal", "revenuquebec",
    "registraire", "ic.gc.ca", "cnesst", "csst",
    # Générique
    "site:google", "maps.google", "waze",
}

_CITY_COORDS = {
    "Montréal": [45.5017, -73.5673],
    "Laval": [45.6066, -73.7124],
    "Longueuil": [45.5315, -73.5185],
    "Brossard": [45.4604, -73.4727],
    "Québec": [46.8139, -71.2080],
    "Sherbrooke": [45.4042, -71.8929],
    "Gatineau": [45.4765, -75.7013],
    "Saguenay": [48.4284, -71.0618],
    "Trois-Rivières": [46.3430, -72.5425],
    "Lévis": [46.8035, -71.1783],
    "Drummondville": [45.8836, -72.4839],
    "Saint-Jérôme": [45.7858, -74.0034],
    "Repentigny": [45.7395, -73.4590],
    "Terrebonne": [45.7002, -73.6453],
}

_DISCOVERY_TARGETS = [
    # Montréal — all industries
    ("Montréal", "salon de coiffure"), ("Montréal", "clinique dentaire"),
    ("Montréal", "garage automobile"), ("Montréal", "restaurant"),
    ("Montréal", "clinique physiothérapie"), ("Montréal", "spa massothérapie"),
    ("Montréal", "cabinet comptable"), ("Montréal", "plombier"),
    ("Montréal", "électricien"), ("Montréal", "serrurier"),
    ("Montréal", "peintre"), ("Montréal", "nettoyage"),
    ("Montréal", "déménagement"), ("Montréal", "traiteur"),
    ("Montréal", "boulangerie"), ("Montréal", "pharmacie"),
    ("Montréal", "optométriste"), ("Montréal", "chiropraticien"),
    ("Montréal", "notaire"), ("Montréal", "avocat"),
    ("Montréal", "assurances"), ("Montréal", "agence immobilière"),
    ("Montréal", "agence marketing"), ("Montréal", "école de conduite"),
    ("Montréal", "garderie"), ("Montréal", "gym"),
    ("Montréal", "spa"), ("Montréal", "esthéticienne"),
    ("Montréal", "vétérinaire"), ("Montréal", "fleuriste"),
    ("Montréal", "boutique vêtements"), ("Montréal", "quincaillerie"),
    ("Montréal", "imprimerie"), ("Montréal", "photographe"),
    ("Montréal", "événements"), ("Montréal", "mécanicien"),
    ("Montréal", "toiture"),
    # Laval
    ("Laval", "salon de coiffure"), ("Laval", "clinique dentaire"),
    ("Laval", "garage automobile"), ("Laval", "restaurant"),
    ("Laval", "clinique physiothérapie"), ("Laval", "cabinet comptable"),
    ("Laval", "plombier"), ("Laval", "électricien"),
    ("Laval", "serrurier"), ("Laval", "peintre"),
    ("Laval", "nettoyage"), ("Laval", "déménagement"),
    ("Laval", "traiteur"), ("Laval", "boulangerie"),
    ("Laval", "pharmacie"), ("Laval", "optométriste"),
    ("Laval", "chiropraticien"), ("Laval", "notaire"),
    ("Laval", "avocat"), ("Laval", "assurances"),
    ("Laval", "agence immobilière"), ("Laval", "école de conduite"),
    ("Laval", "garderie"), ("Laval", "gym"),
    ("Laval", "esthéticienne"), ("Laval", "vétérinaire"),
    ("Laval", "fleuriste"), ("Laval", "boutique vêtements"),
    ("Laval", "photographe"), ("Laval", "mécanicien"),
    ("Laval", "toiture"),
    # Longueuil
    ("Longueuil", "salon de coiffure"), ("Longueuil", "clinique dentaire"),
    ("Longueuil", "garage automobile"), ("Longueuil", "restaurant"),
    ("Longueuil", "clinique physiothérapie"), ("Longueuil", "cabinet comptable"),
    ("Longueuil", "plombier"), ("Longueuil", "électricien"),
    ("Longueuil", "peintre"), ("Longueuil", "nettoyage"),
    ("Longueuil", "traiteur"), ("Longueuil", "boulangerie"),
    ("Longueuil", "pharmacie"), ("Longueuil", "notaire"),
    ("Longueuil", "avocat"), ("Longueuil", "assurances"),
    ("Longueuil", "agence immobilière"), ("Longueuil", "école de conduite"),
    ("Longueuil", "garderie"), ("Longueuil", "gym"),
    ("Longueuil", "esthéticienne"), ("Longueuil", "vétérinaire"),
    ("Longueuil", "fleuriste"), ("Longueuil", "mécanicien"),
    ("Longueuil", "toiture"),
    # Brossard
    ("Brossard", "salon de coiffure"), ("Brossard", "clinique dentaire"),
    ("Brossard", "restaurant"), ("Brossard", "clinique physiothérapie"),
    ("Brossard", "garage automobile"), ("Brossard", "cabinet comptable"),
    ("Brossard", "plombier"), ("Brossard", "électricien"),
    ("Brossard", "peintre"), ("Brossard", "nettoyage"),
    ("Brossard", "pharmacie"), ("Brossard", "notaire"),
    ("Brossard", "assurances"), ("Brossard", "agence immobilière"),
    ("Brossard", "garderie"), ("Brossard", "gym"),
    ("Brossard", "esthéticienne"), ("Brossard", "vétérinaire"),
    ("Brossard", "mécanicien"), ("Brossard", "toiture"),
    # Québec (ville)
    ("Québec", "salon de coiffure"), ("Québec", "clinique dentaire"),
    ("Québec", "garage automobile"), ("Québec", "restaurant"),
    ("Québec", "clinique physiothérapie"), ("Québec", "cabinet comptable"),
    ("Québec", "plombier"), ("Québec", "électricien"),
    ("Québec", "serrurier"), ("Québec", "peintre"),
    ("Québec", "nettoyage"), ("Québec", "déménagement"),
    ("Québec", "traiteur"), ("Québec", "boulangerie"),
    ("Québec", "pharmacie"), ("Québec", "optométriste"),
    ("Québec", "chiropraticien"), ("Québec", "notaire"),
    ("Québec", "avocat"), ("Québec", "assurances"),
    ("Québec", "agence immobilière"), ("Québec", "agence marketing"),
    ("Québec", "école de conduite"), ("Québec", "garderie"),
    ("Québec", "gym"), ("Québec", "spa"),
    ("Québec", "esthéticienne"), ("Québec", "vétérinaire"),
    ("Québec", "fleuriste"), ("Québec", "boutique vêtements"),
    ("Québec", "imprimerie"), ("Québec", "photographe"),
    ("Québec", "événements"), ("Québec", "mécanicien"),
    ("Québec", "toiture"),
    # Lévis
    ("Lévis", "salon de coiffure"), ("Lévis", "clinique dentaire"),
    ("Lévis", "garage automobile"), ("Lévis", "restaurant"),
    ("Lévis", "clinique physiothérapie"), ("Lévis", "cabinet comptable"),
    ("Lévis", "plombier"), ("Lévis", "électricien"),
    ("Lévis", "peintre"), ("Lévis", "nettoyage"),
    ("Lévis", "pharmacie"), ("Lévis", "notaire"),
    ("Lévis", "avocat"), ("Lévis", "assurances"),
    ("Lévis", "agence immobilière"), ("Lévis", "garderie"),
    ("Lévis", "gym"), ("Lévis", "esthéticienne"),
    ("Lévis", "vétérinaire"), ("Lévis", "mécanicien"),
    ("Lévis", "toiture"),
    # Sherbrooke
    ("Sherbrooke", "salon de coiffure"), ("Sherbrooke", "clinique dentaire"),
    ("Sherbrooke", "garage automobile"), ("Sherbrooke", "restaurant"),
    ("Sherbrooke", "clinique physiothérapie"), ("Sherbrooke", "cabinet comptable"),
    ("Sherbrooke", "plombier"), ("Sherbrooke", "électricien"),
    ("Sherbrooke", "serrurier"), ("Sherbrooke", "peintre"),
    ("Sherbrooke", "nettoyage"), ("Sherbrooke", "déménagement"),
    ("Sherbrooke", "traiteur"), ("Sherbrooke", "boulangerie"),
    ("Sherbrooke", "pharmacie"), ("Sherbrooke", "optométriste"),
    ("Sherbrooke", "chiropraticien"), ("Sherbrooke", "notaire"),
    ("Sherbrooke", "avocat"), ("Sherbrooke", "assurances"),
    ("Sherbrooke", "agence immobilière"), ("Sherbrooke", "école de conduite"),
    ("Sherbrooke", "garderie"), ("Sherbrooke", "gym"),
    ("Sherbrooke", "esthéticienne"), ("Sherbrooke", "vétérinaire"),
    ("Sherbrooke", "fleuriste"), ("Sherbrooke", "photographe"),
    ("Sherbrooke", "événements"), ("Sherbrooke", "mécanicien"),
    ("Sherbrooke", "toiture"),
    # Saguenay
    ("Saguenay", "salon de coiffure"), ("Saguenay", "clinique dentaire"),
    ("Saguenay", "garage automobile"), ("Saguenay", "restaurant"),
    ("Saguenay", "clinique physiothérapie"), ("Saguenay", "cabinet comptable"),
    ("Saguenay", "plombier"), ("Saguenay", "électricien"),
    ("Saguenay", "peintre"), ("Saguenay", "nettoyage"),
    ("Saguenay", "pharmacie"), ("Saguenay", "notaire"),
    ("Saguenay", "avocat"), ("Saguenay", "assurances"),
    ("Saguenay", "agence immobilière"), ("Saguenay", "garderie"),
    ("Saguenay", "gym"), ("Saguenay", "esthéticienne"),
    ("Saguenay", "vétérinaire"), ("Saguenay", "mécanicien"),
    ("Saguenay", "toiture"),
    # Gatineau
    ("Gatineau", "salon de coiffure"), ("Gatineau", "clinique dentaire"),
    ("Gatineau", "garage automobile"), ("Gatineau", "restaurant"),
    ("Gatineau", "clinique physiothérapie"), ("Gatineau", "cabinet comptable"),
    ("Gatineau", "plombier"), ("Gatineau", "électricien"),
    ("Gatineau", "serrurier"), ("Gatineau", "peintre"),
    ("Gatineau", "nettoyage"), ("Gatineau", "déménagement"),
    ("Gatineau", "traiteur"), ("Gatineau", "pharmacie"),
    ("Gatineau", "notaire"), ("Gatineau", "avocat"),
    ("Gatineau", "assurances"), ("Gatineau", "agence immobilière"),
    ("Gatineau", "école de conduite"), ("Gatineau", "garderie"),
    ("Gatineau", "gym"), ("Gatineau", "esthéticienne"),
    ("Gatineau", "vétérinaire"), ("Gatineau", "mécanicien"),
    ("Gatineau", "toiture"),
    # Trois-Rivières
    ("Trois-Rivières", "salon de coiffure"), ("Trois-Rivières", "clinique dentaire"),
    ("Trois-Rivières", "garage automobile"), ("Trois-Rivières", "restaurant"),
    ("Trois-Rivières", "clinique physiothérapie"), ("Trois-Rivières", "cabinet comptable"),
    ("Trois-Rivières", "plombier"), ("Trois-Rivières", "électricien"),
    ("Trois-Rivières", "peintre"), ("Trois-Rivières", "nettoyage"),
    ("Trois-Rivières", "pharmacie"), ("Trois-Rivières", "notaire"),
    ("Trois-Rivières", "avocat"), ("Trois-Rivières", "assurances"),
    ("Trois-Rivières", "agence immobilière"), ("Trois-Rivières", "garderie"),
    ("Trois-Rivières", "gym"), ("Trois-Rivières", "esthéticienne"),
    ("Trois-Rivières", "vétérinaire"), ("Trois-Rivières", "mécanicien"),
    ("Trois-Rivières", "toiture"),
    # Drummondville
    ("Drummondville", "salon de coiffure"), ("Drummondville", "clinique dentaire"),
    ("Drummondville", "garage automobile"), ("Drummondville", "restaurant"),
    ("Drummondville", "clinique physiothérapie"), ("Drummondville", "cabinet comptable"),
    ("Drummondville", "plombier"), ("Drummondville", "électricien"),
    ("Drummondville", "peintre"), ("Drummondville", "nettoyage"),
    ("Drummondville", "pharmacie"), ("Drummondville", "notaire"),
    ("Drummondville", "assurances"), ("Drummondville", "agence immobilière"),
    ("Drummondville", "garderie"), ("Drummondville", "gym"),
    ("Drummondville", "esthéticienne"), ("Drummondville", "vétérinaire"),
    ("Drummondville", "mécanicien"), ("Drummondville", "toiture"),
    # Saint-Jean-sur-Richelieu
    ("Saint-Jean-sur-Richelieu", "salon de coiffure"), ("Saint-Jean-sur-Richelieu", "clinique dentaire"),
    ("Saint-Jean-sur-Richelieu", "garage automobile"), ("Saint-Jean-sur-Richelieu", "restaurant"),
    ("Saint-Jean-sur-Richelieu", "clinique physiothérapie"), ("Saint-Jean-sur-Richelieu", "plombier"),
    ("Saint-Jean-sur-Richelieu", "électricien"), ("Saint-Jean-sur-Richelieu", "peintre"),
    ("Saint-Jean-sur-Richelieu", "nettoyage"), ("Saint-Jean-sur-Richelieu", "pharmacie"),
    ("Saint-Jean-sur-Richelieu", "notaire"), ("Saint-Jean-sur-Richelieu", "assurances"),
    ("Saint-Jean-sur-Richelieu", "agence immobilière"), ("Saint-Jean-sur-Richelieu", "garderie"),
    ("Saint-Jean-sur-Richelieu", "gym"), ("Saint-Jean-sur-Richelieu", "esthéticienne"),
    ("Saint-Jean-sur-Richelieu", "vétérinaire"), ("Saint-Jean-sur-Richelieu", "mécanicien"),
    ("Saint-Jean-sur-Richelieu", "toiture"),
    # Granby
    ("Granby", "salon de coiffure"), ("Granby", "clinique dentaire"),
    ("Granby", "garage automobile"), ("Granby", "restaurant"),
    ("Granby", "clinique physiothérapie"), ("Granby", "cabinet comptable"),
    ("Granby", "plombier"), ("Granby", "électricien"),
    ("Granby", "peintre"), ("Granby", "nettoyage"),
    ("Granby", "pharmacie"), ("Granby", "notaire"),
    ("Granby", "assurances"), ("Granby", "agence immobilière"),
    ("Granby", "garderie"), ("Granby", "gym"),
    ("Granby", "esthéticienne"), ("Granby", "vétérinaire"),
    ("Granby", "mécanicien"), ("Granby", "toiture"),
    # Blainville
    ("Blainville", "salon de coiffure"), ("Blainville", "clinique dentaire"),
    ("Blainville", "restaurant"), ("Blainville", "clinique physiothérapie"),
    ("Blainville", "garage automobile"), ("Blainville", "plombier"),
    ("Blainville", "électricien"), ("Blainville", "peintre"),
    ("Blainville", "nettoyage"), ("Blainville", "pharmacie"),
    ("Blainville", "notaire"), ("Blainville", "assurances"),
    ("Blainville", "agence immobilière"), ("Blainville", "garderie"),
    ("Blainville", "gym"), ("Blainville", "esthéticienne"),
    ("Blainville", "vétérinaire"), ("Blainville", "mécanicien"),
    ("Blainville", "toiture"),
    # Mirabel
    ("Mirabel", "salon de coiffure"), ("Mirabel", "clinique dentaire"),
    ("Mirabel", "garage automobile"), ("Mirabel", "restaurant"),
    ("Mirabel", "clinique physiothérapie"), ("Mirabel", "plombier"),
    ("Mirabel", "électricien"), ("Mirabel", "peintre"),
    ("Mirabel", "nettoyage"), ("Mirabel", "pharmacie"),
    ("Mirabel", "notaire"), ("Mirabel", "assurances"),
    ("Mirabel", "agence immobilière"), ("Mirabel", "garderie"),
    ("Mirabel", "gym"), ("Mirabel", "esthéticienne"),
    ("Mirabel", "vétérinaire"), ("Mirabel", "mécanicien"),
    ("Mirabel", "toiture"),
    # Terrebonne
    ("Terrebonne", "salon de coiffure"), ("Terrebonne", "clinique dentaire"),
    ("Terrebonne", "garage automobile"), ("Terrebonne", "restaurant"),
    ("Terrebonne", "clinique physiothérapie"), ("Terrebonne", "plombier"),
    ("Terrebonne", "électricien"), ("Terrebonne", "peintre"),
    ("Terrebonne", "nettoyage"), ("Terrebonne", "pharmacie"),
    ("Terrebonne", "notaire"), ("Terrebonne", "assurances"),
    ("Terrebonne", "agence immobilière"), ("Terrebonne", "garderie"),
    ("Terrebonne", "gym"), ("Terrebonne", "esthéticienne"),
    ("Terrebonne", "vétérinaire"), ("Terrebonne", "mécanicien"),
    ("Terrebonne", "toiture"),
    # Repentigny
    ("Repentigny", "salon de coiffure"), ("Repentigny", "clinique dentaire"),
    ("Repentigny", "restaurant"), ("Repentigny", "clinique physiothérapie"),
    ("Repentigny", "garage automobile"), ("Repentigny", "plombier"),
    ("Repentigny", "électricien"), ("Repentigny", "peintre"),
    ("Repentigny", "nettoyage"), ("Repentigny", "pharmacie"),
    ("Repentigny", "notaire"), ("Repentigny", "assurances"),
    ("Repentigny", "agence immobilière"), ("Repentigny", "garderie"),
    ("Repentigny", "gym"), ("Repentigny", "esthéticienne"),
    ("Repentigny", "vétérinaire"), ("Repentigny", "mécanicien"),
    ("Repentigny", "toiture"),
    # Saint-Jérôme
    ("Saint-Jérôme", "salon de coiffure"), ("Saint-Jérôme", "clinique dentaire"),
    ("Saint-Jérôme", "garage automobile"), ("Saint-Jérôme", "restaurant"),
    ("Saint-Jérôme", "clinique physiothérapie"), ("Saint-Jérôme", "plombier"),
    ("Saint-Jérôme", "électricien"), ("Saint-Jérôme", "peintre"),
    ("Saint-Jérôme", "nettoyage"), ("Saint-Jérôme", "pharmacie"),
    ("Saint-Jérôme", "notaire"), ("Saint-Jérôme", "assurances"),
    ("Saint-Jérôme", "agence immobilière"), ("Saint-Jérôme", "garderie"),
    ("Saint-Jérôme", "gym"), ("Saint-Jérôme", "esthéticienne"),
    ("Saint-Jérôme", "vétérinaire"), ("Saint-Jérôme", "mécanicien"),
    ("Saint-Jérôme", "toiture"),
    # Châteauguay
    ("Châteauguay", "salon de coiffure"), ("Châteauguay", "clinique dentaire"),
    ("Châteauguay", "restaurant"), ("Châteauguay", "clinique physiothérapie"),
    ("Châteauguay", "garage automobile"), ("Châteauguay", "plombier"),
    ("Châteauguay", "électricien"), ("Châteauguay", "peintre"),
    ("Châteauguay", "nettoyage"), ("Châteauguay", "pharmacie"),
    ("Châteauguay", "notaire"), ("Châteauguay", "assurances"),
    ("Châteauguay", "agence immobilière"), ("Châteauguay", "garderie"),
    ("Châteauguay", "gym"), ("Châteauguay", "esthéticienne"),
    ("Châteauguay", "vétérinaire"), ("Châteauguay", "mécanicien"),
    ("Châteauguay", "toiture"),
    # Rimouski
    ("Rimouski", "salon de coiffure"), ("Rimouski", "clinique dentaire"),
    ("Rimouski", "garage automobile"), ("Rimouski", "restaurant"),
    ("Rimouski", "clinique physiothérapie"), ("Rimouski", "cabinet comptable"),
    ("Rimouski", "plombier"), ("Rimouski", "électricien"),
    ("Rimouski", "peintre"), ("Rimouski", "nettoyage"),
    ("Rimouski", "pharmacie"), ("Rimouski", "notaire"),
    ("Rimouski", "assurances"), ("Rimouski", "agence immobilière"),
    ("Rimouski", "garderie"), ("Rimouski", "gym"),
    ("Rimouski", "esthéticienne"), ("Rimouski", "vétérinaire"),
    ("Rimouski", "mécanicien"), ("Rimouski", "toiture"),
    # Sept-Îles
    ("Sept-Îles", "salon de coiffure"), ("Sept-Îles", "clinique dentaire"),
    ("Sept-Îles", "restaurant"), ("Sept-Îles", "garage automobile"),
    ("Sept-Îles", "plombier"), ("Sept-Îles", "électricien"),
    ("Sept-Îles", "peintre"), ("Sept-Îles", "nettoyage"),
    ("Sept-Îles", "pharmacie"), ("Sept-Îles", "notaire"),
    ("Sept-Îles", "assurances"), ("Sept-Îles", "agence immobilière"),
    ("Sept-Îles", "garderie"), ("Sept-Îles", "gym"),
    ("Sept-Îles", "esthéticienne"), ("Sept-Îles", "vétérinaire"),
    ("Sept-Îles", "mécanicien"), ("Sept-Îles", "toiture"),
    # Saint-Hyacinthe
    ("Saint-Hyacinthe", "salon de coiffure"), ("Saint-Hyacinthe", "clinique dentaire"),
    ("Saint-Hyacinthe", "garage automobile"), ("Saint-Hyacinthe", "restaurant"),
    ("Saint-Hyacinthe", "plombier"), ("Saint-Hyacinthe", "électricien"),
    ("Saint-Hyacinthe", "peintre"), ("Saint-Hyacinthe", "nettoyage"),
    ("Saint-Hyacinthe", "pharmacie"), ("Saint-Hyacinthe", "notaire"),
    ("Saint-Hyacinthe", "assurances"), ("Saint-Hyacinthe", "agence immobilière"),
    ("Saint-Hyacinthe", "garderie"), ("Saint-Hyacinthe", "gym"),
    ("Saint-Hyacinthe", "esthéticienne"), ("Saint-Hyacinthe", "vétérinaire"),
    ("Saint-Hyacinthe", "mécanicien"), ("Saint-Hyacinthe", "toiture"),
    # Joliette
    ("Joliette", "salon de coiffure"), ("Joliette", "clinique dentaire"),
    ("Joliette", "restaurant"), ("Joliette", "clinique physiothérapie"),
    ("Joliette", "plombier"), ("Joliette", "électricien"),
    ("Joliette", "peintre"), ("Joliette", "nettoyage"),
    ("Joliette", "pharmacie"), ("Joliette", "notaire"),
    ("Joliette", "assurances"), ("Joliette", "agence immobilière"),
    ("Joliette", "garderie"), ("Joliette", "gym"),
    ("Joliette", "esthéticienne"), ("Joliette", "vétérinaire"),
    ("Joliette", "mécanicien"), ("Joliette", "toiture"),
    # Victoriaville
    ("Victoriaville", "salon de coiffure"), ("Victoriaville", "clinique dentaire"),
    ("Victoriaville", "garage automobile"), ("Victoriaville", "restaurant"),
    ("Victoriaville", "plombier"), ("Victoriaville", "électricien"),
    ("Victoriaville", "peintre"), ("Victoriaville", "nettoyage"),
    ("Victoriaville", "pharmacie"), ("Victoriaville", "notaire"),
    ("Victoriaville", "assurances"), ("Victoriaville", "agence immobilière"),
    ("Victoriaville", "garderie"), ("Victoriaville", "gym"),
    ("Victoriaville", "esthéticienne"), ("Victoriaville", "vétérinaire"),
    ("Victoriaville", "mécanicien"), ("Victoriaville", "toiture"),
    # Val-d'Or
    ("Val-d'Or", "salon de coiffure"), ("Val-d'Or", "clinique dentaire"),
    ("Val-d'Or", "garage automobile"), ("Val-d'Or", "restaurant"),
    ("Val-d'Or", "plombier"), ("Val-d'Or", "électricien"),
    ("Val-d'Or", "peintre"), ("Val-d'Or", "nettoyage"),
    ("Val-d'Or", "pharmacie"), ("Val-d'Or", "notaire"),
    ("Val-d'Or", "assurances"), ("Val-d'Or", "agence immobilière"),
    ("Val-d'Or", "garderie"), ("Val-d'Or", "gym"),
    ("Val-d'Or", "esthéticienne"), ("Val-d'Or", "vétérinaire"),
    ("Val-d'Or", "mécanicien"), ("Val-d'Or", "toiture"),
    # Rouyn-Noranda
    ("Rouyn-Noranda", "salon de coiffure"), ("Rouyn-Noranda", "clinique dentaire"),
    ("Rouyn-Noranda", "garage automobile"), ("Rouyn-Noranda", "restaurant"),
    ("Rouyn-Noranda", "plombier"), ("Rouyn-Noranda", "électricien"),
    ("Rouyn-Noranda", "peintre"), ("Rouyn-Noranda", "nettoyage"),
    ("Rouyn-Noranda", "pharmacie"), ("Rouyn-Noranda", "notaire"),
    ("Rouyn-Noranda", "assurances"), ("Rouyn-Noranda", "agence immobilière"),
    ("Rouyn-Noranda", "garderie"), ("Rouyn-Noranda", "gym"),
    ("Rouyn-Noranda", "esthéticienne"), ("Rouyn-Noranda", "vétérinaire"),
    ("Rouyn-Noranda", "mécanicien"), ("Rouyn-Noranda", "toiture"),
    # Saint-Georges
    ("Saint-Georges", "salon de coiffure"), ("Saint-Georges", "clinique dentaire"),
    ("Saint-Georges", "garage automobile"), ("Saint-Georges", "restaurant"),
    ("Saint-Georges", "plombier"), ("Saint-Georges", "électricien"),
    ("Saint-Georges", "peintre"), ("Saint-Georges", "nettoyage"),
    ("Saint-Georges", "pharmacie"), ("Saint-Georges", "notaire"),
    ("Saint-Georges", "assurances"), ("Saint-Georges", "agence immobilière"),
    ("Saint-Georges", "garderie"), ("Saint-Georges", "gym"),
    ("Saint-Georges", "esthéticienne"), ("Saint-Georges", "vétérinaire"),
    ("Saint-Georges", "mécanicien"), ("Saint-Georges", "toiture"),
    # ── Métiers (très haute proportion de sites désuets) ──────────────────────
    # Ces industries ont les sites les plus vieux du Québec
    ("Montréal", "menuisier"), ("Laval", "menuisier"), ("Longueuil", "menuisier"),
    ("Québec", "menuisier"), ("Sherbrooke", "menuisier"), ("Trois-Rivières", "menuisier"),
    ("Montréal", "couvreur"), ("Laval", "couvreur"), ("Longueuil", "couvreur"),
    ("Québec", "couvreur"), ("Sherbrooke", "couvreur"), ("Gatineau", "couvreur"),
    ("Montréal", "excavation"), ("Laval", "excavation"), ("Longueuil", "excavation"),
    ("Québec", "excavation"), ("Sherbrooke", "excavation"),
    ("Montréal", "paysagiste"), ("Laval", "paysagiste"), ("Longueuil", "paysagiste"),
    ("Québec", "paysagiste"), ("Sherbrooke", "paysagiste"), ("Gatineau", "paysagiste"),
    ("Montréal", "vitrier"), ("Laval", "vitrier"), ("Québec", "vitrier"),
    ("Montréal", "ferblantier"), ("Laval", "ferblantier"), ("Québec", "ferblantier"),
    ("Montréal", "maçon"), ("Laval", "maçon"), ("Québec", "maçon"),
    ("Montréal", "carrossier"), ("Laval", "carrossier"), ("Québec", "carrossier"),
    ("Montréal", "entrepreneur général"), ("Laval", "entrepreneur général"),
    ("Québec", "entrepreneur général"), ("Sherbrooke", "entrepreneur général"),
    ("Montréal", "réfrigération HVAC"), ("Laval", "réfrigération HVAC"),
    ("Québec", "réfrigération HVAC"), ("Sherbrooke", "réfrigération HVAC"),
    ("Montréal", "soudeur"), ("Laval", "soudeur"), ("Québec", "soudeur"),
    ("Montréal", "terrassement"), ("Laval", "terrassement"), ("Québec", "terrassement"),
    ("Montréal", "rénovation"), ("Laval", "rénovation"), ("Longueuil", "rénovation"),
    ("Québec", "rénovation"), ("Sherbrooke", "rénovation"), ("Gatineau", "rénovation"),
    # ── Petites villes (sites souvent vieux de 10+ ans) ───────────────────────
    ("Joliette", "garage automobile"), ("Joliette", "plombier"), ("Joliette", "électricien"),
    ("Joliette", "salon de coiffure"), ("Joliette", "restaurant"), ("Joliette", "toiture"),
    ("Joliette", "peintre"), ("Joliette", "nettoyage"), ("Joliette", "menuisier"),
    ("Sorel-Tracy", "garage automobile"), ("Sorel-Tracy", "plombier"), ("Sorel-Tracy", "électricien"),
    ("Sorel-Tracy", "salon de coiffure"), ("Sorel-Tracy", "restaurant"), ("Sorel-Tracy", "toiture"),
    ("Sorel-Tracy", "peintre"), ("Sorel-Tracy", "nettoyage"), ("Sorel-Tracy", "menuisier"),
    ("Saint-Hyacinthe", "garage automobile"), ("Saint-Hyacinthe", "plombier"),
    ("Saint-Hyacinthe", "salon de coiffure"), ("Saint-Hyacinthe", "restaurant"),
    ("Saint-Hyacinthe", "toiture"), ("Saint-Hyacinthe", "peintre"),
    ("Saint-Hyacinthe", "nettoyage"), ("Saint-Hyacinthe", "clinique dentaire"),
    ("Rimouski", "garage automobile"), ("Rimouski", "plombier"), ("Rimouski", "électricien"),
    ("Rimouski", "salon de coiffure"), ("Rimouski", "restaurant"), ("Rimouski", "toiture"),
    ("Rimouski", "peintre"), ("Rimouski", "nettoyage"), ("Rimouski", "menuisier"),
    ("Baie-Comeau", "garage automobile"), ("Baie-Comeau", "plombier"),
    ("Baie-Comeau", "salon de coiffure"), ("Baie-Comeau", "restaurant"),
    ("Baie-Comeau", "toiture"), ("Baie-Comeau", "électricien"),
    ("Alma", "garage automobile"), ("Alma", "plombier"), ("Alma", "électricien"),
    ("Alma", "salon de coiffure"), ("Alma", "restaurant"), ("Alma", "toiture"),
    ("Sept-Îles", "garage automobile"), ("Sept-Îles", "plombier"),
    ("Sept-Îles", "salon de coiffure"), ("Sept-Îles", "restaurant"), ("Sept-Îles", "toiture"),
    ("Shawinigan", "garage automobile"), ("Shawinigan", "plombier"), ("Shawinigan", "électricien"),
    ("Shawinigan", "salon de coiffure"), ("Shawinigan", "restaurant"), ("Shawinigan", "toiture"),
    ("Shawinigan", "peintre"), ("Shawinigan", "nettoyage"), ("Shawinigan", "menuisier"),
    ("Thetford Mines", "garage automobile"), ("Thetford Mines", "plombier"),
    ("Thetford Mines", "salon de coiffure"), ("Thetford Mines", "restaurant"),
    ("Thetford Mines", "toiture"), ("Thetford Mines", "peintre"),
    ("Cowansville", "garage automobile"), ("Cowansville", "plombier"),
    ("Cowansville", "salon de coiffure"), ("Cowansville", "restaurant"), ("Cowansville", "toiture"),
    ("Vaudreuil-Dorion", "garage automobile"), ("Vaudreuil-Dorion", "plombier"),
    ("Vaudreuil-Dorion", "salon de coiffure"), ("Vaudreuil-Dorion", "restaurant"),
    ("Vaudreuil-Dorion", "toiture"), ("Vaudreuil-Dorion", "clinique dentaire"),
    ("Châteauguay", "garage automobile"), ("Châteauguay", "plombier"),
    ("Châteauguay", "salon de coiffure"), ("Châteauguay", "restaurant"),
    ("Châteauguay", "toiture"), ("Châteauguay", "nettoyage"),
    ("Repentigny", "garage automobile"), ("Repentigny", "plombier"),
    ("Repentigny", "salon de coiffure"), ("Repentigny", "restaurant"),
    ("Repentigny", "toiture"), ("Repentigny", "clinique dentaire"),
    ("Terrebonne", "garage automobile"), ("Terrebonne", "plombier"),
    ("Terrebonne", "salon de coiffure"), ("Terrebonne", "restaurant"),
    ("Terrebonne", "toiture"), ("Terrebonne", "nettoyage"),
    ("Mascouche", "garage automobile"), ("Mascouche", "plombier"),
    ("Mascouche", "salon de coiffure"), ("Mascouche", "restaurant"), ("Mascouche", "toiture"),
    ("Saint-Eustache", "garage automobile"), ("Saint-Eustache", "plombier"),
    ("Saint-Eustache", "salon de coiffure"), ("Saint-Eustache", "restaurant"),
    ("Saint-Eustache", "toiture"), ("Saint-Eustache", "peintre"),
    ("Sainte-Thérèse", "garage automobile"), ("Sainte-Thérèse", "plombier"),
    ("Sainte-Thérèse", "salon de coiffure"), ("Sainte-Thérèse", "restaurant"),
    ("Candiac", "garage automobile"), ("Candiac", "plombier"), ("Candiac", "restaurant"),
    ("Boucherville", "garage automobile"), ("Boucherville", "plombier"),
    ("Boucherville", "salon de coiffure"), ("Boucherville", "restaurant"),
    ("Varennes", "garage automobile"), ("Varennes", "plombier"), ("Varennes", "restaurant"),
    ("Sainte-Julie", "garage automobile"), ("Sainte-Julie", "plombier"),
    ("Sainte-Julie", "salon de coiffure"), ("Sainte-Julie", "restaurant"),
    ("Beloeil", "garage automobile"), ("Beloeil", "plombier"), ("Beloeil", "restaurant"),
    ("Saint-Bruno-de-Montarville", "garage automobile"), ("Saint-Bruno-de-Montarville", "salon de coiffure"),
    ("Matane", "garage automobile"), ("Matane", "plombier"), ("Matane", "restaurant"),
    ("Rivière-du-Loup", "garage automobile"), ("Rivière-du-Loup", "plombier"),
    ("Rivière-du-Loup", "salon de coiffure"), ("Rivière-du-Loup", "restaurant"),
    ("Mont-Laurier", "garage automobile"), ("Mont-Laurier", "plombier"), ("Mont-Laurier", "restaurant"),
    ("Lachute", "garage automobile"), ("Lachute", "plombier"), ("Lachute", "restaurant"),
    ("L'Assomption", "garage automobile"), ("L'Assomption", "plombier"),
    ("Sainte-Marie", "garage automobile"), ("Sainte-Marie", "plombier"), ("Sainte-Marie", "restaurant"),
]


async def _get_suggestions_from_db(limit: int = 15) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Prioritize PMEs with emails AND generated emails; fill rest with email-only
        cursor = await db.execute(
            """SELECT * FROM prospect_suggestions WHERE status='new'
               AND email != '' AND email IS NOT NULL
               ORDER BY
                 CASE WHEN generated_emails IS NOT NULL AND generated_emails != '{}' THEN 0 ELSE 1 END,
                 web_score ASC,
                 created_at DESC
               LIMIT ?""",
            (limit,)
        )
        rows = await cursor.fetchall()
        results = []
        for row in rows:
            d = dict(row)
            d["web_issues"] = json.loads(d.get("web_issues") or "[]")
            d["pain_points"] = json.loads(d.get("pain_points") or "[]")
            d["generated_emails"] = json.loads(d.get("generated_emails") or "{}")
            d["emails_generated"] = bool(d["generated_emails"].get("email1"))
            d["has_refonte"] = bool(d.get("has_refonte"))
            results.append(d)
        return results


async def _suggestions_count_by_status() -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT status, COUNT(*) as cnt FROM prospect_suggestions GROUP BY status"
        )
        rows = await cursor.fetchall()
        return {r[0]: r[1] for r in rows}


async def _bank_builder_loop():
    """Runs forever, keeps prospect_bank filled to 200 ready entries."""
    await asyncio.sleep(20)
    while True:
        try:
            async with aiosqlite.connect(DB_PATH) as db:
                cursor = await db.execute(
                    "SELECT COUNT(*) FROM prospect_bank WHERE status='ready'"
                )
                count = (await cursor.fetchone())[0]
            if count < 200:
                # Parallélisme: plus la banque est vide, plus on lance de batches en même temps
                if count < 15:
                    parallel = 5   # urgent: 5 recherches simultanées
                    batch_size = 10
                elif count < 50:
                    parallel = 3   # rapide: 3 recherches simultanées
                    batch_size = 8
                else:
                    parallel = 2
                    batch_size = 6
                tasks = [_auto_discover_batch(max_new=batch_size, save_to_bank=True) for _ in range(parallel)]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                added = sum(r for r in results if isinstance(r, int))
                logging.info(f"Bank builder: {count} ready → +{added} ({parallel} batches parallèles, target 200)")
                sleep_time = 8 if count < 15 else (20 if count < 50 else 60)
            else:
                sleep_time = 120
        except Exception as e:
            logging.error(f"Bank builder error: {e}")
            sleep_time = 30
        await asyncio.sleep(sleep_time)


async def _try_send_now(prospect_id: str, table: str, name: str, email: str, city: str, industry: str, emails: dict):
    """Envoi immédiat dès la découverte — pas d'attente outreach loop."""
    if not _auto_outreach["enabled"]:
        logging.info(f"_try_send_now skip {name}: auto-outreach disabled")
        return
    if not (RESEND_API_KEY or (SMTP_HOST and SMTP_USER)):
        logging.warning(f"_try_send_now skip {name}: no email provider configured")
        return
    today = datetime.now().strftime("%Y-%m-%d")
    if _auto_outreach["last_reset"] != today:
        _auto_outreach["sent_today"] = 0
        _auto_outreach["last_reset"] = today
    if _auto_outreach["sent_today"] >= _auto_outreach["daily_limit"]:
        logging.info(f"_try_send_now skip {name}: daily limit {_auto_outreach['daily_limit']} reached")
        return
    email_addr = email.strip().lower()
    if email_addr in _sent_emails_session:
        logging.info(f"_try_send_now skip {name}: already sent this session to {email_addr}")
        return
    async with aiosqlite.connect(DB_PATH) as db:
        chk = await db.execute(
            "SELECT COUNT(*) FROM prospect_suggestions WHERE LOWER(email)=? AND email_sent_at != '' AND email_sent_at IS NOT NULL",
            (email_addr,)
        )
        if (await chk.fetchone())[0] > 0:
            logging.info(f"_try_send_now skip {name}: already sent previously to {email_addr}")
            return
    email1 = emails.get("email1", {})
    if not email1.get("subject") or not email1.get("body"):
        logging.warning(f"_try_send_now skip {name}: no email1 subject/body in generated emails")
        return
    unsubscribe_url = f"https://novalisia.ca/unsubscribe?id={prospect_id}"
    _slug = _slugify(name)
    preview_url = f"https://novalisia.ca/preview/{_slug}/{prospect_id}"
    body_text = email1["body"].replace("{PROSPECT_ID}", f"{_slug}/{prospect_id}")
    html_body = _build_prospect_email_html(body_text, preview_url, unsubscribe_url, name)
    try:
        await send_email(email, email1["subject"], html_body)
        _sent_emails_session.add(email_addr)
        now_iso = datetime.now().isoformat()
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                f"UPDATE {table} SET email_sent_at=?, status='contacted', updated_at=? WHERE id=? AND (email_sent_at IS NULL OR email_sent_at='')",
                (now_iso, now_iso, prospect_id)
            )
            await db.commit()
        _auto_outreach["sent_today"] += 1
        _auto_outreach["total_sent"] += 1
        _auto_outreach["last_sent_at"] = now_iso
        _auto_outreach["last_prospect"] = f"{name} ({city})"
        _emit_discovery("sent", name=name[:50], email=email, city=city, industry=industry)
        logging.info(f"Envoi immédiat ✓ {name} <{email}> — {_auto_outreach['sent_today']}/{_auto_outreach['daily_limit']} aujourd'hui")
    except Exception as e:
        logging.error(f"Envoi immédiat erreur {name} <{email}>: {e}")


async def _auto_discover_batch(max_new: int = 10, save_to_bank: bool = False) -> int:
    import random as _random
    target_table = "prospect_bank" if save_to_bank else "prospect_suggestions"
    async with aiosqlite.connect(DB_PATH) as db:
        # For bank: only count 'ready' entries as used keys (recycle 'used' slots)
        if save_to_bank:
            cursor = await db.execute("SELECT DISTINCT search_key FROM prospect_bank WHERE status='ready'")
        else:
            cursor = await db.execute(f"SELECT DISTINCT search_key FROM {target_table}")
        rows = await cursor.fetchall()
        used_keys = {r[0] for r in rows}
        cursor2 = await db.execute(f"SELECT website FROM {target_table}")
        known_sites = {r[0] for r in await cursor2.fetchall()}
    targets = [(c, i) for c, i in _DISCOVERY_TARGETS if f"{c}|{i}" not in used_keys]
    if not targets:
        targets = list(_DISCOVERY_TARGETS)
    city, industry = _random.choice(targets)
    search_key = f"{city}|{industry}"
    _emit_discovery("searching", city=city, industry=industry)
    loop = asyncio.get_event_loop()
    filtered = []

    # === GOOGLE PLACES (priorité si API key dispo) ===
    if GOOGLE_PLACES_API_KEY:
        places_raw = await loop.run_in_executor(None, _google_places_search_sync, city, industry, max_new * 2)
        for r in places_raw:
            url = (r.get("url") or "").lower()
            if url and url in known_sites:
                continue
            if url and any(r2.get("url","").lower() == url for r2 in filtered):
                continue
            filtered.append({**r, "url": r.get("url",""), "_places_phone": r.get("phone",""), "_places_rating": r.get("rating",""), "_places_reviews": r.get("review_count","")})
            _emit_discovery("found", url=r.get("url",""), title=r.get("name","")[:60], city=city, industry=industry)
            if len(filtered) >= max_new * 2:
                break

    # === DDG fallback si pas de Places API ou résultats insuffisants ===
    if len(filtered) < max_new:
        queries = [
            f'"{industry}" "{city}" contact courriel site:.ca',
            f"{industry} {city} Quebec \"nous contacter\" OR \"contactez-nous\"",
            f"{industry} {city} Quebec -site:yelp.ca -site:tripadvisor.ca -site:restaurantguru.com",
        ]
        for query in queries:
            raw = await loop.run_in_executor(None, _ddg_search_sync, query, max_new * 4)
            for r in raw:
                url = r.get("url", "").lower()
                title = r.get("title", "").lower()
                if any(d in url for d in _DDG_EXCLUDE):
                    continue
                if any(kw in title for kw in ["top ", "meilleurs ", "best ", "guide ", "liste ", "les ", " à ", "#", " 2024", " 2025", " 2026"]):
                    continue
                if url in known_sites:
                    continue
                if any(r2.get("url","").lower() == url for r2 in filtered):
                    continue
                filtered.append({**r, "url": r.get("url","")})
                _emit_discovery("found", url=r.get("url",""), title=r.get("title","")[:60], city=city, industry=industry)
                if len(filtered) >= max_new * 2:
                    break
            if len(filtered) >= max_new:
                break
    if not filtered:
        logging.warning(f"_auto_discover_batch: 0 résultats pour {city} / {industry}")
        _emit_discovery("no_result", city=city, industry=industry)
        return 0
    names = []
    for biz in filtered:
        title = biz.get("title", "")
        names.append((re.split(r"[|\-–—]", title)[0].strip() if title else biz.get("url", ""))[:80])
    _emit_discovery("scraping", count=len(filtered), city=city, industry=industry)
    scrape_coros = [loop.run_in_executor(None, _scrape_business_website, b.get("url", "")) for b in filtered]
    research_coros = [loop.run_in_executor(None, _research_business_sync, names[i], city) for i in range(len(filtered))]
    all_results = await asyncio.gather(*scrape_coros, *research_coros)
    scraped = all_results[:len(filtered)]
    researched = all_results[len(filtered):]
    biz_list = []
    for i, biz in enumerate(filtered):
        sc = scraped[i]
        res = researched[i]
        b_entry = {
            "name": biz.get("name") or names[i],
            "website": biz.get("url", ""),
            "city": city,
            "industry": industry,
            "email": sc.get("email", ""),
            "email_quality": sc.get("email_quality", "none"),
            "phone": biz.get("_places_phone") or sc.get("phone", ""),
            "site_text": sc.get("text", ""),
            "web_score": sc.get("web_score", 5),
            "web_issues": sc.get("web_issues", []),
            "brand_meta": sc.get("brand_meta", {}),
            "research": res,
        }
        biz_list.append(b_entry)
        _emit_discovery("scraped",
            name=names[i][:50],
            website=biz.get("url","")[:60],
            city=city,
            industry=industry,
            email=sc.get("email",""),
            web_score=sc.get("web_score", 5),
            has_email=bool(sc.get("email")),
        )
    gen_tasks = [_generate_prospect_emails_claude(b) for b in biz_list]
    email_results = await asyncio.gather(*gen_tasks)
    now = datetime.now().isoformat()
    saved = 0
    async with aiosqlite.connect(DB_PATH) as db:
        for i, b in enumerate(biz_list):
            emails = email_results[i]
            # Cibler seulement les PMEs avec site désuet ou sans site — skip les bons sites
            has_real_site = bool(b.get("website"))
            web_score_val = b.get("web_score", 5)
            if has_real_site and web_score_val >= 4:
                logging.info(f"Skip PME (bon site score {web_score_val}): {b['name']}")
                continue
            # Fallback vers template si Claude dit skip — on contacte toutes les PMEs ciblées
            if emails.get("skip") or not emails.get("email1"):
                emails = _make_template_email(b)
            if not emails.get("email1"):
                logging.info(f"Skipped PME (no email): {b['name']}")
                continue
            try:
                # Deduplicate by email address across parallel batches (root cause of duplicate sends)
                if b["email"]:
                    chk = await db.execute(
                        f"SELECT COUNT(*) FROM {target_table} WHERE LOWER(email)=?",
                        (b["email"].strip().lower(),)
                    )
                    if (await chk.fetchone())[0] > 0:
                        logging.info(f"Skip duplicate email {b['email']} in {target_table}")
                        continue
                # Also deduplicate by website URL
                if b["website"]:
                    chk_site = await db.execute(
                        f"SELECT COUNT(*) FROM {target_table} WHERE website=?",
                        (b["website"],)
                    )
                    if (await chk_site.fetchone())[0] > 0:
                        logging.info(f"Skip duplicate website {b['website']} in {target_table}")
                        continue
                row_status = "ready" if save_to_bank else "new"
                row_id = str(uuid.uuid4())
                await db.execute(f"""
                    INSERT OR IGNORE INTO {target_table}
                    (id, name, website, city, industry, email, email_quality, phone,
                     web_score, web_issues, insights, pain_points, rating, review_count,
                     generated_emails, has_refonte, status, search_key, brand_meta, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (
                    row_id,
                    b["name"], b["website"], b["city"], b["industry"],
                    b["email"], b["email_quality"], b["phone"],
                    b["web_score"],
                    json.dumps(b["web_issues"], ensure_ascii=False),
                    emails.get("insights", ""),
                    json.dumps(emails.get("pain_points", []), ensure_ascii=False),
                    b["research"].get("rating", ""),
                    b["research"].get("review_count", ""),
                    json.dumps(emails, ensure_ascii=False),
                    1 if bool(emails.get("email_refonte")) else 0,
                    row_status, search_key,
                    json.dumps(b.get("brand_meta", {}), ensure_ascii=False),
                    now, now,
                ))
                saved += 1
                if b["email"]:
                    asyncio.create_task(_try_send_now(row_id, target_table, b["name"], b["email"], b["city"], b["industry"], emails))
                _emit_discovery("saved",
                    name=b["name"][:50],
                    website=b["website"][:60],
                    city=b["city"],
                    industry=b["industry"],
                    email=b["email"],
                    has_email=bool(b["email"]),
                    web_score=b["web_score"],
                    need_score=emails.get("need_score", "?"),
                    destination=target_table,
                )
            except Exception as e:
                logging.error(f"Save suggestion error: {e}")
        await db.commit()
    return saved


@app.get("/api/admin/suggestions")
async def get_suggestions_endpoint(request: Request, username: str = Depends(verify_admin)):
    suggestions = await _get_suggestions_from_db(limit=15)
    counts = await _suggestions_count_by_status()
    if len(suggestions) < 8:
        asyncio.create_task(_auto_discover_batch(max_new=10))
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM prospect_bank WHERE status='ready'")
        bank_count = (await cursor.fetchone())[0]
    return {"suggestions": suggestions, "counts": counts, "bank_count": bank_count}


async def _send_interested_email(p: dict):
    """Send warm response email when a PME is marked as interested."""
    try:
        prompt = f"""Tu es l'équipe de Novalis IA.

Une PME vient de montrer de l'intérêt pour nos services. Génère un courriel de réponse chaleureux.

PME: {p['name']} | {p['city']} | {p['industry']}

Règles:
- Objet: court et personnel (ex: "Super nouvelle — {p['name']}")
- Corps: max 80 mots, chaleureux, explique les 3 prochaines étapes simples:
  1. Appel de 15 min pour comprendre vos besoins
  2. Déploiement de l'agent IA en 48h
  3. 1er mois gratuit — aucun risque
- Inclure: "Répondez à ce courriel pour qu'on planifie un appel"
- Signature: — L'équipe Novalis IA | novalisia.ca

Réponds UNIQUEMENT avec JSON: {{"subject": "...", "body": "..."}}"""

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: claude_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=400,
                messages=[{"role": "user", "content": prompt}]
            )
        )
        raw = response.content[0].text.strip()
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        email_data = json.loads(raw)
        subject = email_data.get("subject", f"Merci de votre intérêt — Novalis IA")
        body = email_data.get("body", "")
        if body:
            html_body = "<div style='font-family:sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;'>" + body.replace("\n", "<br>") + "</div>"
            await send_email(p["email"], subject, html_body)
            logging.info(f"Interested email sent to {p['name']} ({p['email']})")
    except Exception as e:
        logging.error(f"_send_interested_email error: {e}")


@app.post("/api/admin/suggestions/action")
async def suggestions_action_endpoint(request: Request, username: str = Depends(verify_admin)):
    data = await request.json()
    suggestion_id = data.get("id", "").strip()
    action = data.get("action", "").strip()
    if action not in ("contacted", "dismissed", "saved", "interested", "client"):
        raise HTTPException(400, "action doit être: contacted, dismissed, saved, interested ou client")
    now = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        result = await db.execute(
            "UPDATE prospect_suggestions SET status=?, updated_at=? WHERE id=?",
            (action, now, suggestion_id)
        )
        if result.rowcount == 0:
            raise HTTPException(404, "Suggestion introuvable")
        await db.commit()
    # If marked interested, send warm welcome email
    if action == "interested":
        async with aiosqlite.connect(DB_PATH) as db2:
            db2.row_factory = aiosqlite.Row
            cursor = await db2.execute("SELECT * FROM prospect_suggestions WHERE id=?", (suggestion_id,))
            prospect = await cursor.fetchone()
        if prospect and prospect["email"] and claude_client and (RESEND_API_KEY or (SMTP_HOST and SMTP_USER)):
            p = dict(prospect)
            asyncio.create_task(_send_interested_email(p))
    return {"ok": True, "id": suggestion_id, "status": action}


async def _run_refresh_job():
    """Background task: pull from bank (instant) OR discover live (fallback)."""
    global _refresh_job
    try:
        saved = 0
        # Try to pull from bank first (instant)
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                """SELECT * FROM prospect_bank WHERE status='ready'
                     AND (email_sent_at IS NULL OR email_sent_at = '')
                   ORDER BY
                     CASE WHEN email != '' AND email IS NOT NULL THEN 0 ELSE 1 END,
                     web_score ASC, created_at DESC
                   LIMIT 15"""
            )
            bank_rows = await cursor.fetchall()
            now = datetime.now().isoformat()
            for row in bank_rows:
                d = dict(row)
                d.pop('status', None)
                try:
                    await db.execute("""
                        INSERT OR IGNORE INTO prospect_suggestions
                        (id, name, website, city, industry, email, email_quality, phone,
                         web_score, web_issues, insights, pain_points, rating, review_count,
                         generated_emails, has_refonte, status, search_key, brand_meta,
                         email_sent_at, created_at, updated_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """, (
                        d["id"], d["name"], d["website"], d["city"], d["industry"],
                        d["email"], d["email_quality"], d["phone"],
                        d["web_score"], d["web_issues"], d["insights"],
                        d["pain_points"], d["rating"], d["review_count"],
                        d["generated_emails"], d["has_refonte"],
                        "new", d["search_key"], d.get("brand_meta", "{}"),
                        d.get("email_sent_at", ""), now, now,
                    ))
                    await db.execute(
                        "UPDATE prospect_bank SET status='used', updated_at=? WHERE id=?",
                        (now, d["id"])
                    )
                    saved += 1
                except Exception as e:
                    logging.error(f"Bank transfer error: {e}")
            await db.commit()

        _refresh_job["saved"] = saved

        # Fallback: live scraping if bank was empty
        if saved == 0:
            for _ in range(3):
                batch = await _auto_discover_batch(max_new=8)
                saved += batch
                _refresh_job["saved"] = saved
                if saved >= 5:
                    break

        # Immediately trigger bank refill in background (more aggressive if bank was empty)
        refill_n = 15 if saved < 3 else 8
        asyncio.create_task(_auto_discover_batch(max_new=refill_n, save_to_bank=True))

        _refresh_job["done"] = True
        _refresh_job["error"] = ""
    except Exception as e:
        _refresh_job["error"] = str(e)
        _refresh_job["done"] = True
    finally:
        _refresh_job["running"] = False


@app.post("/api/admin/suggestions/refresh")
async def refresh_suggestions_endpoint(request: Request, username: str = Depends(verify_admin)):
    """Start background refresh — returns immediately so Railway doesn't timeout."""
    global _refresh_job
    if _refresh_job["running"]:
        return {"started": False, "already_running": True}
    _refresh_job = {"running": True, "saved": 0, "done": False, "error": "", "started_at": datetime.now().isoformat()}
    asyncio.create_task(_run_refresh_job())
    return {"started": True}


@app.get("/api/admin/suggestions/refresh/status")
async def refresh_status_endpoint(username: str = Depends(verify_admin)):
    """Poll this endpoint to check if a background refresh is done."""
    status = dict(_refresh_job)
    if status["done"]:
        status["suggestions"] = await _get_suggestions_from_db(limit=15)
        status["counts"] = await _suggestions_count_by_status()
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute("SELECT COUNT(*) FROM prospect_bank WHERE status='ready'")
            status["bank_count"] = (await cursor.fetchone())[0]
    return status


@app.post("/api/admin/discover-prospects")
async def discover_prospects_endpoint(request: Request, username: str = Depends(verify_admin)):
    data = await request.json()
    city = data.get("city", "").strip()
    industry = data.get("industry", "").strip()
    max_results = min(int(data.get("max_results", 6)), 10)
    if not city or not industry:
        raise HTTPException(400, "city et industry requis")

    query = f"{industry} {city} Quebec"
    loop = asyncio.get_event_loop()
    raw = await loop.run_in_executor(None, _ddg_search_sync, query, max_results * 3)

    filtered = []
    for r in raw:
        url = r.get("url", "")
        if any(d in url.lower() for d in _DDG_EXCLUDE):
            continue
        filtered.append(r)
        if len(filtered) >= max_results:
            break

    # Extract names now (needed for research queries)
    names = []
    for biz in filtered:
        title = biz.get("title", "")
        names.append((re.split(r"[|\-–—]", title)[0].strip() if title else biz.get("url", ""))[:80])

    # Scrape websites + research reviews in parallel (all at once)
    scrape_coros = [loop.run_in_executor(None, _scrape_business_website, b.get("url", "")) for b in filtered]
    research_coros = [loop.run_in_executor(None, _research_business_sync, names[i], city) for i in range(len(filtered))]
    all_results = await asyncio.gather(*scrape_coros, *research_coros)
    scraped = all_results[:len(filtered)]
    researched = all_results[len(filtered):]

    # Build prospect dicts with research data
    biz_list = []
    for i, biz in enumerate(filtered):
        sc = scraped[i]
        res = researched[i]
        biz_list.append({
            "name": names[i],
            "website": biz.get("url", ""),
            "city": city,
            "industry": industry,
            "email": sc.get("email", ""),
            "email_quality": sc.get("email_quality", "none"),
            "phone": sc.get("phone", ""),
            "snippet": biz.get("snippet", ""),
            "site_text": sc.get("text", ""),
            "web_score": sc.get("web_score", 5),
            "web_issues": sc.get("web_issues", []),
            "research": res,
        })

    # Generate insights + emails in parallel with Claude
    gen_tasks = [_generate_prospect_emails_claude(b) for b in biz_list]
    email_results = await asyncio.gather(*gen_tasks)

    prospects = []
    for i, b in enumerate(biz_list):
        emails = email_results[i]
        b["generated_emails"] = emails
        b["emails_generated"] = bool(emails.get("email1"))
        b["insights"] = emails.get("insights", "")
        b["pain_points"] = emails.get("pain_points", [])
        b["rating"] = b["research"].get("rating", "")
        b["review_count"] = b["research"].get("review_count", "")
        b["has_refonte"] = bool(emails.get("email_refonte"))
        del b["site_text"]
        del b["research"]
        prospects.append(b)

    return {"prospects": prospects, "city": city, "industry": industry, "count": len(prospects)}


@app.get("/api/admin/smtp-status")
async def smtp_status_endpoint(username: str = Depends(verify_admin)):
    configured = bool(SMTP_HOST and SMTP_USER and SMTP_PASS)
    return {"configured": configured, "host": SMTP_HOST or "(non défini)", "user": SMTP_USER or "(non défini)"}


@app.post("/api/admin/smtp-test")
async def smtp_test_endpoint(username: str = Depends(verify_admin)):
    """Send a real test email to SMTP_USER to verify config."""
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        raise HTTPException(503, f"SMTP non configuré — SMTP_HOST='{SMTP_HOST}' SMTP_USER='{SMTP_USER}' SMTP_PASS={'***' if SMTP_PASS else '(vide)'}")
    import smtplib as _smtplib
    try:
        def _test():
            with _smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as s:
                s.starttls()
                s.login(SMTP_USER, SMTP_PASS)
                from email.mime.text import MIMEText as _MIMEText
                msg = _MIMEText("<h2>✅ Novalis SMTP fonctionne!</h2><p>Ce test confirme que les emails partent correctement.</p>", "html", "utf-8")
                msg["Subject"] = "✅ Test SMTP Novalis — OK"
                msg["From"] = SMTP_FROM or SMTP_USER
                msg["To"] = SMTP_USER
                s.sendmail(SMTP_FROM or SMTP_USER, [SMTP_USER], msg.as_string())
        await asyncio.to_thread(_test)
        return {"ok": True, "message": f"Email de test envoyé à {SMTP_USER} — vérifiez votre boîte!"}
    except Exception as e:
        raise HTTPException(500, f"Erreur SMTP: {str(e)}")


@app.get("/api/admin/pipeline")
async def pipeline_endpoint(username: str = Depends(verify_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, name, city, industry, email, status, email_sent_at, created_at FROM prospect_suggestions ORDER BY created_at DESC"
        )
        rows = [dict(r) for r in await cursor.fetchall()]
    columns = {
        "new": [r for r in rows if r["status"] == "new"],
        "contacted": [r for r in rows if r["status"] == "contacted"],
        "interested": [r for r in rows if r["status"] == "interested"],
        "client": [r for r in rows if r["status"] == "client"],
        "dismissed": [r for r in rows if r["status"] == "dismissed"],
    }
    return columns


@app.get("/api/admin/email-stats")
async def email_stats_endpoint(username: str = Depends(verify_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE email_sent_at != '' AND email_sent_at IS NOT NULL")
        sent = (await cursor.fetchone())[0]
        cursor = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE followup_sent_at != '' AND followup_sent_at IS NOT NULL")
        followups = (await cursor.fetchone())[0]
        cursor = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE status = 'interested'")
        interested = (await cursor.fetchone())[0]
        cursor = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE status = 'client'")
        clients = (await cursor.fetchone())[0]
        cursor = await db.execute("SELECT COUNT(*) FROM prospect_suggestions")
        total = (await cursor.fetchone())[0]
    response_rate = round(interested / sent * 100, 1) if sent > 0 else 0
    return {"sent": sent, "followups": followups, "interested": interested, "clients": clients, "total": total, "response_rate": response_rate}


@app.post("/api/admin/generate-proposal")
async def generate_proposal_endpoint(request: Request, username: str = Depends(verify_admin)):
    data = await request.json()
    prospect_id = data.get("prospect_id", "")
    if not prospect_id:
        raise HTTPException(400, "prospect_id requis")
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, name, city, industry, email, insights, pain_points FROM prospect_suggestions WHERE id = ?",
            (prospect_id,)
        )
        row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "Prospect introuvable")
    p = dict(row)
    pain_text = ""
    try:
        pain_list = json.loads(p.get("pain_points") or "[]")
        if pain_list:
            pain_text = ", ".join(pain_list)
    except Exception:
        pass
    prompt = f"""Tu es Elliot Pelletier, fondateur de Novalis IA (novalisia.ca). Génère une proposition commerciale professionnelle en français pour la PME suivante.

PME: {p['name']}
Ville: {p.get('city','—')}
Secteur: {p.get('industry','—')}
Email: {p.get('email','—')}
Points de douleur identifiés: {pain_text or p.get('insights','Non précisé')}

La proposition doit inclure:
1. En-tête: "Proposition commerciale — Novalis IA"
2. Adressée à: {p['name']}
3. Problème identifié: points de douleur spécifiques à leur secteur
4. Solution proposée: agent IA 24/7 de Novalis déployé pour leur cas précis
5. Délai de déploiement: 48h
6. Tarif: 497$/mois, premier mois GRATUIT (offre clients de la première heure)
7. Signature: Elliot Pelletier | Novalis IA | novalisia.ca | novalisproia@gmail.com

Ton: professionnel mais chaleureux, en québécois naturel. Maximum 400 mots. Texte brut uniquement, pas de markdown."""

    if not claude_client:
        raise HTTPException(503, "API Claude non configurée")
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: claude_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}]
        )
    )
    proposal_text = response.content[0].text.strip()
    return {"proposal": proposal_text, "prospect": p["name"]}


@app.post("/api/admin/send-prospect-email")
async def send_prospect_email_endpoint(request: Request, username: str = Depends(verify_admin)):
    data = await request.json()
    to = data.get("to", "").strip()
    subject = data.get("subject", "").strip()
    body = data.get("body", "").strip()
    if not to or not subject or not body:
        raise HTTPException(400, "to, subject et body requis")
    if not RESEND_API_KEY and (not SMTP_HOST or not SMTP_USER):
        raise HTTPException(503, "Email non configuré — ajoutez RESEND_API_KEY ou SMTP_HOST/SMTP_USER dans Railway")
    html_body = "<div style=\"font-family:sans-serif;font-size:15px;line-height:1.7;color:#222;max-width:600px;\">" + body.replace("\n", "<br>") + "</div>"
    await send_email(to, subject, html_body)
    # Record that email was sent
    prospect_id = data.get("prospect_id", "").strip()
    if prospect_id:
        now = datetime.now().isoformat()
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE prospect_suggestions SET email_sent_at=?, status='contacted', updated_at=? WHERE id=? AND email_sent_at=''",
                (now, now, prospect_id)
            )
            await db.commit()
    return {"ok": True, "to": to}


@app.post("/api/admin/auto-outreach/toggle")
async def toggle_auto_outreach(username: str = Depends(verify_admin)):
    _auto_outreach["enabled"] = not _auto_outreach["enabled"]
    state = "activé" if _auto_outreach["enabled"] else "désactivé"
    logging.info(f"Auto-outreach {state} par admin")
    # Persist state to DB so it survives server restarts
    val = "1" if _auto_outreach["enabled"] else "0"
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('auto_outreach_enabled', ?)",
            (val,)
        )
        await db.commit()
    return _auto_outreach

@app.get("/api/admin/auto-outreach/status")
async def auto_outreach_status(username: str = Depends(verify_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        c1 = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE status='new' AND email != '' AND (email_sent_at IS NULL OR email_sent_at='')")
        ready = (await c1.fetchone())[0]
        c2 = await db.execute("SELECT COUNT(*) FROM prospect_bank WHERE status='ready'")
        bank = (await c2.fetchone())[0]
    return {
        **_auto_outreach,
        "resend_configured": bool(RESEND_API_KEY),
        "smtp_configured": bool(SMTP_HOST and SMTP_USER),
        "google_places_configured": bool(GOOGLE_PLACES_API_KEY),
        "from_email": FROM_EMAIL,
        "prospects_ready": ready,
        "bank_ready": bank,
    }


@app.post("/api/admin/test-discovery")
async def test_discovery(username: str = Depends(verify_admin)):
    """Lance une découverte test et retourne les résultats bruts."""
    import random as _rand, urllib.request as _ureq3, urllib.parse as _uparse3
    city, industry = _rand.choice(_DISCOVERY_TARGETS)
    results = {"city": city, "industry": industry, "google_places": [], "ddg": [], "error": "", "gp_raw_status": ""}
    try:
        loop = asyncio.get_event_loop()
        if GOOGLE_PLACES_API_KEY:
            # Test brut de l'API pour voir le vrai message d'erreur
            def _test_gp_raw():
                query = f"{industry} {city} Québec"
                payload = json.dumps({"textQuery": query, "languageCode": "fr", "regionCode": "CA", "maxResultCount": 5}).encode()
                req = _ureq3.Request(
                    "https://places.googleapis.com/v1/places:searchText",
                    data=payload,
                    headers={"Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
                             "X-Goog-FieldMask": "places.displayName,places.websiteUri"},
                    method="POST",
                )
                try:
                    with _ureq3.urlopen(req, timeout=10) as r:
                        data = json.loads(r.read())
                    count = len(data.get("places", []))
                    return f"status=OK count={count} query={query}"
                except Exception as e:
                    return f"exception: {e}"
            results["gp_raw_status"] = await loop.run_in_executor(None, _test_gp_raw)
            gp = await loop.run_in_executor(None, _google_places_search_sync, city, industry, 5)
            results["google_places"] = [{"name": r.get("name",""), "url": r.get("url",""), "phone": r.get("phone","")} for r in gp]
        from urllib import parse as _uparse2
        import urllib.request as _ureq2
        ddg_url = "https://html.duckduckgo.com/html/?q=" + _uparse2.quote(f"{industry} {city} Québec contact") + "&kl=ca-fr"
        try:
            req = _ureq2.Request(ddg_url, headers={"User-Agent": "Mozilla/5.0"})
            with _ureq2.urlopen(req, timeout=6) as r:
                body = r.read().decode("utf-8", errors="ignore")
            from bs4 import BeautifulSoup as _BS
            soup = _BS(body, "html.parser")
            ddg_items = []
            for item in soup.select(".result")[:5]:
                t = item.select_one(".result__title a")
                if t:
                    href = t.get("href","")
                    if "uddg=" in href:
                        href = _uparse2.unquote(href.split("uddg=")[-1].split("&")[0])
                    ddg_items.append({"title": t.get_text(strip=True)[:60], "url": href[:80]})
            results["ddg"] = ddg_items
            results["ddg_raw_len"] = len(body)
        except Exception as e:
            results["ddg_error"] = str(e)
    except Exception as e:
        results["error"] = str(e)
    return results


@app.post("/api/admin/debug-batch")
async def debug_batch(username: str = Depends(verify_admin)):
    """Lance UN batch de découverte et retourne les résultats détaillés + erreurs."""
    import traceback as _tb
    report = {"steps": [], "saved": 0, "error": ""}
    try:
        import random as _r2
        city, industry = _r2.choice(_DISCOVERY_TARGETS)
        report["steps"].append(f"1. Cible: {city} / {industry}")

        # Google Places
        loop = asyncio.get_event_loop()
        gp = await loop.run_in_executor(None, _google_places_search_sync, city, industry, 5)
        report["steps"].append(f"2. Google Places: {len(gp)} résultats")
        if not gp:
            report["error"] = "0 résultats Google Places"
            return report

        # Scraping
        biz0 = gp[0]
        website = biz0.get("url", "")
        report["steps"].append(f"3. Test scraping: {website or '(pas de site)'}")
        sc = await loop.run_in_executor(None, _scrape_business_website, website)
        report["steps"].append(f"4. Scraping: email={sc.get('email','')!r} score={sc.get('web_score','?')} err={sc.get('error','')}")

        # Email generation
        b = {"name": biz0.get("name","?"), "website": website, "city": city, "industry": industry,
             "email": sc.get("email",""), "email_quality": sc.get("email_quality","none"),
             "phone": biz0.get("phone","") or sc.get("phone",""),
             "site_text": sc.get("text",""), "web_score": sc.get("web_score",5),
             "web_issues": sc.get("web_issues",[]), "brand_meta": sc.get("brand_meta",{}),
             "research": {"snippets":"","rating":"","review_count":""}}
        try:
            emails = await _generate_prospect_emails_claude(b)
            report["steps"].append(f"5. Claude: skip={emails.get('skip')} need_score={emails.get('need_score','?')} has_email1={bool(emails.get('email1'))}")
        except Exception as e:
            report["steps"].append(f"5. Claude ERREUR: {e}")
            emails = _make_template_email(b)

        if emails.get("skip") or not emails.get("email1"):
            emails = _make_template_email(b)
            report["steps"].append("5b. Fallback template email utilisé")

        # DB save
        try:
            rid = str(uuid.uuid4())
            now = datetime.now().isoformat()
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute("""
                    INSERT OR IGNORE INTO prospect_bank
                    (id, name, website, city, industry, email, email_quality, phone,
                     web_score, web_issues, insights, pain_points, rating, review_count,
                     generated_emails, has_refonte, status, search_key, brand_meta, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, (rid, b["name"], b["website"], b["city"], b["industry"],
                      b["email"], b["email_quality"], b["phone"], b["web_score"],
                      json.dumps(b["web_issues"]), emails.get("insights",""),
                      json.dumps(emails.get("pain_points",[])), b["research"].get("rating",""),
                      b["research"].get("review_count",""), json.dumps(emails),
                      1 if emails.get("email_refonte") else 0,
                      "ready", f"{city}|{industry}",
                      json.dumps(b.get("brand_meta",{})), now, now))
                await db.commit()
                c = await db.execute("SELECT COUNT(*) FROM prospect_bank WHERE status='ready'")
                cnt = (await c.fetchone())[0]
            report["steps"].append(f"6. DB save OK → banque maintenant: {cnt}")
            report["saved"] = 1
        except Exception as e:
            report["steps"].append(f"6. DB ERREUR: {e}\n{_tb.format_exc()[-400:]}")
            report["error"] = str(e)
    except Exception as e:
        report["error"] = str(e)
        report["steps"].append(f"ERREUR GLOBALE: {_tb.format_exc()[-400:]}")
    return report



@app.post("/api/admin/auto-outreach/send-now")
async def outreach_send_now(username: str = Depends(verify_admin)):
    """Force immediate send of up to 3 emails — bypasses the 20-min timer. Returns debug info."""
    if not RESEND_API_KEY and (not SMTP_HOST or not SMTP_USER):
        raise HTTPException(503, "Email non configuré (ni Resend ni SMTP)")
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Check what's available
        c1 = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE status='new'")
        total_new = (await c1.fetchone())[0]
        c2 = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE status='new' AND email != ''")
        with_email = (await c2.fetchone())[0]
        c3 = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE status='new' AND email != '' AND (email_sent_at IS NULL OR email_sent_at = '')")
        not_sent = (await c3.fetchone())[0]
        c4 = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE status='new' AND email != '' AND (email_sent_at IS NULL OR email_sent_at = '') AND generated_emails IS NOT NULL AND generated_emails != '{}'")
        ready = (await c4.fetchone())[0]
        cursor = await db.execute("""
            SELECT * FROM prospect_suggestions
            WHERE status='new' AND email != ''
              AND (email_sent_at IS NULL OR email_sent_at = '')
              AND generated_emails IS NOT NULL AND generated_emails != '{}'
            ORDER BY CASE WHEN email_quality IN ('verified','direct') THEN 0 ELSE 1 END, web_score ASC
            LIMIT 3
        """)
        prospects = [dict(r) for r in await cursor.fetchall()]
    debug = {"total_new": total_new, "with_email": with_email, "not_yet_sent": not_sent, "ready_to_send": ready, "sent": [], "errors": []}
    # If no prospects with generated emails, generate them now
    if not prospects:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT * FROM prospect_suggestions
                WHERE status='new' AND email != ''
                  AND (email_sent_at IS NULL OR email_sent_at = '')
                  AND (generated_emails IS NULL OR generated_emails = '{}')
                LIMIT 5
            """)
            to_generate = [dict(r) for r in await cursor.fetchall()]
        for p in to_generate:
            try:
                biz = {"name": p["name"], "city": p["city"], "industry": p["industry"],
                       "website": p["website"], "email": p["email"],
                       "web_score": p.get("web_score", 5),
                       "web_issues": json.loads(p.get("web_issues") or "[]"),
                       "site_text": "", "research": {"rating": p.get("rating",""), "review_count": p.get("review_count",""), "snippets": p.get("insights","")}}
                emails = await _generate_prospect_emails_claude(biz)
                if emails and emails.get("email1") and not emails.get("skip"):
                    now = datetime.now().isoformat()
                    async with aiosqlite.connect(DB_PATH) as db:
                        await db.execute("UPDATE prospect_suggestions SET generated_emails=?, updated_at=? WHERE id=?",
                                        (json.dumps(emails, ensure_ascii=False), now, p["id"]))
                        await db.commit()
                    prospects.append({**p, "generated_emails": json.dumps(emails)})
                elif emails and emails.get("skip"):
                    debug["errors"].append(f"{p['name']}: Claude skip (score {emails.get('need_score','?')})")
            except Exception as e:
                debug["errors"].append(f"{p['name']}: {str(e)}")
    for p in prospects:
        try:
            emails = json.loads(p.get("generated_emails") or "{}")
            email1 = emails.get("email1", {})
            if not email1.get("subject") or not email1.get("body"):
                debug["errors"].append(f"{p['name']}: email1 vide dans generated_emails")
                continue
            # Anti-doublon: vérifier si cet email a déjà été contacté
            email_addr = p["email"].strip().lower()
            if email_addr in _sent_emails_session:
                debug["errors"].append(f"{p['name']}: doublon ignoré (déjà envoyé cette session)")
                continue
            async with aiosqlite.connect(DB_PATH) as db:
                chk = await db.execute(
                    "SELECT COUNT(*) FROM prospect_suggestions WHERE LOWER(email)=? AND email_sent_at != '' AND email_sent_at IS NOT NULL",
                    (email_addr,)
                )
                if (await chk.fetchone())[0] > 0:
                    debug["errors"].append(f"{p['name']}: déjà contacté — ignoré")
                    continue
            unsubscribe_url = f"https://novalisia.ca/unsubscribe?id={p['id']}"
            _slug2 = _slugify(p.get("name", "entreprise"))
            _preview_url2 = f"https://novalisia.ca/preview/{_slug2}/{p['id']}"
            _body2 = email1["body"].replace("{PROSPECT_ID}", f"{_slug2}/{p['id']}")
            html_body = _build_prospect_email_html(_body2, _preview_url2, unsubscribe_url, p.get("name", ""))
            await send_email(p["email"], email1["subject"], html_body)
            _sent_emails_session.add(email_addr)
            now = datetime.now().isoformat()
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute("UPDATE prospect_suggestions SET email_sent_at=?, status='contacted', updated_at=? WHERE id=? AND (email_sent_at IS NULL OR email_sent_at='')", (now, now, p["id"]))
                await db.commit()
            _auto_outreach["sent_today"] += 1
            _auto_outreach["total_sent"] += 1
            _auto_outreach["last_sent_at"] = now
            _auto_outreach["last_prospect"] = f"{p['name']} ({p['city']})"
            debug["sent"].append(f"{p['name']} → {p['email']}")
        except Exception as e:
            err_msg = str(e)
            debug["errors"].append(f"{p['name']}: {err_msg}")
            logging.error(f"send-now erreur {p.get('name','?')} <{p.get('email','?')}>: {err_msg}")
    debug["resend_from"] = FROM_EMAIL
    debug["smtp_host"] = SMTP_HOST or "non configuré"
    return debug


@app.post("/api/admin/test-email")
async def test_email_send(username: str = Depends(verify_admin)):
    """Teste Resend et SMTP séparément — montre l'erreur exacte de chacun."""
    test_to = ADMIN_EMAIL or os.getenv("SMTP_USER", "") or "novalisproia@gmail.com"
    subject = "✅ Test Novalis"
    body = f"<p>Test envoi — {datetime.now().isoformat()} — FROM: {FROM_EMAIL}</p>"
    results = {}

    # Test Resend seul
    if RESEND_API_KEY:
        def _test_resend():
            import urllib.request, urllib.error
            payload = json.dumps({
                "from": f"{FROM_NAME} <{FROM_EMAIL}>",
                "to": [test_to],
                "subject": subject,
                "html": body,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=payload,
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    return json.loads(resp.read())
            except urllib.error.HTTPError as e:
                raise RuntimeError(f"HTTP {e.code}: {e.read().decode('utf-8','ignore')}") from e
        try:
            r = await asyncio.to_thread(_test_resend)
            results["resend"] = f"✅ OK — id:{r.get('id','?')} — envoyé à {test_to}"
        except Exception as e:
            results["resend"] = f"❌ {str(e)}"
    else:
        results["resend"] = "⚠️ RESEND_API_KEY non configuré"

    # Test SMTP seul
    if SMTP_HOST and SMTP_USER:
        def _test_smtp():
            from email.mime.text import MIMEText
            msg = MIMEText(body, "html", "utf-8")
            msg["Subject"] = subject + " (SMTP)"
            msg["From"] = SMTP_FROM or SMTP_USER
            msg["To"] = test_to
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as s:
                s.starttls()
                s.login(SMTP_USER, SMTP_PASS)
                s.sendmail(SMTP_FROM or SMTP_USER, [test_to], msg.as_string())
        try:
            await asyncio.to_thread(_test_smtp)
            results["smtp"] = f"✅ OK — envoyé à {test_to}"
        except Exception as e:
            results["smtp"] = f"❌ {str(e)}"
    else:
        results["smtp"] = "⚠️ SMTP non configuré"

    summary = " | ".join(f"{k}: {v}" for k, v in results.items())
    ok = any("✅" in v for v in results.values())
    if ok:
        return {"detail": summary}
    raise HTTPException(500, detail=summary)


@app.get("/api/admin/resend-check")
async def resend_check(username: str = Depends(verify_admin)):
    """Test Resend rapidement — retourne la réponse brute en 5s max."""
    import urllib.request, urllib.error
    if not RESEND_API_KEY:
        return {"error": "RESEND_API_KEY non configuré", "key_prefix": "MANQUANT"}
    key_prefix = RESEND_API_KEY[:12] + "..."
    payload = json.dumps({
        "from": f"Novalis IA <{FROM_EMAIL}>",
        "to": [ADMIN_EMAIL or "novalisproia@gmail.com"],
        "subject": "Test Novalis",
        "html": "<p>Test</p>",
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "novalis-mailer/1.0",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
            return {"ok": True, "id": data.get("id"), "key_prefix": key_prefix, "from": FROM_EMAIL}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        return {"ok": False, "http_status": e.code, "error": body, "key_prefix": key_prefix, "from": FROM_EMAIL}
    except Exception as e:
        return {"ok": False, "error": str(e), "key_prefix": key_prefix, "from": FROM_EMAIL}

@app.get("/api/admin/email-pipeline-debug")
async def email_pipeline_debug(username: str = Depends(verify_admin)):
    """Diagnostique complet du pipeline email — montre pourquoi les courriels n'envoient pas."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Counts in suggestions
        c = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE status='new'")
        sugg_new = (await c.fetchone())[0]
        c = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE status='new' AND email != ''")
        sugg_with_email = (await c.fetchone())[0]
        c = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE status='new' AND email != '' AND (email_sent_at IS NULL OR email_sent_at='')")
        sugg_unsent = (await c.fetchone())[0]
        c = await db.execute("SELECT COUNT(*) FROM prospect_suggestions WHERE status='new' AND email != '' AND (email_sent_at IS NULL OR email_sent_at='') AND generated_emails IS NOT NULL AND generated_emails != '{}'")
        sugg_ready = (await c.fetchone())[0]

        # Counts in bank
        c = await db.execute("SELECT COUNT(*) FROM prospect_bank WHERE status='ready'")
        bank_total = (await c.fetchone())[0]
        c = await db.execute("SELECT COUNT(*) FROM prospect_bank WHERE status='ready' AND email != ''")
        bank_with_email = (await c.fetchone())[0]
        try:
            c = await db.execute("SELECT COUNT(*) FROM prospect_bank WHERE status='ready' AND email != '' AND (email_sent_at IS NULL OR email_sent_at='')")
            bank_unsent = (await c.fetchone())[0]
        except Exception:
            bank_unsent = "colonne email_sent_at manquante dans prospect_bank"

        # Sample prospects from bank with email
        try:
            cur = await db.execute("SELECT name, email, web_score, generated_emails FROM prospect_bank WHERE email != '' LIMIT 5")
            bank_samples = []
            for r in await cur.fetchall():
                ge = json.loads(r["generated_emails"] or "{}")
                bank_samples.append({
                    "name": r["name"], "email": r["email"], "web_score": r["web_score"],
                    "has_email1": bool(ge.get("email1", {}).get("subject")),
                    "has_site_preview": bool(ge.get("site_preview")),
                })
        except Exception as e:
            bank_samples = [{"error": str(e)}]

        # Sample prospects from suggestions with email
        try:
            cur = await db.execute("SELECT name, email, web_score, status, email_sent_at, generated_emails FROM prospect_suggestions WHERE email != '' ORDER BY created_at DESC LIMIT 5")
            sugg_samples = []
            for r in await cur.fetchall():
                ge = json.loads(r["generated_emails"] or "{}")
                sugg_samples.append({
                    "name": r["name"], "email": r["email"], "web_score": r["web_score"],
                    "status": r["status"], "email_sent_at": r["email_sent_at"] or "(non envoyé)",
                    "has_email1": bool(ge.get("email1", {}).get("subject")),
                })
        except Exception as e:
            sugg_samples = [{"error": str(e)}]

    return {
        "outreach_state": _auto_outreach,
        "email_providers": {"resend": bool(RESEND_API_KEY), "smtp": bool(SMTP_HOST and SMTP_USER), "from": FROM_EMAIL},
        "suggestions": {"total_new": sugg_new, "with_email": sugg_with_email, "unsent": sugg_unsent, "ready_to_send": sugg_ready},
        "bank": {"total_ready": bank_total, "with_email": bank_with_email, "unsent_with_email": bank_unsent},
        "session_blocked_emails": len(_sent_emails_session),
        "bank_samples_with_email": bank_samples,
        "suggestions_samples_with_email": sugg_samples,
        "diagnosis": (
            "✅ Pipeline OK — les courriels devraient partir" if sugg_ready > 0
            else "⚠ suggestions vides — vérifier bank_samples ci-dessus"
            if bank_with_email == 0
            else "⚠ prospects dans bank mais pas encore copiés vers suggestions — cliquer Refresh"
        ),
    }



async def outreach_force_generate(username: str = Depends(verify_admin)):
    """Force génération template pour tous les prospects bloqués (generated_emails vide). Pas besoin de Claude."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT * FROM prospect_suggestions
            WHERE status='new' AND email != '' AND email IS NOT NULL
              AND (email_sent_at IS NULL OR email_sent_at = '')
              AND (generated_emails IS NULL OR generated_emails = '{}')
            LIMIT 50
        """)
        stuck = [dict(r) for r in await cursor.fetchall()]
    fixed = 0
    skipped = 0
    now = datetime.now().isoformat()
    for p in stuck:
        try:
            biz = {
                "name": p["name"], "city": p["city"], "industry": p["industry"],
                "website": p.get("website", ""), "email": p["email"],
                "web_score": p.get("web_score", 5),
                "web_issues": json.loads(p.get("web_issues") or "[]"),
                "site_text": "", "research": {
                    "rating": p.get("rating", ""), "review_count": p.get("review_count", ""),
                    "snippets": p.get("insights", "")
                }
            }
            emails = _make_template_email(biz)
            async with aiosqlite.connect(DB_PATH) as db:
                await db.execute(
                    "UPDATE prospect_suggestions SET generated_emails=?, updated_at=? WHERE id=?",
                    (json.dumps(emails, ensure_ascii=False), now, p["id"])
                )
                await db.commit()
            fixed += 1
        except Exception as e:
            skipped += 1
            logging.error(f"force-generate error {p.get('name')}: {e}")
    return {"fixed": fixed, "skipped": skipped, "total_stuck": len(stuck)}


@app.get("/unsubscribe", response_class=HTMLResponse)
async def unsubscribe(id: str = ""):
    if id:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE prospect_suggestions SET status='dismissed', updated_at=? WHERE id=?",
                (datetime.now().isoformat(), id)
            )
            await db.commit()
    return HTMLResponse("""<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Désabonnement — Novalis IA</title>
<style>body{font-family:sans-serif;background:#060a12;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.box{text-align:center;padding:48px;max-width:400px;}h1{color:#34d399;margin-bottom:16px;}p{color:#94a3b8;line-height:1.6;}a{color:#38bdf8;}</style></head>
<body><div class="box"><h1>✓ Désabonné</h1><p>Vous ne recevrez plus de courriels de notre part.<br>Merci d'avoir pris le temps de lire.</p>
<p style="margin-top:24px;"><a href="https://novalisia.ca">← novalisia.ca</a></p></div></body></html>""")


# ============================================================
# LIVE DISCOVERY STREAM (SSE)
# ============================================================
@app.get("/api/admin/discovery-stream")
async def discovery_stream(username: str = Depends(verify_admin)):
    """Server-Sent Events — flux live des découvertes PME."""
    import asyncio as _aio
    queue: asyncio.Queue = asyncio.Queue(maxsize=200)
    _discovery_listeners.append(queue)
    # Replay last 50 events immediately on connect
    recent = list(_discovery_events)[:50]
    recent.reverse()

    async def event_generator():
        try:
            # Send cached events first
            for evt in recent:
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
            # Stream live events
            while True:
                try:
                    evt = await asyncio.wait_for(queue.get(), timeout=25)
                    yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            try:
                _discovery_listeners.remove(queue)
            except ValueError:
                pass

    from starlette.responses import StreamingResponse
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


@app.get("/api/admin/discovery-history")
async def discovery_history(username: str = Depends(verify_admin)):
    """Retourne les 100 derniers événements de découverte."""
    return {"events": list(_discovery_events)[:100]}


# ============================================================
# DASHBOARD ADMIN (HTML)
# ============================================================
@app.get("/admin", response_class=HTMLResponse)
async def dashboard(username: str = Depends(verify_admin)):
    """Admin dashboard — plateforme Novalis V3."""
    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <title>Novalis — Platform Admin v{VERSION}</title>
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
        .nav-item{{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;color:#64748b;font-size:1.2rem;background:transparent;border:none;outline:none;padding:0;font-family:inherit;}}
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
        .badge.trial{{background:rgba(251,146,60,0.15);color:#fb923c;}}
        .badge.new{{background:rgba(148,163,184,0.15);color:#94a3b8;}}
        .badge.email1_sent,.badge.email2_sent,.badge.email3_sent{{background:rgba(56,189,248,0.15);color:#38bdf8;}}
        .badge.replied{{background:rgba(168,85,247,0.15);color:#a855f7;}}
        .badge.meeting{{background:rgba(251,191,36,0.15);color:#fbbf24;}}
        .badge.converted{{background:rgba(52,211,153,0.2);color:#34d399;}}
        .badge.not_interested{{background:rgba(239,68,68,0.1);color:#ef4444;}}
        .lead-card{{background:#0f1f2e;border:1px solid #fb923c33;border-radius:12px;padding:14px;margin-bottom:10px;border-left:3px solid #fb923c;}}
        .lead-name{{color:#fb923c;font-weight:600;font-size:1rem;}}
        .lead-meta{{color:#94a3b8;font-size:0.8rem;margin-top:4px;}}
        .lead-msg{{color:#cbd5e1;font-size:0.8rem;margin-top:6px;background:#0a0e17;padding:8px;border-radius:6px;line-height:1.4;}}
        .lead-actions{{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;}}
        .action-btn{{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:6px;font-size:0.75rem;font-weight:600;cursor:pointer;text-decoration:none;border:none;}}
        .btn-email{{background:rgba(56,189,248,0.15);color:#38bdf8;}}
        .btn-wa{{background:rgba(37,211,102,0.15);color:#25D366;}}
        .btn-call{{background:rgba(168,85,247,0.15);color:#a855f7;}}
        .btn-portal{{background:rgba(251,146,60,0.15);color:#fb923c;}}
        .no-leads{{text-align:center;padding:28px;color:#475569;}}
        #pLeads.has-leads{{-webkit-text-fill-color:#fb923c !important;}}
        .btn{{background:#38bdf8;color:#0a0e17;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:0.85rem;}}
        .btn:hover{{background:#34d399;}}
        .btn-sm{{padding:5px 12px;font-size:0.75rem;}}
        input,textarea,select{{background:#0f1f2e;border:1px solid #1e3a5f;border-radius:8px;padding:10px;color:#e2e8f0;width:100%;font-size:0.9rem;margin-bottom:10px;}}
        input:focus,textarea:focus,select:focus{{outline:none;border-color:#38bdf8;}}
        label{{color:#94a3b8;font-size:0.8rem;display:block;margin-bottom:4px;}}
        .form-grid{{display:grid;grid-template-columns:1fr 1fr;gap:12px;}}
        @media(max-width:768px){{.sidebar{{width:56px;}}.main-content{{margin-left:56px;}}.stats-grid{{grid-template-columns:1fr;}}.form-grid{{grid-template-columns:1fr;}}}}
        @keyframes radarPulse{{0%,100%{{box-shadow:0 0 0 0 rgba(52,211,153,0.5);}} 50%{{box-shadow:0 0 0 5px rgba(52,211,153,0);}}}}
        @keyframes radarSlide{{from{{opacity:0;transform:translateY(-6px);}} to{{opacity:1;transform:translateY(0);}}}}
        .carte-tooltip{{background:#0f1a2b!important;border:1px solid #1e3a5f!important;color:#e2e8f0!important;font-size:0.75rem!important;padding:4px 8px!important;}}
        .leaflet-popup-content-wrapper{{background:#1a2332!important;border:1px solid #1e3a5f!important;color:#e2e8f0!important;border-radius:8px!important;}}
        .leaflet-popup-tip{{background:#1a2332!important;}}
    </style>
</head>
<body>
<div id="admin-notice" style="display:none;position:fixed;top:12px;right:16px;z-index:9999;background:#1a2a1a;border:1px solid #34d399;color:#34d399;padding:10px 18px;font-size:0.82rem;border-radius:4px;max-width:500px;word-break:break-all;"></div>
<div class="container">
    <div class="sidebar">
        <div class="nav-logo">N</div>
        <button type="button" class="nav-item active" data-view="dashboard" title="Dashboard" onclick="showView('dashboard')">📊</button>
        <button type="button" class="nav-item" data-view="prospects" title="Prospection" onclick="showView('prospects')">🎯</button>
        <button type="button" class="nav-item" data-view="clients" title="Clients" onclick="showView('clients')">🏢</button>
        <button type="button" class="nav-item" data-view="newclient" title="Nouveau client" onclick="showView('newclient')">➕</button>
        <button type="button" class="nav-item" data-view="rdlog" title="Journal R&D" onclick="showView('rdlog')">🔬</button>
        <button type="button" class="nav-item" data-view="generateur" title="Générateur d'emails" onclick="showView('generateur')" style="font-size:1rem;">📧</button>
        <button type="button" class="nav-item" data-view="decouverte" title="Découverte PMEs" onclick="showView('decouverte')" style="font-size:1rem;">🔍</button>
        <button type="button" class="nav-item" data-view="v_carte" title="Carte en direct" onclick="showView('v_carte')" style="font-size:1rem;">🗺️</button>
        <button type="button" class="nav-item" data-view="v_pipeline" title="Pipeline" onclick="showView('v_pipeline')" style="font-size:1rem;">📊</button>
        <button type="button" class="nav-item" data-view="api" title="API" onclick="showView('api')">🔗</button>
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
                    <div class="stat-card" style="border-color:#fb923c44;cursor:pointer;" onclick="document.getElementById('leadsPanel').scrollIntoView({{behavior:'smooth'}})">
                        <div class="stat-label" style="color:#fb923c;">🔥 Nouveaux leads</div>
                        <div class="stat-value" id="pLeads">0</div>
                        <div style="color:#fb923c66;font-size:0.7rem;margin-top:4px;">7 derniers jours</div>
                    </div>
                    <div class="stat-card"><div class="stat-label">Clients actifs</div><div class="stat-value" id="pClients">0</div></div>
                    <div class="stat-card"><div class="stat-label">Conversations</div><div class="stat-value" id="pConvs">0</div></div>
                    <div class="stat-card"><div class="stat-label">Messages</div><div class="stat-value" id="pMsgs">0</div></div>
                    <div class="stat-card"><div class="stat-label">RDV</div><div class="stat-value" id="pAppts">0</div></div>
                    <div class="stat-card"><div class="stat-label">Aujourd'hui</div><div class="stat-value" id="pToday">0</div></div>
                    <div class="stat-card"><div class="stat-label">MRR</div><div class="stat-value" id="pMrr">0$</div></div>
                </div>
                <!-- EMAIL STATS -->
                <div class="stats-grid" id="emailStatsRow" style="margin-top:0;"></div>
                <!-- LEADS PANEL -->
                <div id="leadsPanel" class="panel" style="border-color:#fb923c33;margin-top:16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                        <h3 style="color:#fb923c;margin:0;">🔥 Nouveaux leads — 7 derniers jours</h3>
                        <button class="btn btn-sm" style="background:rgba(251,146,60,0.15);color:#fb923c;" onclick="loadLeads()">↻ Rafraîchir</button>
                    </div>
                    <div id="leadsList"><div class="no-leads">Chargement...</div></div>
                </div>
            </div>
            <!-- PROSPECTS -->
            <div class="view" id="prospects">
                <h2 style="color:#38bdf8;margin-bottom:4px;">🎯 Prospection — Co-working & PME</h2>
                <p style="color:#64748b;font-size:0.8rem;margin-bottom:16px;">Contacts trouvés dans les espaces co-working de la région · Track des envois d'emails</p>
                <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
                    <button class="btn" onclick="openAddProspect()">➕ Ajouter</button>
                    <label class="btn btn-sm" style="background:#1e3a5f;color:#34d399;cursor:pointer;" title="Importer CSV (Nom,Entreprise,Courriel,Téléphone,Co-working,Secteur,Notes)">
                        ⬆ Importer CSV<input type="file" accept=".csv" style="display:none;" onchange="importProspectsCsv(this)"/>
                    </label>
                    <button class="btn btn-sm" style="background:#1e3a5f;color:#38bdf8;" onclick="window.location.href='/api/v1/prospects/export'">⬇ Exporter CSV</button>
                    <button class="btn btn-sm" style="background:rgba(52,211,153,0.12);color:#34d399;border:1px solid rgba(52,211,153,0.3);" onclick="seedProspects()" id="seedBtn">🌱 Charger prospects initiaux</button>
                    <button class="btn btn-sm" style="background:rgba(201,169,110,0.15);color:#c9a96e;border:1px solid rgba(201,169,110,0.3);" onclick="sendEmail1ToAll()" id="sendAllBtn">📤 Email 1 à tous les nouveaux</button>
                    <select id="pFilterStatus" onchange="loadProspects()" style="background:#0f1f2e;border:1px solid #1e3a5f;color:#e2e8f0;padding:6px 10px;border-radius:6px;font-size:0.8rem;">
                        <option value="">Tous les statuts</option>
                        <option value="new">🆕 Nouveau</option>
                        <option value="email1_sent">📧 Email 1 envoyé</option>
                        <option value="email2_sent">📧 Email 2 envoyé</option>
                        <option value="email3_sent">📧 Email 3 envoyé</option>
                        <option value="replied">💬 A répondu</option>
                        <option value="meeting">📅 Réunion planifiée</option>
                        <option value="converted">✅ Converti</option>
                        <option value="not_interested">❌ Pas intéressé</option>
                    </select>
                </div>
                <div id="prospectList"><div style="color:#94a3b8;text-align:center;padding:20px;">Chargement...</div></div>
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
            <!-- GÉNÉRATEUR D'EMAILS -->
            <div class="view" id="generateur">
                <h2 style="color:#38bdf8;margin-bottom:4px;">✉ Générateur de prospection</h2>
                <p style="color:#64748b;font-size:0.8rem;margin-bottom:20px;">Choisissez une ville + secteur, entrez le nom de la PME — les 3 emails personnalisés sortent en 10 secondes.</p>
                <div class="panel">
                    <h3 style="margin-bottom:14px;">1 — Infos de la PME</h3>
                    <label>Ville</label>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
                        <button class="city-btn" data-city="Montréal" onclick="selectCity('Montréal')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Montréal</button>
                        <button class="city-btn" data-city="Québec" onclick="selectCity('Québec')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Québec</button>
                        <button class="city-btn" data-city="Laval" onclick="selectCity('Laval')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Laval</button>
                        <button class="city-btn" data-city="Longueuil" onclick="selectCity('Longueuil')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Longueuil</button>
                        <button class="city-btn" data-city="Gatineau" onclick="selectCity('Gatineau')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Gatineau</button>
                        <button class="city-btn" data-city="Trois-Rivières" onclick="selectCity('Trois-Rivières')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Trois-Rivières</button>
                        <button class="city-btn" data-city="Saguenay" onclick="selectCity('Saguenay')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Saguenay</button>
                        <button class="city-btn" data-city="Sherbrooke" onclick="selectCity('Sherbrooke')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Sherbrooke</button>
                        <button class="city-btn" data-city="Drummondville" onclick="selectCity('Drummondville')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Drummondville</button>
                        <button class="city-btn" data-city="Saint-Jérôme" onclick="selectCity('Saint-Jérôme')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Saint-Jérôme</button>
                        <button class="city-btn" data-city="Granby" onclick="selectCity('Granby')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Granby</button>
                        <button class="city-btn" data-city="Rimouski" onclick="selectCity('Rimouski')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Rimouski</button>
                        <button class="city-btn" data-city="Victoriaville" onclick="selectCity('Victoriaville')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Victoriaville</button>
                        <button class="city-btn" data-city="Rouyn-Noranda" onclick="selectCity('Rouyn-Noranda')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Rouyn-Noranda</button>
                        <button class="city-btn" data-city="Saint-Hyacinthe" onclick="selectCity('Saint-Hyacinthe')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Saint-Hyacinthe</button>
                        <button class="city-btn" data-city="Brossard" onclick="selectCity('Brossard')" style="background:rgba(56,189,248,0.08);border:1px solid #1e3a5f;color:#64748b;border-radius:6px;padding:4px 12px;font-size:0.78rem;cursor:pointer;">Brossard</button>
                    </div>
                    <input id="gen_city" placeholder="Ou tapez une ville personnalisée…" oninput="clearCityBtns()" style="margin-bottom:16px;"/>
                    <div class="form-grid">
                        <div><label>Secteur *</label>
                            <select id="gen_industry">
                                <option value="">— Choisir —</option>
                                <option value="Salon / Spa">Salon / Spa</option>
                                <option value="Garage / Auto">Garage / Auto</option>
                                <option value="Clinique / Santé">Clinique / Santé</option>
                                <option value="Clinique dentaire">Clinique dentaire</option>
                                <option value="Immobilier">Immobilier</option>
                                <option value="Cabinet comptable / Juridique">Cabinet comptable / Juridique</option>
                                <option value="Restaurant / Traiteur">Restaurant / Traiteur</option>
                                <option value="Pharmacie">Pharmacie</option>
                                <option value="Commerce / Boutique">Commerce / Boutique</option>
                                <option value="Entrepreneur / Construction">Entrepreneur / Construction</option>
                                <option value="Marketing / Design">Marketing / Design</option>
                                <option value="Formation / Coaching">Formation / Coaching</option>
                            </select>
                        </div>
                        <div><label>Nom de l'entreprise *</label><input id="gen_biz" placeholder="ex: Salon Beauté Plus"/></div>
                        <div><label>Nom du contact</label><input id="gen_name" placeholder="ex: Sophie Tremblay"/></div>
                        <div><label>Courriel</label><input id="gen_email_addr" type="email" placeholder="ex: info@salonbeaute.ca"/></div>
                        <div><label>Téléphone</label><input id="gen_phone" placeholder="ex: 514-555-0123"/></div>
                        <div><label>Notes (détails spécifiques)</label><input id="gen_notes" placeholder="ex: 4.8★ Google, 15 ans en affaires"/></div>
                    </div>
                    <button class="btn" onclick="generateEmails()" style="margin-top:4px;">⚡ Générer les 3 emails</button>
                </div>
                <div id="gen_preview" style="display:none;margin-top:16px;">
                    <div class="panel">
                        <h3 style="margin-bottom:12px;">2 — Emails générés</h3>
                        <div style="display:flex;gap:6px;margin-bottom:14px;">
                            <button id="tab_e1" class="btn btn-sm" onclick="showGenTab(1)" style="background:rgba(56,189,248,0.2);color:#38bdf8;">📧 Email 1 — Accroche</button>
                            <button id="tab_e2" class="btn btn-sm" onclick="showGenTab(2)" style="background:#1e3a5f;color:#64748b;">📧 Email 2 — Relance</button>
                            <button id="tab_e3" class="btn btn-sm" onclick="showGenTab(3)" style="background:#1e3a5f;color:#64748b;">📧 Email 3 — Final</button>
                        </div>
                        <textarea id="gen_email_content" rows="20" style="background:#0f1f2e;border:1px solid #1e3a5f;border-radius:8px;padding:12px;color:#e2e8f0;width:100%;font-size:0.82rem;font-family:monospace;line-height:1.6;resize:vertical;margin-bottom:0;"></textarea>
                        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center;">
                            <button class="btn" onclick="copyGenEmail()">📋 Copier</button>
                            <button class="btn" style="background:#34d399;color:#0a0e17;" onclick="saveGenProspect()">💾 Enregistrer prospect</button>
                            <span id="gen_saved_notice" style="color:#34d399;font-size:0.8rem;display:none;">✅ Enregistré dans Prospection !</span>
                        </div>
                    </div>
                </div>
            </div>
            <!-- DÉCOUVERTE DE PMEs -->
            <div class="view" id="decouverte">
                <div id="outreach_panel" style="background:#0f1a2b;border:1px solid #1e3a5f;border-radius:12px;padding:20px 24px;margin-bottom:20px;"></div>
                <div style="margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                <button onclick="testDiscovery(this)" style="background:#0f2d4a;color:#38bdf8;border:1px solid #1e3a5f;border-radius:8px;padding:8px 18px;cursor:pointer;font-size:0.85rem;font-weight:600;">🧪 Tester Google Places</button>
                <button onclick="debugBatch(this)" style="background:#1a1040;color:#c084fc;border:1px solid #4c1d95;border-radius:8px;padding:8px 18px;cursor:pointer;font-size:0.85rem;font-weight:600;">🔬 Diagnostic complet</button>
                <span id="disc_test_result" style="font-size:0.82rem;color:#94a3b8;"></span></div>
                <h2 style="color:#38bdf8;margin-bottom:4px;">🔍 Découverte automatique de PMEs</h2>
                <p style="color:#64748b;font-size:0.8rem;margin-bottom:16px;">Novalis cherche automatiquement des PMEs québécoises qui ont besoin de vous — sites désuets, mauvais avis, opportunités IA. Cliquez "Contacté" ou "Ignorer" pour chaque suggestion, puis Refresh pour en obtenir de nouvelles.</p>

                <!-- RADAR EN DIRECT -->
                <div style="background:#060d1a;border:1px solid #1e3a5f;border-radius:14px;margin-bottom:20px;overflow:hidden;">
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #1e3a5f;background:#0a1628;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span id="radar_dot" style="width:9px;height:9px;border-radius:50%;background:#64748b;display:inline-block;transition:background 0.3s;"></span>
                            <span style="color:#94a3b8;font-size:0.82rem;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Radar en direct</span>
                            <span id="radar_status" style="color:#475569;font-size:0.75rem;">— connexion...</span>
                        </div>
                        <button onclick="clearRadar()" style="background:transparent;border:1px solid #1e3a5f;color:#475569;border-radius:6px;padding:3px 10px;font-size:0.72rem;cursor:pointer;">Effacer</button>
                    </div>
                    <div id="radar_feed" style="height:280px;overflow-y:auto;padding:8px 0;font-family:monospace;font-size:0.78rem;display:flex;flex-direction:column-reverse;">
                        <div style="color:#334155;padding:8px 16px;text-align:center;">En attente de la prochaine découverte...</div>
                    </div>
                </div>
                <div class="panel" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
                    <div id="sugg_stats" style="color:#94a3b8;font-size:0.85rem;">Chargement des suggestions...</div>
                    <button class="btn" onclick="refreshSuggestions()" id="sugg_refresh_btn" style="white-space:nowrap;">🔄 Refresh — nouvelles PMEs</button>
                    <button id="mass_send_btn" class="btn" style="background:#7c3aed;padding:8px 16px;" onclick="sendEmailToAll()">📤 Envoyer à tous</button>
                </div>
                <div id="sugg_loading" style="display:none;color:#94a3b8;font-size:0.85rem;padding:16px;background:#0f1f2e;border-radius:8px;margin-bottom:12px;">⏳ Recherche de nouvelles PMEs à travers le Québec... (60-120 secondes)</div>
                <div id="sugg_results" style="margin-top:8px;"></div>
            </div>
            <!-- CARTE EN DIRECT -->
            <div class="view" id="v_carte">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
                    <div>
                        <h2 style="color:#38bdf8;margin-bottom:4px;">🗺️ Carte en direct — Prospection Québec</h2>
                        <p style="color:#64748b;font-size:0.8rem;margin:0;">Visualisation en temps réel des recherches de PMEs à travers le Québec.</p>
                    </div>
                    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                        <span id="carte_dot" style="width:9px;height:9px;border-radius:50%;background:#64748b;display:inline-block;"></span>
                        <span id="carte_status" style="color:#475569;font-size:0.78rem;">—</span>
                        <button onclick="clearCarteMarkers()" style="background:transparent;border:1px solid #1e3a5f;color:#475569;border-radius:6px;padding:4px 12px;font-size:0.75rem;cursor:pointer;">Effacer pins</button>
                    </div>
                </div>
                <!-- Stats row -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px;">
                    <div style="background:#1a2332;border:1px solid #1e3a5f;border-radius:10px;padding:12px 16px;">
                        <div style="color:#64748b;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.5px;">Scans</div>
                        <div id="cs_searching" style="font-size:1.6rem;font-weight:800;color:#38bdf8;">0</div>
                    </div>
                    <div style="background:#1a2332;border:1px solid #1e3a5f;border-radius:10px;padding:12px 16px;">
                        <div style="color:#64748b;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.5px;">Sites trouvés</div>
                        <div id="cs_found" style="font-size:1.6rem;font-weight:800;color:#a78bfa;">0</div>
                    </div>
                    <div style="background:#1a2332;border:1px solid #1e3a5f;border-radius:10px;padding:12px 16px;">
                        <div style="color:#64748b;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.5px;">Analysées</div>
                        <div id="cs_scraped" style="font-size:1.6rem;font-weight:800;color:#fbbf24;">0</div>
                    </div>
                    <div style="background:#1a2332;border:1px solid #1e3a5f;border-radius:10px;padding:12px 16px;">
                        <div style="color:#64748b;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.5px;">Ajoutées</div>
                        <div id="cs_saved" style="font-size:1.6rem;font-weight:800;color:#34d399;">0</div>
                    </div>
                    <div style="background:#1a2332;border:1px solid #1e3a5f;border-radius:10px;padding:12px 16px;">
                        <div style="color:#64748b;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.5px;">Avec email</div>
                        <div id="cs_email" style="font-size:1.6rem;font-weight:800;color:#fb923c;">0</div>
                    </div>
                </div>
                <!-- Map + side panel -->
                <div style="display:grid;grid-template-columns:1fr 340px;gap:16px;align-items:start;">
                    <!-- Leaflet map -->
                    <div style="background:#0f1a2b;border:1px solid #1e3a5f;border-radius:12px;overflow:hidden;">
                        <div id="qc_map" style="height:480px;width:100%;"></div>
                    </div>
                    <!-- Side panel: PME analysis cards -->
                    <div style="background:#0f1a2b;border:1px solid #1e3a5f;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;max-height:496px;">
                        <div style="padding:12px 16px;border-bottom:1px solid #1e3a5f;background:#0a1628;font-size:0.8rem;font-weight:700;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase;">PMEs récentes</div>
                        <div id="pme_cards" style="flex:1;overflow-y:auto;padding:8px;">
                            <div style="color:#334155;text-align:center;padding:24px;font-size:0.8rem;">En attente de découvertes...</div>
                        </div>
                    </div>
                </div>
            </div>
            <!-- PIPELINE / KANBAN -->
            <div class="view" id="v_pipeline">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
                    <div>
                        <h2 style="color:#38bdf8;margin-bottom:4px;">📊 Pipeline commercial</h2>
                        <p style="color:#64748b;font-size:0.8rem;margin:0;">Vue kanban des PMEs par étape — de la découverte au client.</p>
                    </div>
                    <button class="btn" onclick="loadPipeline()">↻ Rafraîchir</button>
                </div>
                <div id="pipeline_grid" style="display:flex;gap:14px;overflow-x:auto;padding-bottom:8px;">
                    <div style="color:#94a3b8;padding:32px;">Chargement...</div>
                </div>
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
<script src="/admin.js?v={VERSION}"></script>

<!-- ADD PROSPECT MODAL -->
<div id="addProspectModal" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.75);align-items:center;justify-content:center;padding:24px;overflow-y:auto;">
  <div style="background:#1a2332;border:1px solid #1e3a5f;border-radius:16px;padding:28px;max-width:560px;width:100%;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h3 style="color:#38bdf8;margin:0;">🎯 Ajouter un prospect</h3>
      <button onclick="closeAddProspect()" style="background:transparent;border:none;color:#94a3b8;font-size:2rem;cursor:pointer;line-height:1;">×</button>
    </div>
    <div class="form-grid">
      <div><label>Prénom / Nom *</label><input id="ap_name" placeholder="Marie Tremblay"/></div>
      <div><label>Entreprise</label><input id="ap_biz" placeholder="Salon Éclat"/></div>
      <div><label>Courriel *</label><input id="ap_email" type="email" placeholder="marie@salon.ca"/></div>
      <div><label>Téléphone</label><input id="ap_phone" placeholder="+1 819 555-0000"/></div>
      <div><label>Espace co-working</label><input id="ap_cw" placeholder="ex: Bureau Nomade Sherbrooke"/></div>
      <div><label>Secteur</label>
        <select id="ap_industry" style="background:#0f1f2e;border:1px solid #1e3a5f;border-radius:8px;padding:10px;color:#e2e8f0;width:100%;font-size:0.9rem;margin-bottom:10px;">
          <option value="">— Choisir —</option>
          <option>Clinique / Santé</option><option>Salon / Spa</option><option>Resto / Café</option>
          <option>Immobilier</option><option>Cabinet comptable / Juridique</option>
          <option>Commerce de détail</option><option>Construction / Rénovation</option>
          <option>Marketing / Design</option><option>Formation / Coaching</option><option>Autre</option>
        </select>
      </div>
    </div>
    <label>Notes</label><textarea id="ap_notes" rows="2" placeholder="Ex: rencontré au Bureau Nomade, cherche à automatiser sa prise de RDV"></textarea>
    <button class="btn" onclick="saveProspect()">Enregistrer le prospect</button>
  </div>
</div>

<!-- EMAIL TEMPLATE MODAL -->
<div id="emailTplModal" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.80);align-items:center;justify-content:center;padding:24px;overflow-y:auto;">
  <div style="background:#1a2332;border:1px solid #1e3a5f;border-radius:16px;padding:28px;max-width:680px;width:100%;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 id="emailTplTitle" style="color:#38bdf8;margin:0;font-size:1rem;"></h3>
      <button onclick="document.getElementById('emailTplModal').style.display='none'" style="background:transparent;border:none;color:#94a3b8;font-size:2rem;cursor:pointer;line-height:1;">×</button>
    </div>
    <input type="hidden" id="emailTplId"/><input type="hidden" id="emailTplNum"/>
    <p style="color:#64748b;font-size:0.78rem;margin-bottom:10px;">Modifiez si nécessaire, puis copiez et envoyez depuis novalisproia@gmail.com</p>
    <textarea id="emailTplContent" rows="18" style="background:#0f1f2e;border:1px solid #1e3a5f;border-radius:8px;padding:12px;color:#e2e8f0;width:100%;font-size:0.82rem;font-family:monospace;line-height:1.6;margin-bottom:12px;resize:vertical;"></textarea>
    <div style="display:flex;gap:8px;">
      <button id="copyTplBtn" class="btn" onclick="copyEmailTpl()">📋 Copier</button>
      <button class="btn" style="background:#34d399;color:#0a0e17;" onclick="markEmailSent()">✅ Marquer comme envoyé</button>
    </div>
    <p style="color:#475569;font-size:0.72rem;margin-top:10px;">💡 Cliquez "Marquer comme envoyé" après avoir envoyé l'email — le statut se met à jour automatiquement.</p>
  </div>
</div>
<script>
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

<!-- PROPOSAL MODAL -->
<div id="proposalModal" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.82);align-items:center;justify-content:center;padding:24px;overflow-y:auto;">
    <div style="background:#1a2332;border:1px solid #1e3a5f;border-radius:16px;padding:28px;max-width:680px;width:100%;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="color:#0d9488;margin:0;">📄 Proposition — <span id="proposalModalName"></span></h3>
            <button onclick="document.getElementById('proposalModal').style.display='none'" style="background:transparent;border:none;color:#94a3b8;font-size:2rem;cursor:pointer;line-height:1;">×</button>
        </div>
        <p style="color:#64748b;font-size:0.78rem;margin-bottom:10px;">Proposition commerciale générée par IA — modifiez si nécessaire, puis copiez.</p>
        <textarea id="proposalContent" rows="20" style="background:#0f1f2e;border:1px solid #1e3a5f;border-radius:8px;padding:12px;color:#e2e8f0;width:100%;font-size:0.82rem;font-family:monospace;line-height:1.6;resize:vertical;margin-bottom:12px;"></textarea>
        <div style="display:flex;gap:8px;">
            <button id="copyProposalBtn" class="btn" onclick="copyProposal()">📋 Copier</button>
            <button class="btn" style="background:#334155;color:#94a3b8;" onclick="document.getElementById('proposalModal').style.display='none'">Fermer</button>
        </div>
    </div>
</div>

<!-- DISCOVERY EMAIL MODAL -->
<div id="discEmailModal" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.82);align-items:center;justify-content:center;padding:24px;">
    <div style="background:#1a2332;border:1px solid #1e3a5f;border-radius:16px;padding:28px;max-width:640px;width:100%;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="color:#38bdf8;margin:0;">📨 Emails — <span id="disc_em_name"></span></h3>
            <button onclick="document.getElementById('discEmailModal').style.display='none'" style="background:transparent;border:none;color:#94a3b8;font-size:2rem;cursor:pointer;line-height:1;">×</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:16px;">
            <button id="disc_tab_1" onclick="switchDiscTab(1)" style="background:#0ea5e9;border:none;color:white;padding:6px 18px;border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:600;">Email 1</button>
            <button id="disc_tab_2" onclick="switchDiscTab(2)" style="background:#1e3a5f;border:none;color:#94a3b8;padding:6px 18px;border-radius:8px;cursor:pointer;font-size:0.85rem;">Email 2</button>
            <button id="disc_tab_3" onclick="switchDiscTab(3)" style="background:#1e3a5f;border:none;color:#94a3b8;padding:6px 18px;border-radius:8px;cursor:pointer;font-size:0.85rem;">Email 3</button>
            <button id="disc_tab_refonte" onclick="switchDiscTab('refonte')" style="display:none;background:#1e3a5f;border:none;color:#94a3b8;padding:6px 18px;border-radius:8px;cursor:pointer;font-size:0.85rem;">🖥️ Refonte</button>
        </div>
        <label>Objet</label>
        <input id="disc_em_subj" style="margin-bottom:12px;"/>
        <label>Corps du courriel</label>
        <textarea id="disc_em_body" rows="12" style="margin-bottom:16px;font-family:inherit;font-size:0.85rem;line-height:1.6;white-space:pre-wrap;"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="disc_send_modal_btn" class="btn" style="background:#7c3aed;" onclick="sendDiscEmailFromModal()">📤 Envoyer</button>
            <button class="btn" onclick="copyDiscEmail()">📋 Copier</button>
            <button class="btn" style="background:#16a34a;" onclick="saveDiscProspect(discEmailIdx)">💾 Sauvegarder PME</button>
            <button class="btn" style="background:#334155;color:#94a3b8;" onclick="document.getElementById('discEmailModal').style.display='none'">Fermer</button>
        </div>
    </div>
</div>
</body>
</html>"""
    return HTMLResponse(content=html, headers={
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
    })


@app.get("/admin.js")
async def admin_js_endpoint():
    """Serve admin panel JavaScript as external file (bypasses CSP inline script restrictions)."""
    js = _ADMIN_JS_RAW.lstrip('\n').replace('{{', '{').replace('}}', '}').replace('{VERSION}', VERSION)
    from fastapi.responses import Response as FastAPIResponse
    return FastAPIResponse(content=js, media_type="application/javascript", headers={
        "Cache-Control": "no-cache, no-store, must-revalidate",
    })


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
            _wh_url = wh["url"]
            _wh_headers = {"Content-Type": "application/json", "X-Novalis-Signature": sig}
            await asyncio.to_thread(
                http_requests.post, _wh_url, data=body, headers=_wh_headers, timeout=5
            )
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
        response = await asyncio.to_thread(
            claude_client.messages.create,
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
@limiter.limit("10/minute")
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
            "Keep a relaxed yet professional tone — no slang. "
            "If asked about pricing: Starter $497/mo, Pro $1,497/mo, Enterprise custom. "
            "If asked about results: first ROI in 22-30 days, -40% to -80% customer service costs. "
            "Encourage them to book a free consultation via the contact form."
        )
    else:
        system_text = (
            "Tu es l'assistant démo de Novalis IA — une IA concise et experte pour les PME québécoises. "
            "Réponds en 2-3 phrases max, en français québécois. Ton décontracté mais professionnel. "
            "Évite tout argot (yo, tsé, genre, faque). Utilise le vouvoiement. Sois chaleureux et précis. "
            "Prix: Starter 497$/mois, Pro 1 497$/mois, Entreprise sur mesure. "
            "Résultats: premier ROI en 22-30 jours, -40% à -80% coûts service client. "
            "Encourage la prise de contact via le formulaire."
        )

    try:
        resp = await asyncio.to_thread(
            claude_client.messages.create,
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

    import json as _json_mod
    bname  = _json_mod.dumps(c["business_name"])
    bphone = _json_mod.dumps(c.get("owner_phone") or "")
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

document.getElementById('business_name').value = {bname};
document.getElementById('owner_phone').value = {bphone};
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
        f'<button onclick="openPlanModal()" style="background:#A86844;color:#EDE8DF;border:0.5px solid #C4895A;padding:8px 20px;font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;cursor:pointer;">Voir les plans →</button>'
        f'</div>'
    ) if c.get("plan") == "trial" else ""

    portal_html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Portail — {html_module.escape(c['business_name'])} | Novalis</title>
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
        .toast{{position:fixed;bottom:24px;right:24px;z-index:9999;background:#1d2733;border:0.5px solid var(--b);padding:13px 18px;font-size:0.82rem;color:var(--pearl);border-radius:4px;opacity:0;transform:translateY(10px);transition:opacity 0.22s,transform 0.22s;max-width:360px;line-height:1.5;pointer-events:none;}}
        .toast.show{{opacity:1;transform:translateY(0);}}
        .toast.tok{{border-left:3px solid #4ac36f;}}.toast.terr{{border-left:3px solid #f87171;}}
        .hamburger{{display:none;position:fixed;top:12px;left:12px;z-index:2000;background:rgba(29,39,51,0.97);border:0.5px solid var(--b);color:var(--pearl);width:40px;height:40px;font-size:1.2rem;cursor:pointer;align-items:center;justify-content:center;padding:0;}}
        .sb-overlay{{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1500;}}
        @media(max-width:900px){{
          .hamburger{{display:flex;}}
          .sidebar{{transform:translateX(-100%);position:fixed;height:100vh;width:260px;z-index:1600;transition:transform 0.25s ease;}}
          .sidebar.open{{transform:translateX(0);}}
          .sb-overlay.open{{display:block;}}
          .main{{margin-left:0;padding:52px 16px 16px;max-width:100%;}}
          .row2{{grid-template-columns:1fr;}}
        }}
    </style>
</head>
<body>
<div class="toast" id="toast"></div>
<button class="hamburger" id="hbg" aria-label="Menu" onclick="toggleSidebar()">☰</button>
<div class="sb-overlay" id="sb-overlay" onclick="closeSidebar()"></div>
<div class="layout">
  <div class="sidebar" id="sidebar">
    <div class="sb-logo">
      <div class="sb-brand">Novalis IA</div>
      <div class="sb-biz">{html_module.escape(c['business_name'])}</div>
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

      <!-- Bienvenue — visible seulement quand pas encore de données -->
      <div id="welcomeBanner" style="display:none;margin-bottom:20px;">
        <div class="card" style="border-left:3px solid var(--copper);background:rgba(168,104,68,0.04);">
          <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">
            <div style="flex:1;min-width:220px;">
              <div style="font-size:0.65rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--copper);margin-bottom:8px;">Bienvenue sur Novalis IA</div>
              <div class="card-title" style="margin-bottom:6px;">Votre assistant IA est prêt — 3 étapes pour démarrer</div>
              <p style="font-size:0.82rem;color:var(--dim);line-height:1.6;margin:0;">Dès que votre premier client interagit avec votre agent, vos statistiques apparaîtront ici en temps réel.</p>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:18px;">
            <div style="padding:14px;background:rgba(29,39,51,0.6);border:0.5px solid rgba(237,232,223,0.08);">
              <div style="font-size:0.65rem;color:var(--copper);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">01 — Configurer</div>
              <div style="font-size:0.82rem;color:var(--pearl);margin-bottom:4px;">Complétez votre profil</div>
              <div style="font-size:0.75rem;color:var(--dim);">Horaires, services, FAQ — l'IA apprend votre business.</div>
              <button class="btn btn-sm" style="margin-top:10px;" onclick="nav(document.querySelector('[onclick*=settings]'),'settings')">Mon compte →</button>
            </div>
            <div style="padding:14px;background:rgba(29,39,51,0.6);border:0.5px solid rgba(237,232,223,0.08);">
              <div style="font-size:0.65rem;color:var(--copper);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">02 — Enrichir</div>
              <div style="font-size:0.82rem;color:var(--pearl);margin-bottom:4px;">Base de connaissances</div>
              <div style="font-size:0.75rem;color:var(--dim);">Ajoutez vos documents, catalogue et politiques.</div>
              <button class="btn btn-sm" style="margin-top:10px;" onclick="nav(document.querySelector('[onclick*=knowledge]'),'knowledge')">Ajouter →</button>
            </div>
            <div style="padding:14px;background:rgba(29,39,51,0.6);border:0.5px solid rgba(237,232,223,0.08);">
              <div style="font-size:0.65rem;color:var(--copper);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">03 — Lancer</div>
              <div style="font-size:0.82rem;color:var(--pearl);margin-bottom:4px;">Première interaction</div>
              <div style="font-size:0.75rem;color:var(--dim);">Envoyez un SMS à votre numéro Novalis pour tester votre agent.</div>
              <button class="btn btn-sm" style="margin-top:10px;" onclick="nav(document.querySelector('[onclick*=conversations]'),'conversations')">Conversations →</button>
            </div>
          </div>
        </div>
      </div>

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
            <input id="s_bname" class="fi" value="{html_module.escape(c['business_name'])}" />
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
  else {{
    const r2 = await fetch('/api/v1/plan-request', {{method:'POST',headers:{{'X-API-Key':API_KEY,'Content-Type':'application/json'}},body:JSON.stringify({{plan}})}});
    if(r2.ok) showToast('✅ Demande reçue — l\'équipe Novalis vous contacte dans les 24h pour finaliser votre plan '+plan+'.', false);
    else showToast('Demande envoyée — contactez novalisproia@gmail.com pour finaliser.', false);
  }}
}}
function esc(s){{
  if(s==null)return'';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}}
var _tt=null;
function showToast(msg,isErr){{
  var t=document.getElementById('toast');
  if(!t)return;
  clearTimeout(_tt);
  t.textContent=msg;
  t.className='toast '+(isErr?'terr':'tok');
  requestAnimationFrame(function(){{t.classList.add('show');}});
  _tt=setTimeout(function(){{t.classList.remove('show');}},4200);
}}
function toggleSidebar(){{
  var s=document.getElementById('sidebar');
  var o=document.getElementById('sb-overlay');
  s.classList.toggle('open');o.classList.toggle('open');
}}
function closeSidebar(){{
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sb-overlay').classList.remove('open');
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
  if(window.innerWidth<=900) closeSidebar();
}}

function mkChart(id, cfg) {{
  if(charts[id] && typeof charts[id].destroy === 'function') {{ try{{charts[id].destroy();}}catch(_){{}} }}
  charts[id] = null;
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

  // Écran de bienvenue pour les nouveaux clients sans données
  const isNew = !s.total_interactions || s.total_interactions === 0;
  const welcomeBanner = document.getElementById('welcomeBanner');
  if (welcomeBanner) welcomeBanner.style.display = isNew ? 'block' : 'none';

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
        <div><span style="font-size:0.85rem;font-weight:500;">${{esc(e.title)}}</span> <span class="badge bc" style="margin-left:6px;">${{esc(tl[e.kb_type]||e.kb_type)}}</span></div>
        <button class="btn btn-danger btn-sm" onclick="deleteKbEntry('${{esc(e.id)}}')">×</button>
      </div>
      <div style="color:var(--dim);font-size:0.78rem;margin-top:6px;">${{esc(e.content.slice(0,120))}}${{e.content.length>120?'…':''}}</div>
    </div>`).join('') : '<div class="empty">Aucune entrée — ajoutez votre FAQ pour que l\'IA soit précise.</div>';
}}
async function addKbEntry() {{
  const data={{title:document.getElementById('kb_title').value,content:document.getElementById('kb_content').value,kb_type:document.getElementById('kb_type').value}};
  if(!data.title||!data.content){{showToast('Titre et contenu requis',true);return;}}
  const r=await fetch('/api/v1/me/knowledge-base',{{method:'POST',headers:{{...H,'Content-Type':'application/json'}},body:JSON.stringify(data)}});
  if(r.ok){{document.getElementById('kb_title').value='';document.getElementById('kb_content').value='';showToast('✓ Entrée ajoutée.',false);loadKnowledgeBase();}}
  else{{showToast((await r.json()).detail||'Erreur',true);}}
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
        <div><span style="font-weight:500;font-size:0.85rem;">${{esc(c.name)}}</span> <span class="badge bd" style="margin-left:6px;">${{esc(c.channel)}}</span> <span class="badge ${{sb[c.status]||'bd'}}" style="margin-left:4px;">${{esc(sl[c.status]||c.status)}}</span></div>
        ${{c.status==='draft'?`<button class="btn btn-sm" onclick="sendCampaign('${{c.id}}')">▶ Envoyer</button>`:''}}
      </div>
      <div style="color:var(--dim);font-size:0.75rem;margin-top:6px;">${{c.message.slice(0,80)}}… · ${{c.sent_count}} envoyés</div>
    </div>`).join('') : '<div class="empty">Aucune campagne.</div>';
}}
async function createCampaign(){{
  const contacts=document.getElementById('camp_contacts').value.split('\\n').map(s=>s.trim()).filter(Boolean);
  const data={{name:document.getElementById('camp_name').value,message:document.getElementById('camp_message').value,channel:document.getElementById('camp_channel').value,contacts}};
  if(!data.name||!data.message){{showToast('Nom et message requis',true);return;}}
  const r=await fetch('/api/v1/me/campaigns',{{method:'POST',headers:{{...H,'Content-Type':'application/json'}},body:JSON.stringify(data)}});
  const d=await r.json();
  if(r.ok){{showToast('✓ Campagne créée pour '+d.contacts_count+' contacts.',false);loadCampaigns();}}
  else{{showToast(d.detail||'Erreur',true);}}
}}
async function sendCampaign(id){{
  if(!confirm('Envoyer maintenant ?'))return;
  const r=await fetch('/api/v1/me/campaigns/'+id+'/send',{{method:'POST',headers:H}});
  const d=await r.json();
  showToast(d.message||'Envoi lancé',!r.ok);loadCampaigns();
}}

async function loadWebhooks(){{
  const whs=await fetch('/api/v1/me/webhooks',{{headers:H}}).then(r=>r.json()).catch(()=>[]);
  document.getElementById('whList').innerHTML=whs.length?whs.map(w=>`
    <div style="padding:12px 0;border-bottom:0.5px solid rgba(237,232,223,0.06);">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div style="word-break:break-all;font-size:0.8rem;color:var(--cu);">${{esc(w.url)}}</div>
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
  else{{showToast(d.detail||'Erreur',true);}}
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

<!-- PLAN PICKER MODAL -->
<div id="planModal" style="display:none;position:fixed;inset:0;z-index:9000;background:rgba(9,12,15,0.9);backdrop-filter:blur(6px);align-items:center;justify-content:center;padding:24px;">
  <div style="background:#0f1a24;border:0.5px solid rgba(168,104,68,0.35);max-width:820px;width:100%;max-height:90vh;overflow-y:auto;position:relative;">
    <div style="position:absolute;top:0;left:0;right:0;height:1.5px;background:linear-gradient(90deg,transparent,#A86844,transparent);"></div>
    <div style="padding:32px 28px 8px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">
        <div>
          <p style="margin:0 0 4px;font-size:0.65rem;letter-spacing:0.2em;text-transform:uppercase;color:#A86844;">Votre essai se termine</p>
          <h2 style="margin:0;font-size:1.6rem;font-weight:400;font-style:italic;color:#EDE8DF;">Choisissez votre plan</h2>
        </div>
        <button onclick="closePlanModal()" style="background:transparent;border:none;color:#4A5260;font-size:1.8rem;cursor:pointer;line-height:1;padding:0 4px;margin-top:-4px;">×</button>
      </div>
      <p style="margin:4px 0 24px;color:#4A5260;font-size:0.85rem;">Aucun engagement · Annulable en tout temps · Prix en CAD</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1px;background:rgba(168,104,68,0.1);">
      <!-- Starter -->
      <div style="background:#090C0F;padding:28px;display:flex;flex-direction:column;">
        <p style="margin:0 0 4px;font-size:0.6rem;letter-spacing:0.2em;text-transform:uppercase;color:#4A5260;">Starter</p>
        <p style="margin:0 0 2px;font-size:2.6rem;font-style:italic;color:#EDE8DF;font-weight:400;line-height:1;">497<span style="font-size:1rem;font-style:normal;">$</span></p>
        <p style="margin:0 0 20px;color:#4A5260;font-size:0.75rem;">/mois</p>
        <ul style="list-style:none;flex:1;display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>1 assistant IA configuré</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>500 interactions/mois</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>Intégration site ou téléphone</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>Tableau de bord + rapport mensuel</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>Support par courriel</li>
        </ul>
        <button onclick="upgradePlan(event,'starter')" style="background:transparent;border:0.5px solid #A86844;color:#A86844;padding:10px;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;width:100%;">Choisir Starter →</button>
      </div>
      <!-- Pro -->
      <div style="background:#0d1720;padding:28px;display:flex;flex-direction:column;position:relative;">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:#A86844;"></div>
        <div style="position:absolute;top:12px;right:12px;background:#A86844;color:#EDE8DF;font-size:0.58rem;letter-spacing:0.15em;text-transform:uppercase;padding:3px 8px;">Recommandé</div>
        <p style="margin:0 0 4px;font-size:0.6rem;letter-spacing:0.2em;text-transform:uppercase;color:#A86844;">Pro</p>
        <p style="margin:0 0 2px;font-size:2.6rem;font-style:italic;color:#C4895A;font-weight:400;line-height:1;">1&nbsp;497<span style="font-size:1rem;font-style:normal;color:#EDE8DF;">$</span></p>
        <p style="margin:0 0 20px;color:#4A5260;font-size:0.75rem;">/mois</p>
        <ul style="list-style:none;flex:1;display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>3 assistants IA configurés</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>Interactions illimitées</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>Intégrations CRM & ERP</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>Analytics avancé + API complète</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>Support prioritaire 7j/7</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>Optimisation continue incluse</li>
        </ul>
        <button onclick="upgradePlan(event,'pro')" style="background:#A86844;border:0.5px solid #C4895A;color:#EDE8DF;padding:10px;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;width:100%;">Choisir Pro →</button>
      </div>
      <!-- Enterprise -->
      <div style="background:#090C0F;padding:28px;display:flex;flex-direction:column;">
        <p style="margin:0 0 4px;font-size:0.6rem;letter-spacing:0.2em;text-transform:uppercase;color:#4A5260;">Entreprise</p>
        <p style="margin:0 0 2px;font-size:2rem;font-style:italic;color:#EDE8DF;font-weight:400;line-height:1.1;">Sur mesure</p>
        <p style="margin:0 0 20px;color:#4A5260;font-size:0.75rem;">tarification personnalisée</p>
        <ul style="list-style:none;flex:1;display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>Assistants IA illimités</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>Infrastructure dédiée</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>Intégrations systèmes propriétaires</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>SLA garanti 99,9%</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>Formation de vos équipes</li>
          <li style="color:#EDE8DF;font-size:0.82rem;"><span style="color:#A86844;margin-right:8px;">✓</span>Conformité Loi 25 / RGPD</li>
        </ul>
        <button onclick="upgradePlan(event,'enterprise')" style="background:transparent;border:0.5px solid rgba(237,232,223,0.2);color:#EDE8DF;padding:10px;font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;width:100%;">Nous contacter →</button>
      </div>
    </div>
    <p style="text-align:center;color:#4A5260;font-size:0.7rem;padding:16px;">
      Questions ? <a href="https://wa.me/18193422290" target="_blank" style="color:#A86844;">WhatsApp</a> — réponse en moins de 2h
    </p>
  </div>
</div>

<script>
function openPlanModal(){{var m=document.getElementById('planModal');m.style.display='flex';document.body.style.overflow='hidden';}}
function closePlanModal(){{var m=document.getElementById('planModal');m.style.display='none';document.body.style.overflow='';}}
document.getElementById('planModal').addEventListener('click',function(e){{if(e.target===this)closePlanModal();}});
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
            await asyncio.sleep(30)

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

@app.post("/api/v1/plan-request")
@limiter.limit("3/minute")
async def plan_request(request: Request, client: dict = Depends(verify_api_key)):
    data = await request.json()
    plan = data.get("plan", "inconnu")
    name = client.get("owner_name", "")
    email = client.get("owner_email", "")
    asyncio.create_task(send_email(
        to=ADMIN_EMAIL,
        subject=f"💳 Demande de plan {plan} — {name}",
        body=f"""<div style="font-family:sans-serif;max-width:500px;background:#090C0F;color:#EDE8DF;padding:24px;">
<h2 style="color:#A86844;">Demande d'abonnement</h2>
<p><b>Client :</b> {html_module.escape(name)}</p>
<p><b>Email :</b> {html_module.escape(email)}</p>
<p><b>Plan demandé :</b> {html_module.escape(plan)}</p>
<p>Contactez ce client pour finaliser la facturation.</p>
</div>"""
    ))
    return {"status": "ok"}

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
    if not STRIPE_WEBHOOK_SECRET:
        logger.error("STRIPE_WEBHOOK_SECRET non configuré — webhook refusé")
        raise HTTPException(status_code=503, detail="Stripe webhook non configuré")

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


@app.get("/api/granitecom.js")
async def granitecom_js():
    js = r"""
var ZONE_BOUNDS = {
  'ZONE-A':[0,33,0,33],  'ZONE-B':[33,67,0,33],  'ZONE-C':[67,100,0,33],
  'ZONE-D':[0,33,33,67], 'ZONE-E':[33,67,33,67], 'ZONE-F':[67,100,33,67],
  'ZONE-G':[0,33,67,100],'ZONE-H':[33,67,67,100],'ZONE-I':[67,100,67,100]
};
var MAX_FILE_SIZE = 30 * 1024 * 1024;

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(n) {
  if (n < 1024) return n + ' o';
  if (n < 1024*1024) return (n/1024).toFixed(0) + ' Ko';
  return (n/1024/1024).toFixed(1) + ' Mo';
}

window.onerror = function(msg, src, line, col, err) {
  var b = document.getElementById('js-error-banner');
  if (b) { b.style.display = 'block'; b.textContent = 'Erreur JS : ' + msg + ' (ligne ' + line + ')'; }
  return false;
};

function handleFilePick(inputEl, zoneId, fnameId, prevId) {
  var f = inputEl.files && inputEl.files[0];
  if (!f) return;
  if (f.size > MAX_FILE_SIZE) {
    showError('Fichier trop volumineux (' + formatBytes(f.size) + '). Maximum : 30 Mo.');
    inputEl.value = '';
    return;
  }
  var zone = document.getElementById(zoneId);
  if (zone) zone.classList.add('has-file');
  var fnameEl = document.getElementById(fnameId);
  if (fnameEl) { fnameEl.textContent = f.name + ' (' + formatBytes(f.size) + ')'; fnameEl.style.display = 'block'; }
  var prev = document.getElementById(prevId);
  if (prev) {
    if (prev._objectUrl) { try { URL.revokeObjectURL(prev._objectUrl); } catch(_) {} }
    try {
      prev._objectUrl = URL.createObjectURL(f);
      prev.src = prev._objectUrl;
      prev.style.display = 'block';
    } catch(err) {
      var reader = new FileReader();
      reader.onload = function(e) { prev.src = e.target.result; prev.style.display = 'block'; };
      reader.readAsDataURL(f);
    }
  }
}

function wireInput(inputId, zoneId, fnameId, prevId) {
  var inp = document.getElementById(inputId);
  if (!inp) return;
  var handler = function() { handleFilePick(inp, zoneId, fnameId, prevId); };
  inp.addEventListener('change', handler, false);
  inp.onchange = handler;
}

function readFileAsDataUrl(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload  = function(e) { resolve(e.target.result); };
    reader.onerror = function()  { reject(new Error('Lecture fichier echouee')); };
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload  = function() { resolve(img); };
    img.onerror = function() { reject(new Error('Chargement image echoue')); };
    img.src = src;
  });
}

function clampToZone(e) {
  var b = e.zone && ZONE_BOUNDS[e.zone]; if (!b) return;
  var cx = (b[0]+b[1])/2, cy = (b[2]+b[3])/2;
  e.x = (e.x == null || e.x < b[0] || e.x > b[1]) ? cx : e.x;
  e.y = (e.y == null || e.y < b[2] || e.y > b[3]) ? cy : e.y;
}

function cropZone(zone, imgEl) {
  var b = ZONE_BOUNDS[zone]; if (!b) return null;
  var iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;
  var x1=b[0]/100*iw, x2=b[1]/100*iw, y1=b[2]/100*ih, y2=b[3]/100*ih;
  var cw = x2-x1, ch = y2-y1;
  var scale = Math.min(4, 380/Math.max(cw, 1));
  var c = document.createElement('canvas');
  c.width = Math.round(cw*scale); c.height = Math.round(ch*scale);
  var ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imgEl, x1, y1, cw, ch, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.92);
}

function drawOverview(errors, imgEl) {
  var canvas = document.getElementById('overview-canvas');
  var ctx    = canvas.getContext('2d');
  canvas.width = imgEl.naturalWidth; canvas.height = imgEl.naturalHeight;
  ctx.drawImage(imgEl, 0, 0);
  var r = Math.max(14, imgEl.naturalWidth * 0.015);
  var num = 0;
  errors.forEach(function(e) {
    if (e.severity === 'ok' || e.x == null) return;
    num++;
    var cx = e.x/100*imgEl.naturalWidth, cy = e.y/100*imgEl.naturalHeight;
    var color = e.severity === 'critique' ? '#ef4444' : '#d4a017';
    ctx.beginPath(); ctx.arc(cx, cy, r+4, 0, 2*Math.PI);
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2*Math.PI);
    ctx.fillStyle = color; ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(r*1.2) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(num, cx, cy);
  });
}

function buildErrorList(errors, modelImg, photoImg) {
  var num = 0;
  var html = errors.map(function(e) {
    var cls = e.severity==='critique'?'cr':e.severity==='avertissement'?'wa':'ok';
    var lbl = e.severity==='critique'?'Critique':e.severity==='avertissement'?'Attention':'OK';
    var msg = escapeHtml(e.message || '');
    if (e.severity === 'ok') {
      return '<div class="ecard ok"><div class="ecard-head"><span class="badge">'+lbl+'</span>'
           + '<span class="emsg" style="color:#555">'+msg+'</span></div></div>';
    }
    num++;
    var crops = '';
    if (e.zone && modelImg && photoImg) {
      try {
        var mc = cropZone(e.zone, modelImg);
        var pc = cropZone(e.zone, photoImg);
        if (mc && pc) {
          crops = '<div class="crops">'
            + '<div class="crop-col"><div class="crop-lbl">Modele attendu</div><img src="'+mc+'" alt="Modele zone '+escapeHtml(e.zone)+'"></div>'
            + '<div class="crop-col"><div class="crop-lbl">Photo gravee</div><img src="'+pc+'" alt="Photo zone '+escapeHtml(e.zone)+'"></div>'
            + '</div>';
        }
      } catch(err) {}
    }
    return '<div class="ecard '+cls+'">'
      + '<div class="ecard-head">'
      + '<span class="enum">'+num+'</span>'
      + '<span class="badge">'+lbl+'</span>'
      + '<span class="emsg">'+msg+'</span>'
      + '</div>'
      + (e.detail ? '<div class="edet">'+escapeHtml(e.detail)+'</div>' : '')
      + crops
      + '</div>';
  }).join('');
  document.getElementById('error-list').innerHTML = html ||
    '<div class="ecard ok"><div class="ecard-head"><span class="badge">OK</span>'
    + '<span class="emsg" style="color:#555">Monument conforme au modele — aucune erreur detectee.</span></div></div>';
}

function showError(msg) {
  var n = document.getElementById('err-notice');
  if (n) { n.style.display = 'block'; n.textContent = msg; n.scrollIntoView({behavior:'smooth',block:'center'}); }
}
function hideError() {
  var n = document.getElementById('err-notice');
  if (n) n.style.display = 'none';
}

var loadingTimer = null;
var loadingMsgs = [
  'Envoi des images au serveur...',
  'Preparation des images (compression, orientation EXIF)...',
  'Analyse du texte hebreu — lettre par lettre...',
  'Verification des signes diacritiques et niqqud...',
  'Comparaison des symboles, bordures et decorations...',
  'Verification de la mise en page et des espacements...',
  'Generation du rapport de verification...'
];

function setMessage(text) {
  var el = document.getElementById('loading-msg');
  if (el) el.textContent = text;
}

async function verify() {
  hideError();
  var mf = document.getElementById('inp-model').files[0];
  var pf = document.getElementById('inp-photo').files[0];
  if (!mf || !pf) { showError('Selectionnez les deux images (modele approuve + photo du monument grave).'); return; }
  if (mf.size > MAX_FILE_SIZE || pf.size > MAX_FILE_SIZE) {
    showError('Une des images depasse 30 Mo. Compressez-la ou utilisez une resolution plus basse.'); return;
  }
  var btn    = document.getElementById('btn');
  var loadEl = document.getElementById('loading');
  btn.disabled = true;
  loadEl.style.display = 'block';
  document.getElementById('results').style.display = 'none';
  var mi = 0;
  setMessage(loadingMsgs[0]);
  loadingTimer = setInterval(function() {
    mi = Math.min(mi+1, loadingMsgs.length-1);
    setMessage(loadingMsgs[mi]);
  }, 7000);
  var controller = new AbortController();
  var abortTimer = setTimeout(function(){ controller.abort(); }, 120000);
  try {
    var fd = new FormData();
    fd.append('model', mf);
    fd.append('photo', pf);
    var resp = await fetch('/api/monument-verify', { method: 'POST', body: fd, signal: controller.signal, cache: 'no-store' });
    if (!resp.ok) {
      var errData = {};
      try { errData = await resp.json(); } catch(e) {}
      var msg;
      switch(resp.status) {
        case 400: msg = errData.detail || 'Requete invalide. Verifiez les images.'; break;
        case 413: msg = errData.detail || 'Fichier trop volumineux (max 30 Mo par image).'; break;
        case 415: msg = errData.detail || 'Format non supporte — utilisez JPG, PNG ou HEIC.'; break;
        case 429: msg = 'Limite atteinte. Patientez une minute puis reessayez.'; break;
        case 502: msg = errData.detail || 'Service IA indisponible. Reessayez dans quelques instants.'; break;
        case 503: msg = errData.detail || 'Service IA temporairement surcharge. Reessayez.'; break;
        case 504: msg = errData.detail || "L'analyse a depasse le delai. Reessayez avec des images moins grandes."; break;
        default:  msg = errData.detail || ('Erreur ' + resp.status + '. Reessayez.');
      }
      showError(msg);
      return;
    }
    var data = await resp.json();
    setMessage('Generation du rapport...');
    await render(data, mf, pf);
    if (window.navigator && window.navigator.vibrate) { try { window.navigator.vibrate(30); } catch(_) {} }
  } catch(err) {
    if (err.name === 'AbortError') {
      showError("L'analyse prend trop de temps (>2 min). Reessayez avec des images plus legeres.");
    } else if (err.name === 'TypeError') {
      showError('Connexion impossible. Verifiez votre connexion internet.');
    } else {
      showError('Erreur inattendue : ' + (err.message || err));
    }
  } finally {
    clearTimeout(abortTimer);
    clearInterval(loadingTimer);
    btn.disabled = false;
    loadEl.style.display = 'none';
  }
}

async function render(data, modelFile, photoFile) {
  var errors = (data && Array.isArray(data.errors)) ? data.errors : [];
  errors.forEach(clampToZone);
  var cr = errors.filter(function(e){return e.severity==='critique';}).length;
  var wa = errors.filter(function(e){return e.severity==='avertissement';}).length;
  var ok = cr === 0 && wa === 0;

  // Verdict banner
  var vEl = document.getElementById('verdict');
  var vIcon = document.getElementById('verdict-icon');
  var vTitle = document.getElementById('verdict-title');
  var vSub = document.getElementById('verdict-sub');
  if (vEl && vIcon && vTitle && vSub) {
    vEl.className = 'verdict ' + (ok ? 'verdict-ok' : cr > 0 ? 'verdict-crit' : 'verdict-warn');
    vEl.style.display = 'flex';
    if (ok) {
      vIcon.textContent = '✅';
      vTitle.textContent = 'Monument conforme — approuve pour livraison';
      vSub.textContent = 'Aucune erreur detectee. Le monument correspond exactement au modele approuve.';
    } else if (cr > 0) {
      vIcon.textContent = '⛔';
      vTitle.textContent = cr + ' erreur'+(cr>1?'s':'')+' critique'+(cr>1?'s':'')+' — correction requise avant livraison';
      vSub.textContent = (wa > 0 ? wa + ' point'+(wa>1?'s':'')+' d\'attention supplementaire'+(wa>1?'s':'')+'. ' : '') + 'Ne pas livrer sans correction.';
    } else {
      vIcon.textContent = '⚠️';
      vTitle.textContent = wa + ' point'+(wa>1?'s':'')+' d\'attention — a confirmer avec le client';
      vSub.textContent = 'Aucune erreur critique. Validez les differences mineures avec le client avant livraison.';
    }
  }

  // Report timestamp
  var meta = document.getElementById('report-meta');
  if (meta) {
    var now = new Date();
    var opts = {year:'numeric',month:'long',day:'numeric'};
    var dateStr = now.toLocaleDateString('fr-CA', opts);
    var timeStr = now.toLocaleTimeString('fr-CA', {hour:'2-digit',minute:'2-digit'});
    meta.innerHTML = '<span>Granit Com \xD7 Novalis IA</span><span>Rapport généré le ' + dateStr + ' à ' + timeStr + '</span>';
  }

  document.getElementById('chips').innerHTML =
    (cr ? '<span class="chip c-red">&#9940; '+cr+' critique'+(cr>1?'s':'')+'</span>' : '') +
    (wa ? '<span class="chip c-yel">&#9888; '+wa+' attention'+(wa>1?'s':'')+'</span>' : '') +
    (ok ? '<span class="chip c-grn">&#10003; Monument conforme</span>' : '');
  document.getElementById('results').style.display = 'block';
  var modelImg = null, photoImg = null;
  try {
    var modelUrl = await readFileAsDataUrl(modelFile);
    var photoUrl = await readFileAsDataUrl(photoFile);
    modelImg = await loadImage(modelUrl);
    photoImg = await loadImage(photoUrl);
  } catch(err) { console.warn('Image local reload echec:', err); }
  var hasAnnotated = errors.some(function(e){ return e.severity !== 'ok' && e.x != null; });
  var overviewWrap = document.getElementById('overview-wrap');
  if (hasAnnotated && photoImg) {
    overviewWrap.style.display = 'block';
    try { drawOverview(errors, photoImg); }
    catch(err) { overviewWrap.style.display = 'none'; }
  } else {
    overviewWrap.style.display = 'none';
  }
  buildErrorList(errors, modelImg, photoImg);
  setTimeout(function(){
    try { document.getElementById('results').scrollIntoView({ behavior:'smooth', block:'start' }); }
    catch(_) {}
  }, 60);
}

// Init
try {
  wireInput('inp-model', 'zone-model', 'fname-model', 'prev-model');
  wireInput('inp-photo', 'zone-photo', 'fname-photo', 'prev-photo');
  var _btn = document.getElementById('btn');
  if (_btn) { _btn.addEventListener('click', function(ev) { ev.preventDefault(); verify(); }, false); }
  var _bt = document.getElementById('build-tag');
  if (_bt) _bt.textContent = 'Propulse par Claude Opus \xB7 build-14 \xB7 JS-OK';
  document.title = 'build-14 JS-OK \xB7 Granit Com';
} catch(e) {
  var _eb = document.getElementById('js-error-banner');
  if (_eb) { _eb.style.display='block'; _eb.textContent='Init echouee : ' + e.message; }
}
"""
    from fastapi.responses import Response
    return Response(
        content=js,
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Cloudflare-CDN-Cache-Control": "no-store",
        }
    )


@app.get("/granitecom-verify", response_class=HTMLResponse)
async def granitecom_verify():
    html = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=5,viewport-fit=cover">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<meta name="format-detection" content="telephone=no">
<meta name="theme-color" content="#0a0a0a">
<title>Verificateur de monuments — Granit Com</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#0a0a0a;color:#e8e4dd;min-height:100vh;padding:28px 16px 60px}
.wrap{max-width:920px;margin:0 auto}
header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid #1e1e1e}
.logo-txt{font-size:0.68rem;letter-spacing:0.22em;text-transform:uppercase;color:#A86844}
.powered{font-size:0.65rem;color:#3a3a3a}
h1{font-size:1.45rem;font-weight:500;margin-bottom:4px;letter-spacing:-0.01em}
.sub{color:#555;font-size:0.83rem;margin-bottom:24px;line-height:1.5}
.upload-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
@media(max-width:560px){.upload-grid{grid-template-columns:1fr}}
.uzone{border:1.5px dashed rgba(168,104,68,0.3);border-radius:10px;padding:20px 14px 16px;text-align:center;background:rgba(168,104,68,0.025);transition:border-color .2s,background .2s}
.uzone.has-file{border-color:#A86844;border-style:solid;background:rgba(168,104,68,0.06)}
.uzone .ico{font-size:1.9rem;display:block;margin-bottom:8px}
.uzone h3{font-size:0.82rem;font-weight:600;margin-bottom:3px}
.uzone small{color:#555;font-size:0.72rem}
.file-input{display:block;margin:14px auto 0;color:#A86844;font-size:0.78rem;max-width:100%}
.file-input::file-selector-button{padding:8px 18px;background:rgba(168,104,68,0.12);border:1px solid rgba(168,104,68,0.4);border-radius:6px;color:#A86844;font-size:0.78rem;font-weight:500;cursor:pointer;margin-right:8px;transition:background .2s}
.file-input:active::file-selector-button,.file-input:hover::file-selector-button{background:rgba(168,104,68,0.25)}
.uzone .prev-img{max-width:100%;max-height:160px;margin-top:10px;border-radius:6px;border:1px solid rgba(168,104,68,0.2);display:none;object-fit:contain}
.uzone .fname{display:none;font-size:0.72rem;color:#A86844;margin-top:6px;word-break:break-all;text-align:center;opacity:0.85}
.btn-analyze{width:100%;padding:14px;background:#A86844;color:#fff;border:none;border-radius:8px;font-size:0.84rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;transition:background .2s;margin-bottom:8px}
.btn-analyze:hover{background:#c07840}
.btn-analyze:disabled{background:#1e1e1e;color:#3a3a3a;cursor:not-allowed}
.loading{display:none;padding:36px 0;text-align:center}
.loading-inner{display:inline-flex;flex-direction:column;align-items:center;gap:14px}
.sp{width:36px;height:36px;border:3px solid rgba(168,104,68,0.2);border-top-color:#A86844;border-radius:50%;animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.loading-msg{font-size:0.82rem;color:#555;max-width:260px;line-height:1.5;text-align:center}
.results{margin-top:28px;display:none}
.result-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px}
.result-header h2{font-size:0.88rem;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#888}
.btn-print{padding:6px 14px;background:transparent;border:1px solid #2a2a2a;border-radius:6px;color:#888;font-size:0.75rem;cursor:pointer;transition:all .2s}
.btn-print:hover{border-color:#A86844;color:#A86844}
.chips{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}
.chip{padding:5px 13px;border-radius:99px;font-size:0.74rem;font-weight:600;letter-spacing:0.03em}
.c-red{background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.2)}
.c-yel{background:rgba(234,179,8,0.12);color:#d4a017;border:1px solid rgba(234,179,8,0.2)}
.c-grn{background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.2)}
.overview-wrap{margin-bottom:20px;display:none}
.section-label{font-size:0.68rem;letter-spacing:0.14em;text-transform:uppercase;color:#444;margin-bottom:8px}
.overview-wrap canvas{max-width:100%;border-radius:8px;border:1px solid #1e1e1e;display:block}
.error-list{display:flex;flex-direction:column;gap:10px}
.ecard{border-radius:10px;overflow:hidden;border:1px solid}
.ecard.cr{border-color:rgba(239,68,68,0.25);background:rgba(239,68,68,0.04)}
.ecard.wa{border-color:rgba(234,179,8,0.25);background:rgba(234,179,8,0.04)}
.ecard.ok{border-color:rgba(34,197,94,0.2);background:rgba(34,197,94,0.03)}
.ecard-head{padding:12px 14px 10px;display:flex;align-items:flex-start;gap:10px}
.enum{display:flex;align-items:center;justify-content:center;width:22px;height:22px;min-width:22px;border-radius:50%;font-size:0.72rem;font-weight:700;margin-top:1px}
.cr .enum{background:rgba(239,68,68,0.2);color:#ef4444}
.wa .enum{background:rgba(234,179,8,0.2);color:#d4a017}
.badge{font-size:0.6rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:2px 8px;border-radius:99px;white-space:nowrap;margin-top:3px;flex-shrink:0}
.cr .badge{background:rgba(239,68,68,0.15);color:#ef4444}
.wa .badge{background:rgba(234,179,8,0.15);color:#d4a017}
.ok .badge{background:rgba(34,197,94,0.12);color:#22c55e}
.emsg{font-size:0.85rem;line-height:1.5;font-weight:500;flex:1}
.edet{font-size:0.75rem;color:#666;margin:2px 0 0 32px;padding:0 14px 10px;font-family:monospace;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.crops{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#1e1e1e;margin-top:2px}
.crop-col{background:#0a0a0a;padding:10px 12px}
.crop-lbl{font-size:0.62rem;letter-spacing:0.12em;text-transform:uppercase;color:#444;margin-bottom:6px}
.crop-col img{width:100%;border-radius:5px;display:block;image-rendering:auto}
.cr .crop-col img{border:1.5px solid rgba(239,68,68,0.3)}
.wa .crop-col img{border:1.5px solid rgba(234,179,8,0.3)}
.err-notice{display:none;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:0.82rem;color:#ef4444;line-height:1.5}
.verdict{border-radius:12px;padding:18px 20px;margin-bottom:20px;display:none;align-items:flex-start;gap:14px}
.verdict-ok{background:rgba(34,197,94,0.07);border:1px solid rgba(34,197,94,0.25)}
.verdict-warn{background:rgba(234,179,8,0.07);border:1px solid rgba(234,179,8,0.25)}
.verdict-crit{background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.25)}
.verdict-icon{font-size:1.8rem;line-height:1;flex-shrink:0;margin-top:2px}
.verdict-text{flex:1}
.verdict-title{font-size:0.96rem;font-weight:700;margin-bottom:4px}
.verdict-ok .verdict-title{color:#22c55e}
.verdict-warn .verdict-title{color:#d4a017}
.verdict-crit .verdict-title{color:#ef4444}
.verdict-sub{font-size:0.78rem;color:#666;line-height:1.5}
.report-meta{font-size:0.65rem;color:#2e2e2e;margin-bottom:16px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px}
.zone-badge{font-size:0.58rem;letter-spacing:0.08em;text-transform:uppercase;padding:2px 7px;border-radius:4px;background:#181818;color:#555;flex-shrink:0;align-self:flex-start;margin-top:3px}
@media print{
  .btn-analyze,.upload-grid,.loading,.err-notice,.powered{display:none!important}
  .btn-print{display:none!important}
  body{background:#fff;color:#000;padding:20px;font-family:Georgia,serif}
  .wrap{max-width:100%}
  header{border-bottom:2pt solid #000;padding-bottom:12px;margin-bottom:16px}
  .logo-txt{font-size:13pt;letter-spacing:0.05em;color:#000;font-weight:700}
  h1{font-size:16pt;margin-bottom:6pt}
  .sub{display:none}
  .verdict{border:1.5pt solid #999!important;background:#fafafa!important;page-break-inside:avoid;display:flex!important}
  .verdict-title{color:#000!important;font-size:11pt}
  .verdict-sub{color:#444!important}
  .results{display:block!important}
  .result-header{display:none}
  .chips{gap:6pt;margin-bottom:10pt}
  .chip{border:1pt solid #999;background:#f0f0f0!important;color:#333!important}
  .overview-wrap canvas{max-width:100%;max-height:280px;border:1pt solid #ccc}
  .ecard{border:1pt solid #ccc!important;background:#fff!important;break-inside:avoid;margin-bottom:6pt;page-break-inside:avoid}
  .ecard.cr{border-left:3.5pt solid #c00!important}
  .ecard.wa{border-left:3.5pt solid #b80!important}
  .emsg{color:#000!important;font-size:10pt}
  .edet{color:#333!important;font-size:9pt}
  .crop-lbl{color:#555!important}
  .crops{background:#eee!important;break-inside:avoid}
  .report-meta{color:#666;font-size:8pt;border-top:0.5pt solid #ccc;padding-top:8pt;margin-top:8pt}
}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="logo-txt">Granit Com &times; Novalis IA</span>
    <span class="powered" id="build-tag">Propulse par Claude Opus &middot; build-12</span>
  </header>
  <h1>Verificateur de monuments</h1>
  <div id="js-error-banner" style="display:none;background:#7a1010;color:#fff;padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:0.78rem;line-height:1.5"></div>
  <div class="err-notice" id="err-notice"></div>
  <p class="sub">Telechargez le modele approuve et la photo du monument grave. L'IA compare chaque lettre, signe diacritique et symbole et affiche un rapport detaille.</p>

  <div class="upload-grid">
    <div class="uzone" id="zone-model">
      <span class="ico">📋</span>
      <h3>Modele approuve</h3>
      <small>Design original — JPG, PNG, HEIC</small>
      <input class="file-input" type="file" id="inp-model" accept="image/*,.heic,.heif">
      <div class="fname" id="fname-model"></div>
      <img class="prev-img" id="prev-model">
    </div>
    <div class="uzone" id="zone-photo">
      <span class="ico">📷</span>
      <h3>Photo du monument</h3>
      <small>Photo apres gravure — HEIC, JPG, PNG</small>
      <input class="file-input" type="file" id="inp-photo" accept="image/*,.heic,.heif">
      <div class="fname" id="fname-photo"></div>
      <img class="prev-img" id="prev-photo">
    </div>
  </div>

  <button class="btn-analyze" id="btn" type="button">Analyser les erreurs</button>

  <div class="loading" id="loading">
    <div class="loading-inner">
      <div class="sp"></div>
      <div class="loading-msg" id="loading-msg">Preparation des images...</div>
    </div>
  </div>

  <div class="results" id="results">
    <div class="result-header">
      <h2>Rapport de verification</h2>
      <button class="btn-print" type="button" onclick="window.print()">Imprimer le rapport</button>
    </div>
    <div class="verdict" id="verdict">
      <div class="verdict-icon" id="verdict-icon"></div>
      <div class="verdict-text">
        <div class="verdict-title" id="verdict-title"></div>
        <div class="verdict-sub" id="verdict-sub"></div>
      </div>
    </div>
    <div class="report-meta" id="report-meta"></div>
    <div class="chips" id="chips"></div>
    <div class="overview-wrap" id="overview-wrap">
      <div class="section-label">Vue d'ensemble — position des erreurs</div>
      <canvas id="overview-canvas"></canvas>
    </div>
    <div class="error-list" id="error-list"></div>
  </div>
</div>

<script src="/api/granitecom.js"></script>
</body>
</html>"""
    return HTMLResponse(
        content=html,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
            "CDN-Cache-Control": "no-store",
            "Cloudflare-CDN-Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        }
    )


MONUMENT_MAX_UPLOAD_BYTES = 30 * 1024 * 1024  # 30MB par fichier (HEIC iPhone peut être gros)

@app.post("/api/monument-verify")
@limiter.limit("10/minute")
async def monument_verify(request: Request, model: UploadFile = File(...), photo: UploadFile = File(...)):
    """Compare un modèle de monument approuvé avec une photo du monument gravé via Claude Vision."""
    if not claude_client:
        raise HTTPException(status_code=503, detail="Service IA temporairement indisponible.")

    import base64, io

    def to_jpeg(raw: bytes, filename: str = "", label: str = "image") -> tuple[bytes, str]:
        """Convertit n'importe quel format image (incl. HEIC) en JPEG <4MB."""
        if not raw:
            raise HTTPException(status_code=400, detail=f"Fichier {label} vide.")
        if len(raw) > MONUMENT_MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Fichier {label} trop volumineux ({len(raw)//1024//1024} Mo). Maximum : 30 Mo."
            )
        fname = (filename or "").lower()
        if fname.endswith(".heic") or fname.endswith(".heif"):
            try:
                import pillow_heif
                pillow_heif.register_heif_opener()
            except ImportError:
                raise HTTPException(status_code=415, detail="Format HEIC non supporte — convertissez en JPG ou PNG.")
        try:
            from PIL import Image, ImageOps
            img = Image.open(io.BytesIO(raw))
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            max_side = 2400
            if max(img.width, img.height) > max_side:
                img.thumbnail((max_side, max_side), Image.LANCZOS)
            for quality in (88, 75, 60, 45):
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=quality, optimize=True)
                if buf.tell() < 4 * 1024 * 1024:
                    break
            return buf.getvalue(), "image/jpeg"
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Erreur lecture {label}: {e}")
            raise HTTPException(status_code=415, detail=f"Impossible de lire le {label}. Verifiez le format (JPG, PNG, HEIC).")

    try:
        model_bytes = await model.read()
        photo_bytes = await photo.read()
    except Exception as e:
        logger.error(f"Erreur lecture upload: {e}")
        raise HTTPException(status_code=400, detail="Erreur lors de la reception des fichiers.")

    model_bytes, model_mt = to_jpeg(model_bytes, model.filename or "", "modele")
    photo_bytes, photo_mt = to_jpeg(photo_bytes, photo.filename or "", "photo")

    # Draw 9-zone labels on photo so Claude can reference named regions
    ZONES = {
        "ZONE-A": (17, 17), "ZONE-B": (50, 17), "ZONE-C": (83, 17),
        "ZONE-D": (17, 50), "ZONE-E": (50, 50), "ZONE-F": (83, 50),
        "ZONE-G": (17, 83), "ZONE-H": (50, 83), "ZONE-I": (83, 83),
    }
    def add_zone_labels(img_bytes: bytes) -> tuple[bytes, str]:
        from PIL import Image as _Img, ImageDraw as _Draw
        img = _Img.open(io.BytesIO(img_bytes)).convert("RGB")
        draw = _Draw.Draw(img)
        w, h = img.size
        lw = max(1, w // 500)
        # Draw 2 vertical and 2 horizontal dividers
        for frac in (1/3, 2/3):
            px = int(w * frac); py = int(h * frac)
            draw.line([(px, 0), (px, h)], fill=(220, 40, 40), width=lw)
            draw.line([(0, py), (w, py)], fill=(220, 40, 40), width=lw)
        # Label each zone in its center
        font_size = max(18, w // 60)
        for name, (cx_pct, cy_pct) in ZONES.items():
            px = int(w * cx_pct / 100)
            py = int(h * cy_pct / 100)
            # White rectangle behind text for legibility
            tw = font_size * len(name) // 2 + 8
            th = font_size + 6
            draw.rectangle([px - tw//2, py - th//2, px + tw//2, py + th//2],
                           fill=(255, 255, 255))
            draw.text((px - tw//2 + 4, py - th//2 + 3), name, fill=(220, 40, 40))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue(), "image/jpeg"

    photo_zone_bytes, photo_zone_mt = add_zone_labels(photo_bytes)
    model_b64      = base64.standard_b64encode(model_bytes).decode()
    photo_b64      = base64.standard_b64encode(photo_bytes).decode()
    photo_zone_b64 = base64.standard_b64encode(photo_zone_bytes).decode()

    zone_map_text = "\n".join(
        f"  {name}: x={cx}%, y={cy}%" for name, (cx, cy) in ZONES.items()
    )

    prompt_text = f"""Tu es un expert en vérification de monuments funéraires juifs. Une erreur non détectée sur un monument livré au client est inacceptable — sois exhaustif.

MÉTHODE — analyse séquentielle, élément par élément :

1. TEXTE HÉBREU (priorité absolue, lecture droite-à-gauche)
   - Compare chaque lettre individuellement (aleph א, bet ב, gimel ג, dalet ד, hé ה, vav ו, zayin ז, ḥet ח, tet ט, yod י, kaf כ/ך, lamed ל, mem מ/ם, noun נ/ן, samekh ס, ayin ע, pé פ/ף, tsadé צ/ץ, qof ק, resh ר, shin ש, tav ת)
   - Lettres finales (ך ם ן ף ץ) souvent confondues avec leurs formes normales
   - Signes diacritiques : niqqud (points voyelles), dagesh (point dans la lettre), shva, kamatz, patach, segol, tsere, ḥolam, qubuts, shuruq
   - Guillemets hébraïques : géreshayim ״ (avant dernière lettre d'un acronyme), geresh ׳
   - Espaces entre mots et entre lettres
   - Taille relative des caractères

2. TEXTE LATIN (français / anglais)
   - Chaque lettre du nom, prénom, titre — caractère par caractère
   - Accents (é, è, ê, à, ç...) — souvent oubliés à la gravure
   - Dates : jour, mois, année — chiffre par chiffre
   - Ponctuation : tirets, virgules, points

3. SYMBOLES ET DÉCORATIONS
   - Étoile de David, mains de cohen (כֹּהֵן), pichet du lévite (לֵוִי), menorah, etc.
   - Bordures, ornements, lignes de séparation
   - Photo gravée, médaillon

4. MISE EN PAGE
   - Centrage de chaque ligne
   - Espacement vertical entre sections
   - Éléments manquants ou ajoutés
   - Alignement vertical/horizontal

RÈGLE D'OR : chaque différence = UN item JSON séparé. 3 lettres incorrectes → 3 items distincts. Ne regroupe jamais.

La photo est divisée en 9 zones visibles avec des labels rouges :
  ZONE-A (haut-gauche)   ZONE-B (haut-centre)   ZONE-C (haut-droite)
  ZONE-D (milieu-gauche) ZONE-E (centre)         ZONE-F (milieu-droite)
  ZONE-G (bas-gauche)    ZONE-H (bas-centre)     ZONE-I (bas-droite)

Pour chaque erreur, identifie la zone (ZONE-A à ZONE-I) où elle se trouve. Les coordonnées x/y sont les pourcentages du centre de la zone :
{zone_map_text}

Réponds UNIQUEMENT en JSON valide (sans markdown, sans préambule) :
{{
  "errors": [
    {{
      "severity": "critique",
      "message": "Description courte (ex: Lettre incorrecte — ב gravé au lieu de כ)",
      "detail": "Attendu : [texte exact du modèle] — Trouvé : [texte exact sur la photo]",
      "zone": "ZONE-B",
      "x": 50,
      "y": 17
    }}
  ]
}}

Sévérités :
- "critique" = erreur visible qui doit être corrigée avant livraison (lettre, mot, date, symbole)
- "avertissement" = différence mineure à confirmer avec le client (espacement, légère variation)
- "ok" = un seul item "ok" si tout est conforme (champs zone/x/y absents)

Mieux vaut signaler trop que pas assez. Sois précis dans les descriptions."""

    import json as _json
    last_error = None

    # Retry avec backoff exponentiel (Claude API peut être surchargée)
    for attempt in range(3):
        try:
            resp = await asyncio.wait_for(
                asyncio.to_thread(
                    claude_client.messages.create,
                    model="claude-opus-4-7",
                    max_tokens=4096,
                    messages=[{
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "MODÈLE APPROUVÉ (ce qui devrait être gravé) :"},
                            {"type": "image", "source": {"type": "base64", "media_type": model_mt, "data": model_b64}},
                            {"type": "text", "text": "PHOTO DU MONUMENT GRAVÉ (avec grille 9 zones en surimpression) :"},
                            {"type": "image", "source": {"type": "base64", "media_type": photo_zone_mt, "data": photo_zone_b64}},
                            {"type": "text", "text": prompt_text}
                        ]
                    }]
                ),
                timeout=90.0
            )
            text = resp.content[0].text.strip()
            # Nettoyer les éventuelles balises markdown
            if text.startswith("```"):
                text = text.split("```", 2)[1] if "```" in text[3:] else text[3:]
                if text.startswith("json"):
                    text = text[4:]
                text = text.rsplit("```", 1)[0]
            # Si le JSON est tronqué, essayer de trouver le dernier objet valide
            text = text.strip()
            if not text.endswith("}"):
                last_brace = text.rfind("}")
                if last_brace > 0:
                    text = text[:last_brace+1]
                    # Fermer le tableau errors si nécessaire
                    if text.count("[") > text.count("]"):
                        text += "]"
                    if text.count("{") > text.count("}"):
                        text += "}"
            try:
                result = _json.loads(text)
            except _json.JSONDecodeError as je:
                logger.warning(f"JSON malformé tentative {attempt+1}: {je}. Texte: {text[:200]}")
                last_error = je
                if attempt < 2:
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
                raise HTTPException(status_code=502, detail="Reponse IA invalide. Reessayez avec des images plus claires.")
            # Validation du format
            if not isinstance(result, dict) or "errors" not in result:
                logger.warning(f"Format inattendu tentative {attempt+1}: {result}")
                result = {"errors": [{"severity": "ok", "message": "Analyse incomplete — reessayez."}]}
            return result
        except asyncio.TimeoutError:
            logger.warning(f"Timeout Claude API tentative {attempt+1}")
            last_error = "timeout"
            if attempt < 2:
                await asyncio.sleep(2 * (attempt + 1))
                continue
            raise HTTPException(status_code=504, detail="L'analyse a depasse le delai. Reessayez avec des images plus petites.")
        except anthropic.APIError as ae:
            status = getattr(ae, "status_code", 500)
            logger.error(f"Anthropic API error (status={status}) tentative {attempt+1}: {ae}")
            last_error = ae
            # 429 (rate limit) ou 529 (overloaded) : retry avec backoff
            if status in (429, 529, 500, 502, 503) and attempt < 2:
                await asyncio.sleep(2 ** (attempt + 1))
                continue
            if status == 401:
                raise HTTPException(status_code=503, detail="Service IA mal configure. Contactez l'administrateur.")
            raise HTTPException(status_code=502, detail="Service IA indisponible. Reessayez dans quelques instants.")
        except Exception as e:
            logger.error(f"Erreur inattendue monument-verify tentative {attempt+1}: {type(e).__name__}: {e}")
            last_error = e
            if attempt < 2:
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            raise HTTPException(status_code=500, detail="Erreur lors de l'analyse. Veuillez reessayer.")

    # Si on arrive ici, toutes les tentatives ont échoué
    logger.error(f"Toutes les tentatives ont echoue: {last_error}")
    raise HTTPException(status_code=500, detail="Echec apres plusieurs tentatives. Reessayez plus tard.")


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
        expected = hmac.new(VAPI_WEBHOOK_SECRET.encode(), body, digestmod=hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(status_code=401, detail="Invalid signature")
        data = json.loads(body)
    else:
        data = await request.json()

    msg = data.get("message", {})
    msg_type = msg.get("type", "")

    if msg_type == "tool-calls":
        results = []
        _VAPI_ALLOWED = {"sendCallSummary", "bookAppointment"}
        for tool_call in msg.get("toolCallList", []):
            fn = tool_call.get("function", {})
            name = fn.get("name", "")
            args = fn.get("arguments", {})
            call_id = tool_call.get("id", "")

            if name not in _VAPI_ALLOWED:
                logger.warning(f"Vapi: fonction inconnue ignorée: {name!r}")
                continue

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

@app.get("/politique-confidentialite", response_class=HTMLResponse)
async def privacy_policy():
    return HTMLResponse(content="""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Politique de confidentialite -- Novalis IA</title>
    <meta name="description" content="Politique de confidentialite de Novalis IA, conforme a la Loi 25 du Quebec.">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #060a12;
            --bg2: #0d1520;
            --card: #111827;
            --border: rgba(255,255,255,0.07);
            --accent: #38bdf8;
            --accent2: #0ea5e9;
            --green: #34d399;
            --text: #f1f5f9;
            --muted: #64748b;
            --muted2: #94a3b8;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.7; }
        nav { position: sticky; top: 0; width: 100%; z-index: 100; background: rgba(6,10,18,0.92); backdrop-filter: blur(24px); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 16px 24px; display: flex; align-items: center; gap: 16px; }
        .nav-logo { font-weight: 900; font-size: 1.1rem; color: var(--accent); letter-spacing: 1px; text-decoration: none; }
        .nav-back { color: var(--muted2); text-decoration: none; font-size: 0.88rem; transition: color 0.2s; }
        .nav-back:hover { color: var(--accent); }
        .container { max-width: 760px; margin: 0 auto; padding: 56px 24px 80px; }
        h1 { font-size: 2rem; font-weight: 800; color: var(--text); margin-bottom: 8px; }
        .subtitle { color: var(--muted2); font-size: 0.9rem; margin-bottom: 48px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
        h2 { font-size: 1.15rem; font-weight: 700; color: var(--accent); margin: 36px 0 12px; }
        p { color: var(--muted2); margin-bottom: 14px; font-size: 0.95rem; }
        ul { color: var(--muted2); font-size: 0.95rem; margin: 0 0 14px 20px; }
        ul li { margin-bottom: 6px; }
        a { color: var(--accent); text-decoration: none; }
        a:hover { text-decoration: underline; }
        .highlight-box { background: var(--card); border: 1px solid var(--border); border-left: 3px solid var(--green); border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
        .highlight-box p { margin: 0; color: var(--muted2); }
        footer { border-top: 1px solid var(--border); padding: 32px 24px; text-align: center; color: var(--muted); font-size: 0.82rem; margin-top: 40px; }
    </style>
</head>
<body>
<nav>
    <a href="/" class="nav-logo">NOVALIS</a>
    <span style="color:var(--muted);">|</span>
    <a href="/" class="nav-back">&#8592; Retour a l'accueil</a>
</nav>
<div class="container">
    <h1>Politique de confidentialite</h1>
    <p class="subtitle">Derniere mise a jour : 1er janvier 2026 — Conforme a la Loi 25 (Loi modernisant des dispositions legislatives en matiere de protection des renseignements personnels, Quebec)</p>
    <h2>1. Responsable du traitement</h2>
    <p>Novalis IA, exploitee par Elliot Pelletier (ci-apres &laquo; Novalis &raquo;), est responsable du traitement de vos renseignements personnels. Pour toute question : <a href="mailto:novalisproia@gmail.com">novalisproia@gmail.com</a>.</p>
    <h2>2. Donnees collectees</h2>
    <ul>
        <li><strong>Identification :</strong> nom, prenom, courriel, telephone.</li>
        <li><strong>Professionnelles :</strong> nom d'entreprise, poste, secteur.</li>
        <li><strong>Navigation :</strong> adresse IP, navigateur, pages visitees (cookies analytiques).</li>
        <li><strong>Communication :</strong> echanges via nos agents IA (SMS, WhatsApp, Messenger, voix).</li>
        <li><strong>Facturation :</strong> informations de paiement via prestataire securise (aucune carte bancaire stockee).</li>
    </ul>
    <h2>3. Finalites du traitement</h2>
    <ul>
        <li>Fournir et ameliorer nos services d'automatisation IA.</li>
        <li>Repondre aux demandes de consultation.</li>
        <li>Gerer la relation commerciale et la facturation.</li>
        <li>Envoyer des communications de service (avec consentement).</li>
        <li>Respecter nos obligations legales.</li>
    </ul>
    <h2>4. Hebergement et transfert des donnees</h2>
    <div class="highlight-box">
        <p>Donnees hebergees au Canada sur des serveurs Railway. Vos renseignements personnels demeurent sur le territoire canadien et ne sont pas transferes a l'exterieur sans votre consentement explicite, sauf obligation legale.</p>
    </div>
    <h2>5. Duree de conservation</h2>
    <ul>
        <li><strong>Clients actifs :</strong> duree du contrat + 3 ans.</li>
        <li><strong>Prospection :</strong> 2 ans apres la derniere interaction.</li>
        <li><strong>Navigation et logs :</strong> 12 mois.</li>
        <li><strong>Facturation :</strong> 7 ans (obligation fiscale).</li>
    </ul>
    <h2>6. Partage des donnees</h2>
    <p>Nous ne vendons ni ne louons vos donnees. Partage uniquement avec sous-traitants techniques (Railway, Twilio, Anthropic) et autorites si la loi l'exige.</p>
    <h2>7. Securite des donnees</h2>
    <ul>
        <li>Chiffrement TLS/HTTPS en transit et AES-256 au repos.</li>
        <li>Isolation des donnees par client (multi-tenant securise).</li>
        <li>Acces restreint aux personnes autorisees.</li>
        <li>Surveillance continue et journalisation des acces.</li>
    </ul>
    <h2>8. Cookies</h2>
    <p>Cookies essentiels (session) et analytiques (Google Analytics 4, donnees anonymisees). Desactivation possible dans votre navigateur sans affecter le fonctionnement du site.</p>
    <h2>9. Vos droits (Loi 25)</h2>
    <ul>
        <li><strong>Acces :</strong> obtenir une copie de vos donnees.</li>
        <li><strong>Rectification :</strong> corriger des informations inexactes.</li>
        <li><strong>Effacement :</strong> demander la suppression (sous reserve des obligations legales).</li>
        <li><strong>Portabilite :</strong> recevoir vos donnees en format structure.</li>
        <li><strong>Opposition :</strong> refuser le traitement a des fins de prospection.</li>
        <li><strong>Retrait du consentement :</strong> a tout moment, sans effet retroactif.</li>
    </ul>
    <p>Pour exercer ces droits : <a href="mailto:novalisproia@gmail.com">novalisproia@gmail.com</a>. Reponse sous 30 jours.</p>
    <h2>10. Declaration d'incident</h2>
    <p>En cas d'incident, nous aviserons la Commission d'acces a l'information du Quebec (CAI) et les personnes concernees, conformement a la Loi 25.</p>
    <h2>11. Contact</h2>
    <ul>
        <li><strong>Courriel :</strong> <a href="mailto:novalisproia@gmail.com">novalisproia@gmail.com</a></li>
        <li><strong>Entreprise :</strong> Novalis IA — Elliot Pelletier, Quebec, Canada</li>
    </ul>
    <p>Vous pouvez aussi deposer une plainte aupres de la <a href="https://www.cai.gouv.qc.ca" target="_blank" rel="noopener">Commission d'acces a l'information du Quebec</a>.</p>
    <h2>12. Modifications</h2>
    <p>Nous pouvons modifier cette politique. Les changements substantiels seront notifies par courriel. La date en haut du document sera mise a jour.</p>
</div>
<footer>&copy; 2026 Novalis IA — Elliot Pelletier &middot; <a href="/">Accueil</a> &middot; <a href="/conditions-utilisation">Conditions d'utilisation</a></footer>
</body>
</html>""")

@app.get("/conditions-utilisation", response_class=HTMLResponse)
async def terms_of_service():
    return HTMLResponse(content="""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conditions d'utilisation -- Novalis IA</title>
    <meta name="description" content="Conditions d'utilisation des services Novalis IA.">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #060a12;
            --bg2: #0d1520;
            --card: #111827;
            --border: rgba(255,255,255,0.07);
            --accent: #38bdf8;
            --green: #34d399;
            --text: #f1f5f9;
            --muted: #64748b;
            --muted2: #94a3b8;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.7; }
        nav { position: sticky; top: 0; width: 100%; z-index: 100; background: rgba(6,10,18,0.92); backdrop-filter: blur(24px); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 16px 24px; display: flex; align-items: center; gap: 16px; }
        .nav-logo { font-weight: 900; font-size: 1.1rem; color: var(--accent); letter-spacing: 1px; text-decoration: none; }
        .nav-back { color: var(--muted2); text-decoration: none; font-size: 0.88rem; transition: color 0.2s; }
        .nav-back:hover { color: var(--accent); }
        .container { max-width: 760px; margin: 0 auto; padding: 56px 24px 80px; }
        h1 { font-size: 2rem; font-weight: 800; color: var(--text); margin-bottom: 8px; }
        .subtitle { color: var(--muted2); font-size: 0.9rem; margin-bottom: 48px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
        h2 { font-size: 1.15rem; font-weight: 700; color: var(--accent); margin: 36px 0 12px; }
        p { color: var(--muted2); margin-bottom: 14px; font-size: 0.95rem; }
        ul { color: var(--muted2); font-size: 0.95rem; margin: 0 0 14px 20px; }
        ul li { margin-bottom: 6px; }
        a { color: var(--accent); text-decoration: none; }
        a:hover { text-decoration: underline; }
        .highlight-box { background: var(--card); border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
        .highlight-box p { margin: 0; color: var(--muted2); }
        footer { border-top: 1px solid var(--border); padding: 32px 24px; text-align: center; color: var(--muted); font-size: 0.82rem; margin-top: 40px; }
    </style>
</head>
<body>
<nav>
    <a href="/" class="nav-logo">NOVALIS</a>
    <span style="color:var(--muted);">|</span>
    <a href="/" class="nav-back">&#8592; Retour a l'accueil</a>
</nav>
<div class="container">
    <h1>Conditions d'utilisation</h1>
    <p class="subtitle">Derniere mise a jour : 1er janvier 2026 — En utilisant les services Novalis IA, vous acceptez les presentes conditions.</p>
    <h2>1. Description du service</h2>
    <p>Novalis IA (exploitee par Elliot Pelletier) fournit des services d'automatisation IA pour entreprises : agents conversationnels (SMS, WhatsApp, Messenger, voix), automatisation de processus, integrations sur mesure et consultation strategique.</p>
    <h2>2. Acces au service</h2>
    <p>L'acces necessite un compte client. Vous etes responsable de la confidentialite de vos identifiants. Novalis peut suspendre un compte en cas de violation des presentes conditions.</p>
    <h2>3. Tarification et paiement</h2>
    <div class="highlight-box">
        <p><strong>Forfait Starter : 497 $/mois</strong> (CAD, taxes en sus). Facturation mensuelle automatique. Premier paiement a la date de demarrage du service.</p>
    </div>
    <p>D'autres forfaits sont disponibles selon entente. Prix en CAD, hors TPS/TVQ. Tarifs modifiables avec 30 jours de preavis. Non-paiement : suspension apres 7 jours d'avis.</p>
    <h2>4. Duree et annulation</h2>
    <ul>
        <li>Abonnement mensuel renouvelable automatiquement.</li>
        <li><strong>Preavis de 30 jours</strong> requis avant le renouvellement.</li>
        <li>Demande de resiliation par courriel a <a href="mailto:novalisproia@gmail.com">novalisproia@gmail.com</a>.</li>
        <li>Aucun remboursement pour la periode en cours.</li>
        <li>Donnees conservees 90 jours apres resiliation puis supprimees.</li>
    </ul>
    <h2>5. Utilisation acceptable</h2>
    <p>Utilisation uniquement a des fins legales. Sont interdits : spam via nos agents IA, usages frauduleux ou illegaux, contournement des mesures de securite, revente sans autorisation ecrite.</p>
    <h2>6. Propriete intellectuelle</h2>
    <p>Novalis conserve les droits sur sa plateforme et ses algorithmes. Le client conserve la propriete de ses donnees. Novalis peut utiliser des donnees agregees anonymisees pour ameliorer ses services.</p>
    <h2>7. Limitation de responsabilite</h2>
    <ul>
        <li>Novalis n'est pas responsable des dommages indirects ou consecutifs.</li>
        <li>Responsabilite totale limitee aux sommes payees les 3 derniers mois.</li>
        <li>Disponibilite visee : 99,5 % (non garantie contractuellement).</li>
        <li>Novalis n'est pas responsable des decisions prises sur la base des sorties IA.</li>
    </ul>
    <h2>8. Confidentialite</h2>
    <p>Le traitement de vos donnees est regi par notre <a href="/politique-confidentialite">Politique de confidentialite</a>, conforme a la Loi 25 du Quebec.</p>
    <h2>9. Modifications des conditions</h2>
    <p>Modifications notifiees 30 jours avant entree en vigueur. L'utilisation continue vaut acceptation.</p>
    <h2>10. Droit applicable</h2>
    <p>Lois du Quebec et du Canada. Juridiction exclusive des tribunaux du Quebec.</p>
    <h2>11. Contact</h2>
    <ul>
        <li><strong>Courriel :</strong> <a href="mailto:novalisproia@gmail.com">novalisproia@gmail.com</a></li>
        <li><strong>Entreprise :</strong> Novalis IA — Elliot Pelletier, Quebec, Canada</li>
    </ul>
</div>
<footer>&copy; 2026 Novalis IA — Elliot Pelletier &middot; <a href="/">Accueil</a> &middot; <a href="/politique-confidentialite">Politique de confidentialite</a></footer>
</body>
</html>""")

# ============================================================
# BLOG SEO — Trafic organique Québec PMEs
# ============================================================

_BLOG_NAV = """
<nav aria-label="Navigation principale">
    <div class="nav-inner">
        <a href="/" class="logo" style="text-decoration:none;">NOVALIS</a>
        <div class="nav-links">
            <a href="/#services">Services</a>
            <a href="/#demo">Démo</a>
            <a href="/#pricing">Tarifs</a>
            <a href="/blog">Blog</a>
            <a href="https://novalisia.ca/#contact" class="btn-nav">Consultation gratuite</a>
        </div>
    </div>
</nav>"""

_BLOG_CSS = """
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
    :root {
        --bg: #060a12; --bg2: #0d1520; --card: #111827;
        --border: rgba(255,255,255,0.07); --border-glow: rgba(56,189,248,0.25);
        --accent: #38bdf8; --accent2: #0ea5e9; --green: #34d399;
        --text: #f1f5f9; --muted: #64748b; --muted2: #94a3b8;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; overflow-x: hidden; }
    nav { position: sticky; top: 0; width: 100%; z-index: 100; background: rgba(6,10,18,0.92); backdrop-filter: blur(24px); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 16px 0; }
    .nav-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; display: flex; justify-content: space-between; align-items: center; }
    .logo { font-size: 1.5rem; font-weight: 900; letter-spacing: -0.02em; background: linear-gradient(135deg, var(--accent), var(--green)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .nav-links { display: flex; gap: 32px; align-items: center; }
    .nav-links a { color: var(--muted); text-decoration: none; font-size: 0.875rem; font-weight: 500; transition: color 0.2s; }
    .nav-links a:hover { color: var(--text); }
    .btn-nav { background: var(--accent); color: #060a12 !important; padding: 10px 22px; border-radius: 8px; font-weight: 700 !important; font-size: 0.875rem; text-decoration: none; transition: all 0.2s; }
    .btn-nav:hover { background: var(--green); transform: translateY(-1px); }
    .container { max-width: 1200px; margin: 0 auto; padding: 56px 24px 80px; }
    .article-container { max-width: 780px; margin: 0 auto; padding: 56px 24px 80px; }
    h1 { font-size: 2.4rem; font-weight: 900; line-height: 1.15; letter-spacing: -0.02em; margin-bottom: 20px; }
    h2 { font-size: 1.4rem; font-weight: 700; color: var(--accent); margin: 40px 0 14px; }
    h3 { font-size: 1.1rem; font-weight: 700; margin: 28px 0 10px; }
    p { color: var(--muted2); margin-bottom: 16px; font-size: 0.97rem; line-height: 1.8; }
    ul, ol { color: var(--muted2); font-size: 0.97rem; margin: 0 0 16px 22px; }
    ul li, ol li { margin-bottom: 8px; line-height: 1.7; }
    strong { color: var(--text); }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .blog-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 28px; margin-top: 48px; }
    .blog-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 32px; transition: all 0.3s; text-decoration: none; display: block; }
    .blog-card:hover { border-color: var(--border-glow); transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.3); text-decoration: none; }
    .blog-card-tag { display: inline-block; background: rgba(56,189,248,0.1); color: var(--accent); border: 1px solid rgba(56,189,248,0.2); border-radius: 6px; padding: 3px 10px; font-size: 0.75rem; font-weight: 600; margin-bottom: 14px; }
    .blog-card h2 { font-size: 1.15rem; font-weight: 700; color: var(--text); margin: 0 0 12px; }
    .blog-card p { color: var(--muted); font-size: 0.88rem; margin: 0 0 16px; }
    .blog-card-footer { color: var(--accent); font-size: 0.85rem; font-weight: 600; }
    .article-meta { color: var(--muted); font-size: 0.85rem; margin-bottom: 40px; padding-bottom: 28px; border-bottom: 1px solid var(--border); }
    .article-meta span { margin-right: 20px; }
    .cta-box { background: linear-gradient(135deg, rgba(56,189,248,0.1), rgba(52,211,153,0.08)); border: 1px solid rgba(56,189,248,0.25); border-radius: 16px; padding: 40px; margin-top: 56px; text-align: center; }
    .cta-box h3 { font-size: 1.4rem; font-weight: 800; margin-bottom: 12px; }
    .cta-box p { color: var(--muted2); margin-bottom: 24px; }
    .btn-cta { display: inline-block; background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #fff; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 1rem; text-decoration: none; transition: all 0.3s; }
    .btn-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(56,189,248,0.35); text-decoration: none; }
    .back-link { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 0.875rem; text-decoration: none; margin-bottom: 40px; transition: color 0.2s; }
    .back-link:hover { color: var(--accent); }
    .hero-blog { background: linear-gradient(135deg, rgba(56,189,248,0.06), rgba(52,211,153,0.04)); border-bottom: 1px solid var(--border); padding: 64px 24px 48px; text-align: center; }
    .hero-blog h1 { font-size: 2.8rem; max-width: 700px; margin: 0 auto 16px; }
    .hero-blog p { max-width: 600px; margin: 0 auto; }
    footer { border-top: 1px solid var(--border); padding: 40px 24px; text-align: center; color: var(--muted); font-size: 0.82rem; margin-top: 40px; }
    footer a { color: var(--muted2); }
    @media (max-width: 768px) {
        .blog-grid { grid-template-columns: 1fr; }
        h1 { font-size: 1.8rem; }
        .hero-blog h1 { font-size: 2rem; }
    }
</style>"""

_BLOG_FOOTER = """
<footer>
    <p>&copy; 2026 Novalis IA Inc. &mdash; Qu&eacute;bec, Canada &nbsp;&middot;&nbsp;
    <a href="/">Accueil</a> &nbsp;&middot;&nbsp;
    <a href="/blog">Blog</a> &nbsp;&middot;&nbsp;
    <a href="/politique-confidentialite">Politique de confidentialit&eacute;</a></p>
</footer>"""

_ARTICLES = {
    "agent-ia-pme-quebec": {
        "title": "Comment un agent IA peut faire économiser 10h/semaine à votre PME québécoise",
        "description": "Appels manqués, demandes hors heures, prise de RDV — découvrez comment un agent IA permet aux PMEs du Québec d'économiser 10h par semaine et d'augmenter leurs revenus.",
        "tag": "Agent IA",
        "intro": "Chaque semaine, votre PME perd des heures et des clients à cause de tâches répétitives. Découvrez comment l'automatisation par agent IA change la donne.",
    },
    "site-web-pme-desuet": {
        "title": "Votre site web fait fuir vos clients : 5 signes que c'est le moment de le refaire",
        "description": "Un site web désuét coûte des clients. Voici 5 signes concrets que votre site freine votre croissance et comment une refonte modernise votre présence en ligne au Québec.",
        "tag": "Site Web",
        "intro": "Votre site web est souvent le premier contact qu'un client potentiel a avec votre entreprise. S'il donne une mauvaise impression, il repart — sans jamais revenir.",
    },
    "automatisation-rendez-vous-quebec": {
        "title": "Arrêtez de perdre des clients à cause des heures d'ouverture : l'automatisation des RDV au Québec",
        "description": "Clients qui appellent le soir, no-shows, agenda difficile à gérer — l'automatisation de la prise de rendez-vous résout ces problèmes pour les PMEs québécoises.",
        "tag": "Automatisation RDV",
        "intro": "Au Québec, plus de 60 % des demandes de rendez-vous arrivent en dehors des heures d'ouverture. Et chaque appel manqué, c'est potentiellement un client qui appelle votre concurrent.",
    },
    "intelligence-artificielle-petite-entreprise": {
        "title": "L'intelligence artificielle n'est plus réservée aux grandes entreprises — guide pour les PMEs",
        "description": "Guide complet sur l'IA pour les petites entreprises au Québec. Ce que l'IA peut vraiment faire, les mythes à démystifier et combien ça coûte réellement (dès 497$/mois).",
        "tag": "Guide IA",
        "intro": "On pense souvent que l'intelligence artificielle est réservée aux Amazon, Google et grandes banques de ce monde. Mais depuis 2024, la réalité a radicalement changé pour les PMEs.",
    },
}


def _article_body(slug: str) -> str:
    if slug == "agent-ia-pme-quebec":
        return """
<h2>Le problème invisible qui coûte des milliers de dollars par an</h2>
<p>Imaginez un client qui cherche un plombier d'urgence à 19h30. Il appelle. Personne ne répond. Il essaie le suivant dans Google. Ce client — et les centaines d'autres dans la même situation — représente un manque à gagner direct pour votre entreprise.</p>
<p>Selon une étude récente, <strong>78 % des consommateurs choisissent le premier fournisseur qui répond à leur demande</strong>. Pour une PME au Québec, être disponible 24h/24 n'était autrefois possible qu'avec un employé dédié au service client. Ce n'est plus le cas.</p>
<h2>Ce qu'un agent IA fait concrètement pour votre PME</h2>
<p>Un agent IA conversationnel peut gérer, en temps réel et sans supervision humaine :</p>
<ul>
<li><strong>Les demandes de renseignements</strong> (prix, disponibilités, politiques)</li>
<li><strong>La prise de rendez-vous</strong> directement dans votre agenda (Google Calendar, Calendly, etc.)</li>
<li><strong>Les suivis après-vente</strong> et rappels automatiques</li>
<li><strong>La qualification des prospects</strong> avant de les transférer à votre équipe</li>
<li><strong>La réponse aux messages Facebook, Instagram et WhatsApp</strong> en quelques secondes</li>
</ul>
<p>Le résultat concret? Les PMEs qui déploient un agent Novalis récupèrent en moyenne <strong>8 à 12 heures de travail par semaine</strong> — des heures que vous ou votre équipe passiez à répondre aux mêmes questions répétitives.</p>
<h2>Calcul ROI : combien vaut vraiment 10 heures par semaine?</h2>
<p>Faisons le calcul ensemble. Si votre équipe répond à 25 messages ou appels par jour, et que chaque interaction prend 5 minutes :</p>
<ul>
<li>25 interactions x 5 min = 125 minutes par jour</li>
<li>125 min x 22 jours ouvrables = <strong>2 750 minutes, soit ~46 heures par mois</strong></li>
<li>À 25 $/h, c'est <strong>1 150 $ par mois en coût de main-d'oeuvre</strong> pour des tâches répétitives</li>
</ul>
<p>L'agent IA Novalis automatise jusqu'à 80 % de ces interactions. Vous économisez <strong>920 $ par mois</strong> tout en étant disponible 24h/24 — pour 497 $/mois. C'est un ROI positif dès le premier mois.</p>
<h2>Les appels manqués hors heures : la pire fuite de revenus</h2>
<p>Une clinique de physiothérapie à Laval nous a contactés après avoir réalisé que <strong>40 % de ses demandes de rendez-vous arrivaient entre 18h et 8h</strong>. Ces demandes étaient simplement ignorées jusqu'au lendemain matin — et souvent, le patient avait déjà pris RDV ailleurs.</p>
<p>Depuis le déploiement de leur agent Novalis, tous ces appels et messages sont traités instantanément. L'agenda se remplit automatiquement. Le personnel arrive le matin avec une liste de rendez-vous confirmés, pas une boîte vocale pleine.</p>
<h2>Automatisation et touche humaine : pas incompatibles</h2>
<p>L'idée n'est pas de remplacer votre équipe, mais de la libérer. L'agent IA s'occupe de 80 % des demandes courantes. Pour les cas complexes — plaintes, négociations, situations délicates — il transfère automatiquement à un humain avec un résumé complet de la conversation.</p>
<p>Votre client ne remarque même pas la transition. Il a l'impression d'être bien servi rapidement. C'est ça, l'automatisation intelligente.</p>
<h2>Par où commencer?</h2>
<p>Chez <strong>Novalis IA</strong>, on déploie des agents conversationnels sur mesure en 48 heures. On s'occupe de tout : configuration, intégration à vos outils existants, et formation de l'agent sur votre secteur d'activité. Dès 497 $/mois, sans engagement long terme.</p>
<p>Si vous êtes propriétaire d'une PME au Québec et que vous en avez assez de manquer des appels ou de passer vos soirées à répondre à des messages, il est temps d'explorer ce que l'automatisation peut faire pour vous.</p>"""
    elif slug == "site-web-pme-desuet":
        return """
<h2>Signe #1 : Votre site n'est pas adapté aux mobiles</h2>
<p>Aujourd'hui, <strong>plus de 65 % du trafic web au Québec provient des téléphones intelligents</strong>. Si votre site nécessite de zoomer, de faire défiler horizontalement ou affiche des éléments qui se chevauchent sur un téléphone, vous perdez des clients à chaque visite mobile.</p>
<p>Google pénalise également les sites non-responsive dans ses résultats de recherche. Un site qui ne s'adapte pas aux mobiles est invisible dans les recherches locales — exactement là où vos clients potentiels vous cherchent.</p>
<h2>Signe #2 : Pas de HTTPS (le cadenas dans la barre d'adresse)</h2>
<p>Si votre site affiche encore "HTTP" au lieu de "HTTPS", les navigateurs modernes affichent un avertissement de sécurité à vos visiteurs. Résultat : ils quittent immédiatement, même si votre site ne contient aucun danger réel.</p>
<p>Un certificat SSL est <strong>gratuit et obligatoire</strong> en 2025. Son absence signale à Google et aux visiteurs que votre site est abandonné ou négligé — deux impressions catastrophiques pour une entreprise sérieuse.</p>
<h2>Signe #3 : Votre site prend plus de 3 secondes à charger</h2>
<p>Selon Google, <strong>53 % des visiteurs quittent un site mobile qui prend plus de 3 secondes à se charger</strong>. Chaque seconde supplémentaire réduit votre taux de conversion de 7 %. Si votre site est construit sur une vieille technologie avec des images non optimisées, vous perdez des clients avant même qu'ils aient vu votre offre.</p>
<p>Les sites modernes construits avec les bonnes technologies chargent en moins d'une seconde. C'est la différence entre un client qui reste et un client qui rebondit vers votre concurrent.</p>
<h2>Signe #4 : Aucun formulaire de contact ou prise de rendez-vous en ligne</h2>
<p>Si vos clients ne peuvent contacter votre entreprise que par téléphone ou en se déplaçant, vous vous coupez d'une génération entière d'acheteurs qui préfèrent tout faire en ligne. Un formulaire de contact basique ne suffit plus en 2025.</p>
<p>Les PMEs qui intègrent une prise de rendez-vous en ligne voient <strong>en moyenne 35 % plus de conversions</strong> qu'avec un simple numéro de téléphone. Les gens veulent réserver à minuit depuis leur lit — pas rappeler demain matin.</p>
<h2>Signe #5 : Design et contenu datant de plus de 4 ans</h2>
<p>Le design web évolue vite. Un site de 2018 ou 2019 ressemble aujourd'hui à un site de 1995 aux yeux de vos visiteurs. Les polices trop petites, les couleurs criardes, les photos génériques de banque d'images et les textes institutionnels inspirent une méfiance immédiate.</p>
<p>Votre site web est votre vendeur #1. Il travaille 24h/24, 7j/7. S'il communique "cette entreprise ne s'investit pas dans sa présence professionnelle", vos prospects iront chez un concurrent qui leur inspire confiance.</p>
<h2>La refonte de site web avec Novalis : rapide, moderne, efficace</h2>
<p>Chez <strong>Novalis IA</strong>, on conçoit des sites web modernes pour les PMEs québécoises : rapides, sécurisés, optimisés pour le référencement local, et intégrés à vos outils d'automatisation. On ne construit pas que de beaux sites — on construit des outils de vente.</p>
<p>Chaque site que nous livrons inclut : design responsive, HTTPS, optimisation de vitesse, SEO local, formulaires de contact intelligents et, si vous le souhaitez, un agent IA intégré pour répondre aux visiteurs 24h/24.</p>
<p>Si votre site actuel vous fait honte ou que vous hésitez à le partager avec des clients, c'est le signal qu'il est temps de passer à autre chose.</p>"""
    elif slug == "automatisation-rendez-vous-quebec":
        return """
<h2>Le problème des heures d'ouverture : une réalité québécoise</h2>
<p>Au Québec, la grande majorité des PMEs opèrent de 9h à 17h, du lundi au vendredi. Mais vos clients, eux, ont des besoins à toutes heures. Le soir après le souper, la fin de semaine, entre deux réunions — c'est là qu'ils pensent à prendre leur rendez-vous chez le dentiste, le kyné, le salon de coiffure ou le consultant.</p>
<p><strong>Résultat concret : vous perdez des rendez-vous chaque nuit.</strong> Ces clients ne rappellent pas nécessairement le lendemain matin. Certains trouvent un concurrent qui leur permet de réserver immédiatement en ligne. D'autres oublient simplement.</p>
<h2>Les no-shows : un fléau qui coûte cher</h2>
<p>Les absences sans préavis représentent entre <strong>10 % et 30 % des rendez-vous</strong> dans la plupart des secteurs de services. Pour une clinique, un garage ou un studio, chaque no-show, c'est un créneau vide qui aurait pu générer des revenus.</p>
<p>L'automatisation des rappels règle ce problème directement. Un message texte automatique envoyé 24h avant le rendez-vous, avec un lien pour confirmer ou annuler, réduit les no-shows de <strong>60 à 80 %</strong> selon les données de nos clients Novalis.</p>
<h2>Comment fonctionne l'automatisation de la prise de RDV</h2>
<p>Voici ce qui se passe quand un client envoie un message à votre entreprise à 21h30 :</p>
<ol>
<li>L'agent IA Novalis détecte la demande de rendez-vous</li>
<li>Il consulte votre agenda en temps réel (Google Calendar, Calendly, Jane App, etc.)</li>
<li>Il propose 2-3 créneaux disponibles adaptés aux préférences du client</li>
<li>Le client confirme. Le rendez-vous est inscrit automatiquement</li>
<li>Une confirmation est envoyée par SMS ou courriel</li>
<li>Un rappel automatique est planifié 24h à l'avance</li>
</ol>
<p>Tout ça sans que vous ou votre équipe n'ayez à intervenir. Le lendemain matin, votre agenda est à jour.</p>
<h2>Cas réel : un salon de coiffure à Montréal</h2>
<p>Une propriétaire de salon de coiffure dans le Plateau-Mont-Royal nous a contactés après avoir réalisé qu'elle passait <strong>2 heures par jour</strong> à répondre à des messages Facebook et Instagram pour confirmer des rendez-vous. Elle travaillait, en plus de couper des cheveux, comme secrétaire non rémunérée pour son propre commerce.</p>
<p>Depuis le déploiement de l'agent Novalis, 100 % des demandes de RDV sont gérées automatiquement. Elle a récupéré 10 heures par semaine. Son taux de no-shows a chuté de 28 % à 6 %. Et son chiffre d'affaires a augmenté de 18 % grâce aux créneaux qui ne restaient plus vides.</p>
<h2>ROI de l'automatisation des rendez-vous</h2>
<p>Calculons pour un cabinet de physiothérapie avec 30 rendez-vous par semaine :</p>
<ul>
<li>Valeur moyenne d'un rendez-vous : 85 $</li>
<li>Taux de no-show avant automatisation : 20 % = 6 rendez-vous perdus/semaine</li>
<li>Valeur perdue : 6 x 85 $ x 4 semaines = <strong>2 040 $/mois</strong></li>
<li>Réduction des no-shows avec Novalis : 70 % -&gt; récupération de ~1 400 $/mois</li>
<li>Coût de la solution Novalis : 497 $/mois</li>
</ul>
<p><strong>Profit net dès le premier mois : ~900 $</strong> — sans compter les nouveaux RDV pris hors heures d'ouverture.</p>
<h2>Prêt à arrêter de perdre des clients la nuit?</h2>
<p>Chez <strong>Novalis IA</strong>, on déploie des solutions d'automatisation de rendez-vous pour les PMEs québécoises en 48 heures. On s'intègre à vos outils existants et on forme l'agent IA sur votre secteur. Dès 497 $/mois, sans contrat annuel.</p>"""
    else:  # intelligence-artificielle-petite-entreprise
        return """
<h2>L'IA en 2025 : pas ce que vous croyez</h2>
<p>Quand on parle d'intelligence artificielle, beaucoup de propriétaires de PMEs pensent à des projets de millions de dollars, à des équipes de data scientists et à une infrastructure technologique hors de portée. Cette image appartient au passé.</p>
<p>Aujourd'hui, des outils d'IA puissants et abordables sont accessibles à n'importe quelle entreprise, peu importe sa taille. Un restaurant de quartier, un garage automobile, une clinique de santé ou un consultant indépendant peuvent tous bénéficier de l'automatisation intelligente — à partir de <strong>497 $/mois</strong>.</p>
<h2>Les mythes les plus courants sur l'IA pour les PMEs</h2>
<h3>Mythe #1 : "C'est trop cher pour nous"</h3>
<p>La réalité : automatiser la réponse aux messages, la prise de rendez-vous et le suivi client coûte moins cher qu'un employé à temps partiel — et travaille 24h/24, 7j/7, sans congé maladie ni vacances.</p>
<h3>Mythe #2 : "Nos clients préfèrent parler à un humain"</h3>
<p>Les études montrent que <strong>68 % des consommateurs préfèrent une réponse instantanée à 3h du matin plutôt qu'une réponse humaine le lendemain</strong>. Ce que vos clients veulent, c'est être servis rapidement. L'IA excelle à ça.</p>
<h3>Mythe #3 : "C'est trop compliqué à mettre en place"</h3>
<p>Avec Novalis, le déploiement prend 48 heures. On s'occupe de tout : configuration, intégrations, tests. Vous n'avez pas besoin de comprendre comment ça marche pour en profiter.</p>
<h2>Ce que l'IA peut concrètement faire pour votre type d'entreprise</h2>
<h3>Restaurant ou café</h3>
<p>Gérer les réservations automatiquement, répondre aux questions sur le menu et les allergènes, envoyer des promotions ciblées aux clients fidèles, rappeler les réservations pour réduire les no-shows.</p>
<h3>Garage automobile</h3>
<p>Prendre les rendez-vous d'entretien 24h/24, envoyer des rappels de vidange d'huile, répondre aux demandes d'estimation, relancer les clients inactifs depuis 6 mois.</p>
<h3>Clinique ou cabinet de santé</h3>
<p>Automatiser la prise de rendez-vous, envoyer des rappels pré-visite, gérer les listes d'attente, répondre aux questions fréquentes sur les services et les assurances.</p>
<h2>Combien ça coûte vraiment?</h2>
<p>Chez <strong>Novalis IA</strong>, notre forfait Starter est à <strong>497 $/mois</strong> (CAD, taxes en sus). Il inclut :</p>
<ul>
<li>Agent IA conversationnel déployé sur vos canaux (SMS, WhatsApp, Messenger, site web)</li>
<li>Intégration à votre agenda et vos outils existants</li>
<li>Rappels automatiques et suivi client</li>
<li>Tableau de bord avec statistiques en temps réel</li>
<li>Support technique québécois, en français</li>
</ul>
<p>Pour mettre ça en perspective : à 25 $/h, 497 $ représente environ 20 heures de travail. Nos clients récupèrent en moyenne 40 à 50 heures de tâches répétitives par mois — soit un retour sur investissement de 2x à 2,5x dès le premier mois.</p>
<h2>Par où commencer?</h2>
<p>La meilleure façon de commencer avec l'IA, c'est de cibler un seul processus répétitif et de l'automatiser. Quel est le problème qui vous prend le plus de temps chaque semaine? Les messages sans fin? Les appels manqués? Les no-shows?</p>
<p>Chez <strong>Novalis IA</strong>, on commence par une consultation gratuite pour identifier votre plus grande douleur opérationnelle et proposer une solution concrète. Aucun engagement, aucune pression.</p>
<p>L'intelligence artificielle n'est plus réservée aux grandes entreprises. Elle est là, disponible, abordable — et vos concurrents l'adoptent déjà. La question n'est plus "est-ce que l'IA est pour moi?" mais "est-ce que je peux me permettre de ne pas l'adopter?"</p>"""


def _article_html(slug: str) -> str:
    art = _ARTICLES[slug]
    title = art["title"]
    description = art["description"]
    body = _article_body(slug)

    schema = (
        '<script type="application/ld+json">\n'
        '{\n'
        '  "@context": "https://schema.org",\n'
        '  "@type": "Article",\n'
        '  "headline": "' + title.replace('"', '\\"') + '",\n'
        '  "description": "' + description.replace('"', '\\"') + '",\n'
        '  "author": {"@type": "Organization", "name": "Novalis IA"},\n'
        '  "publisher": {"@type": "Organization", "name": "Novalis IA", "url": "https://novalisia.ca"},\n'
        '  "datePublished": "2025-05-01",\n'
        '  "dateModified": "2025-05-01",\n'
        '  "mainEntityOfPage": {"@type": "WebPage", "@id": "https://novalisia.ca/blog/' + slug + '"}\n'
        '}\n'
        '</script>'
    )

    escaped_title = title.replace('"', '&quot;')
    escaped_desc = description.replace('"', '&quot;')

    return (
        '<!DOCTYPE html>\n'
        '<html lang="fr">\n'
        '<head>\n'
        '    <meta charset="UTF-8">\n'
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        '    <title>' + title + ' | Novalis IA</title>\n'
        '    <meta name="description" content="' + escaped_desc + '">\n'
        '    <meta property="og:title" content="' + escaped_title + '">\n'
        '    <meta property="og:description" content="' + escaped_desc + '">\n'
        '    <meta property="og:type" content="article">\n'
        '    <meta property="og:url" content="https://novalisia.ca/blog/' + slug + '">\n'
        '    <meta property="og:image" content="/og-image.svg">\n'
        '    <meta name="twitter:card" content="summary_large_image">\n'
        '    <meta name="twitter:title" content="' + escaped_title + '">\n'
        '    <meta name="twitter:description" content="' + escaped_desc + '">\n'
        '    ' + schema + '\n'
        '    ' + _BLOG_CSS + '\n'
        '</head>\n'
        '<body>\n'
        + _BLOG_NAV + '\n'
        '<div class="article-container">\n'
        '    <a href="/blog" class="back-link">&#8592; Retour au blog</a>\n'
        '    <h1>' + title + '</h1>\n'
        '    <div class="article-meta">\n'
        '        <span>&#128197; Mai 2025</span>\n'
        '        <span>&#128203; Novalis IA</span>\n'
        '        <span>&#127758; Qu&eacute;bec, Canada</span>\n'
        '    </div>\n'
        + body + '\n'
        '    <div class="cta-box">\n'
        '        <h3>Prêt à automatiser votre entreprise?</h3>\n'
        '        <p>Rejoignez les PMEs québécoises qui ont récupéré des heures chaque semaine grâce à Novalis IA.</p>\n'
        '        <a href="https://novalisia.ca/#contact" class="btn-cta">Consultation gratuite &#8594;</a>\n'
        '    </div>\n'
        '</div>\n'
        + _BLOG_FOOTER + '\n'
        '</body>\n'
        '</html>'
    )


@app.get("/blog", response_class=HTMLResponse)
async def blog_index():
    cards = ""
    for slug, art in _ARTICLES.items():
        cards += (
            '\n        <a href="/blog/' + slug + '" class="blog-card">\n'
            '            <div class="blog-card-tag">' + art["tag"] + '</div>\n'
            '            <h2>' + art["title"] + '</h2>\n'
            '            <p>' + art["intro"] + '</p>\n'
            '            <div class="blog-card-footer">Lire l\'article &#8594;</div>\n'
            '        </a>'
        )

    return HTMLResponse(
        '<!DOCTYPE html>\n'
        '<html lang="fr">\n'
        '<head>\n'
        '    <meta charset="UTF-8">\n'
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        '    <title>Blog Novalis IA — Automatisation et IA pour les PMEs québécoises</title>\n'
        '    <meta name="description" content="Conseils pratiques sur l\'automatisation IA pour les PMEs au Québec. Agents conversationnels, refonte de sites web, prise de RDV automatique.">\n'
        '    <meta property="og:title" content="Blog Novalis IA — Automatisation et IA pour les PMEs québécoises">\n'
        '    <meta property="og:description" content="Conseils pratiques sur l\'automatisation IA pour les PMEs au Québec. Agents conversationnels, refonte de sites web, prise de RDV automatique.">\n'
        '    <meta property="og:type" content="website">\n'
        '    <meta property="og:url" content="https://novalisia.ca/blog">\n'
        '    <meta property="og:image" content="/og-image.svg">\n'
        '    <meta name="twitter:card" content="summary_large_image">\n'
        '    ' + _BLOG_CSS + '\n'
        '</head>\n'
        '<body>\n'
        + _BLOG_NAV + '\n'
        '<div class="hero-blog">\n'
        '    <h1>Blog Novalis IA</h1>\n'
        '    <p>Conseils pratiques sur l\'automatisation IA pour les PMEs au Québec. Agents conversationnels, refonte de sites web, prise de RDV automatique.</p>\n'
        '</div>\n'
        '<div class="container">\n'
        '    <div class="blog-grid">\n'
        + cards + '\n'
        '    </div>\n'
        '</div>\n'
        + _BLOG_FOOTER + '\n'
        '</body>\n'
        '</html>'
    )


@app.get("/blog/{slug}", response_class=HTMLResponse)
async def blog_article(slug: str):
    if slug not in _ARTICLES:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    return HTMLResponse(_article_html(slug))


# ============================================================
# SANTE DU SERVEUR
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

@app.get("/preview/{name_slug}/{prospect_id}", response_class=HTMLResponse)
@app.get("/preview/{prospect_id}", response_class=HTMLResponse)
async def preview_page(prospect_id: str, name_slug: str = ""):
    """Page d'audit + aperçu site impressionnant — envoyée dans les emails PME."""
    # Mode démo — données fictives pour tester le rendu
    if prospect_id == "demo":
        prospect = {
            "id": "demo",
            "name": "Plomberie Bolduc & Fils",
            "city": "Sorel-Tracy",
            "industry": "plombier",
            "website": "https://plomberiebolduc.ca",
            "email": "info@plomberiebolduc.ca",
            "phone": "450 742-3381",
            "web_score": 1,
            "web_issues": json.dumps([
                "Site non-mobile — illisible sur téléphone",
                "Pas de certificat HTTPS (non sécurisé)",
                "Technologie Flash/jQuery 1.x désuète",
                "Aucun appel à l'action visible",
                "Temps de chargement excessif (8+ secondes)",
            ]),
            "insights": "Site créé vers 2009, non sécurisé, impossible à utiliser sur mobile. 78% des recherches de plombiers se font sur téléphone — ce site perd presque tous ces clients.",
            "pain_points": json.dumps(["Invisible sur mobile", "Non sécurisé HTTP", "Design 2009 décrédibilise l'entreprise"]),
            "rating": "4.6",
            "review_count": "43 avis",
            "brand_meta": json.dumps({
                "brand_color": "#1d4ed8",
                "accent_color": "#f97316",
                "logo_url": "",
                "og_image": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80",
                "favicon_url": "",
                "gallery": [
                    "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&q=80",
                    "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=800&q=80",
                    "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=800&q=80",
                    "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=800&q=80",
                    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
                ],
                "hours": [
                    "Lundi: 7h00 – 18h00",
                    "Mardi: 7h00 – 18h00",
                    "Mercredi: 7h00 – 18h00",
                    "Jeudi: 7h00 – 18h00",
                    "Vendredi: 7h00 – 17h00",
                    "Samedi: 8h00 – 12h00",
                    "Dimanche: Urgences seulement",
                ],
                "address": "284 rue du Roi, Sorel-Tracy, QC J3P 1P4",
                "about": "En affaires depuis 1987, Plomberie Bolduc & Fils dessert la région de Sorel-Tracy et ses environs. Entreprise familiale certifiée RBQ, spécialisée en plomberie résidentielle et commerciale, chauffe-eau, drain français et urgences 24/7. Membre de l'Association de la construction du Québec.",
                "services_data": [
                    {"name": "Plomberie résidentielle", "desc": "Installation, réparation et remplacement — robinets, tuyaux, toilettes, éviers."},
                    {"name": "Chauffe-eau & thermopompe", "desc": "Installation et remplacement de chauffe-eau traditionnels et sans réservoir."},
                    {"name": "Drain français", "desc": "Inspection, nettoyage et remplacement de drains — protégez votre fondation."},
                    {"name": "Urgences 24h/7j", "desc": "Intervention rapide en cas de dégât d'eau, bris de tuyau ou fuite urgente."},
                ],
            }),
            "generated_emails": json.dumps({"site_preview": {
                "hero_title": "Plombier certifié RBQ à Sorel-Tracy — Urgences 24h/7j",
                "hero_subtitle": "Plomberie Bolduc & Fils · En affaires depuis 1987 · Intervention rapide garantie.",
                "services": ["Plomberie résidentielle", "Chauffe-eau & thermopompe", "Drain français", "Urgences 24h/7j"],
                "trust_line": "4.6 ⭐ · 43 avis Google · Certifié RBQ · Sorel-Tracy depuis 1987",
                "cta": "Appeler maintenant",
                "color_theme": "blue",
                "phone": "450 742-3381",
            }}),
        }
    else:
        prospect = None
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            for table in ("prospect_suggestions", "prospect_bank"):
                cur = await db.execute(f"SELECT * FROM {table} WHERE id=?", (prospect_id,))
                row = await cur.fetchone()
                if row:
                    prospect = dict(row)
                    break
    if not prospect:
        return HTMLResponse("<h2 style='font-family:sans-serif;text-align:center;margin-top:80px;color:#64748b'>Page introuvable</h2>", status_code=404)

    name      = prospect.get("name", "votre entreprise")
    city      = prospect.get("city", "Québec")
    industry  = prospect.get("industry", "votre secteur")
    web_score = int(prospect.get("web_score") or 5)
    web_issues= json.loads(prospect.get("web_issues") or "[]")
    insights  = prospect.get("insights", "")
    pain_points = json.loads(prospect.get("pain_points") or "[]")
    rating    = prospect.get("rating", "")
    review_count = prospect.get("review_count", "")
    generated  = json.loads(prospect.get("generated_emails") or "{}")
    sp         = generated.get("site_preview", {})
    bm         = json.loads(prospect.get("brand_meta") or "{}")
    industry_lower = industry.lower()

    # ── Real structured data from scraping ───────────────────────────────────
    real_hours   = bm.get("hours", [])
    real_address = bm.get("address", "")
    real_about   = bm.get("about", "")
    real_svcs    = bm.get("services_data", [])

    # ── Contact réel (Google Places + scraping) ───────────────────────────────
    phone_raw    = (sp.get("phone") or prospect.get("phone") or "").strip()
    phone_digits = re.sub(r"[^\d+]", "", phone_raw)
    if phone_digits and not phone_digits.startswith("+"):
        phone_digits = ("+1" + phone_digits) if len(phone_digits) == 10 else phone_digits
    phone_display = phone_raw
    biz_email    = (prospect.get("email") or "").strip()
    biz_website  = (prospect.get("website") or "").strip()
    # Tel href — fallback to novalisia contact if no phone
    _tel_href  = f"tel:{phone_digits}" if phone_digits else "mailto:elliot@novalisia.ca"
    _tel_label = phone_display if phone_display else "Nous contacter"
    # Mailto CTA — PME writes to us using their name as subject so we know who they are
    _mail_href = f"mailto:elliot@novalisia.ca?subject=Site%20web%20-%20{name.replace(' ', '%20')}"

    # ── Vraies données du site (logo, image, couleurs) ────────────────────────
    real_logo    = bm.get("logo_url", "")
    real_og      = bm.get("og_image", "")
    real_favicon = bm.get("favicon_url", "")
    real_color1  = bm.get("brand_color", "")
    real_color2  = bm.get("accent_color", "")

    # ── site_preview content ──────────────────────────────────────────────────
    hero_title   = sp.get("hero_title")   or f"{name} — {city}"
    hero_subtitle= sp.get("hero_subtitle") or f"Service professionnel à {city}. Réponse rapide, satisfaction garantie."
    services_list= sp.get("services")     or ["Service professionnel", "Disponible 24/7", "Réponse rapide", "Satisfaction garantie"]
    trust_line   = sp.get("trust_line")   or f"Des centaines de clients satisfaits à {city}"
    cta_text     = sp.get("cta")          or "Nous contacter"
    color_theme  = sp.get("color_theme",  "purple")

    # ── Theme palette (vraies couleurs si disponibles, sinon par industrie) ───
    palettes = {
        "blue":   {"bg":"#050d1f","grad1":"#0ea5e9","grad2":"#2563eb","accent":"#38bdf8","light":"#bae6fd","btn":"#0284c7"},
        "green":  {"bg":"#030f07","grad1":"#16a34a","grad2":"#059669","accent":"#4ade80","light":"#bbf7d0","btn":"#15803d"},
        "purple": {"bg":"#0d0720","grad1":"#7c3aed","grad2":"#a21caf","accent":"#a78bfa","light":"#e9d5ff","btn":"#6d28d9"},
        "orange": {"bg":"#120700","grad1":"#ea580c","grad2":"#dc2626","accent":"#fb923c","light":"#fed7aa","btn":"#c2410c"},
        "red":    {"bg":"#0f0202","grad1":"#dc2626","grad2":"#9f1239","accent":"#f87171","light":"#fecaca","btn":"#b91c1c"},
        "yellow": {"bg":"#0c0900","grad1":"#d97706","grad2":"#ca8a04","accent":"#fbbf24","light":"#fef08a","btn":"#b45309"},
    }
    p = palettes.get(color_theme, palettes["purple"])
    bg,g1,g2,acc,lgt,btn = p["bg"],p["grad1"],p["grad2"],p["accent"],p["light"],p["btn"]

    # ── Override avec les vraies couleurs du site si disponibles ─────────────
    if real_color1:
        g1 = real_color1
        btn = real_color1
        acc = real_color1
        lgt = real_color2 or real_color1
    if real_color2:
        g2 = real_color2

    # ── Industry gradient backgrounds ─────────────────────────────────────────
    industry_gradients = {
        "restaurant": f"linear-gradient(135deg,#1a0a00 0%,#3d1505 40%,{g1}44 100%)",
        "salon":      f"linear-gradient(135deg,#0d0020 0%,#2d0858 40%,{g1}44 100%)",
        "coiffure":   f"linear-gradient(135deg,#0d0020 0%,#2d0858 40%,{g1}44 100%)",
        "clinique":   f"linear-gradient(135deg,#000d1f 0%,#002244 40%,{g1}44 100%)",
        "médecin":    f"linear-gradient(135deg,#000d1f 0%,#002244 40%,{g1}44 100%)",
        "dentiste":   f"linear-gradient(135deg,#000d1f 0%,#002244 40%,{g1}44 100%)",
        "garage":     f"linear-gradient(135deg,#0a0a0a 0%,#1a1a1a 40%,{g1}44 100%)",
        "construction":f"linear-gradient(135deg,#0c0800 0%,#1f1500 40%,{g1}44 100%)",
        "immobilier": f"linear-gradient(135deg,#030f07 0%,#071a0d 40%,{g1}44 100%)",
        "avocat":     f"linear-gradient(135deg,#050510 0%,#0d0d25 40%,{g1}44 100%)",
    }
    _industry_hero_bg = next((v for k,v in industry_gradients.items() if k in industry_lower),
                   f"linear-gradient(135deg,{bg} 0%,#1a1040 40%,{g1}44 100%)")
    # Si on a la vraie image du site → l'utiliser comme fond avec overlay sombre
    if real_og:
        hero_bg = f"url('{real_og}') center/cover no-repeat"
    else:
        hero_bg = _industry_hero_bg
    # When we have their brand color, tint the overlay with it (makes hero feel like THEIR brand)
    if real_color1 and real_og:
        hero_overlay_css = f"linear-gradient(to top,{real_color1}f0 0%,{real_color1}99 45%,{real_color1}33 100%)"
    else:
        hero_overlay_css = "linear-gradient(to top right,rgba(12,7,4,0.88) 0%,rgba(12,7,4,0.50) 55%,rgba(12,7,4,0.64) 100%)"

    # ── Industry pattern overlay (SVG) ────────────────────────────────────────
    pattern_svg = "data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E"

    # ── Services cards ────────────────────────────────────────────────────────
    services_html = ""
    svc_source = real_svcs[:4] if real_svcs else [{"name": s, "desc": ""} for s in services_list[:4]]
    for _si, _svc in enumerate(svc_source, 1):
        _name = _svc["name"] if isinstance(_svc, dict) else _svc
        _desc = _svc.get("desc", "") if isinstance(_svc, dict) else ""
        _desc_html = f'<div class="svc-desc">{_desc}</div>' if _desc else ""
        services_html += f'<div class="svc-row reveal d{min(_si,3)}"><div class="svc-num">0{_si}</div><div><div class="svc-title">{_name}</div>{_desc_html}</div></div>'

    # ── Testimonials by industry ──────────────────────────────────────────────
    testimonials_map = {
        "restaurant": [
            ("Sophie L.", "Réservation ultra simple, table parfaite. Je recommande!","★★★★★"),
            ("Marc T.",   "Réponse immédiate même à 22h. Impressionnant.","★★★★★"),
            ("Julie R.",  "Super service, on revient chaque semaine.","★★★★★"),
        ],
        "salon": [
            ("Amélie B.", "J'ai réservé en ligne à minuit et reçu une confirmation en 30 sec!","★★★★★"),
            ("Kevin D.",  "Rappel SMS la veille — j'oublie plus jamais mon RDV.","★★★★★"),
            ("Sarah M.",  "Service impeccable, coupe parfaite. Bravo!","★★★★★"),
        ],
        "coiffure": [
            ("Amélie B.", "Réservation en ligne tellement pratique. Je reviendrai!","★★★★★"),
            ("Kevin D.",  "Rappel automatique avant mon RDV — super idée.","★★★★★"),
            ("Sarah M.",  "Coupe parfaite et service très professionnel.","★★★★★"),
        ],
        "clinique": [
            ("Pierre G.",  "Rappel de RDV automatique, ça change tout.","★★★★★"),
            ("Nathalie C.","Prise de RDV en ligne super simple. Merci!","★★★★★"),
            ("André P.",   "Personnel attentionné et système moderne.","★★★★★"),
        ],
        "garage": [
            ("François L.","Devis rapide, travail impeccable. Je recommande à tous.","★★★★★"),
            ("Manon R.",   "Rappel pour l'inspection annuelle — très pratique!","★★★★★"),
            ("Robert S.",  "Équipe sérieuse, prix honnêtes.","★★★★★"),
        ],
        "construction": [
            ("Daniel M.", "Suivi de chantier parfait, livré à temps.","★★★★★"),
            ("Lucie F.",  "Soumission rapide et travail excellent.","★★★★★"),
            ("Thomas B.", "Professionnels du début à la fin.","★★★★★"),
        ],
    }
    testimonials = next(
        (v for k,v in testimonials_map.items() if k in industry_lower),
        [
            ("Marie L.", "Service exceptionnel, réponse en moins d'une minute!","★★★★★"),
            ("Jean P.",  "Professionnel et efficace. Je recommande.","★★★★★"),
            ("Claire B.","Exactement ce qu'on cherchait. Parfait.","★★★★★"),
        ]
    )
    testi_html_parts = []
    for (author, text, stars) in testimonials[:3]:
        initials = "".join(w[0].upper() for w in author.split()[:2])
        testi_html_parts.append(
            f'<div class="testi-card reveal">'
            f'<div class="testi-quote">&ldquo;</div>'
            f'<div class="testi-stars">{stars}</div>'
            f'<p class="testi-text">{text}</p>'
            f'<div class="testi-author">'
            f'<div class="testi-avatar">{initials}</div>'
            f'<div><div class="testi-name">{author}</div><div class="testi-loc">{city}, QC</div></div>'
            f'</div></div>'
        )
    testimonials_html = "".join(testi_html_parts)

    # ── Galerie d'images réelles du site ─────────────────────────────────────
    gallery_images = bm.get("gallery", [])
    gallery_html = ""
    if gallery_images:
        for img_url in gallery_images[:6]:
            gallery_html += (
                f'<div class="gal-item reveal">'
                f'<div class="gal-overlay"><span class="gal-zoom">⤢</span></div>'
                f'<img src="{img_url}" alt="" loading="lazy" referrerpolicy="no-referrer" '
                f'onerror="this.closest(\'.gal-item\').style.display=\'none\'">'
                f'</div>'
            )

    # ── Audit section — "Votre site analysé" ──────────────────────────────────
    score_color = "#22c55e" if web_score >= 4 else ("#f59e0b" if web_score == 3 else "#ef4444")
    score_label = "Bon" if web_score >= 4 else ("Améliorable" if web_score == 3 else "À refaire")
    before_items_html = ""
    for issue in web_issues[:5]:
        before_items_html += f'<div class="audit-row"><span class="audit-x">✗</span><span>{issue}</span></div>'
    if not before_items_html:
        before_items_html = '<div class="audit-row"><span class="audit-x">·</span><span>Présence en ligne à améliorer</span></div>'
    fixes = [
        "Site mobile rapide et moderne",
        "Photos et contenu mis en valeur",
        "Appel à l'action clair et visible",
        "Référencement Google amélioré (SEO)",
        "Chargement instantané (performance)",
    ]
    after_items_html = ""
    for fix in fixes[:max(len(web_issues[:5]), 3)]:
        after_items_html += f'<div class="audit-row"><span class="audit-check">✓</span><span>{fix}</span></div>'

    # ── Section "Ce que votre site actuel vous coûte" (shock + loss aversion) ──
    _pain_points_map = {
        "mobile":    ("📱", "Invisible sur mobile", f"68% des recherches {industry.lower()} à {city} se font sur téléphone. Votre site ne s'affiche pas correctement."),
        "https":     ("🔒", "Pas sécurisé (HTTP)", "Google pénalise les sites non-HTTPS — vous êtes moins bien classé que vos concurrents."),
        "lent":      ("⏱", "Chargement lent", "Un visiteur qui attend plus de 3 secondes part. Et ne revient pas."),
        "contact":   ("📞", "Aucun appel à l'action", "Vos visiteurs ne savent pas comment vous rejoindre — ils vont ailleurs."),
        "images":    ("🖼", "Aucune photo de qualité", "Un site sans images perd 60% de ses visiteurs dès la première seconde."),
        "ancien":    ("📅", "Site désuet", "Vos concurrents ont refait leur site. Vous semblez fermé ou peu professionnel."),
        "contenu":   ("📝", "Contenu insuffisant", "Google ne vous trouve pas — votre site n'a pas assez de contenu indexable."),
    }
    shock_rows_html = ""
    used_pains = set()
    for issue in web_issues[:4]:
        for key, (icon, title, desc) in _pain_points_map.items():
            if key in issue.lower() and key not in used_pains:
                shock_rows_html += (
                    f'<div class="shock-row reveal">'
                    f'<div class="shock-icon">{icon}</div>'
                    f'<div><div class="shock-title">{title}</div>'
                    f'<div class="shock-desc">{desc}</div></div>'
                    f'</div>'
                )
                used_pains.add(key)
                break
    # Always add the "clients perdus" row
    shock_rows_html += (
        f'<div class="shock-row reveal shock-conclusion">'
        f'<div class="shock-icon">💸</div>'
        f'<div><div class="shock-title">Des clients partent chez vos concurrents</div>'
        f'<div class="shock-desc">Chaque semaine, des gens cherchent <em>{industry.lower()} à {city}</em> — et choisissent quelqu\'un avec un meilleur site.</div></div>'
        f'</div>'
    )
    # Build compare rows from web_issues
    _compare_rows = ""
    _issue_compare = {
        "mobile": ("📵 Site illisible sur téléphone", "📱 100% mobile-first — parfait sur tout écran"),
        "https": ("🔓 Pas de HTTPS — site «non sécurisé»", "🔒 HTTPS inclus — Google et clients vous font confiance"),
        "vitesse": ("🐢 Chargement lent — visiteurs qui repartent", "⚡ Chargement < 2 secondes — expérience fluide"),
        "seo": ("👻 Invisible sur Google", "🔍 Optimisé SEO — vous apparaissez quand on cherche"),
        "design": ("💀 Design daté — crédibilité zéro", "✨ Design moderne 2025 — image professionnelle"),
        "contact": ("📵 Appel difficile à trouver", "📞 Bouton d'appel en 1 clic partout"),
    }
    _generic_compare = [
        ("❌ Pas de présence mobile", "✅ Mobile-first parfait"),
        ("❌ Aucun appel à l'action clair", "✅ Boutons d'appel et réservation visibles"),
        ("❌ Design qui date", "✅ Design moderne et professionnel"),
        ("❌ Invisible sur Google", "✅ Référencement local optimisé"),
    ]
    if web_issues:
        for issue in web_issues[:4]:
            iss_low = issue.lower()
            matched = None
            for k, (b, a) in _issue_compare.items():
                if k in iss_low:
                    matched = (b, a)
                    break
            if not matched:
                matched = (f"❌ {issue}", f"✅ Corrigé dans votre nouveau site")
            _compare_rows += (
                f'<div class="compare-row">'
                f'<div class="compare-cell before"><span class="compare-icon">　</span>{matched[0]}</div>'
                f'<div class="compare-cell after"><span class="compare-icon">　</span>{matched[1]}</div>'
                f'</div>'
            )
    else:
        for b, a in _generic_compare:
            _compare_rows += (
                f'<div class="compare-row">'
                f'<div class="compare-cell before"><span class="compare-icon">　</span>{b}</div>'
                f'<div class="compare-cell after"><span class="compare-icon">　</span>{a}</div>'
                f'</div>'
            )
    shock_section = (
        '<section class="compare-sec">'
        '<div class="sec-in">'
        '<div class="sec-label reveal" style="color:rgba(255,255,255,0.4)">Votre transformation</div>'
        f'<h2 class="sec-h reveal d1" style="color:#fff">Avant · Après</h2>'
        f'<p class="sec-lead reveal d2" style="color:rgba(255,255,255,0.45)">Exactement ce que vos clients voient en ce moment — et ce qu\'ils verront demain.</p>'
        '<div class="compare-table reveal d3">'
        '<div class="compare-header">'
        '<div class="compare-hcol before">Site actuel</div>'
        '<div class="compare-hcol after">✦ Nouveau site Novalis</div>'
        '</div>'
        f'{_compare_rows}'
        '</div>'
        '</div></section>'
    )

    # ── Audit avant/après ─────────────────────────────────────────────────────
    if web_issues:
        audit_section = (
            '<section class="sec audit-sec">'
            '<div class="sec-in audit-grid">'
            '<div class="audit-col audit-before">'
            f'<div class="audit-label">Votre site · {score_label}</div>'
            f'<div class="audit-score" style="color:{score_color}">{web_score}/5</div>'
            f'{before_items_html}'
            '</div>'
            '<div class="audit-arrow">→</div>'
            '<div class="audit-col audit-after">'
            '<div class="audit-label">Nouveau site · Novalis IA</div>'
            '<div class="audit-score" style="color:#22c55e">Professionnel</div>'
            f'{after_items_html}'
            '</div>'
            '</div></section>'
        )
    else:
        audit_section = ""

    # ── Ce que vous obtenez (valeur perçue) ───────────────────────────────────
    included = [
        ("📱","Site mobile parfait","Vos clients vous trouvent et réservent depuis leur téléphone — à toute heure"),
        ("🔍","Référencement Google","Apparaître dans les 3 premiers résultats quand on cherche votre service à {city}".format(city=city)),
        ("⚡","Chargement en 1 seconde","Performance optimisée — aucun visiteur ne repart à cause d'un temps d'attente"),
        ("📞","Appel direct en 1 clic","Votre numéro en évidence sur mobile — les clients appellent sans chercher"),
        ("📸","Vos vraies photos","Vos réalisations et votre équipe mis en valeur — pas des photos génériques"),
        ("🔒","Sécurisé HTTPS","Certificat SSL inclus — Google et vos clients vous font confiance"),
    ]
    included_html = ""
    for icon, title, desc in included:
        included_html += (
            f'<div class="incl-item reveal">'
            f'<div class="incl-icon">{icon}</div>'
            f'<div><div class="incl-title">{title}</div><div class="incl-desc">{desc}</div></div>'
            f'</div>'
        )

    _favicon_tag = f'<link rel="icon" href="{real_favicon}">' if real_favicon else ""

    # Logo HTML — image réelle ou texte fallback
    if real_logo:
        _nav_logo_html = (
            f'<img src="{real_logo}" style="height:38px;max-width:160px;object-fit:contain" referrerpolicy="no-referrer" '
            f'onerror="this.style.display=\'none\';document.getElementById(\'nav-logo-text\').style.display=\'block\'">'
            f'<span id="nav-logo-text" style="display:none;font-family:var(--serif);font-weight:700">{name[:22]}</span>'
        )
    else:
        _nav_logo_html = f'<span style="font-family:var(--serif);font-weight:700">{name[:22]}</span>'

    stars_display = ("★" * round(float(rating)) + "☆" * (5 - round(float(rating)))) if rating else "★★★★★"
    rating_text = f"{stars_display} {rating}/5 · {review_count} avis" if rating else f"{stars_display} Avis clients vérifiés"

    # ── Photo strip (horizontal scroll — their real photos, right after hero) ──
    if gallery_images:
        strip_items = ""
        for img_url in gallery_images[:8]:
            strip_items += (
                f'<div class="ps-item">'
                f'<img src="{img_url}" loading="lazy" alt="" referrerpolicy="no-referrer" '
                f'onerror="this.closest(\'.ps-item\').style.display=\'none\'">'
                f'</div>'
            )
        photo_strip_section = (
            f'<div class="photo-strip" aria-label="Photos de {name}">'
            f'<div class="ps-inner">{strip_items}</div>'
            f'</div>'
        )
    else:
        photo_strip_section = ""

    # ── Gallery section ───────────────────────────────────────────────────────
    if gallery_html:
        gallery_section = (
            '<section class="sec gal-sec" id="galerie">'
            '<div class="sec-in">'
            '<div class="sec-label reveal">En images</div>'
            f'<h2 class="sec-h reveal d1">Nos réalisations</h2>'
            f'<div class="gal-grid">{gallery_html}</div>'
            '</div></section>'
        )
    else:
        gallery_section = ""

    # ── About section with photo ──────────────────────────────────────────────
    if real_about and len(real_about) > 60:
        _addr_html = (f'<p class="about-addr reveal d3">&#128205; {real_address}</p>' if real_address else "")
        _phone_html = (f'<p class="about-phone reveal d4"><a href="{_tel_href}" style="color:var(--brand);font-weight:600">{phone_display}</a></p>' if phone_display else "")
        if real_og:
            about_section = (
                '<section class="sec about-sec" id="apropos">'
                '<div class="sec-in about-grid">'
                '<div class="about-text-col">'
                '<div class="sec-label reveal">À propos</div>'
                f'<h2 class="sec-h reveal d1">{name}</h2>'
                f'<p class="about-text reveal d2">{real_about[:480]}</p>'
                f'{_addr_html}{_phone_html}'
                '</div>'
                '<div class="about-img-col reveal d2">'
                f'<img src="{real_og}" alt="{name}" loading="lazy" referrerpolicy="no-referrer" '
                f'onerror="this.closest(\'.about-img-col\').style.display=\'none\'">'
                '</div>'
                '</div></section>'
            )
        else:
            about_section = (
                '<section class="sec about-sec" id="apropos">'
                '<div class="sec-in">'
                '<div class="sec-label reveal">À propos</div>'
                f'<h2 class="sec-h reveal d1">{name}</h2>'
                f'<p class="about-text reveal d2">{real_about[:480]}</p>'
                f'{_addr_html}{_phone_html}'
                '</div></section>'
            )
    else:
        about_section = ""

    # ── Hours section ─────────────────────────────────────────────────────────
    if real_hours:
        hours_items = ""
        for h in real_hours[:7]:
            if ":" in h:
                day_part = h.split(":")[0].strip()
                time_part = ":".join(h.split(":")[1:]).strip()
            else:
                day_part = ""
                time_part = h
            hours_items += f'<div class="hr-row"><span class="hr-day">{day_part}</span><span class="hr-time">{time_part}</span></div>'
        hours_section = (
            '<section class="sec hrs-sec" id="heures">'
            '<div class="sec-in hrs-inner">'
            '<div><div class="sec-label reveal">Disponibilité</div>'
            '<h2 class="sec-h reveal d1">Heures d\'ouverture</h2></div>'
            f'<div class="hr-grid reveal d2">{hours_items}</div>'
            '</div></section>'
        )
    else:
        hours_section = ""

    _hero_logo_html = (
        f'<div class="hero-logo-wrap">'
        f'<img src="{real_logo}" alt="{name}" loading="eager" referrerpolicy="no-referrer" '
        f'onerror="this.closest(\'.hero-logo-wrap\').style.display=\'none\'">'
        f'</div>'
    ) if real_logo else ""

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{name}</title>
{_favicon_tag}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,700;9..144,900&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
:root{{--brand:{btn};--ink:#18120F;--ink2:#5C534E;--paper:#F7F4EF;--paper2:#EFEBE4;--rule:#E2DBD2;--serif:'Fraunces',Georgia,serif;--sans:'Jost',system-ui,sans-serif}}
*{{margin:0;padding:0;box-sizing:border-box}}html{{scroll-behavior:smooth}}
body{{font-family:var(--sans);background:var(--paper);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased}}a{{color:inherit;text-decoration:none}}
.ticker{{background:var(--brand);color:#fff;padding:8px 0;overflow:hidden;white-space:nowrap}}
.ticker-inner{{display:inline-flex;animation:tick 30s linear infinite}}
.ticker-inner span{{padding:0 28px;font-size:0.7rem;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;opacity:0.85}}
.ticker-inner span::after{{content:'·';margin-left:28px;opacity:0.4}}
@keyframes tick{{from{{transform:translateX(0)}}to{{transform:translateX(-50%)}}}}
nav{{position:sticky;top:0;z-index:200;background:rgba(247,244,239,0.95);backdrop-filter:blur(18px);border-bottom:1px solid var(--rule)}}
.nav-in{{max-width:1160px;margin:0 auto;padding:0 5vw;display:flex;align-items:center;justify-content:space-between;height:66px}}
.nav-logo{{font-family:var(--serif);font-size:1.08rem;font-weight:700;letter-spacing:-0.01em}}
.nav-links{{display:flex;align-items:center;gap:24px}}
.nav-link{{font-size:0.82rem;font-weight:500;color:var(--ink2);transition:color 0.2s}}
.nav-link:hover{{color:var(--ink)}}
.nav-cta{{background:var(--brand);color:#fff;padding:9px 20px;border-radius:5px;font-size:0.82rem;font-weight:600;letter-spacing:0.01em;transition:opacity 0.2s}}
.nav-cta:hover{{opacity:0.88}}
.hero{{position:relative;min-height:580px;display:flex;align-items:flex-end;overflow:hidden}}
.hero-bg{{position:absolute;inset:0;background:{hero_bg};background-size:cover;background-position:center}}
.hero-veil{{position:absolute;inset:0;background:{hero_overlay_css}}}
.hero-body{{position:relative;z-index:2;width:100%;max-width:1160px;margin:0 auto;padding:80px 5vw 72px}}
.hero-logo-wrap{{margin-bottom:22px}}
.hero-logo-wrap img{{height:52px;max-width:200px;object-fit:contain;filter:brightness(0) invert(1);opacity:0.9}}
.hero-chip{{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,0.2);border-radius:3px;padding:5px 12px;font-size:0.7rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.75);margin-bottom:24px}}
.hero-chip i{{width:6px;height:6px;border-radius:50%;background:var(--brand);display:inline-block;box-shadow:0 0 8px {btn}bb;flex-shrink:0}}
.hero h1{{font-family:var(--serif);font-size:clamp(2rem,5.2vw,3.8rem);font-weight:900;line-height:1.08;letter-spacing:-0.03em;color:#fff;max-width:660px;margin-bottom:18px}}
.hero-sub{{font-size:0.98rem;color:rgba(255,255,255,0.66);max-width:500px;font-weight:300;line-height:1.75;margin-bottom:32px}}
.hero-rating{{display:inline-flex;align-items:center;gap:9px;font-size:0.78rem;color:rgba(255,255,255,0.52);margin-bottom:38px;padding:8px 16px;border:1px solid rgba(255,255,255,0.12);border-radius:3px}}
.hero-rating .s{{color:#F4B942;letter-spacing:2px}}
.hero-btns{{display:flex;gap:12px;flex-wrap:wrap}}
.btn-p{{background:var(--brand);color:#fff;padding:13px 30px;border-radius:5px;font-weight:600;font-size:0.92rem;transition:opacity 0.2s,transform 0.2s;display:inline-block}}
.btn-p:hover{{opacity:0.88;transform:translateY(-1px)}}
.btn-g{{background:rgba(255,255,255,0.08);color:#fff;padding:13px 24px;border-radius:5px;font-weight:400;font-size:0.9rem;border:1px solid rgba(255,255,255,0.22);transition:all 0.2s;display:inline-block}}
.btn-g:hover{{background:rgba(255,255,255,0.15)}}
.trust{{background:#fff;border-bottom:1px solid var(--rule);padding:16px 5vw}}
.trust-in{{max-width:1160px;margin:0 auto;display:flex;align-items:center;flex-wrap:wrap}}
.trust-pill{{padding:7px 22px;font-size:0.78rem;color:var(--ink2);border-right:1px solid var(--rule)}}
.trust-pill:last-child{{border-right:none}}
.trust-pill strong{{color:var(--ink);font-weight:600}}
.sec{{padding:88px 5vw}}
.sec-in{{max-width:1160px;margin:0 auto}}
.sec-label{{display:inline-flex;align-items:center;gap:8px;font-size:0.7rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--brand);margin-bottom:14px}}
.sec-label::before{{content:'';width:20px;height:1px;background:var(--brand)}}
.sec-h{{font-family:var(--serif);font-size:clamp(1.7rem,3.5vw,2.7rem);font-weight:700;letter-spacing:-0.025em;color:var(--ink);line-height:1.15;margin-bottom:12px}}
.sec-lead{{font-size:0.95rem;color:var(--ink2);font-weight:300;max-width:460px;line-height:1.75}}
.svc-list{{margin-top:48px;border-top:1px solid var(--rule)}}
.svc-row{{display:grid;grid-template-columns:52px 1fr;gap:0 24px;padding:26px 0;border-bottom:1px solid var(--rule);transition:background 0.2s;cursor:default}}
.svc-row:hover{{background:rgba(0,0,0,0.018)}}
.svc-row:hover .svc-title{{color:var(--brand)}}
.svc-num{{font-family:var(--serif);font-size:0.78rem;color:var(--ink2);letter-spacing:0.04em;padding-top:4px}}
.svc-title{{font-family:var(--serif);font-size:1.2rem;font-weight:700;color:var(--ink);transition:color 0.2s;line-height:1.3}}
.svc-desc{{font-size:0.83rem;color:var(--ink2);font-weight:300;margin-top:4px;line-height:1.6}}
.about-sec{{background:var(--paper2)}}
.about-grid{{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center}}
.about-text-col{{}}
.about-img-col{{border-radius:8px;overflow:hidden;aspect-ratio:4/3;background:var(--paper)}}
.about-img-col img{{width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.6s}}
.about-img-col:hover img{{transform:scale(1.04)}}
.about-text{{font-size:0.98rem;color:var(--ink2);font-weight:300;line-height:1.85;max-width:680px;margin-top:14px}}
.about-addr{{font-size:0.85rem;color:var(--ink2);margin-top:18px;font-style:italic}}
.about-phone{{margin-top:10px;font-size:0.9rem}}
@media(max-width:768px){{.about-grid{{grid-template-columns:1fr;gap:32px}}.about-img-col{{order:-1}}}}
.hrs-sec{{background:#fff;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}}
.hrs-inner{{display:flex;align-items:flex-start;gap:64px;flex-wrap:wrap}}
.hr-grid{{display:grid;grid-template-columns:1fr;gap:0;min-width:240px}}
.hr-row{{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--rule);font-size:0.88rem}}
.hr-row:last-child{{border-bottom:none}}
.hr-day{{font-weight:600;color:var(--ink)}}
.hr-time{{color:var(--ink2);font-weight:300}}
.photo-strip{{overflow-x:auto;display:block;background:#0d0a07;scrollbar-width:none;padding:4px 0}}
.photo-strip::-webkit-scrollbar{{display:none}}
.ps-inner{{display:flex;gap:4px;min-width:100%}}
.ps-item{{flex-shrink:0;width:min(340px,80vw);height:240px;overflow:hidden;background:#1a1510;position:relative}}
.ps-item img{{width:100%;height:100%;object-fit:cover;transition:transform 0.6s ease;display:block}}
.ps-item:hover img{{transform:scale(1.06)}}
.gal-sec{{background:#fff;padding:88px 5vw}}
.gal-grid{{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:44px}}
.gal-item{{aspect-ratio:16/10;overflow:hidden;border-radius:6px;background:var(--paper2)}}
.gal-item img{{width:100%;height:100%;object-fit:cover;transition:transform 0.5s ease;display:block}}
.gal-item:hover img{{transform:scale(1.05)}}
@media(min-width:768px){{.gal-grid{{grid-template-columns:repeat(3,1fr)}}}}
@media(max-width:600px){{.gal-grid{{grid-template-columns:1fr}}}}
.shock-sec{{background:#0f0404;padding:80px 5vw}}
.shock-sec .sec-label{{color:#ef4444!important}}
.shock-sec .sec-h{{color:#fff}}
.shock-grid{{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:16px}}
.shock-row{{display:flex;align-items:flex-start;gap:18px;background:#1a0808;border:1px solid #3a1010;border-radius:8px;padding:22px 20px}}
.shock-row.shock-conclusion{{grid-column:1/-1;border-color:#7f1d1d;background:#1f0c0c}}
.shock-icon{{font-size:1.5rem;flex-shrink:0;margin-top:2px}}
.shock-title{{font-family:var(--serif);font-size:1rem;font-weight:700;color:#fff;margin-bottom:4px}}
.shock-desc{{font-size:0.82rem;color:rgba(255,255,255,0.55);line-height:1.6}}
.shock-desc em{{color:rgba(255,255,255,0.75);font-style:normal;font-weight:500}}
@media(max-width:600px){{.shock-grid{{grid-template-columns:1fr}}.shock-row.shock-conclusion{{grid-column:auto}}}}
.audit-sec{{background:var(--paper);padding:72px 5vw;border-top:1px solid var(--rule)}}
.audit-grid{{display:grid;grid-template-columns:1fr auto 1fr;gap:24px;align-items:start;max-width:800px;margin:0 auto}}
.audit-col{{padding:28px 24px;border-radius:8px}}
.audit-before{{background:#fff;border:1px solid var(--rule)}}
.audit-after{{background:{btn}12;border:1px solid {btn}44}}
.audit-label{{font-size:0.68rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink2);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.audit-score{{font-family:var(--serif);font-size:1.3rem;font-weight:700;margin-bottom:16px}}
.audit-row{{display:flex;align-items:flex-start;gap:10px;font-size:0.82rem;color:var(--ink2);margin-bottom:8px;line-height:1.4}}
.audit-x{{color:#ef4444;font-weight:700;flex-shrink:0;margin-top:1px}}
.audit-check{{color:#22c55e;font-weight:700;flex-shrink:0;margin-top:1px}}
.audit-arrow{{font-size:1.6rem;color:var(--brand);align-self:center;font-weight:300;padding-top:60px}}
@media(max-width:600px){{.audit-grid{{grid-template-columns:1fr}}.audit-arrow{{display:none}}}}
.testi-sec{{background:#131009;padding:88px 5vw}}
.testi-sec .sec-label{{color:{acc}}}
.testi-sec .sec-h{{color:#fff}}
.testi-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1px;background:rgba(255,255,255,0.06);margin-top:48px}}
.testi-card{{background:#131009;padding:34px 28px;transition:background 0.3s}}
.testi-card:hover{{background:#1b1410}}
.testi-quote{{font-family:var(--serif);font-size:2.8rem;line-height:1;color:{btn};opacity:0.45;margin-bottom:10px;font-weight:900}}
.testi-stars{{color:#F4B942;font-size:0.78rem;letter-spacing:3px;margin-bottom:14px}}
.testi-text{{font-size:0.88rem;color:rgba(255,255,255,0.62);line-height:1.8;font-weight:300;margin-bottom:22px}}
.testi-author{{display:flex;align-items:center;gap:12px}}
.testi-avatar{{width:36px;height:36px;border-radius:50%;background:{btn};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;flex-shrink:0;font-family:var(--serif)}}
.testi-name{{font-size:0.82rem;font-weight:600;color:#fff}}
.testi-loc{{font-size:0.72rem;color:rgba(255,255,255,0.32)}}
.incl-sec{{background:var(--paper);padding:80px 5vw;border-top:1px solid var(--rule)}}
.incl-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-top:44px}}
.incl-item{{display:flex;align-items:flex-start;gap:16px;padding:22px 20px;background:#fff;border:1px solid var(--rule);border-radius:8px}}
.incl-icon{{font-size:1.4rem;flex-shrink:0}}
.incl-title{{font-weight:600;font-size:0.92rem;color:var(--ink);margin-bottom:3px}}
.incl-desc{{font-size:0.8rem;color:var(--ink2);line-height:1.55}}
.cta-final{{position:relative;overflow:hidden;padding:100px 5vw;text-align:center;background:var(--ink)}}
.cta-final-glow{{position:absolute;top:-60px;left:50%;transform:translateX(-50%);width:600px;height:400px;background:var(--brand);opacity:0.15;filter:blur(100px);pointer-events:none;border-radius:50%}}
.cta-badge{{display:inline-block;background:var(--brand);color:#fff;font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:6px 16px;border-radius:3px;margin-bottom:28px}}
.cta-h{{font-family:var(--serif);font-size:clamp(2rem,5vw,3.6rem);font-weight:900;letter-spacing:-0.03em;color:#fff;margin-bottom:16px;line-height:1.05}}
.cta-sub{{color:rgba(255,255,255,0.55);font-size:0.95rem;font-weight:300;margin-bottom:40px;line-height:1.8;max-width:480px;margin-left:auto;margin-right:auto}}
.cta-price{{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:20px 28px;display:inline-block;margin-bottom:32px}}
.cta-price-main{{font-family:var(--serif);font-size:2rem;font-weight:700;color:#fff}}
.cta-price-note{{display:block;font-size:0.78rem;color:rgba(255,255,255,0.4);margin-top:4px}}
.cta-btns{{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}}
.cta-a{{background:var(--brand);color:#fff;padding:17px 38px;border-radius:5px;font-weight:700;font-size:0.95rem;transition:opacity 0.2s,transform 0.2s;display:inline-block;letter-spacing:0.01em}}
.cta-a:hover{{opacity:0.88;transform:translateY(-2px)}}
.cta-b{{background:rgba(255,255,255,0.08);color:#fff;padding:17px 28px;border-radius:5px;font-weight:400;font-size:0.9rem;border:1px solid rgba(255,255,255,0.2);transition:all 0.2s;display:inline-block}}
.cta-b:hover{{background:rgba(255,255,255,0.16)}}
.cta-reassure{{margin-top:24px;font-size:0.76rem;color:rgba(255,255,255,0.28);letter-spacing:0.04em}}
footer{{background:#fff;border-top:1px solid var(--rule);padding:36px 5vw}}
.foot-in{{max-width:1160px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px}}
.foot-name{{font-family:var(--serif);font-weight:700;font-size:0.98rem;color:var(--ink)}}
.foot-city{{font-size:0.75rem;color:var(--ink2);margin-top:2px}}
.novalis-line{{font-size:0.73rem;color:var(--ink2)}}
.novalis-line a{{color:var(--brand);font-weight:600}}
.float{{position:fixed;bottom:26px;right:26px;z-index:500}}
.float-btn{{width:52px;height:52px;border-radius:50%;background:var(--brand);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.2rem;transition:transform 0.2s;animation:breathe 3s ease-in-out infinite;position:relative}}
.float-btn:hover{{transform:scale(1.08)}}
.float-dot{{position:absolute;top:-2px;right:-2px;width:15px;height:15px;background:#EF4444;border-radius:50%;border:2px solid var(--paper);display:flex;align-items:center;justify-content:center;font-size:0.55rem;font-weight:700;color:#fff}}
@keyframes breathe{{0%,100%{{box-shadow:0 4px 22px {btn}55}}50%{{box-shadow:0 8px 36px {btn}88,0 0 0 7px {btn}16}}}}
.reveal{{opacity:0;transform:translateY(28px);transition:opacity 0.7s cubic-bezier(0.16,1,0.3,1),transform 0.7s cubic-bezier(0.16,1,0.3,1)}}
.reveal.in{{opacity:1;transform:none}}
.reveal-left{{opacity:0;transform:translateX(-36px);transition:opacity 0.7s cubic-bezier(0.16,1,0.3,1),transform 0.7s cubic-bezier(0.16,1,0.3,1)}}
.reveal-left.in{{opacity:1;transform:none}}
.reveal-right{{opacity:0;transform:translateX(36px);transition:opacity 0.7s cubic-bezier(0.16,1,0.3,1),transform 0.7s cubic-bezier(0.16,1,0.3,1)}}
.reveal-right.in{{opacity:1;transform:none}}
.reveal-scale{{opacity:0;transform:scale(0.88);transition:opacity 0.6s cubic-bezier(0.16,1,0.3,1),transform 0.6s cubic-bezier(0.16,1,0.3,1)}}
.reveal-scale.in{{opacity:1;transform:none}}
.d1{{transition-delay:0.08s}}.d2{{transition-delay:0.18s}}.d3{{transition-delay:0.28s}}.d4{{transition-delay:0.38s}}.d5{{transition-delay:0.48s}}
@media(max-width:600px){{
  .hero{{min-height:460px}}
  .nav-link{{display:none}}
  .trust-pill{{border-right:none;padding:4px 12px}}
  .foot-in{{flex-direction:column;text-align:center}}
  .svc-row{{grid-template-columns:38px 1fr}}
}}
.hero-orb{{position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none;animation:orb-float 12s ease-in-out infinite}}
.orb1{{width:420px;height:420px;background:var(--brand);opacity:0.22;top:-80px;right:5%;animation-delay:0s}}
.orb2{{width:280px;height:280px;background:{acc};opacity:0.18;bottom:20px;left:8%;animation-delay:-4s}}
.orb3{{width:200px;height:200px;background:#ffffff;opacity:0.06;top:40%;right:20%;animation-delay:-8s}}
@keyframes orb-float{{0%,100%{{transform:translateY(0) scale(1)}}50%{{transform:translateY(-30px) scale(1.05)}}}}
.compare-sec{{background:#0a0a0f;padding:80px 5vw;overflow:hidden}}
.compare-table{{margin-top:48px;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.07)}}
.compare-header{{display:grid;grid-template-columns:1fr 1fr;background:rgba(255,255,255,0.04)}}
.compare-hcol{{padding:16px 24px;font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase}}
.compare-hcol.before{{color:rgba(255,255,255,0.3)}}
.compare-hcol.after{{color:var(--brand)}}
.compare-row{{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid rgba(255,255,255,0.05)}}
.compare-cell{{padding:18px 24px;font-size:0.88rem;line-height:1.5;display:flex;align-items:flex-start;gap:10px}}
.compare-cell.before{{color:rgba(255,255,255,0.38);background:rgba(255,0,0,0.03)}}
.compare-cell.after{{color:rgba(255,255,255,0.85);background:rgba(37,99,235,0.06)}}
.compare-icon{{flex-shrink:0;font-size:0.9rem;margin-top:1px}}
@media(max-width:600px){{.compare-header,.compare-row{{grid-template-columns:1fr}}.compare-cell.before{{display:none}}}}
.gal-item{{position:relative}}
.gal-overlay{{position:absolute;inset:0;background:rgba(0,0,0,0);transition:background 0.3s;display:flex;align-items:center;justify-content:center}}
.gal-item:hover .gal-overlay{{background:rgba(0,0,0,0.35)}}
.gal-zoom{{opacity:0;color:#fff;font-size:1.5rem;transition:opacity 0.3s}}
.gal-item:hover .gal-zoom{{opacity:1}}
.svc-row{{cursor:default;border-radius:4px;padding:26px 16px}}
.svc-num{{font-family:var(--serif);font-size:0.75rem;color:var(--ink2);letter-spacing:0.04em;padding-top:4px;opacity:0.5}}
.counter-wrap{{background:#fff;border:1px solid var(--rule);border-radius:10px;padding:28px;text-align:center}}
.counter-val{{font-family:var(--serif);font-size:2.4rem;font-weight:700;color:var(--brand);line-height:1}}
.counter-label{{font-size:0.78rem;color:var(--ink2);margin-top:6px}}
.stats-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-top:44px}}
</style>
</head>
<body>

<div class="ticker" aria-hidden="true">
  <div class="ticker-inner">
    <span>Aperçu exclusif</span><span>{name}</span><span>{city}, Québec</span><span>{industry}</span><span>Novalis IA</span>
    <span>Aperçu exclusif</span><span>{name}</span><span>{city}, Québec</span><span>{industry}</span><span>Novalis IA</span>
  </div>
</div>

<nav>
  <div class="nav-in">
    <div class="nav-logo">{_nav_logo_html}</div>
    <div class="nav-links">
      <a class="nav-link" href="#services">Services</a>
      <a class="nav-link" href="#avis">Avis clients</a>
      <a class="nav-cta" href="{_tel_href}">{cta_text}</a>
    </div>
  </div>
</nav>

<div class="hero">
  <div class="hero-bg"></div>
  <div class="hero-veil"></div>
  <div class="hero-orb orb1"></div>
  <div class="hero-orb orb2"></div>
  <div class="hero-orb orb3"></div>
  <div class="hero-body">
    {_hero_logo_html}
    <div class="hero-chip"><i></i>{city} &nbsp;·&nbsp; {industry}</div>
    <h1>{hero_title}</h1>
    <p class="hero-sub">{hero_subtitle}</p>
    <div class="hero-rating"><span class="s">{stars_display}</span><span>{rating_text}</span></div>
    <div class="hero-btns">
      <a class="btn-p" href="{_tel_href}">{cta_text}</a>
      <a class="btn-g" href="#services">Nos services →</a>
    </div>
  </div>
</div>

<div class="trust">
  <div class="trust-in">
    <div class="trust-pill"><strong>{rating_text}</strong></div>
    <div class="trust-pill">{city}, <strong>Québec</strong></div>
    <div class="trust-pill"><strong>{industry}</strong></div>
    <div class="trust-pill">Aperçu par <strong>Novalis IA</strong></div>
  </div>
</div>

{photo_strip_section}

{shock_section}

<section class="sec" id="services">
  <div class="sec-in">
    <div class="sec-label reveal">Vos services</div>
    <h2 class="sec-h reveal d1">Ce que vous offrez — mis en valeur</h2>
    <p class="sec-lead reveal d2">Vos services présentés comme ils méritent de l'être, pour que vos clients comprennent exactement ce que vous faites.</p>
    <div class="svc-list">
      {services_html}
    </div>
  </div>
</section>

{audit_section}

{about_section}

{gallery_section}

{hours_section}

<section class="incl-sec" id="inclus">
  <div class="sec-in">
    <div class="sec-label reveal">Ce que vous obtenez</div>
    <h2 class="sec-h reveal d1">Tout ce qu'il faut pour dominer votre marché local</h2>
    <div class="incl-grid">
      {included_html}
    </div>
  </div>
</section>

<section class="cta-final" id="contact">
  <div class="cta-final-glow"></div>
  <div class="cta-badge">Votre site est prêt</div>
  <h2 class="cta-h reveal">Il ne manque que votre accord.</h2>
  <p class="cta-sub reveal d1">Ce site a été conçu spécifiquement pour {name}.<br>Livraison en 2–3 semaines. Satisfait ou remboursé.</p>
  <div class="cta-price reveal d2">
    <div class="cta-price-main">À partir de 1 000 $</div>
    <span class="cta-price-note">Moins qu'un mois de clients perdus à cause d'un mauvais site</span>
  </div>
  <div class="cta-btns reveal d3">
    <a class="cta-a" href="{_tel_href}">{_tel_label or "Nous appeler"}</a>
    <a class="cta-b" href="{_mail_href}">Nous écrire</a>
  </div>
  <p class="cta-reassure">Sans engagement · Aucune carte requise · Livré clé en main</p>
</section>

<footer>
  <div class="foot-in">
    <div>
      <div class="foot-name">{name}</div>
      <div class="foot-city">{real_address or city + ", Québec"}</div>
    </div>
    <div class="novalis-line">Site préparé par <a href="https://novalisia.ca" target="_blank">Novalis IA</a> &nbsp;·&nbsp; <a href="/unsubscribe?id={prospect_id}">Se désabonner</a></div>
  </div>
</footer>

<div class="float">
  <button class="float-btn" onclick="location.href='{_mail_href}'" aria-label="Nous contacter">
    💬<span class="float-dot">1</span>
  </button>
</div>

<script>
const obs = new IntersectionObserver(entries => {{
  entries.forEach(e => {{ if(e.isIntersecting){{ e.target.classList.add('in'); obs.unobserve(e.target); }} }});
}}, {{threshold:0.08}});
document.querySelectorAll('.reveal,.reveal-left,.reveal-right,.reveal-scale').forEach(el => obs.observe(el));
['.hero-chip','.hero h1','.hero-sub','.hero-rating','.hero-btns'].forEach((s,i) => {{
  const el = document.querySelector(s);
  if(!el) return;
  Object.assign(el.style,{{opacity:'0',transform:'translateY(14px)',transition:'0.7s cubic-bezier(0.22,1,0.36,1)'}});
  setTimeout(() => {{ el.style.opacity='1'; el.style.transform='none'; }}, 80 + i*120);
}});
</script>
</body>
</html>"""
    return HTMLResponse(html)


@app.post("/api/admin/rescrape-brand-meta")
async def admin_rescrape_brand_meta(credentials: HTTPBasicCredentials = Depends(verify_admin)):
    """Re-scrape brand_meta (images, colors, logo) for prospects that have a website but no gallery."""
    loop = asyncio.get_event_loop()
    updated = 0
    errors = 0
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("""
            SELECT id, website, brand_meta FROM prospect_bank
            WHERE website IS NOT NULL AND website != ''
            UNION ALL
            SELECT id, website, brand_meta FROM prospect_suggestions
            WHERE website IS NOT NULL AND website != ''
        """)
        rows = await cur.fetchall()

    targets = []
    for row in rows:
        bm = json.loads(row["brand_meta"] or "{}")
        gallery = bm.get("gallery", [])
        og = bm.get("og_image", "")
        if not gallery and not og:
            targets.append((row["id"], row["website"]))

    logging.info(f"Rescrape brand_meta: {len(targets)} prospects to refresh")

    for pid, site_url in targets:
        try:
            result = await loop.run_in_executor(None, _scrape_business_website, site_url)
            new_bm = result.get("brand_meta", {})
            if new_bm.get("gallery") or new_bm.get("og_image"):
                async with aiosqlite.connect(DB_PATH) as db:
                    # Update in both tables
                    await db.execute(
                        "UPDATE prospect_bank SET brand_meta=?, updated_at=? WHERE id=?",
                        (json.dumps(new_bm), datetime.now().isoformat(), pid)
                    )
                    await db.execute(
                        "UPDATE prospect_suggestions SET brand_meta=?, updated_at=? WHERE id=?",
                        (json.dumps(new_bm), datetime.now().isoformat(), pid)
                    )
                    await db.commit()
                updated += 1
        except Exception as e:
            errors += 1
            logging.error(f"Rescrape error for {site_url}: {e}")

    return {"updated": updated, "errors": errors, "total_checked": len(targets)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
