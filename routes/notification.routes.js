// routes/notification.routes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { verifyToken } = require('../middleware/auth.middleware');

/**
 * @route   GET /digitontine/notifications
 * @desc    Récupérer mes notifications
 * @access  Private
 */
router.get(
  '/',
  verifyToken,
  notificationController.getMyNotifications
);

/**
 * @route   GET /digitontine/notifications/unread-count
 * @desc    Obtenir le nombre de notifications non lues
 * @access  Private
 */
router.get(
  '/unread-count',
  verifyToken,
  notificationController.getUnreadCount
);

/**
 * @route   PUT /digitontine/notifications/:notificationId/read
 * @desc    Marquer une notification comme lue
 * @access  Private
 */
router.put(
  '/:notificationId/read',
  verifyToken,
  notificationController.markAsRead
);

/**
 * @route   PUT /digitontine/notifications/mark-all-read
 * @desc    Marquer toutes les notifications comme lues
 * @access  Private
 */
router.put(
  '/mark-all-read',
  verifyToken,
  notificationController.markAllAsRead
);

/**
 * @route   POST /digitontine/notifications/:notificationId/action
 * @desc    Accepter ou refuser participation au tirage
 * @access  Private
 */
router.post(
  '/:notificationId/action',
  verifyToken,
  notificationController.takeAction
);

/**
 * @route   DELETE /digitontine/notifications/:notificationId
 * @desc    Supprimer une notification
 * @access  Private
 */
router.delete(
  '/:notificationId',
  verifyToken,
  notificationController.deleteNotification
);

module.exports = router;