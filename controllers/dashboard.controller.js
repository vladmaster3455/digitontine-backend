const User = require('../models/User');
const Tontine = require('../models/Tontine');
const Transaction = require('../models/Transaction');
const Tirage = require('../models/Tirage');
const Penalite = require('../models/Penalite');
const ApiResponse = require('../utils/apiResponse');
const { AppError } = require('../utils/errors');
const mongoose = require('mongoose');

// US : Tableau de bord Administrateur
exports.dashboardAdmin = async (req, res, next) => {
  try {
    // Statistiques utilisateurs
    const totalUtilisateurs = await User.countDocuments();
    const utilisateursActifs = await User.countDocuments({ statut: 'Actif' });
    const nouveauxCeMois = await User.countDocuments({
      dateCreation: {
        $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      }
    });

    const repartitionRoles = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    // Statistiques tontines
    const totalTontines = await Tontine.countDocuments();
    const tontinesActives = await Tontine.countDocuments({ statut: 'Active' });
    const tontinesTerminees = await Tontine.countDocuments({ statut: 'Terminee' });
    const tontinesEnAttente = await Tontine.countDocuments({ statut: 'En attente' });

    // Statistiques financieres (vue globale)
    const statsFinancieres = await Transaction.aggregate([
      {
        $group: {
          _id: '$statut',
          count: { $sum: 1 },
          montantTotal: { $sum: '$montant' }
        }
      }
    ]);

    // Tontines les plus actives
    const tontinesPopulaires = await Tontine.aggregate([
      { $match: { statut: 'Active' } },
      {
        $project: {
          nom: 1,
          nombreMembres: { $size: '$membres' },
          montantCotisation: 1,
          frequence: 1
        }
      },
      { $sort: { nombreMembres: -1 } },
      { $limit: 5 }
    ]);

    // ✅ CORRECTION : Logs d'audit - populate('userId') au lieu de populate('user')
    const AuditLog = require('../models/AuditLog');
    const logsRecents = await AuditLog.find()
      .populate('userId', 'prenom nom role')  // ✅ CORRIGÉ : userId au lieu de user
      .sort({ timestamp: -1 })
      .limit(10);

    // Alertes (membres en retard, tontines problematiques)
    const membresEnRetard = await Transaction.countDocuments({
      statut: 'En attente',
      dateLimite: { $lt: new Date() }
    });

    const tontinesBloquees = await Tontine.countDocuments({ statut: 'Bloquee' });

    ApiResponse.success(res, {
      utilisateurs: {
        total: totalUtilisateurs,
        actifs: utilisateursActifs,
        nouveauxCeMois,
        repartitionRoles
      },
      tontines: {
        total: totalTontines,
        actives: tontinesActives,
        terminees: tontinesTerminees,
        enAttente: tontinesEnAttente,
        bloquees: tontinesBloquees,
        populaires: tontinesPopulaires
      },
      financier: statsFinancieres,
      alertes: {
        membresEnRetard,
        tontinesBloquees
      },
      logsRecents
    }, 'Tableau de bord administrateur');
  } catch (error) {
    next(error);
  }
};

// US : Tableau de bord Membre (CORRIGÉ)
exports.dashboardMembre = async (req, res, next) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // Chercher dans le tableau membres.userId
    const mesTontinesActives = await Tontine.find({
      'membres.userId': userId,
      statut: 'Active'
    }).select('nom montantCotisation frequence dateDebut');

    // Mes cotisations
    const mesCotisations = await Transaction.aggregate([
      { $match: { userId: userId, type: 'Cotisation' } },
      {
        $group: {
          _id: '$statut',
          count: { $sum: 1 },
          montantTotal: { $sum: '$montant' }
        }
      }
    ]);

    const totalCotise = mesCotisations
      .filter(c => c._id === 'Validee')
      .reduce((sum, c) => sum + c.montantTotal, 0);

    // Mes gains
    const mesGains = await Tirage.find({
      beneficiaireId: userId,
      statut: 'Effectue'
    })
      .populate('tontineId', 'nom')
      .select('tontineId montant dateEffective');

    const totalGagne = mesGains.reduce((sum, g) => sum + g.montant, 0);

    // Mes pénalités
    const mesPenalites = await Penalite.aggregate([
      { $match: { userId: userId, statut: 'Appliquee' } },
      { $group: { _id: null, total: { $sum: '$montant' } } }
    ]);

    // Prochaines échéances
    const prochainesEcheances = await Transaction.find({
      userId: userId,
      statut: 'En attente',
      dateLimite: { $gte: new Date() }
    })
      .populate('tontineId', 'nom')
      .sort({ dateLimite: 1 })
      .limit(5);

    // Retards
    const retards = await Transaction.countDocuments({
      userId: userId,
      statut: 'En attente',
      dateLimite: { $lt: new Date() }
    });

    return ApiResponse.success(res, {
      resume: {
        tontinesActives: mesTontinesActives?.length || 0,
        totalCotise: totalCotise || 0,
        totalGagne: totalGagne || 0,
        totalPenalites: mesPenalites[0]?.total || 0,
        retards: retards || 0
      },
      tontines: mesTontinesActives || [],
      gains: mesGains || [],
      prochainesEcheances: prochainesEcheances || []
    }, 'Tableau de bord membre');
  } catch (error) {
    console.error('❌ Erreur dashboardMembre:', error);
    next(error);
  }
};

// US : Tableau de bord Tresorier (CORRIGÉ)
// US : Tableau de bord Tresorier (CORRIGÉ)
exports.dashboardTresorier = async (req, res, next) => {
  try {
    const tresorierUserId = new mongoose.Types.ObjectId(req.user.id);

    // KPIs principaux
    const montantTotalCollecte = await Transaction.aggregate([
      { $match: { statut: 'Validee', type: 'Cotisation' } },
      { $group: { _id: null, total: { $sum: '$montant' } } }
    ]);

    const montantTotalDistribue = await Tirage.aggregate([
      { $match: { statut: 'Effectue' } },
      { $group: { _id: null, total: { $sum: '$montant' } } }
    ]);

    const totalCollecte = montantTotalCollecte[0]?.total || 0;
    const totalDistribue = montantTotalDistribue[0]?.total || 0;
    const soldeDisponible = totalCollecte - totalDistribue;

    // Taux de recouvrement
    const totalAttendu = await Transaction.countDocuments({ type: 'Cotisation' });
    const totalValide = await Transaction.countDocuments({ 
      type: 'Cotisation', 
      statut: 'Validee' 
    });
    const tauxRecouvrement = totalAttendu > 0 
      ? ((totalValide / totalAttendu) * 100).toFixed(2) 
      : 0;

    // Repartition par tontine
    const repartitionParTontine = await Transaction.aggregate([
      { $match: { statut: 'Validee', type: 'Cotisation' } },
      {
        $group: {
          _id: '$tontineId',
          montant: { $sum: '$montant' },
          nombre: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'tontines',
          localField: '_id',
          foreignField: '_id',
          as: 'tontineInfo'
        }
      },
      { $unwind: '$tontineInfo' },
      {
        $project: {
          tontine: '$tontineInfo.nom',
          montant: 1,
          nombre: 1
        }
      }
    ]);

    // Evolution des cotisations (30 derniers jours)
    const dateLimite = new Date();
    dateLimite.setDate(dateLimite.getDate() - 30);

    const evolutionCotisations = await Transaction.aggregate([
      {
        $match: {
          statut: 'Validee',
          type: 'Cotisation',
          dateTransaction: { $gte: dateLimite }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$dateTransaction' }
          },
          montant: { $sum: '$montant' },
          nombre: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Transactions en attente - COUNT
    const transactionsEnAttenteCount = await Transaction.countDocuments({
      statut: 'En attente'
    });

    // Transactions en attente - LISTE avec populate
    const transactionsEnAttenteListe = await Transaction.find({
      statut: 'En attente'
    })
      .populate('userId', 'prenom nom')
      .populate('tontineId', 'nom')
      .sort({ dateTransaction: -1 })
      .limit(10);

    // Penalites totales
    const totalPenalites = await Penalite.aggregate([
      { $match: { statut: 'Appliquee' } },
      { $group: { _id: null, total: { $sum: '$montant' } } }
    ]);

    // Top 5 membres ponctuels
    const topMembres = await Transaction.aggregate([
      { $match: { statut: 'Validee', type: 'Cotisation' } },
      {
        $group: {
          _id: '$userId',
          nombrePaiements: { $sum: 1 },
          montantTotal: { $sum: '$montant' }
        }
      },
      { $sort: { nombrePaiements: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },
      {
        $project: {
          prenom: '$userInfo.prenom',
          nom: '$userInfo.nom',
          nombrePaiements: 1,
          montantTotal: 1
        }
      }
    ]);

    //  NOUVEAU : Récupérer les tontines où le trésorier est assigné
 //  Ajout du champ 'membres'
const mesTontines = await Tontine.find({
  tresorierAssigne: tresorierUserId
})
  .select('nom description montantCotisation frequence statut membres dateDebut')
  .sort({ createdAt: -1 })
  .limit(10);

    ApiResponse.success(res, {
      kpis: {
        montantTotalCollecte: totalCollecte || 0,
        montantTotalDistribue: totalDistribue || 0,
        soldeDisponible: soldeDisponible || 0,
        tauxRecouvrement: `${tauxRecouvrement || 0}%`,
        transactionsEnAttente: transactionsEnAttenteCount || 0,
        totalPenalites: totalPenalites[0]?.total || 0
      },
      transactionsEnAttente: transactionsEnAttenteListe || [],
      repartitionParTontine: repartitionParTontine || [],
      evolutionCotisations: evolutionCotisations || [],
      topMembres: topMembres || [],
      mesTontines: mesTontines || []  // ✅ AJOUTÉ
    }, 'Tableau de bord tresorier');
  } catch (error) {
    next(error);
  }
};

// US : Statistiques globales (Admin)
exports.statistiquesGlobales = async (req, res, next) => {
  try {
    const { dateDebut, dateFin } = req.query;

    const dateFilter = {};
    if (dateDebut) dateFilter.$gte = new Date(dateDebut);
    if (dateFin) dateFilter.$lte = new Date(dateFin);

    const stats = {
      transactions: await Transaction.aggregate([
        ...(Object.keys(dateFilter).length > 0
          ? [{ $match: { dateTransaction: dateFilter } }]
          : []),
        {
          $group: {
            _id: null,
            total: { $sum: '$montant' },
            count: { $sum: 1 },
            moyenne: { $avg: '$montant' }
          }
        }
      ]),
      tontines: await Tontine.aggregate([
        {
          $group: {
            _id: '$statut',
            count: { $sum: 1 }
          }
        }
      ]),
      utilisateurs: await User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 }
          }
        }
      ])
    };

    ApiResponse.success(res, stats, 'Statistiques globales');
  } catch (error) {
    next(error);
  }
};

module.exports = exports;