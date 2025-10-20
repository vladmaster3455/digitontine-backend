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

module.exports = router;