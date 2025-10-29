const express = require('express');
const router = express.Router();
const tirageController = require('../controllers/tirage.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { isAdmin, isAdminOrTresorier } = require('../middleware/role.middleware');
const { 
  validateCreateTirage, 
  validateTirageId 
} = require('../validators/tirage.validator');
const { auditLog } = require('../middleware/audit.middleware');
const { body } = require('express-validator');

// Route pour notifier les membres avant tirage (Admin/Tresorier)
router.post(
  '/tontine/:tontineId/notify',
  verifyToken,
  isAdminOrTresorier,
  body('dateTirage')
    .notEmpty()
    .withMessage('Date du tirage requise')
    .isISO8601()
    .withMessage('Format de date invalide'),
  auditLog('NOTIFY_TIRAGE', 'Tirage'),
  tirageController.notifyUpcomingTirage
);

// Tirage automatique (Admin/Tresorier)
router.post(
  '/tontine/:tontineId/automatique',
  verifyToken,
  isAdminOrTresorier,
  auditLog('TIRAGE_AUTOMATIQUE', 'Tirage'),
  tirageController.effectuerTirageAutomatique
);
//  NOUVEAU : Tirage automatique MODE TEST (Admin/Trésorier)
router.post(
  '/tontine/:tontineId/automatique-test',
  verifyToken,
  isAdminOrTresorier,
  auditLog('TIRAGE_AUTOMATIQUE_TEST', 'Tirage'),
  tirageController.effectuerTirageAutomatiqueTest
);

// Tirage manuel (Admin uniquement)
router.post(
  '/tontine/:tontineId/manuel',
  verifyToken,
  isAdmin,
  validateCreateTirage,
  auditLog('TIRAGE_MANUEL', 'Tirage'),
  tirageController.effectuerTirageManuel
);

// Annuler un tirage (Admin uniquement)
router.put(
  '/:tirageId/annuler',
  verifyToken,
  isAdmin,
  validateTirageId,
  auditLog('TIRAGE_ANNULATION', 'Tirage'),
  tirageController.annulerTirage
);

// Liste des tirages d'une tontine (Tous)
router.get(
  '/tontine/:tontineId',
  verifyToken,
  tirageController.listeTiragesTontine
);

// Details d'un tirage (Tous)
router.get(
  '/:tirageId',
  verifyToken,
  validateTirageId,
  tirageController.detailsTirage
);

// Mes gains (Membre/Tresorier/Admin)
router.get(
  '/me/gains',
  verifyToken,
  tirageController.mesGains
);

/**
 * @swagger
 * /digitontine/tirages/tontine/{tontineId}/notify:
 *   post:
 *     tags: [Tirages]
 *     summary: Notifier les membres avant un tirage (Admin/Tresorier)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tontineId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la tontine
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dateTirage
 *             properties:
 *               dateTirage:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-12-20T14:00:00.000Z"
 *                 description: Date et heure prevues du tirage
 *     responses:
 *       200:
 *         description: Notifications envoyees avec succes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                     notificationsSent:
 *                       type: integer
 *                     notificationsFailed:
 *                       type: integer
 *                     dateTirage:
 *                       type: string
 *       400:
 *         description: Donnees invalides
 *       403:
 *         description: Acces refuse
 *       404:
 *         description: Tontine introuvable
 */

/**
 * @swagger
 * /digitontine/tirages/tontine/{tontineId}/automatique:
 *   post:
 *     tags: [Tirages]
 *     summary: Effectuer un tirage automatique (Admin/Tresorier)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tontineId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la tontine
 *     responses:
 *       201:
 *         description: Tirage automatique effectue avec succes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     tontineId:
 *                       type: string
 *                     beneficiaire:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         prenom:
 *                           type: string
 *                         nom:
 *                           type: string
 *                         email:
 *                           type: string
 *                     montant:
 *                       type: number
 *                     dateEffective:
 *                       type: string
 *                       format: date-time
 *                     typeTirage:
 *                       type: string
 *                       example: "Automatique"
 *                     statut:
 *                       type: string
 *                       example: "Effectue"
 *       400:
 *         description: Tirage impossible (cotisations manquantes, aucun membre eligible)
 *       404:
 *         description: Tontine introuvable
 */

/**
 * @swagger
 * /digitontine/tirages/tontine/{tontineId}/manuel:
 *   post:
 *     tags: [Tirages]
 *     summary: Effectuer un tirage manuel (Admin uniquement)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tontineId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - beneficiaireId
 *             properties:
 *               beneficiaireId:
 *                 type: string
 *                 description: ID du membre beneficiaire
 *               raison:
 *                 type: string
 *                 description: Raison du tirage manuel
 *                 example: "Situation exceptionnelle - Besoin urgent"
 *     responses:
 *       201:
 *         description: Tirage manuel effectue avec succes
 *       400:
 *         description: Beneficiaire invalide ou a deja gagne
 *       404:
 *         description: Tontine ou beneficiaire introuvable
 */

/**
 * @swagger
 * /digitontine/tirages/{tirageId}/annuler:
 *   put:
 *     tags: [Tirages]
 *     summary: Annuler un tirage (Admin uniquement)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tirageId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - raison
 *             properties:
 *               raison:
 *                 type: string
 *                 minLength: 10
 *                 description: Raison de l'annulation (minimum 10 caracteres)
 *                 example: "Erreur dans le processus de tirage"
 *     responses:
 *       200:
 *         description: Tirage annule avec succes
 *       400:
 *         description: Tirage deja annule ou raison trop courte
 *       404:
 *         description: Tirage introuvable
 */

/**
 * @swagger
 * /digitontine/tirages/tontine/{tontineId}:
 *   get:
 *     tags: [Tirages]
 *     summary: Liste des tirages d'une tontine
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tontineId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: statut
 *         schema:
 *           type: string
 *           enum: [Effectue, Annule]
 *         description: Filtrer par statut
 *     responses:
 *       200:
 *         description: Liste des tirages recuperee avec succes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       beneficiaire:
 *                         type: object
 *                       montant:
 *                         type: number
 *                       dateEffective:
 *                         type: string
 *                       typeTirage:
 *                         type: string
 *                       statut:
 *                         type: string
 */

/**
 * @swagger
 * /digitontine/tirages/{tirageId}:
 *   get:
 *     tags: [Tirages]
 *     summary: Details d'un tirage specifique
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tirageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Details du tirage
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     tontineId:
 *                       type: object
 *                     beneficiaire:
 *                       type: object
 *                     montant:
 *                       type: number
 *                     dateEffective:
 *                       type: string
 *                     typeTirage:
 *                       type: string
 *                     statut:
 *                       type: string
 *                     effectuePar:
 *                       type: object
 *       403:
 *         description: Acces refuse
 *       404:
 *         description: Tirage introuvable
 */

/**
 * @swagger
 * /digitontine/tirages/me/gains:
 *   get:
 *     tags: [Tirages]
 *     summary: Consulter mes gains (Membre/Tresorier/Admin)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Historique de mes gains
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     tirages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           tontineId:
 *                             type: object
 *                           montant:
 *                             type: number
 *                           dateEffective:
 *                             type: string
 *                     totalGagne:
 *                       type: number
 *                       description: Montant total gagne
 *                     nombreGains:
 *                       type: integer
 *                       description: Nombre de tirages gagnes
 */

module.exports = router;