
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

/**
 * Créer une notification de tirage
 */
const sendTirageNotification = async (user, tontine, dateTirage, delaiOptIn) => {
  try {
    const notification = await Notification.createTirageNotification(
      user._id,
      tontine,
      dateTirage,
      delaiOptIn
    );

    logger.info(` Notification tirage créée pour ${user.email}`);
    return { success: true, notification };
  } catch (error) {
    logger.error(` Erreur création notification tirage pour ${user.email}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Créer notification de résultat de tirage
 */
const sendTirageResultNotification = async (user, tirage, tontine, gagnant) => {
  try {
    const notification = await Notification.createTirageResultNotification(
      user._id,
      tirage,
      tontine,
      gagnant
    );

    logger.info(` Notification résultat tirage créée pour ${user.email}`);
    return { success: true, notification };
  } catch (error) {
    logger.error(` Erreur notification résultat pour ${user.email}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Créer notification de gain
 */
const sendTirageWinnerNotification = async (user, tirage, tontine) => {
  try {
    const notification = await Notification.createTirageWinnerNotification(
      user._id,
      tirage,
      tontine
    );

    logger.info(` Notification gagnant créée pour ${user.email}`);
    return { success: true, notification };
  } catch (error) {
    logger.error(` Erreur notification gagnant pour ${user.email}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Récupérer les notifications d'un utilisateur
 */
const getUserNotifications = async (userId, options = {}) => {
  try {
    const result = await Notification.getUserNotifications(userId, options);
    return { success: true, data: result };
  } catch (error) {
    logger.error(` Erreur récupération notifications pour ${userId}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Marquer une notification comme lue
 */
const markAsRead = async (notificationId, userId) => {
  try {
    const notification = await Notification.findOne({
      _id: notificationId,
      userId,
    });

    if (!notification) {
      return { success: false, error: 'Notification introuvable' };
    }

    notification.markAsRead();
    await notification.save();

    return { success: true, notification };
  } catch (error) {
    logger.error(` Erreur marquage notification lue:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Marquer toutes les notifications comme lues
 */
const markAllAsRead = async (userId) => {
  try {
    await Notification.markAllAsRead(userId);
    return { success: true };
  } catch (error) {
    logger.error(` Erreur marquage toutes notifications lues:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Enregistrer une action sur notification (accepter/refuser tirage)
 */
const recordAction = async (notificationId, userId, action) => {
  try {
    const notification = await Notification.findOne({
      _id: notificationId,
      userId,
    });

    if (!notification) {
      return { success: false, error: 'Notification introuvable' };
    }

    if (!notification.requiresAction) {
      return { success: false, error: 'Cette notification ne nécessite pas d\'action' };
    }

    if (notification.isExpired()) {
      notification.actionTaken = 'expired';
      await notification.save();
      return { success: false, error: 'Notification expirée' };
    }

    if (notification.actionTaken) {
      return { success: false, error: 'Action déjà enregistrée' };
    }

    notification.recordAction(action);
    await notification.save();

    return { success: true, notification };
  } catch (error) {
    logger.error(`Erreur enregistrement action:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Obtenir le nombre de notifications non lues
 */
const getUnreadCount = async (userId) => {
  try {
    const count = await Notification.getUnreadCount(userId);
    return { success: true, count };
  } catch (error) {
    logger.error(` Erreur comptage notifications non lues:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Supprimer une notification
 */
const deleteNotification = async (notificationId, userId) => {
  try {
    const result = await Notification.deleteOne({
      _id: notificationId,
      userId,
    });

    if (result.deletedCount === 0) {
      return { success: false, error: 'Notification introuvable' };
    }

    return { success: true };
  } catch (error) {
    logger.error(` Erreur suppression notification:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Nettoyer les notifications expirées (à exécuter périodiquement)
 */
const cleanupExpired = async () => {
  try {
    const result = await Notification.deleteExpired();
    logger.info(` Nettoyage : ${result.deletedCount} notifications expirées supprimées`);
    return { success: true, deletedCount: result.deletedCount };
  } catch (error) {
    logger.error(` Erreur nettoyage notifications:`, error);
    return { success: false, error: error.message };
  }
};
/**
 * Créer notification d'invitation tontine
 */
const sendInvitationTontine = async (user, tontine) => {
  try {
    const notification = await Notification.createInvitationTontine(
      user._id,
      tontine
    );

    logger.info(`Invitation tontine envoyée à ${user.email} pour "${tontine.nom}"`);
    return { success: true, notification };
  } catch (error) {
    logger.error(` Erreur invitation tontine pour ${user.email}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Accepter invitation tontine
 */
const acceptInvitationTontine = async (notificationId, userId) => {
  try {
    const notification = await Notification.findOne({
      _id: notificationId,
      userId,
      type: 'TONTINE_INVITATION',
    });

    if (!notification) {
      return { success: false, error: 'Invitation introuvable' };
    }

    if (notification.actionTaken) {
      return { success: false, error: 'Invitation déjà traitée' };
    }

    notification.recordAction('accepted');
    await notification.save();

    logger.info(` ${userId} a accepté l'invitation tontine ${notification.data.tontineId}`);
    return { success: true, notification };
  } catch (error) {
    logger.error(` Erreur acceptation invitation:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Refuser invitation tontine
 */
const refuseInvitationTontine = async (notificationId, userId) => {
  try {
    const notification = await Notification.findOne({
      _id: notificationId,
      userId,
      type: 'TONTINE_INVITATION',
    });

    if (!notification) {
      return { success: false, error: 'Invitation introuvable' };
    }

    if (notification.actionTaken) {
      return { success: false, error: 'Invitation déjà traitée' };
    }

    notification.recordAction('refused');
    await notification.save();

    logger.info(` ${userId} a refusé l'invitation tontine ${notification.data.tontineId}`);
    return { success: true, notification };
  } catch (error) {
    logger.error(` Erreur refus invitation:`, error);
    return { success: false, error: error.message };
  }
};
/**
 * Créer notification de demande de validation
 */
const sendValidationRequestNotification = async (tresorier, admin, validationRequest, actionType, resourceName) => {
  try {
    const notification = await Notification.createValidationRequestNotification(
      tresorier,
      admin,
      validationRequest,
      actionType,
      resourceName
    );

    logger.info(` Notification validation envoyée à ${tresorier.email}`);
    return { success: true, notification };
  } catch (error) {
    logger.error(` Erreur notification validation pour ${tresorier.email}:`, error);
    return { success: false, error: error.message };
  }
};
module.exports = {
  sendTirageNotification,
  sendTirageResultNotification,
  sendTirageWinnerNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  recordAction,
  getUnreadCount,
  deleteNotification,
  cleanupExpired,
   sendInvitationTontine,     
  acceptInvitationTontine,      
  refuseInvitationTontine,
  sendValidationRequestNotification,
};