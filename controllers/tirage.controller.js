const Tirage = require('../models/Tirage');
const Tontine = require('../models/Tontine');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const emailService = require('../services/email.service');
const { ApiResponse } = require('../utils/apiResponse');
const { AppError } = require('../utils/errors');

// US : Tirage automatique aleatoire
exports.effectuerTirageAutomatique = async (req, res, next) => {
  try {
    const { tontineId } = req.params;

    const tontine = await Tontine.findById(tontineId)
      .populate('membres', 'prenom nom email telephone');

    if (!tontine) {
      throw new AppError('Tontine introuvable', 404);
    }

    if (tontine.statut !== 'Active') {
      throw new AppError('La tontine doit etre active', 400);
    }

    // Verifier qu'il reste des membres n'ayant pas gagne
    const tiragesExistants = await Tirage.find({ 
      tontine: tontineId, 
      statut: 'Effectue' 
    }).distinct('beneficiaire');

    const membresEligibles = tontine.membres.filter(
      m => !tiragesExistants.some(t => t.equals(m._id))
    );

    if (membresEligibles.length === 0) {
      throw new AppError('Tous les membres ont deja gagne', 400);
    }

    // Verifier les cotisations validees pour cette echeance
    const echeanceActuelle = tiragesExistants.length + 1;
    const cotisationsValidees = await Transaction.countDocuments({
      tontine: tontineId,
      echeanceNumero: echeanceActuelle,
      statut: 'Validee',
      type: 'Cotisation'
    });

    if (cotisationsValidees < tontine.membres.length) {
      throw new AppError(
        `${cotisationsValidees}/${tontine.membres.length} cotisations validees. Tirage impossible.`,
        400
      );
    }

    // Tirage aleatoire
    const beneficiaire = membresEligibles[
      Math.floor(Math.random() * membresEligibles.length)
    ];

    const montantTotal = tontine.montantCotisation * tontine.membres.length;

    const nouveauTirage = await Tirage.create({
      tontine: tontineId,
      beneficiaire: beneficiaire._id,
      montant: montantTotal,
      dateEffective: new Date(),
      typeTirage: 'Automatique',
      statut: 'Effectue',
      effectuePar: req.user.id
    });

    await nouveauTirage.populate('beneficiaire', 'prenom nom email telephone');

    // Audit log
    await AuditLog.create({
      user: req.user.id,
      action: 'TIRAGE_EFFECTUE',
      details: {
        tirageId: nouveauTirage._id,
        tontineId,
        beneficiaire: beneficiaire._id,
        montant: montantTotal,
        type: 'Automatique'
      },
      ipAddress: req.ip
    });

    // Notifier le beneficiaire
    await emailService.sendEmail(
      beneficiaire.email,
      'Felicitations - Vous avez gagne le tirage',
      `Bonjour ${beneficiaire.prenom},\n\nFelicitations ! Vous avez ete tire au sort pour la tontine "${tontine.nom}".\n\nMontant a recevoir : ${montantTotal} FCFA\n\nLe montant sera verse sous 48h.`
    );

    // Notifier tous les autres membres
    const autresMembres = tontine.membres.filter(m => !m._id.equals(beneficiaire._id));
    for (const membre of autresMembres) {
      await emailService.sendEmail(
        membre.email,
        `Resultat du tirage - Tontine ${tontine.nom}`,
        `Bonjour ${membre.prenom},\n\nLe tirage pour l'echeance ${echeanceActuelle} a ete effectue.\n\nBeneficiaire : ${beneficiaire.prenom} ${beneficiaire.nom}\nMontant : ${montantTotal} FCFA`
      );
    }

    ApiResponse.success(res, nouveauTirage, 'Tirage effectue avec succes', 201);
  } catch (error) {
    next(error);
  }
};

// US : Tirage manuel (Admin)
exports.effectuerTirageManuel = async (req, res, next) => {
  try {
    const { tontineId } = req.params;
    const { beneficiaireId, raison } = req.body;

    if (!beneficiaireId) {
      throw new AppError('Beneficiaire requis', 400);
    }

    const tontine = await Tontine.findById(tontineId)
      .populate('membres', 'prenom nom email telephone');

    if (!tontine) {
      throw new AppError('Tontine introuvable', 404);
    }

    if (tontine.statut !== 'Active') {
      throw new AppError('La tontine doit etre active', 400);
    }

    // Verifier que le beneficiaire est membre
    const estMembre = tontine.membres.some(m => m._id.equals(beneficiaireId));
    if (!estMembre) {
      throw new AppError('Le beneficiaire doit etre membre de la tontine', 400);
    }

    // Verifier qu'il n'a pas deja gagne
    const aDejaGagne = await Tirage.exists({
      tontine: tontineId,
      beneficiaire: beneficiaireId,
      statut: 'Effectue'
    });

    if (aDejaGagne) {
      throw new AppError('Ce membre a deja gagne', 400);
    }

    const montantTotal = tontine.montantCotisation * tontine.membres.length;

    const nouveauTirage = await Tirage.create({
      tontine: tontineId,
      beneficiaire: beneficiaireId,
      montant: montantTotal,
      dateEffective: new Date(),
      typeTirage: 'Manuel',
      statut: 'Effectue',
      effectuePar: req.user.id,
      raisonManuelle: raison || 'Tirage manuel administrateur'
    });

    await nouveauTirage.populate('beneficiaire', 'prenom nom email telephone');

    await AuditLog.create({
      user: req.user.id,
      action: 'TIRAGE_MANUEL',
      details: {
        tirageId: nouveauTirage._id,
        tontineId,
        beneficiaire: beneficiaireId,
        montant: montantTotal,
        raison
      },
      ipAddress: req.ip
    });

    const beneficiaire = await User.findById(beneficiaireId);
    await emailService.sendEmail(
      beneficiaire.email,
      'Tirage manuel - Vous avez gagne',
      `Bonjour ${beneficiaire.prenom},\n\nVous avez ete designe beneficiaire du tirage de la tontine "${tontine.nom}".\n\nMontant : ${montantTotal} FCFA\n\nRaison : ${raison || 'Decision administrative'}`
    );

    ApiResponse.success(res, nouveauTirage, 'Tirage manuel effectue', 201);
  } catch (error) {
    next(error);
  }
};

// US : Annuler un tirage (Admin uniquement)
exports.annulerTirage = async (req, res, next) => {
  try {
    const { tirageId } = req.params;
    const { raison } = req.body;

    if (!raison || raison.trim().length < 10) {
      throw new AppError('Raison d\'annulation requise (min 10 caracteres)', 400);
    }

    const tirage = await Tirage.findById(tirageId);
    if (!tirage) {
      throw new AppError('Tirage introuvable', 404);
    }

    if (tirage.statut === 'Annule') {
      throw new AppError('Tirage deja annule', 400);
    }

    tirage.statut = 'Annule';
    tirage.raisonAnnulation = raison;
    tirage.annulePar = req.user.id;
    tirage.dateAnnulation = new Date();
    await tirage.save();

    await AuditLog.create({
      user: req.user.id,
      action: 'TIRAGE_ANNULE',
      details: {
        tirageId,
        tontineId: tirage.tontine,
        beneficiaire: tirage.beneficiaire,
        raison
      },
      ipAddress: req.ip
    });

    const beneficiaire = await User.findById(tirage.beneficiaire);
    const tontine = await Tontine.findById(tirage.tontine);

    await emailService.sendEmail(
      beneficiaire.email,
      'Annulation de tirage',
      `Bonjour ${beneficiaire.prenom},\n\nLe tirage de la tontine "${tontine.nom}" dont vous etiez beneficiaire a ete annule.\n\nRaison : ${raison}\n\nUn nouveau tirage sera effectue prochainement.`
    );

    ApiResponse.success(res, tirage, 'Tirage annule');
  } catch (error) {
    next(error);
  }
};

// US : Liste des tirages d'une tontine
exports.listeTiragesTontine = async (req, res, next) => {
  try {
    const { tontineId } = req.params;
    const { statut } = req.query;

    const query = { tontine: tontineId };
    if (statut) query.statut = statut;

    const tirages = await Tirage.find(query)
      .populate('beneficiaire', 'prenom nom email telephone')
      .populate('effectuePar', 'prenom nom')
      .sort({ dateEffective: -1 });

    ApiResponse.success(res, tirages, `${tirages.length} tirage(s) trouve(s)`);
  } catch (error) {
    next(error);
  }
};

// US : Historique de mes gains (Membre)
exports.mesGains = async (req, res, next) => {
  try {
    const tirages = await Tirage.find({
      beneficiaire: req.user.id,
      statut: 'Effectue'
    })
      .populate('tontine', 'nom montantCotisation frequence')
      .sort({ dateEffective: -1 });

    const totalGagne = tirages.reduce((sum, t) => sum + t.montant, 0);

    ApiResponse.success(res, {
      tirages,
      totalGagne,
      nombreGains: tirages.length
    }, 'Historique des gains');
  } catch (error) {
    next(error);
  }
};

// US : Details d'un tirage
exports.detailsTirage = async (req, res, next) => {
  try {
    const { tirageId } = req.params;

    const tirage = await Tirage.findById(tirageId)
      .populate('beneficiaire', 'prenom nom email telephone')
      .populate('tontine', 'nom montantCotisation frequence')
      .populate('effectuePar', 'prenom nom')
      .populate('annulePar', 'prenom nom');

    if (!tirage) {
      throw new AppError('Tirage introuvable', 404);
    }

    // Verifier autorisation
    const estAdmin = req.user.role === 'Administrateur';
    const estTresorier = req.user.role === 'Tresorier';
    const estBeneficiaire = tirage.beneficiaire._id.equals(req.user.id);

    const tontine = await Tontine.findById(tirage.tontine);
    const estMembreTontine = tontine.membres.some(m => m.equals(req.user.id));

    if (!estAdmin && !estTresorier && !estBeneficiaire && !estMembreTontine) {
      throw new AppError('Acces refuse', 403);
    }

    ApiResponse.success(res, tirage, 'Details du tirage');
  } catch (error) {
    next(error);
  }
};

module.exports = exports;