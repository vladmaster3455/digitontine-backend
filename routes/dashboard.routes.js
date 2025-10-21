const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkRole } = require('../middleware/role.middleware');

// Dashboards par role
router.get(
  '/tresorier',
  verifyToken,
  checkRole('Tresorier', 'Administrateur'),
  dashboardController.dashboardTresorier
);

router.get(
  '/admin',
  verifyToken,
  checkRole('Administrateur'),
  dashboardController.dashboardAdmin
);

router.get(
  '/membre',
  verifyToken,
  checkRole('Membre', 'Tresorier', 'Administrateur'),
  dashboardController.dashboardMembre
);

// Statistiques globales
router.get(
  '/statistiques',
  verifyToken,
  checkRole('Administrateur'),
  dashboardController.statistiquesGlobales
);
/**
 * @swagger
 * /digitontine/dashboard/admin:
 *   get:
 *     tags: [Dashboard]
 *     summary: Tableau de bord Admin
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Statistiques admin
 */

/**
 * @swagger
 * /digitontine/dashboard/membre:
 *   get:
 *     tags: [Dashboard]
 *     summary: Tableau de bord Membre
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Mes tontines et cotisations
 */

/**
 * @swagger
 * /digitontine/dashboard/statistiques:
 *   get:
 *     tags: [Dashboard]
 *     summary: Statistiques globales (Admin)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateDebut
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateFin
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Statistiques globales
 */
module.exports = router;