'use strict';
// ── Nova — l'assistant Novalis ──────────────────────────────────────
// Nova veille sur l'entreprise et repère ce qui compte : ce qui coûte de
// l'argent maintenant (urgent), ce qui en rapporterait (occasion), ce qu'il
// reste à régler (info). Déterministe et honnête : Nova ne devine pas, elle lit
// les chiffres réels et propose une action concrète. (La couche conversationnelle
// « Nova répond » vient se brancher par-dessus via core/llm.js.)

const GRAVITE_ORDRE = { urgent: 0, occasion: 1, info: 2 };

function pl(n, s, p) { return n <= 1 ? s : p; }

/**
 * Analyse l'état d'une entreprise → liste d'observations classées.
 * @param {{
 *   leadsAttente?:number, propositions?:number, fuite?:object|null, pretPct?:number,
 *   pctSous1h?:number|null, repondus?:number, accuseActif?:boolean, horsHeures?:number,
 *   gagnesSansAvis?:number, servicesCount?:number, contacts?:number
 * }} ctx
 * @returns {Array<{gravite:'urgent'|'occasion'|'info', titre:string, detail:string, action:{label:string, lien:string}}>}
 */
function analyser(ctx = {}) {
  const n = ctx;
  const ins = [];

  if (n.leadsAttente > 0) {
    ins.push({
      gravite: 'urgent',
      titre: `${n.leadsAttente} ${pl(n.leadsAttente, 'client attend', 'clients attendent')} une réponse`,
      detail: 'Répondre en moins d\'une heure multiplie les chances de vente. Chaque heure qui passe refroidit le client.',
      action: { label: 'Voir les contacts', lien: 'reception' },
    });
  }

  if (n.pctSous1h != null && (n.repondus || 0) >= 3 && n.pctSous1h < 50) {
    ins.push({
      gravite: 'urgent',
      titre: `Vous répondez trop lentement (${n.pctSous1h}% sous 1 h)`,
      detail: 'La lenteur de réponse est le premier tueur de ventes des PME. La réponse instantanée 24/7 corrige ça sans effort.',
      action: { label: 'Activer la réponse instantanée', lien: 'branchement' },
    });
  }

  if (n.propositions > 0) {
    ins.push({
      gravite: 'occasion',
      titre: `${n.propositions} ${pl(n.propositions, 'proposition prête', 'propositions prêtes')} à approuver`,
      detail: 'Novalis a déjà rédigé le travail. Un oui et c\'est envoyé.',
      action: { label: 'Ouvrir le poste de commande', lien: 'propositions' },
    });
  }

  if (!n.accuseActif && (n.horsHeures || 0) > 0) {
    ins.push({
      gravite: 'occasion',
      titre: 'Activez la réponse instantanée 24/7',
      detail: `${n.horsHeures} ${pl(n.horsHeures, 'message est arrivé', 'messages sont arrivés')} hors de vos heures — sans réponse immédiate, un client sur deux part ailleurs.`,
      action: { label: 'Activer', lien: 'branchement' },
    });
  }

  if ((n.gagnesSansAvis || 0) > 0) {
    ins.push({
      gravite: 'occasion',
      titre: `Demandez un avis à ${n.gagnesSansAvis} ${pl(n.gagnesSansAvis, 'client satisfait', 'clients satisfaits')}`,
      detail: 'Un job gagné est le meilleur moment pour un avis — et les avis attirent de nouveaux clients.',
      action: { label: 'Préparer les demandes', lien: 'propositions' },
    });
  }

  if ((n.paiementsAttente || 0) > 0) {
    const montant = n.paiementsAttenteCents
      ? ' (' + Math.round(n.paiementsAttenteCents / 100).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }) + ')'
      : '';
    ins.push({
      gravite: 'occasion',
      titre: `${n.paiementsAttente} ${pl(n.paiementsAttente, 'paiement en attente', 'paiements en attente')}${montant}`,
      detail: 'Une demande de paiement envoyée mais pas encore réglée. Un rappel amical accélère l\'encaissement.',
      action: { label: 'Voir les clients', lien: 'clients' },
    });
  }

  if ((n.avisAffiches || 0) === 0 && (n.avisTotal || 0) > 0) {
    ins.push({
      gravite: 'occasion',
      titre: `Affichez vos ${n.avisTotal} ${pl(n.avisTotal, 'avis', 'avis')} sur votre site`,
      detail: 'Vous avez des avis enregistrés mais aucun n\'est affiché. Les avis visibles rassurent et attirent de nouveaux clients.',
      action: { label: 'Ouvrir Avis', lien: 'avis' },
    });
  }

  if (n.fuite && n.fuite.fiable && n.fuite.fuite) {
    ins.push({
      gravite: 'info',
      titre: n.fuite.fuite.titre,
      detail: n.fuite.fuite.levier,
      action: { label: 'Voir Pulse', lien: 'reception' },
    });
  }

  if (n.pretPct != null && n.pretPct < 100) {
    ins.push({
      gravite: 'info',
      titre: `Terminez le branchement (${n.pretPct}%)`,
      detail: 'Quelques étapes et tous les automatismes s\'activent pour vous.',
      action: { label: 'Compléter le branchement', lien: 'branchement' },
    });
  }

  if (n.servicesCount === 0) {
    ins.push({
      gravite: 'info',
      titre: 'Ajoutez vos services et prix',
      detail: 'Une fois définis, Novalis prépare vos soumissions en un clic.',
      action: { label: 'Ouvrir Devis', lien: 'devis' },
    });
  }

  if ((n.rdvBientot || 0) > 0) {
    ins.push({
      gravite: 'info',
      titre: `${n.rdvBientot} ${pl(n.rdvBientot, 'rendez-vous approche', 'rendez-vous approchent')}`,
      detail: 'Les rappels sont préparés — approuvez-les pour prévenir vos clients et éviter les oublis.',
      action: { label: 'Voir les rendez-vous', lien: 'rdv' },
    });
  }

  ins.sort((a, b) => GRAVITE_ORDRE[a.gravite] - GRAVITE_ORDRE[b.gravite]);
  return ins;
}

/** Une phrase de synthèse, en voix d'opérateur (neutre, sans persona). */
function resume(insights) {
  if (!insights || !insights.length) return 'Tout est à jour — rien ne requiert votre attention pour l\'instant.';
  const u = insights.filter(i => i.gravite === 'urgent').length;
  const o = insights.filter(i => i.gravite === 'occasion').length;
  const morceaux = [];
  if (u) morceaux.push(`${u} ${pl(u, 'chose urgente', 'choses urgentes')}`);
  if (o) morceaux.push(`${o} ${pl(o, 'occasion', 'occasions')}`);
  if (!morceaux.length) return `${insights.length} ${pl(insights.length, 'chose à regarder', 'choses à regarder')} ce matin.`;
  return `${morceaux.join(' et ')} à regarder.`;
}

/**
 * Interprète une commande d'ACTION dans un message (déterministe — jamais laissé
 * à l'IA d'inventer une action). Reconnaît : approuver / rejeter une proposition
 * (par nom, ou « tout »), et activer un réglage (réponse instantanée, envoi).
 * @returns {null | {action:'approuver'|'rejeter', cible:string|null, tout:boolean}
 *                 | {action:'activer', quoi:'accuse'|'envoyer'}}
 */
function interpreterCommande(message) {
  // Retirer une adresse polie initiale (« Novalis, … »).
  const brut = String(message || '').trim().replace(/^\s*nova(lis)?\s*[,:]?\s*/i, '');
  const m = brut.toLowerCase();
  if (!m) return null;

  // Une QUESTION ou une NÉGATION n'est jamais une commande — sinon « peux-tu
  // supprimer… ? » ou « je ne veux pas rejeter… » déclencheraient une action
  // irréversible. On exige aussi que le verbe d'action soit EN TÊTE de phrase
  // (une commande est impérative), pas noyé dans une question.
  if (/[?]/.test(brut)) return null;
  if (/^(peux|pourrais|pourrait|est-ce|pourquoi|comment|combien|qui|quand|quel|faut-il|dois|penses|crois|veux|serait|as-tu|aimerais)/i.test(brut)) return null;
  if (/\bne\s+\S/.test(m) && /\bpas\b/.test(m)) return null;

  const premier = (m.match(/^([a-zà-ÿ']+)/) || [])[1] || '';
  if (/^(active|activ|activez|allume|allumez)$/.test(premier)) {
    if (/(instantan|accus|24\s*\/?\s*7|24h)/.test(m)) return { action: 'activer', quoi: 'accuse' };
    if (/(envoi|envoy|approbation)/.test(m)) return { action: 'activer', quoi: 'envoyer' };
    return null;
  }
  const approuver = /^(approuve|approuver|approuvez|accepte|accepter|valide|valider|envoie|envoyer|envoyez)$/.test(premier);
  const rejeter = /^(rejette|rejeter|rejetez|refuse|refuser|refusez|ecarte|écarte)$/.test(premier);
  if (!approuver && !rejeter) return null;

  const tout = /\b(tout|toutes|tous)\b/.test(m);
  // Le nom propre suit « à / au / pour / de » et commence par une majuscule.
  let cible = null;
  const mm = brut.match(/(?:^|\s)(?:à|au|pour|de|a)\s+(\p{Lu}[\p{L}\-' ]{0,50})/u);
  if (mm) cible = mm[1].trim().replace(/\s+(le|la|les|un|une|ce|cette|ma|mon)\b.*$/i, '').trim() || null;
  return { action: approuver ? 'approuver' : 'rejeter', cible, tout };
}

module.exports = { analyser, resume, interpreterCommande };
