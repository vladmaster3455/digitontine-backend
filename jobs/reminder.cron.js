// jobs/reminder.cron.js
const cron = require('node-cron');
const Tontine = require('../models/Tontine');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const emailService = require('../services/email.service');
const pushService = require('../services/push.service');
const whatsappService = require('../services/whatsapp.service');
const logger = require('../utils/logger');
const { REMINDERS } = require('../config/constants');

/**
 * Envoyer rappels J-3 (3 jours avant echeance)
 * US 4.2
 */
const sendJMinus3Reminders = async () => {
  try {
    logger.info('CRON: Debut envoi rappels J-3');

    const dateLimite = new Date();
    dateLimite.setDate(dateLimite.getDate() + 3);
    dateLimite.setHours(0, 0, 0, 0);

    const dateLimiteEnd = new Date(dateLimite);
    dateLimiteEnd.setHours(23, 59, 59, 999);

    const transactionsEnAttente = await Transaction.find({
      statut: 'En attente',
      dateEcheance: {
        $gte: dateLimite,
        $lte: dateLimiteEnd,
      },
    })
      .populate('userId', 'prenom nom email numeroTelephone preferences')
      .populate('tontineId', 'nom montantCotisation');

    let emailsSent = 0;
    let pushSent = 0;
    let whatsappSent = 0;

    for (const transaction of transactionsEnAttente) {
      const user = transaction.userId;
      const tontine = transaction.tontineId;

      if (!user || !tontine) continue;

      const echeance = {
        dateEcheance: transaction.dateEcheance,
        montant: transaction.montant,
      };

      try {
        if (user.preferences?.notifications?.email !== false) {
          await emailService.sendPaymentReminder(user, tontine, echeance, 3);
          emailsSent++;
        }
      } catch (error) {
        logger.error(`Erreur email J-3 pour ${user.email}:`, error);
      }

      try {
        if (user.preferences?.notifications?.push !== false) {
          await pushService.notifyPaymentReminder(user._id, tontine, echeance, 3);
          pushSent++;
        }
      } catch (error) {
        logger.error(`Erreur push J-3 pour ${user._id}:`, error);
      }

      try {
        if (user.preferences?.notifications?.whatsapp !== false) {
          await whatsappService.sendPaymentReminderWhatsApp(user, tontine, echeance, 3);
          whatsappSent++;
        }
      } catch (error) {
        logger.error(`Erreur WhatsApp J-3 pour ${user.numeroTelephone}:`, error);
      }
    }

    logger.info(
      `CRON J-3: ${transactionsEnAttente.length} rappels - Emails: ${emailsSent}, Push: ${pushSent}, WhatsApp: ${whatsappSent}`
    );

    return {
      total: transactionsEnAttente.length,
      emailsSent,
      pushSent,
      whatsappSent,
    };
  } catch (error) {
    logger.error('Erreur CRON J-3:', error);
    throw error;
  }
};

/**
 * Envoyer rappels J (jour de l'echeance)
 * US 4.2
 */
const sendJDayReminders = async () => {
  try {
    logger.info('CRON: Debut envoi rappels J (jour J)');

    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);

    const aujourdhuiEnd = new Date(aujourdhui);
    aujourdhuiEnd.setHours(23, 59, 59, 999);

    const transactionsEnAttente = await Transaction.find({
      statut: 'En attente',
      dateEcheance: {
        $gte: aujourdhui,
        $lte: aujourdhuiEnd,
      },
    })
      .populate('userId', 'prenom nom email numeroTelephone preferences')
      .populate('tontineId', 'nom montantCotisation');

    let emailsSent = 0;
    let pushSent = 0;
    let whatsappSent = 0;

    for (const transaction of transactionsEnAttente) {
      const user = transaction.userId;
      const tontine = transaction.tontineId;

      if (!user || !tontine) continue;

      const echeance = {
        dateEcheance: transaction.dateEcheance,
        montant: transaction.montant,
      };

      try {
        if (user.preferences?.notifications?.email !== false) {
          await emailService.sendPaymentReminder(user, tontine, echeance, 0);
          emailsSent++;
        }
      } catch (error) {
        logger.error(`Erreur email J pour ${user.email}:`, error);
      }

      try {
        if (user.preferences?.notifications?.push !== false) {
          await pushService.notifyPaymentReminder(user._id, tontine, echeance, 0);
          pushSent++;
        }
      } catch (error) {
        logger.error(`Erreur push J pour ${user._id}:`, error);
      }

      try {
        if (user.preferences?.notifications?.whatsapp !== false) {
          await whatsappService.sendPaymentReminderWhatsApp(user, tontine, echeance, 0);
          whatsappSent++;
        }
      } catch (error) {
        logger.error(`Erreur WhatsApp J pour ${user.numeroTelephone}:`, error);
      }
    }

    logger.info(
      `CRON J: ${transactionsEnAttente.length} rappels - Emails: ${emailsSent}, Push: ${pushSent}, WhatsApp: ${whatsappSent}`
    );

    return {
      total: transactionsEnAttente.length,
      emailsSent,
      pushSent,
      whatsappSent,
    };
  } catch (error) {
    logger.error('Erreur CRON J:', error);
    throw error;
  }
};

/**
 * Envoyer relances J+2 (retard de 2 jours)
 * US 4.2
 */
const sendJPlus2Reminders = async () => {
  try {
    logger.info('CRON: Debut envoi relances J+2 (retard)');

    const dateRetard = new Date();
    dateRetard.setDate(dateRetard.getDate() - 2);
    dateRetard.setHours(0, 0, 0, 0);

    const dateRetardEnd = new Date(dateRetard);
    dateRetardEnd.setHours(23, 59, 59, 999);

    const transactionsEnRetard = await Transaction.find({
      statut: 'En attente',
      dateEcheance: {
        $gte: dateRetard,
        $lte: dateRetardEnd,
      },
    })
      .populate('userId', 'prenom nom email numeroTelephone preferences')
      .populate('tontineId', 'nom montantCotisation tauxPenalite');

    let emailsSent = 0;
    let pushSent = 0;
    let whatsappSent = 0;

    for (const transaction of transactionsEnRetard) {
      const user = transaction.userId;
      const tontine = transaction.tontineId;

      if (!user || !tontine) continue;

      const echeance = {
        dateEcheance: transaction.dateEcheance,
        montant: transaction.montant,
      };

      try {
        if (user.preferences?.notifications?.email !== false) {
          await emailService.sendPaymentReminder(user, tontine, echeance, -2);
          emailsSent++;
        }
      } catch (error) {
        logger.error(`Erreur email J+2 pour ${user.email}:`, error);
      }

      try {
        if (user.preferences?.notifications?.push !== false) {
          await pushService.notifyPaymentReminder(user._id, tontine, echeance, -2);
          pushSent++;
        }
      } catch (error) {
        logger.error(`Erreur push J+2 pour ${user._id}:`, error);
      }

      try {
        if (user.preferences?.notifications?.whatsapp !== false) {
          await whatsappService.sendPaymentReminderWhatsApp(user, tontine, echeance, -2);
          whatsappSent++;
        }
      } catch (error) {
        logger.error(`Erreur WhatsApp J+2 pour ${user.numeroTelephone}:`, error);
      }
    }

    logger.info(
      `CRON J+2: ${transactionsEnRetard.length} relances - Emails: ${emailsSent}, Push: ${pushSent}, WhatsApp: ${whatsappSent}`
    );

    return {
      total: transactionsEnRetard.length,
      emailsSent,
      pushSent,
      whatsappSent,
    };
  } catch (error) {
    logger.error('Erreur CRON J+2:', error);
    throw error;
  }
};

/**
 * Initialiser les taches CRON
 */
const initializeReminderJobs = () => {
  const cronHour = REMINDERS.HOUR || '09:00';
  const [hour, minute] = cronHour.split(':');

  if (REMINDERS.J_MINUS_3) {
    cron.schedule(`${minute} ${hour} * * *`, async () => {
      logger.info('Execution CRON: Rappels J-3');
      try {
        await sendJMinus3Reminders();
      } catch (error) {
        logger.error('Erreur execution CRON J-3:', error);
      }
    });
    logger.info(`CRON J-3 planifie: tous les jours a ${cronHour}`);
  }

  if (REMINDERS.J) {
    cron.schedule(`${minute} ${hour} * * *`, async () => {
      logger.info('Execution CRON: Rappels J');
      try {
        await sendJDayReminders();
      } catch (error) {
        logger.error('Erreur execution CRON J:', error);
      }
    });
    logger.info(`CRON J planifie: tous les jours a ${cronHour}`);
  }

  if (REMINDERS.J_PLUS_2) {
    cron.schedule(`${minute} ${hour} * * *`, async () => {
      logger.info('Execution CRON: Relances J+2');
      try {
        await sendJPlus2Reminders();
      } catch (error) {
        logger.error('Erreur execution CRON J+2:', error);
      }
    });
    logger.info(`CRON J+2 planifie: tous les jours a ${cronHour}`);
  }

  logger.info('Tous les CRON de rappels sont initialises');
};

module.exports = {
  initializeReminderJobs,
  sendJMinus3Reminders,
  sendJDayReminders,
  sendJPlus2Reminders,
};