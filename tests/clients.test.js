import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../core/db.js';
import { cleDe, repertoire, fiche, pipeline, enregistrerDossier } from '../core/clients.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db);
});

const SRC = 'garage-test';
function lead(o) {
  db.prepare(`INSERT INTO leads (source, nom, courriel, message, statut, valeur_cents, created_at, gagne_le)
    VALUES (@source,@nom,@courriel,@message,@statut,@valeur_cents,@created_at,@gagne_le)`).run({
    source: SRC, nom: o.nom, courriel: o.courriel || '', message: o.message || 'Bonjour',
    statut: o.statut || 'nouveau', valeur_cents: o.valeur_cents || null,
    created_at: o.created_at, gagne_le: o.gagne_le || null,
  });
}
function rdv(o) {
  db.prepare(`INSERT INTO rendezvous (source, client_nom, client_courriel, debut, service, statut, client_reponse, cree_le)
    VALUES (@source,@client_nom,@client_courriel,@debut,@service,@statut,@client_reponse,@cree_le)`).run({
    source: SRC, client_nom: o.nom, client_courriel: o.courriel || '', debut: o.debut,
    service: o.service || null, statut: o.statut || 'prevu', client_reponse: o.client_reponse || null,
    cree_le: o.cree_le || o.debut,
  });
}
function prop(o) {
  db.prepare(`INSERT INTO propositions (source, type, ref_type, titre, brouillon, destinataire, statut, cree_le)
    VALUES (@source,@type,@ref_type,@titre,@brouillon,@destinataire,@statut,@cree_le)`).run({
    source: SRC, type: o.type, ref_type: o.ref_type || null, titre: o.titre || 'Titre',
    brouillon: 'texte', destinataire: o.destinataire || '', statut: o.statut || 'en_attente',
    cree_le: o.cree_le,
  });
}

describe('clients — clé de regroupement', () => {
  it('regroupe par courriel (insensible à la casse/espaces)', () => {
    expect(cleDe('  Marie@Test.CA ', 'Marie')).toBe('m:marie@test.ca');
  });
  it('retombe sur le nom quand aucun courriel valide', () => {
    expect(cleDe('', 'Jean  Roy')).toBe('n:jean roy');
    expect(cleDe('pasuncourriel', 'Jean Roy')).toBe('n:jean roy');
  });
  it('retourne null si rien', () => {
    expect(cleDe('', '')).toBeNull();
  });
});

describe('clients — répertoire agrégé', () => {
  it('fusionne les échanges d’une même personne à travers les tables', () => {
    lead({ nom: 'Mme Côté', courriel: 'cote@courriel.ca', created_at: '2026-01-01 09:00' });
    rdv({ nom: 'Mme Côté', courriel: 'COTE@courriel.ca', debut: '2026-02-01 12:00', service: 'Vidange' });
    prop({ type: 'devis', destinataire: 'cote@courriel.ca', titre: 'Devis vidange', cree_le: '2026-02-02 10:00' });
    const r = repertoire(db, SRC, {});
    expect(r.total).toBe(1); // une seule personne malgré 3 lignes
    const c = r.clients[0];
    expect(c.nom).toBe('Mme Côté');
    expect(c.messages).toBe(1);
    expect(c.rdv).toBe(1);
    expect(c.devis).toBe(1);
  });

  it('compte la valeur seulement pour les clients gagnés', () => {
    lead({ nom: 'A', courriel: 'a@x.ca', statut: 'gagne', valeur_cents: 50000, created_at: '2026-01-01 09:00', gagne_le: '2026-01-05 09:00' });
    lead({ nom: 'B', courriel: 'b@x.ca', statut: 'nouveau', valeur_cents: 99999, created_at: '2026-01-02 09:00' });
    const r = repertoire(db, SRC, {});
    expect(r.gagnes).toBe(1);
    expect(r.valeur_cents).toBe(50000); // B non gagné → sa valeur n'est pas comptée
  });

  it('trie par activité la plus récente', () => {
    lead({ nom: 'Ancien', courriel: 'vieux@x.ca', created_at: '2026-01-01 09:00' });
    lead({ nom: 'Récent', courriel: 'neuf@x.ca', created_at: '2026-03-01 09:00' });
    const r = repertoire(db, SRC, {});
    expect(r.clients[0].nom).toBe('Récent');
  });

  it('filtre par recherche (nom ou courriel)', () => {
    lead({ nom: 'Marie Tremblay', courriel: 'marie@x.ca', created_at: '2026-01-01 09:00' });
    lead({ nom: 'Paul Roy', courriel: 'paul@x.ca', created_at: '2026-01-02 09:00' });
    expect(repertoire(db, SRC, { q: 'tremblay' }).affiches).toBe(1);
    expect(repertoire(db, SRC, { q: 'paul@x' }).affiches).toBe(1);
    expect(repertoire(db, SRC, { q: 'zzz' }).affiches).toBe(0);
  });

  it('ne crée pas de dossier pour une proposition sans personne connue', () => {
    prop({ type: 'reponse', destinataire: 'inconnu@x.ca', cree_le: '2026-01-01 09:00' });
    expect(repertoire(db, SRC, {}).total).toBe(0);
  });
});

describe('clients — fiche', () => {
  it('assemble une chronologie triée du plus récent au plus ancien', () => {
    lead({ nom: 'Mme Côté', courriel: 'cote@x.ca', message: 'Première demande', created_at: '2026-01-01 09:00' });
    rdv({ nom: 'Mme Côté', courriel: 'cote@x.ca', debut: '2026-03-01 12:00', service: 'Vidange', client_reponse: 'confirme' });
    const f = fiche(db, SRC, 'm:cote@x.ca');
    expect(f).not.toBeNull();
    expect(f.compteurs.messages).toBe(1);
    expect(f.compteurs.rdv).toBe(1);
    expect(f.evenements[0].genre).toBe('rdv'); // le plus récent d'abord
    expect(f.evenements[0].meta).toContain('confirmé');
    expect(f.premier).toBe('2026-01-01 09:00');
  });

  it('retourne null pour une clé inconnue', () => {
    expect(fiche(db, SRC, 'm:personne@x.ca')).toBeNull();
  });
});

describe('clients — dossier persistant (notes, étape, assignation)', () => {
  beforeEach(() => {
    lead({ nom: 'Mme Côté', courriel: 'cote@x.ca', created_at: '2026-01-01 09:00' });
  });

  it('enregistre notes + responsable et les relit dans la fiche', () => {
    enregistrerDossier(db, SRC, 'm:cote@x.ca', { notes: 'Préfère le matin.', assigne: 'Éric' });
    const f = fiche(db, SRC, 'm:cote@x.ca');
    expect(f.notes).toBe('Préfère le matin.');
    expect(f.assigne).toBe('Éric');
  });

  it('l’étape choisie à la main prime sur le statut déduit', () => {
    // lead statut = 'nouveau' ; on force 'gagne'
    enregistrerDossier(db, SRC, 'm:cote@x.ca', { statut: 'gagne' });
    const f = fiche(db, SRC, 'm:cote@x.ca');
    expect(f.statut).toBe('gagne');
    expect(f.statut_manuel).toBe('gagne');
    expect(f.gagne).toBe(true);
  });

  it('rejette un statut invalide', () => {
    expect(() => enregistrerDossier(db, SRC, 'm:cote@x.ca', { statut: 'zzz' })).toThrow();
  });

  it('un statut vide efface l’override (retour au déduit)', () => {
    enregistrerDossier(db, SRC, 'm:cote@x.ca', { statut: 'gagne' });
    enregistrerDossier(db, SRC, 'm:cote@x.ca', { statut: '' });
    const f = fiche(db, SRC, 'm:cote@x.ca');
    expect(f.statut_manuel).toBe('');
    expect(f.statut).toBe('nouveau'); // redevient déduit
  });

  it('une mise à jour partielle ne perd pas les autres champs', () => {
    enregistrerDossier(db, SRC, 'm:cote@x.ca', { notes: 'Note A', assigne: 'Éric' });
    enregistrerDossier(db, SRC, 'm:cote@x.ca', { statut: 'contacte' }); // sans toucher notes/assigne
    const f = fiche(db, SRC, 'm:cote@x.ca');
    expect(f.notes).toBe('Note A');
    expect(f.assigne).toBe('Éric');
    expect(f.statut).toBe('contacte');
  });
});

describe('clients — pipeline', () => {
  it('range chaque personne dans sa colonne d’étape', () => {
    lead({ nom: 'A', courriel: 'a@x.ca', created_at: '2026-01-01 09:00' });
    lead({ nom: 'B', courriel: 'b@x.ca', statut: 'gagne', valeur_cents: 10000, created_at: '2026-01-02 09:00', gagne_le: '2026-01-03 09:00' });
    enregistrerDossier(db, SRC, 'm:a@x.ca', { statut: 'contacte' });
    const p = pipeline(db, SRC);
    const col = (s) => p.colonnes.find(c => c.statut === s);
    expect(col('contacte').clients.map(c => c.nom)).toContain('A');
    expect(col('gagne').clients.map(c => c.nom)).toContain('B');
    expect(col('nouveau').clients.length).toBe(0);
    expect(p.colonnes.map(c => c.statut)).toEqual(['nouveau', 'contacte', 'gagne', 'perdu']);
  });
});
