// services/push.service.js
const admin = require('firebase-admin');
const logger = require('../utils/logger');
const User = require('../models/User');

let fcmInitialized = false;

/**
 * Initialiser Firebase Admin SDK
 */
const initializeFirebase = () => {
  try {
    if (fcmInitialized) {
      return true;
    }

    if (!process.env.FIREBASE_PROJECT_ID) {
      logger.warn('Firebase non configure - Push notifications desactivees');
      return false;
    }

    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    fcmInitialized = true;
    logger.info('Firebase Admin SDK initialise');
    return true;
  } catch (error) {
    logger.error('Erreur initialisation Firebase:', error);
    return false;
  }
};

/**
 * Envoyer notification push a un utilisateur
 */
const sendPushToUser = async (userId, notification, data = {}) => {
  try {
    if (!initializeFirebase()) {
      logger.warn('Push notification ignoree - Firebase non configure');
      return { success: false, error: 'Firebase non configure' };
    }

    const user = await User.findById(userId);
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      logger.warn(`Aucun token FCM pour user ${userId}`);
      return { success: false, error: 'Aucun token FCM' };
    }

    const tokens = user.fcmTokens.map((t) => t.token);

    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        icon: notification.icon || '/logo.png',
      },
      data: {
        ...data,
        click_action: data.click_action || 'FLUTTER_NOTIFICATION_CLICK',
      },
      tokens,
    };

    const response = await admin.messaging().sendMulticast(message);

    logger.info(
      `Push envoye a ${userId}: ${response.successCount}/${tokens.length} reussi(s)`
    );

    // Supprimer tokens invalides
    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          invalidTokens.push(tokens[idx]);
        }
      });

      if (invalidTokens.length > 0) {
        user.fcmTokens = user.fcmTokens.filter(
          (t) => !invalidTokens.includes(t.token)
        );
        await user.save();
        logger.info(`${invalidTokens.length} token(s) invalide(s) supprime(s)`);
      }
    }

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    logger.error('Erreur envoi push:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Envoyer notification push a plusieurs utilisateurs
 */
const sendPushToMultipleUsers = async (userIds, notification, data = {}) => {
  try {
    if (!initializeFirebase()) {
      return { success: false, error: 'Firebase non configure' };
    }

    const results = {
      total: userIds.length,
      sent: 0,
      failed: 0,
      details: [],
    };

    for (const userId of userIds) {
      const result = await sendPushToUser(userId, notification, data);
      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
      }
      results.details.push({ userId, ...result });
    }

    logger.info(
      `Push batch: ${results.sent}/${results.total} envoye(s) avec succes`
    );
    return results;
  } catch (error) {
    logger.error('Erreur push batch:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Envoyer notification a tous les membres d'une tontine
 */
const sendPushToTontineMembers = async (tontine, notification, data = {}) => {
  try {
    const memberIds = tontine.membres.map((m) => m.userId.toString());
    return await sendPushToMultipleUsers(memberIds, notification, data);
  } catch (error) {
    logger.error('Erreur push tontine:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Notifications predefinies
 */

const notifyPaymentReceived = async (userId, transaction, tontine) => {
  return await sendPushToUser(
    userId,
    {
      title: 'Paiement recu',
      body: `Votre cotisation de ${transaction.montant} FCFA pour ${tontine.nom} a ete recue`,
    },
    {
      type: 'payment_received',
      transactionId: transaction._id.toString(),
      tontineId: tontine._id.toString(),
      click_action: '/transactions',
    }
  );
};

const notifyPaymentValidated = async (userId, transaction, tontine) => {
  return await sendPushToUser(
    userId,
    {
      title: 'Paiement valide',
      body: `Votre cotisation pour ${tontine.nom} a ete validee`,
    },
    {
      type: 'payment_validated',
      transactionId: transaction._id.toString(),
      tontineId: tontine._id.toString(),
      click_action: '/transactions',
    }
  );
};

const notifyPaymentRejected = async (userId, transaction, tontine, motif) => {
  return await sendPushToUser(
    userId,
    {
      title: 'Paiement rejete',
      body: `Votre paiement pour ${tontine.nom} a ete rejete: ${motif}`,
    },
    {
      type: 'payment_rejected',
      transactionId: transaction._id.toString(),
      tontineId: tontine._id.toString(),
      click_action: '/transactions',
    }
  );
};

const notifyPaymentReminder = async (userId, tontine, echeance, joursAvant) => {
  let message;
  if (joursAvant > 0) {
    message = `Rappel: Cotisation dans ${joursAvant} jour(s) pour ${tontine.nom}`;
  } else if (joursAvant === 0) {
    message = `Aujourd'hui: Date limite de cotisation pour ${tontine.nom}`;
  } else {
    message = `Retard de ${Math.abs(joursAvant)} jour(s) pour ${tontine.nom}`;
  }

  return await sendPushToUser(
    userId,
    {
      title: joursAvant >= 0 ? 'Rappel cotisation' : 'Retard de paiement',
      body: message,
    },
    {
      type: 'payment_reminder',
      tontineId: tontine._id.toString(),
      echeanceId: echeance._id?.toString(),
      joursAvant: joursAvant.toString(),
      click_action: '/tontines',
    }
  );
};

const notifyTirageWinner = async (userId, tirage, tontine) => {
  return await sendPushToUser(
    userId,
    {
      title: 'Felicitations !',
      body: `Vous avez gagne le tirage de ${tontine.nom} - ${tirage.montant} FCFA`,
    },
    {
      type: 'tirage_winner',
      tirageId: tirage._id.toString(),
      tontineId: tontine._id.toString(),
      montant: tirage.montant.toString(),
      click_action: '/tirages',
    }
  );
};

const notifyTirageResult = async (userId, tirage, tontine, beneficiaire) => {
  return await sendPushToUser(
    userId,
    {
      title: 'Resultat du tirage',
      body: `${beneficiaire.prenom} ${beneficiaire.nom} a gagne le tirage de ${tontine.nom}`,
    },
    {
      type: 'tirage_result',
      tirageId: tirage._id.toString(),
      tontineId: tontine._id.toString(),
      beneficiaireId: beneficiaire._id.toString(),
      click_action: '/tirages',
    }
  );
};

const notifyTontineActivated = async (userId, tontine) => {
  return await sendPushToUser(
    userId,
    {
      title: 'Tontine activee',
      body: `La tontine ${tontine.nom} est maintenant active`,
    },
    {
      type: 'tontine_activated',
      tontineId: tontine._id.toString(),
      click_action: '/tontines',
    }
  );
};

const notifyTontineBlocked = async (userId, tontine, motif) => {
  return await sendPushToUser(
    userId,
    {
      title: 'Tontine bloquee',
      body: `La tontine ${tontine.nom} a ete bloquee: ${motif}`,
    },
    {
      type: 'tontine_blocked',
      tontineId: tontine._id.toString(),
      click_action: '/tontines',
    }
  );
};

const notifyTontineUnblocked = async (userId, tontine) => {
  return await sendPushToUser(
    userId,
    {
      title: 'Tontine reactivee',
      body: `La tontine ${tontine.nom} est de nouveau active`,
    },
    {
      type: 'tontine_unblocked',
      tontineId: tontine._id.toString(),
      click_action: '/tontines',
    }
  );
};

const notifyTontineClosed = async (userId, tontine) => {
  return await sendPushToUser(
    userId,
    {
      title: 'Tontine cloturee',
      body: `La tontine ${tontine.nom} est terminee. Merci pour votre participation !`,
    },
    {
      type: 'tontine_closed',
      tontineId: tontine._id.toString(),
      click_action: '/tontines',
    }
  );
};

const notifyPenaltyApplied = async (userId, penalite, tontine) => {
  return await sendPushToUser(
    userId,
    {
      title: 'Penalite appliquee',
      body: `Penalite de ${penalite.montant} FCFA pour retard sur ${tontine.nom}`,
    },
    {
      type: 'penalty_applied',
      penaliteId: penalite._id.toString(),
      tontineId: tontine._id.toString(),
      montant: penalite.montant.toString(),
      click_action: '/transactions',
    }
  );
};

const notifyAccountCreated = async (userId) => {
  return await sendPushToUser(
    userId,
    {
      title: 'Bienvenue sur DigiTontine',
      body: 'Votre compte a ete cree avec succes',
    },
    {
      type: 'account_created',
      click_action: '/profile',
    }
  );
};

const notifyAccountDeactivated = async (userId) => {
  return await sendPushToUser(
    userId,
    {
      title: 'Compte desactive',
      body: 'Votre compte a ete desactive. Contactez l\'administrateur.',
    },
    {
      type: 'account_deactivated',
      click_action: '/profile',
    }
  );
};

module.exports = {
  initializeFirebase,
  sendPushToUser,
  sendPushToMultipleUsers,
  sendPushToTontineMembers,
  
  // Notifications predefinies
  notifyPaymentReceived,
  notifyPaymentValidated,
  notifyPaymentRejected,
  notifyPaymentReminder,
  notifyTirageWinner,
  notifyTirageResult,
  notifyTontineActivated,
  notifyTontineBlocked,
  notifyTontineUnblocked,
  notifyTontineClosed,
  notifyPenaltyApplied,
  notifyAccountCreated,
  notifyAccountDeactivated,
};