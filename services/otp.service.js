// services/otp.service.js
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

/**
 * Créer le transporteur email
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

/**
 * Envoyer l'OTP au Trésorier
 */
const sendTresorierOTP = async (tresorier, code, actionType, resourceName) => {
  try {
    const transporter = createTransporter();

    const actionLabels = {
      DELETE_USER: 'Suppression d\'utilisateur',
      DELETE_TONTINE: 'Suppression de tontine',
      BLOCK_TONTINE: 'Blocage de tontine',
      UNBLOCK_TONTINE: 'Déblocage de tontine',
      ACTIVATE_USER: 'Activation d\'utilisateur',
      DEACTIVATE_USER: 'Désactivation d\'utilisateur',
    };

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: tresorier.email,
      subject: ` Code de validation - ${actionLabels[actionType]}`,
      html: `
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
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1> Code de Validation Trésorier</h1>
            </div>
            <div class="content">
              <p>Bonjour <strong>${tresorier.prenom} ${tresorier.nom}</strong>,</p>
              
              <p>Vous avez initié une demande de <strong>${actionLabels[actionType]}</strong> pour :</p>
              <p><strong>${resourceName}</strong></p>
              
              <p>Voici votre code de validation :</p>
              
              <div class="code">${code}</div>
              
              <div class="warning">
                 <strong>Important :</strong>
                <ul>
                  <li>Ce code est valide pendant <strong>15 minutes</strong></li>
                  <li>Vous avez <strong>3 tentatives</strong> maximum</li>
                  <li>Après votre validation, l'Admin devra également valider</li>
                </ul>
              </div>
              
              <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email et contactez immédiatement l'administrateur.</p>
              
              <div class="footer">
                <p>DigiTontine - Gestion de Tontines Digitales</p>
                <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(` OTP Trésorier envoyé à ${tresorier.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur envoi OTP Trésorier:', error);
    throw error;
  }
};

/**
 * Envoyer l'OTP à l'Admin
 */
const sendAdminOTP = async (admin, code, actionType, resourceName, tresorier) => {
  try {
    const transporter = createTransporter();

    const actionLabels = {
      DELETE_USER: 'Suppression d\'utilisateur',
      DELETE_TONTINE: 'Suppression de tontine',
      BLOCK_TONTINE: 'Blocage de tontine',
      UNBLOCK_TONTINE: 'Déblocage de tontine',
      ACTIVATE_USER: 'Activation d\'utilisateur',
      DEACTIVATE_USER: 'Désactivation d\'utilisateur',
    };

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: admin.email,
      subject: ` Validation Admin requise - ${actionLabels[actionType]}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #ff5722; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .code { font-size: 32px; font-weight: bold; color: #ff5722; text-align: center; padding: 20px; background: white; border: 2px dashed #ff5722; border-radius: 5px; margin: 20px 0; letter-spacing: 5px; }
            .info { background: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; }
            .warning { background: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1> Validation Admin Requise</h1>
            </div>
            <div class="content">
              <p>Bonjour <strong>${admin.prenom} ${admin.nom}</strong>,</p>
              
              <p>Le Trésorier <strong>${tresorier.prenom} ${tresorier.nom}</strong> a validé une demande de :</p>
              <p><strong>${actionLabels[actionType]}</strong> pour : <strong>${resourceName}</strong></p>
              
              <div class="info">
                ℹ <strong>Détails de la demande :</strong>
                <ul>
                  <li>Initiée par : ${tresorier.email}</li>
                  <li>Validation Trésorier :  Confirmée</li>
                  <li>En attente de : Votre validation</li>
                </ul>
              </div>
              
              <p>Voici votre code de validation Admin :</p>
              
              <div class="code">${code}</div>
              
              <div class="warning">
                 <strong>Attention :</strong>
                <ul>
                  <li>Cette action est <strong>irréversible</strong></li>
                  <li>Code valide pendant <strong>15 minutes</strong></li>
                  <li>Vous avez <strong>3 tentatives</strong> maximum</li>
                </ul>
              </div>
              
              <p>Si vous souhaitez rejeter cette demande, connectez-vous à votre tableau de bord.</p>
              
              <div class="footer">
                <p>DigiTontine - Gestion de Tontines Digitales</p>
                <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(` OTP Admin envoyé à ${admin.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur envoi OTP Admin:', error);
    throw error;
  }
};

/**
 * Envoyer notification de validation complète
 */
const sendValidationCompleteNotification = async (tresorier, admin, actionType, resourceName) => {
  try {
    const transporter = createTransporter();

    const actionLabels = {
      DELETE_USER: 'Suppression d\'utilisateur',
      DELETE_TONTINE: 'Suppression de tontine',
      BLOCK_TONTINE: 'Blocage de tontine',
      UNBLOCK_TONTINE: 'Déblocage de tontine',
      ACTIVATE_USER: 'Activation d\'utilisateur',
      DEACTIVATE_USER: 'Désactivation d\'utilisateur',
    };

    // Email au Trésorier
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: tresorier.email,
      subject: `Validation complète - ${actionLabels[actionType]}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #4CAF50;">✅ Validation Complète</h2>
          <p>Bonjour <strong>${tresorier.prenom}</strong>,</p>
          <p>Votre demande de <strong>${actionLabels[actionType]}</strong> pour <strong>${resourceName}</strong> a été validée par l'administrateur.</p>
          <p>L'action a été exécutée avec succès.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">DigiTontine - Gestion de Tontines Digitales</p>
        </div>
      `,
    });

    logger.info(`Notification complète envoyée au Trésorier ${tresorier.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur envoi notification complète:', error);
    throw error;
  }
};

/**
 * Envoyer notification de rejet
 */
const sendRejectionNotification = async (tresorier, actionType, resourceName, reason) => {
  try {
    const transporter = createTransporter();

    const actionLabels = {
      DELETE_USER: 'Suppression d\'utilisateur',
      DELETE_TONTINE: 'Suppression de tontine',
      BLOCK_TONTINE: 'Blocage de tontine',
      UNBLOCK_TONTINE: 'Déblocage de tontine',
      ACTIVATE_USER: 'Activation d\'utilisateur',
      DEACTIVATE_USER: 'Désactivation d\'utilisateur',
    };

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: tresorier.email,
      subject: ` Demande rejetée - ${actionLabels[actionType]}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #f44336;"> Demande Rejetée</h2>
          <p>Bonjour <strong>${tresorier.prenom}</strong>,</p>
          <p>Votre demande de <strong>${actionLabels[actionType]}</strong> pour <strong>${resourceName}</strong> a été rejetée par l'administrateur.</p>
          <p><strong>Raison :</strong> ${reason}</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">DigiTontine - Gestion de Tontines Digitales</p>
        </div>
      `,
    });

    logger.info(`Notification rejet envoyée au Trésorier ${tresorier.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur envoi notification rejet:', error);
    throw error;
  }
};

module.exports = {
  sendTresorierOTP,
  sendAdminOTP,
  sendValidationCompleteNotification,
  sendRejectionNotification,
};