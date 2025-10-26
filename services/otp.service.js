// services/otp.service.js - VERSION MAILJET
const Mailjet = require('node-mailjet');
const logger = require('../utils/logger');

let mailjetClient = null;

const initializeMailjet = () => {
  if (mailjetClient) return mailjetClient;

  if (!process.env.MAILJET_API_KEY || !process.env.MAILJET_SECRET_KEY) {
    logger.error('Configuration Mailjet manquante');
    return null;
  }

  mailjetClient = Mailjet.apiConnect(
    process.env.MAILJET_API_KEY,
    process.env.MAILJET_SECRET_KEY
  );

  return mailjetClient;
};

const sendEmail = async (to, subject, htmlContent) => {
  try {
    const client = initializeMailjet();
    
    if (!client) {
      logger.warn('Mailjet non configure');
      return { success: false, error: 'Service email non configure' };
    }

    const request = client.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: {
            Email: process.env.MAILJET_FROM_EMAIL,
            Name: process.env.MAILJET_FROM_NAME || 'DigiTontine'
          },
          To: [
            {
              Email: to,
              Name: to
            }
          ],
          Subject: subject,
          HTMLPart: htmlContent,
          TextPart: subject
        }
      ]
    });

    const result = await request;
    
    if (result.body.Messages[0].Status === 'success') {
      logger.info(`Email OTP envoye avec succes a ${to}`);
      return { success: true };
    } else {
      logger.error('Erreur envoi email OTP:', result.body);
      return { success: false, error: 'Echec envoi' };
    }
  } catch (error) {
    logger.error('Erreur Mailjet OTP:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Envoyer l'OTP a l'Admin
 */
const sendAdminOTP = async (admin, code, actionType, resourceName) => {
  try {
    const actionLabels = {
      DELETE_USER: 'Suppression d\'utilisateur',
      DELETE_TONTINE: 'Suppression de tontine',
      BLOCK_TONTINE: 'Blocage de tontine',
      UNBLOCK_TONTINE: 'Deblocage de tontine',
      ACTIVATE_USER: 'Activation d\'utilisateur',
      DEACTIVATE_USER: 'Desactivation d\'utilisateur',
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
          .code { font-size: 32px; font-weight: bold; color: #2196F3; text-align: center; padding: 20px; background: white; border: 2px dashed #2196F3; border-radius: 5px; margin: 20px 0; letter-spacing: 5px; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .info { background: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Votre Code de Validation</h1>
          </div>
          <div class="content">
            <p>Bonjour <strong>${admin.prenom} ${admin.nom}</strong>,</p>
            
            <p>Vous avez initie une demande de <strong>${actionLabels[actionType]}</strong> pour :</p>
            <p><strong>${resourceName}</strong></p>
            
            <p>Voici VOTRE code de validation :</p>
            
            <div class="code">${code}</div>
            
            <div class="info">
              <strong>Etapes suivantes :</strong>
              <ol>
                <li>Conservez ce code</li>
                <li>Contactez le Tresorier pour obtenir SON code</li>
                <li>Soumettez les DEUX codes pour valider l'action</li>
              </ol>
            </div>
            
            <div class="warning">
              <strong>Important :</strong>
              <ul>
                <li>Ce code est valide pendant <strong>15 minutes</strong></li>
                <li>Vous avez <strong>3 tentatives</strong> maximum</li>
                <li>Les DEUX codes (Admin + Tresorier) sont necessaires</li>
              </ul>
            </div>
            
            <p>Si vous n'etes pas a l'origine de cette demande, ignorez cet email et modifiez immediatement votre mot de passe.</p>
            
            <div class="footer">
              <p>DigiTontine - Gestion de Tontines Digitales</p>
              <p>Cet email a ete envoye automatiquement, merci de ne pas y repondre.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail(
      admin.email,
      `Votre code de validation - ${actionLabels[actionType]}`,
      htmlContent
    );

    logger.info(`OTP Admin envoye a ${admin.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi OTP Admin:', error);
    throw error;
  }
};

/**
 * Envoyer l'OTP au Tresorier
 */
const sendTresorierOTP = async (tresorier, code, actionType, resourceName) => {
  try {
    const actionLabels = {
      DELETE_USER: 'Suppression d\'utilisateur',
      DELETE_TONTINE: 'Suppression de tontine',
      BLOCK_TONTINE: 'Blocage de tontine',
      UNBLOCK_TONTINE: 'Deblocage de tontine',
      ACTIVATE_USER: 'Activation d\'utilisateur',
      DEACTIVATE_USER: 'Desactivation d\'utilisateur',
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
          .code { font-size: 32px; font-weight: bold; color: #4CAF50; text-align: center; padding: 20px; background: white; border: 2px dashed #4CAF50; border-radius: 5px; margin: 20px 0; letter-spacing: 5px; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .info { background: #e8f5e9; border-left: 4px solid #4CAF50; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Code de Validation Tresorier</h1>
          </div>
          <div class="content">
            <p>Bonjour <strong>${tresorier.prenom} ${tresorier.nom}</strong>,</p>
            
            <p>Un Administrateur a initie une demande de <strong>${actionLabels[actionType]}</strong> pour :</p>
            <p><strong>${resourceName}</strong></p>
            
            <p>Votre validation est requise. Voici VOTRE code :</p>
            
            <div class="code">${code}</div>
            
            <div class="info">
              <strong>Que faire ?</strong>
              <ol>
                <li>Conservez ce code en securite</li>
                <li>L'Administrateur vous contactera pour demander ce code</li>
                <li>Ne partagez ce code QU'AVEC l'Administrateur qui a initie l'action</li>
                <li>Verifiez que l'action est legitime avant de partager le code</li>
              </ol>
            </div>
            
            <div class="warning">
              <strong>Important :</strong>
              <ul>
                <li>Ce code est valide pendant <strong>15 minutes</strong></li>
                <li>NE partagez ce code qu'apres avoir verifie la legitimite de l'action</li>
                <li>Les DEUX codes (Admin + Tresorier) sont necessaires pour executer l'action</li>
                <li>Vous pouvez REJETER cette demande si elle vous semble suspecte</li>
              </ul>
            </div>
            
            <p>Si vous n'etes pas au courant de cette action, <strong>ne partagez pas ce code</strong> et contactez immediatement l'equipe de direction.</p>
            
            <div class="footer">
              <p>DigiTontine - Gestion de Tontines Digitales</p>
              <p>Cet email a ete envoye automatiquement, merci de ne pas y repondre.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail(
      tresorier.email,
      `Code de validation requis - ${actionLabels[actionType]}`,
      htmlContent
    );

    logger.info(`OTP Tresorier envoye a ${tresorier.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi OTP Tresorier:', error);
    throw error;
  }
};

/**
 * Envoyer notification de validation complete
 */
const sendValidationCompleteNotification = async (admin, tresorier, actionType, resourceName) => {
  try {
    const actionLabels = {
      DELETE_USER: 'Suppression d\'utilisateur',
      DELETE_TONTINE: 'Suppression de tontine',
      BLOCK_TONTINE: 'Blocage de tontine',
      UNBLOCK_TONTINE: 'Deblocage de tontine',
      ACTIVATE_USER: 'Activation d\'utilisateur',
      DEACTIVATE_USER: 'Desactivation d\'utilisateur',
    };

    const htmlAdmin = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #4CAF50;">Validation Complete</h2>
        <p>Bonjour <strong>${admin.prenom}</strong>,</p>
        <p>La double validation pour <strong>${actionLabels[actionType]}</strong> concernant <strong>${resourceName}</strong> a ete completee avec succes.</p>
        <p><strong>Les deux codes ont ete valides :</strong></p>
        <ul>
          <li>Code Admin : Valide</li>
          <li>Code Tresorier : Valide</li>
        </ul>
        <p>L'action a ete executee automatiquement.</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">DigiTontine - Gestion de Tontines Digitales</p>
      </div>
    `;

    const htmlTresorier = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #4CAF50;">Action Validee et Executee</h2>
        <p>Bonjour <strong>${tresorier.prenom}</strong>,</p>
        <p>L'action <strong>${actionLabels[actionType]}</strong> pour <strong>${resourceName}</strong> a ete validee avec les deux codes et a ete executee.</p>
        <p>Merci pour votre validation.</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">DigiTontine - Gestion de Tontines Digitales</p>
      </div>
    `;

    await sendEmail(
      admin.email,
      `Validation complete - ${actionLabels[actionType]}`,
      htmlAdmin
    );

    await sendEmail(
      tresorier.email,
      `Validation complete - ${actionLabels[actionType]}`,
      htmlTresorier
    );

    logger.info(`Notifications validation complete envoyees`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi notification complete:', error);
    throw error;
  }
};

/**
 * Envoyer notification de rejet
 */
const sendRejectionNotification = async (recipient, actionType, resourceName, reason, rejectedBy = 'Tresorier') => {
  try {
    const actionLabels = {
      DELETE_USER: 'Suppression d\'utilisateur',
      DELETE_TONTINE: 'Suppression de tontine',
      BLOCK_TONTINE: 'Blocage de tontine',
      UNBLOCK_TONTINE: 'Deblocage de tontine',
      ACTIVATE_USER: 'Activation d\'utilisateur',
      DEACTIVATE_USER: 'Desactivation d\'utilisateur',
    };

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #f44336;">Demande Rejetee</h2>
        <p>Bonjour <strong>${recipient.prenom}</strong>,</p>
        <p>La demande de <strong>${actionLabels[actionType]}</strong> pour <strong>${resourceName}</strong> a ete rejetee par le <strong>${rejectedBy}</strong>.</p>
        <p><strong>Raison :</strong> ${reason}</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">DigiTontine - Gestion de Tontines Digitales</p>
      </div>
    `;

    await sendEmail(
      recipient.email,
      `Demande rejetee - ${actionLabels[actionType]}`,
      htmlContent
    );

    logger.info(`Notification rejet envoyee a ${recipient.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi notification rejet:', error);
    throw error;
  }
};

module.exports = {
  sendAdminOTP,
  sendTresorierOTP,
  sendValidationCompleteNotification,
  sendRejectionNotification,
};