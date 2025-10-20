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
 * /digitontine/dashboard/tresorier:
 *   get:
 *     tags: [Dashboard]
 *     summary: Tableau de bord Trésorier
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: KPIs et statistiques
 */
module.exports = router;