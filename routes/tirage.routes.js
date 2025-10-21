const express = require('express');
const router = express.Router();
const tirageController = require('../controllers/tirage.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkRole } = require('../middleware/role.middleware');
const { 
  validateCreateTirage, 
  validateTirageId 
} = require('../validators/tirage.validator');
const { auditLog } = require('../middleware/audit.middleware');

// Routes Admin/Tresorier
router.post(
  '/tontine/:tontineId/automatique',
  verifyToken,
  checkRole('Administrateur', 'Tresorier'),
  auditLog('TIRAGE_AUTOMATIQUE', 'Tirage'),
  tirageController.effectuerTirageAutomatique
);

router.post(
  '/tontine/:tontineId/manuel',
  verifyToken,
  checkRole('Administrateur'),
  validateCreateTirage,
  auditLog('TIRAGE_MANUEL', 'Tirage'),
  tirageController.effectuerTirageManuel
);

router.put(
  '/:tirageId/annuler',
  verifyToken,
  checkRole('Administrateur'),
  validateTirageId,
  auditLog('TIRAGE_ANNULATION', 'Tirage'),
  tirageController.annulerTirage
);

router.get(
  '/tontine/:tontineId',
  verifyToken,
  tirageController.listeTiragesTontine
);

router.get(
  '/:tirageId',
  verifyToken,
  validateTirageId,
  tirageController.detailsTirage
);

// Routes Membre
router.get(
  '/me/gains',
  verifyToken,
  checkRole('Membre', 'Tresorier', 'Administrateur'),
  tirageController.mesGains
);
/**
 * @swagger
 * /digitontine/tirages/tontine/{tontineId}/manuel:
 *   post:
 *     tags: [Tirages]
 *     summary: Effectuer un tirage manuel (Admin)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tontineId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [beneficiaireId]
 *             properties:
 *               beneficiaireId: { type: string }
 *               raison: { type: string }
 *     responses:
 *       201:
 *         description: Tirage manuel effectué
 */

/**
 * @swagger
 * /digitontine/tirages/{tirageId}/annuler:
 *   put:
 *     tags: [Tirages]
 *     summary: Annuler un tirage (Admin)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tirageId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [raison]
 *             properties:
 *               raison: { type: string, minLength: 10 }
 *     responses:
 *       200:
 *         description: Tirage annulé
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
 *         schema: { type: string }
 *       - in: query
 *         name: statut
 *         schema: { type: string, enum: [Effectue, Annule] }
 *     responses:
 *       200:
 *         description: Liste des tirages
 */

/**
 * @swagger
 * /digitontine/tirages/{tirageId}:
 *   get:
 *     tags: [Tirages]
 *     summary: Détails d'un tirage
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tirageId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Détails du tirage
 *       404:
 *         description: Tirage introuvable
 */

/**
 * @swagger
 * /digitontine/tirages/me/gains:
 *   get:
 *     tags: [Tirages]
 *     summary: Mes gains (Membre)
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
 *                 tirages: { type: array }
 *                 totalGagne: { type: number }
 *                 nombreGains: { type: number }
 */
module.exports = router;