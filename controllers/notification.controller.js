// controllers/notification.controller.js
const notificationService = require('../services/notification.service');
const Tontine = require('../models/Tontine');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

/**
 * @desc    Récupérer mes notifications
 * @route   GET /digitontine/notifications
 * @access  Private
 */
const getMyNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, type, lu } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
    };

    if (type) options.type = type;
    if (lu !== undefined) options.lu = lu === 'true';

    const result = await notificationService.getUserNotifications(userId, options);

    if (!result.success) {
      throw new AppError(result.error, 500);
    }

    return ApiResponse.success(
      res,
      result.data,
      `${result.data.total} notification(s) trouvée(s)`
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Obtenir le nombre de notifications non lues
 * @route   GET /digitontine/notifications/unread-count
 * @access  Private
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const result = await notificationService.getUnreadCount(userId);

    if (!result.success) {
      throw new AppError(result.error, 500);
    }

    return ApiResponse.success(res, { count: result.count });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Marquer une notification comme lue
 * @route   PUT /digitontine/notifications/:notificationId/read
 * @access  Private
 */
const markAsRead = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const result = await notificationService.markAsRead(notificationId, userId);

    if (!result.success) {
      throw new AppError(result.error, 404);
    }

    return ApiResponse.success(res, result.notification, 'Notification marquée comme lue');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Marquer toutes les notifications comme lues
 * @route   PUT /digitontine/notifications/mark-all-read
 * @access  Private
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const result = await notificationService.markAllAsRead(userId);

    if (!result.success) {
      throw new AppError(result.error, 500);
    }

    return ApiResponse.success(res, null, 'Toutes les notifications ont été marquées comme lues');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Accepter ou refuser participation au tirage
 * @route   POST /digitontine/notifications/:notificationId/action
 * @access  Private
 */
const takeAction = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const { action } = req.body; // 'accepted' ou 'refused'
    const userId = req.user._id;

    if (!action || !['accepted', 'refused'].includes(action)) {
      throw new AppError('Action invalide (accepted ou refused)', 400);
    }

    // Enregistrer l'action sur la notification
    const result = await notificationService.recordAction(notificationId, userId, action);

    if (!result.success) {
      throw new AppError(result.error, 400);
    }

    const notification = result.notification;

    // Mettre à jour le champ participeTirage dans la tontine
    if (notification.data?.tontineId) {
      const tontine = await Tontine.findById(notification.data.tontineId);

      if (tontine) {
        const membre = tontine.membres.find(
          m => m.userId.toString() === userId.toString()
        );

        if (membre) {
          membre.participeTirage = (action === 'accepted');
          membre.dateOptIn = Date.now();
          membre.optInAutomatique = false; // C'est un choix manuel
          await tontine.save();

          logger.info(
            ` ${req.user.email} a ${action === 'accepted' ? 'ACCEPTÉ' : 'REFUSÉ'} ` +
            `de participer au tirage de "${tontine.nom}"`
          );
        }
      }
    }

    return ApiResponse.success(
      res,
      {
        notification,
        action,
        message: action === 'accepted' 
          ? 'Vous participez au tirage' 
          : 'Vous ne participez pas au tirage',
      },
      'Action enregistrée'
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Supprimer une notification
 * @route   DELETE /digitontine/notifications/:notificationId
 * @access  Private
 */
const deleteNotification = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const result = await notificationService.deleteNotification(notificationId, userId);

    if (!result.success) {
      throw new AppError(result.error, 404);
    }

    return ApiResponse.success(res, null, 'Notification supprimée');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  takeAction,
  deleteNotification,
};