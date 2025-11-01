// controllers/notification.controller.js
const notificationService = require('../services/notification.service'); //  DÉPLACÉ ICI
const Tontine = require('../models/Tontine');
const Notification = require('../models/Notification'); //  AJOUTÉ
const User = require('../models/User'); //  AJOUTÉ
const ValidationRequest = require('../models/ValidationRequest'); //  AJOUTÉ
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
    const { action } = req.body;
    const userId = req.user._id;

    if (!action || !['accepted', 'refused'].includes(action)) {
      throw new AppError('Action invalide (accepted ou refused)', 400);
    }

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
          membre.optInAutomatique = false;
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

/**
 * @desc    Accepter invitation tontine
 * @route   POST /digitontine/notifications/:notificationId/accepter-invitation
 * @access  Private
 */
const accepterInvitationTontine = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    //  Valider notification
    const result = await notificationService.acceptInvitationTontine(notificationId, userId);

    if (!result.success) {
      throw new AppError(result.error, 400);
    }

    const notification = result.notification;

    //  Ajouter membre à la tontine
    if (notification.data?.tontineId) {
      const tontine = await Tontine.findById(notification.data.tontineId);

      if (!tontine) {
        throw new AppError('Tontine introuvable', 404);
      }

      //  Vérifier si déjà membre
      const dejaMembre = tontine.membres.some(
        m => m.userId.toString() === userId.toString()
      );

      if (dejaMembre) {
        throw new AppError('Vous êtes déjà membre de cette tontine', 400);
      }

      //  Ajouter membre
      try {
        tontine.ajouterMembre(userId);
        await tontine.save();

        logger.info(` ${req.user.email} a rejoint "${tontine.nom}"`);

        //  Notifier le trésorier ET l'admin
        const notificationsToSend = [];

        if (tontine.tresorierAssigne) {
          notificationsToSend.push({
            userId: tontine.tresorierAssigne,
            type: 'SYSTEM',
            titre: ` ${req.user.nomComplet} a rejoint "${tontine.nom}"`,
            message: `Un nouveau membre a accepté l'invitation et rejoint la tontine.`,
            data: { tontineId: tontine._id },
            requiresAction: false,
          });
        }

        if (tontine.createdBy && tontine.createdBy.toString() !== tontine.tresorierAssigne?.toString()) {
          notificationsToSend.push({
            userId: tontine.createdBy,
            type: 'SYSTEM',
            titre: ` ${req.user.nomComplet} a rejoint "${tontine.nom}"`,
            message: `Un nouveau membre a accepté l'invitation et rejoint la tontine.`,
            data: { tontineId: tontine._id },
            requiresAction: false,
          });
        }

        await Notification.insertMany(notificationsToSend);

      } catch (error) {
        logger.error(' Erreur ajout membre après acceptation:', error);
        throw new AppError(error.message || 'Erreur lors de l\'ajout à la tontine', 500);
      }
    }

    return ApiResponse.success(res, {
      message: 'Vous avez rejoint la tontine avec succès',
      notification,
      tontineId: notification.data?.tontineId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Refuser invitation tontine
 * @route   POST /digitontine/notifications/:notificationId/refuser-invitation
 * @access  Private
 */
const refuserInvitationTontine = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const result = await notificationService.refuseInvitationTontine(notificationId, userId);

    if (!result.success) {
      throw new AppError(result.error, 400);
    }

    const notification = result.notification;

    //  Notifier le trésorier ET l'admin du refus
    if (notification.data?.tontineId) {
      const tontine = await Tontine.findById(notification.data.tontineId);

      if (tontine) {
        const notificationsToSend = [];

        if (tontine.tresorierAssigne) {
          notificationsToSend.push({
            userId: tontine.tresorierAssigne,
            type: 'SYSTEM',
            titre: ` ${req.user.nomComplet} a refusé l'invitation`,
            message: `L'invitation pour "${tontine.nom}" a été déclinée.`,
            data: { tontineId: tontine._id },
            requiresAction: false,
          });
        }

        if (tontine.createdBy && tontine.createdBy.toString() !== tontine.tresorierAssigne?.toString()) {
          notificationsToSend.push({
            userId: tontine.createdBy,
            type: 'SYSTEM',
            titre: ` ${req.user.nomComplet} a refusé l'invitation`,
            message: `L'invitation pour "${tontine.nom}" a été déclinée.`,
            data: { tontineId: tontine._id },
            requiresAction: false,
          });
        }

        await Notification.insertMany(notificationsToSend);
      }
    }

    logger.info(` ${req.user.email} a refusé l'invitation`);

    return ApiResponse.success(res, {
      message: 'Invitation refusée',
      notification,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Accepter demande de validation
 * @route   POST /digitontine/notifications/:notificationId/accepter-validation
 * @access  Trésorier
 */
const accepterDemandeValidation = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOne({
      _id: notificationId,
      userId,
      type: 'VALIDATION_REQUEST',
    });

    if (!notification) {
      throw new AppError('Notification de validation introuvable', 404);
    }

    if (notification.actionTaken) {
      throw new AppError('Action déjà traitée', 400);
    }

    notification.recordAction('accepted');
    await notification.save();

    const validationRequest = await ValidationRequest.findById(
      notification.data.validationRequestId
    );

    if (!validationRequest) {
      throw new AppError('Demande de validation introuvable', 404);
    }

    validationRequest.accept();
    await validationRequest.save();

    const admin = await User.findById(validationRequest.initiatedBy);
    
    await Notification.create({
      userId: admin._id,
      type: 'SYSTEM',
      titre: ` Demande acceptée par ${req.user.nomComplet}`,
      message: `Votre demande "${validationRequest.actionType}" a été acceptée. Vous pouvez maintenant exécuter l'action.`,
      data: { validationRequestId: validationRequest._id },
      requiresAction: false,
    });

    logger.info(` ${req.user.email} a accepté la demande ${validationRequest._id}`);

    return ApiResponse.success(res, {
      message: 'Demande de validation acceptée',
      validationRequest,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Refuser demande de validation
 * @route   POST /digitontine/notifications/:notificationId/refuser-validation
 * @access  Trésorier
 */
const refuserDemandeValidation = async (req, res, next) => {
  try {
    const { notificationId } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    if (!reason || reason.length < 10) {
      throw new AppError('Raison du refus requise (min 10 caractères)', 400);
    }

    const notification = await Notification.findOne({
      _id: notificationId,
      userId,
      type: 'VALIDATION_REQUEST',
    });

    if (!notification) {
      throw new AppError('Notification de validation introuvable', 404);
    }

    if (notification.actionTaken) {
      throw new AppError('Action déjà traitée', 400);
    }

    notification.recordAction('refused');
    await notification.save();

    const validationRequest = await ValidationRequest.findById(
      notification.data.validationRequestId
    );

    if (!validationRequest) {
      throw new AppError('Demande de validation introuvable', 404);
    }

    validationRequest.reject(reason);
    await validationRequest.save();

    const admin = await User.findById(validationRequest.initiatedBy);
    
    await Notification.create({
      userId: admin._id,
      type: 'SYSTEM',
      titre: ` Demande refusée par ${req.user.nomComplet}`,
      message: `Votre demande "${validationRequest.actionType}" a été refusée. Raison : ${reason}`,
      data: { validationRequestId: validationRequest._id },
      requiresAction: false,
    });

    logger.info(` ${req.user.email} a refusé la demande ${validationRequest._id}`);

    return ApiResponse.success(res, {
      message: 'Demande de validation refusée',
      validationRequest,
    });
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
  accepterInvitationTontine,
  refuserInvitationTontine,
  accepterDemandeValidation,
  refuserDemandeValidation,
};