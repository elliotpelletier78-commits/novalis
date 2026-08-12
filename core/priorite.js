'use strict';
// ── Novalis — la priorité du matin ──────────────────────────────────
// À partir de l'état agrégé d'une entreprise, une SEULE action à faire en
// premier. Déterministe et honnête : on ne dramatise pas, et quand tout est à
// jour, on le dit. L'ordre reflète ce qui coûte le plus cher à ignorer :
//   1. un client qui attend une réponse (le tueur de vente n°1)
//   2. du travail déjà préparé qui attend un oui
//   3. une fuite mesurée sur le site
//   4. un branchement inachevé
//   5. rien — tout est à jour

/**
 * @param {{leads_attente?:Array<{nom:string,ilya?:string}>,
 *          propositions?:Array<object>, fuite?:object, pret_pct?:number}} etat
 * @returns {{ton:'urgent'|'action'|'info'|'calme', titre:string, sousTitre:string, lien:string}}
 */
function prioriteDuJour(etat = {}) {
  const attente = Array.isArray(etat.leads_attente) ? etat.leads_attente : [];
  const props = Array.isArray(etat.propositions) ? etat.propositions : [];
  const fuite = etat.fuite;
  const pret = Number.isFinite(etat.pret_pct) ? etat.pret_pct : 0;

  if (attente.length) {
    const l = attente[0];
    return {
      ton: 'urgent',
      titre: `Rappeler ${l.nom}`,
      sousTitre: `En attente${l.ilya ? ` depuis ${l.ilya}` : ''}. Répondre vite multiplie les chances de vente.`,
      lien: 'reception',
    };
  }
  if (props.length) {
    return {
      ton: 'action',
      titre: props.length === 1 ? 'Approuver la proposition préparée' : `Approuver ${props.length} propositions préparées`,
      sousTitre: 'Novalis a déjà fait le travail — il ne manque que votre oui.',
      lien: 'propositions',
    };
  }
  if (fuite && fuite.fiable && fuite.fuite) {
    return {
      ton: 'info',
      titre: fuite.fuite.titre,
      sousTitre: fuite.fuite.levier,
      lien: 'reception',
    };
  }
  if (pret < 100) {
    return {
      ton: 'info',
      titre: `Terminer le branchement (${pret}%)`,
      sousTitre: 'Quelques étapes et Novalis se met au travail pour vous.',
      lien: 'branchement',
    };
  }
  return {
    ton: 'calme',
    titre: 'Tout est à jour',
    sousTitre: 'Aucune action requise pour l\'instant. Novalis veille.',
    lien: 'aujourdhui',
  };
}

module.exports = { prioriteDuJour };
