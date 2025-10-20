// services/whatsapp.service.js
const twilio = require('twilio');
const logger = require('../utils/logger');
const { formatCurrency, formatDate } = require('../utils/helpers');

let twilioClient = null;
let isConfigured = false;

/**
 * Initialiser Twilio
 */
const initializeTwilio = () => {
  try {
    if (isConfigured) {
      return true;
    }

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      logger.warn('Twilio non configure - Messages WhatsApp desactives');
      return false;
    }

    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    isConfigured = true;
    logger.info('Twilio initialise pour WhatsApp');
    return true;
  } catch (error) {
    logger.error('Erreur initialisation Twilio:', error);
    return false;
  }
};

/**
 * Formater numero telephone pour WhatsApp
 */
const formatPhoneNumber = (phoneNumber) => {
  let formatted = phoneNumber.replace(/\s/g, '');
  
  if (!formatted.startsWith('+')) {
    if (formatted.startsWith('221')) {
      formatted = '+' + formatted;
    } else if (formatted.startsWith('77') || formatted.startsWith('78') || formatted.startsWith('70')) {
      formatted = '+221' + formatted;
    } else {
      formatted = '+' + formatted;
    }
  }
  
  return `whatsapp:${formatted}`;
};

/**
 * Envoyer message WhatsApp
 */
const sendWhatsAppMessage = async (phoneNumber, message) => {
  try {
    if (!initializeTwilio()) {
      logger.warn('Message WhatsApp ignore - Twilio non configure');
      return { success: false, error: 'Twilio non configure' };
    }

    const to = formatPhoneNumber(phoneNumber);
    const from = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

    const response = await twilioClient.messages.create({
      body: message,
      from,
      to,
    });

    logger.info(`WhatsApp envoye a ${phoneNumber} - SID: ${response.sid}`);

    return {
      success: true,
      messageSid: response.sid,
      status: response.status,
    };
  } catch (error) {
    logger.error('Erreur envoi WhatsApp:', error);
    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }
};

/**
 * Messages predéfinis
 */

const sendPaymentReminderWhatsApp = async (user, tontine, echeance, joursAvant) => {
  let message;
  
  if (joursAvant > 0) {
    message = `Bonjour ${user.prenom},\n\nRappel: Votre cotisation pour la tontine "${tontine.nom}" est due dans ${joursAvant} jour(s).\n\nMontant: ${formatCurrency(tontine.montantCotisation)}\nDate limite: ${formatDate(echeance.dateEcheance)}\n\nMerci de proceder au paiement.\n\n- DigiTontine`;
  } else if (joursAvant === 0) {
    message = `Bonjour ${user.prenom},\n\nAUJOURD'HUI: Date limite de cotisation pour "${tontine.nom}".\n\nMontant: ${formatCurrency(tontine.montantCotisation)}\n\nMerci de payer avant minuit pour eviter les penalites.\n\n- DigiTontine`;
  } else {
    message = `Bonjour ${user.prenom},\n\nVotre cotisation pour "${tontine.nom}" est en RETARD de ${Math.abs(joursAvant)} jour(s).\n\nMontant: ${formatCurrency(tontine.montantCotisation)}\nPenalites appliquees: Oui\n\nMerci de regulariser rapidement.\n\n- DigiTontine`;
  }

  return await sendWhatsAppMessage(user.numeroTelephone, message);
};

const sendPaymentValidatedWhatsApp = async (user, transaction, tontine) => {
  const message = `Bonjour ${user.prenom},\n\nVotre paiement a ete VALIDE.\n\nTontine: ${tontine.nom}\nMontant: ${formatCurrency(transaction.montant)}\nReference: ${transaction.referenceTransaction}\n\nMerci pour votre ponctualite !\n\n- DigiTontine`;

  return await sendWhatsAppMessage(user.numeroTelephone, message);
};

const sendPaymentRejectedWhatsApp = async (user, transaction, tontine, motif) => {
  const message = `Bonjour ${user.prenom},\n\nVotre paiement a ete REJETE.\n\nTontine: ${tontine.nom}\nReference: ${transaction.referenceTransaction}\nMotif: ${motif}\n\nVeuillez effectuer un nouveau paiement.\n\n- DigiTontine`;

  return await sendWhatsAppMessage(user.numeroTelephone, message);
};

const sendTirageWinnerWhatsApp = async (user, tirage, tontine) => {
  const message = `FELICITATIONS ${user.prenom} !\n\nVous avez GAGNE le tirage de la tontine "${tontine.nom}".\n\nMontant a recevoir: ${formatCurrency(tirage.montant)}\nDate: ${formatDate(tirage.dateTirage)}\n\nLe montant sera verse sous 48h.\n\n- DigiTontine`;

  return await sendWhatsAppMessage(user.numeroTelephone, message);
};

const sendTirageResultWhatsApp = async (user, tirage, tontine, beneficiaire) => {
  const message = `Bonjour ${user.prenom},\n\nResultat du tirage "${tontine.nom}":\n\nBeneficiaire: ${beneficiaire.prenom} ${beneficiaire.nom}\nMontant: ${formatCurrency(tirage.montant)}\nDate: ${formatDate(tirage.dateTirage)}\n\n- DigiTontine`;

  return await sendWhatsAppMessage(user.numeroTelephone, message);
};

const sendTontineActivatedWhatsApp = async (user, tontine) => {
  const message = `Bonjour ${user.prenom},\n\nLa tontine "${tontine.nom}" est maintenant ACTIVE.\n\nMontant cotisation: ${formatCurrency(tontine.montantCotisation)}\nFrequence: ${tontine.frequence}\nPremiere echeance: ${formatDate(tontine.calendrierCotisations?.[0]?.dateEcheance)}\n\nBonne participation !\n\n- DigiTontine`;

  return await sendWhatsAppMessage(user.numeroTelephone, message);
};

const sendTontineBlockedWhatsApp = async (user, tontine, motif) => {
  const message = `Bonjour ${user.prenom},\n\nLa tontine "${tontine.nom}" a ete BLOQUEE.\n\nMotif: ${motif}\n\nLes cotisations et tirages sont suspendus jusqu'a nouvel ordre.\n\n- DigiTontine`;

  return await sendWhatsAppMessage(user.numeroTelephone, message);
};

const sendTontineUnblockedWhatsApp = async (user, tontine) => {
  const message = `Bonjour ${user.prenom},\n\nLa tontine "${tontine.nom}" a ete REACTIVEE.\n\nLes activites reprennent normalement.\n\n- DigiTontine`;

  return await sendWhatsAppMessage(user.numeroTelephone, message);
};

const sendTontineClosedWhatsApp = async (user, tontine) => {
  const message = `Bonjour ${user.prenom},\n\nLa tontine "${tontine.nom}" est maintenant CLOTUREE.\n\nTous les membres ont beneficie du tirage.\nMerci pour votre participation !\n\nConsultez votre rapport final dans l'application.\n\n- DigiTontine`;

  return await sendWhatsAppMessage(user.numeroTelephone, message);
};

const sendPenaltyAppliedWhatsApp = async (user, penalite, tontine) => {
  const message = `Bonjour ${user.prenom},\n\nPENALITE APPLIQUEE pour retard de paiement.\n\nTontine: ${tontine.nom}\nMontant penalite: ${formatCurrency(penalite.montant)}\nRetard: ${penalite.joursRetard} jours\n\nMerci de regulariser votre situation.\n\n- DigiTontine`;

  return await sendWhatsAppMessage(user.numeroTelephone, message);
};

const sendWelcomeWhatsApp = async (user, temporaryPassword) => {
  const message = `Bienvenue sur DigiTontine ${user.prenom} !\n\nVotre compte a ete cree avec succes.\n\nEmail: ${user.email}\nMot de passe temporaire: ${temporaryPassword}\n\nVous devrez le changer a votre premiere connexion.\n\nConnectez-vous sur: ${process.env.FRONTEND_URL}\n\n- DigiTontine`;

  return await sendWhatsAppMessage(user.numeroTelephone, message);
};

const sendPasswordResetCodeWhatsApp = async (user, resetCode) => {
  const message = `Bonjour ${user.prenom},\n\nVotre code de reinitialisation de mot de passe:\n\n${resetCode}\n\nValide pendant 15 minutes.\n\nSi vous n'etes pas a l'origine de cette demande, ignorez ce message.\n\n- DigiTontine`;

  return await sendWhatsAppMessage(user.numeroTelephone, message);
};

const sendAccountDeactivatedWhatsApp = async (user) => {
  const message = `Bonjour ${user.prenom},\n\nVotre compte DigiTontine a ete DESACTIVE.\n\nPour le reactiver, contactez l'administrateur.\n\n- DigiTontine`;

  return await sendWhatsAppMessage(user.numeroTelephone, message);
};

/**
 * Envoyer message batch
 */
const sendBatchWhatsApp = async (users, messageTemplate) => {
  try {
    if (!initializeTwilio()) {
      return { success: false, error: 'Twilio non configure' };
    }

    const results = {
      total: users.length,
      sent: 0,
      failed: 0,
      details: [],
    };

    for (const user of users) {
      try {
        const message = typeof messageTemplate === 'function'
          ? messageTemplate(user)
          : messageTemplate;
        
        const result = await sendWhatsAppMessage(user.numeroTelephone, message);
        
        if (result.success) {
          results.sent++;
        } else {
          results.failed++;
        }
        
        results.details.push({
          userId: user._id,
          phone: user.numeroTelephone,
          ...result,
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        results.failed++;
        results.details.push({
          userId: user._id,
          phone: user.numeroTelephone,
          success: false,
          error: error.message,
        });
      }
    }

    logger.info(
      `WhatsApp batch: ${results.sent}/${results.total} envoye(s) avec succes`
    );
    return results;
  } catch (error) {
    logger.error('Erreur batch WhatsApp:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Verifier configuration
 */
const isWhatsAppConfigured = () => {
  return initializeTwilio();
};

module.exports = {
  initializeTwilio,
  sendWhatsAppMessage,
  sendBatchWhatsApp,
  isWhatsAppConfigured,
  
  // Messages predéfinis
  sendPaymentReminderWhatsApp,
  sendPaymentValidatedWhatsApp,
  sendPaymentRejectedWhatsApp,
  sendTirageWinnerWhatsApp,
  sendTirageResultWhatsApp,
  sendTontineActivatedWhatsApp,
  sendTontineBlockedWhatsApp,
  sendTontineUnblockedWhatsApp,
  sendTontineClosedWhatsApp,
  sendPenaltyAppliedWhatsApp,
  sendWelcomeWhatsApp,
  sendPasswordResetCodeWhatsApp,
  sendAccountDeactivatedWhatsApp,
};