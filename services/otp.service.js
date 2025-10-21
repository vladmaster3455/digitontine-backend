// services/otp.service.js - AJOUT EMAIL OTP ADMIN
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
 * Envoyer l'OTP à l'Admin (celui qui initie l'action)
 */
const sendAdminOTP = async (admin, code, actionType, resourceName) => {
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
      subject: `Votre code de validation - ${actionLabels[actionType]}`,
      html: `
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
              <h1> Votre Code de Validation</h1>
            </div>
            <div class="content">
              <p>Bonjour <strong>${admin.prenom} ${admin.nom}</strong>,</p>
              
              <p>Vous avez initié une demande de <strong>${actionLabels[actionType]}</strong> pour :</p>
              <p><strong>${resourceName}</strong></p>
              
              <p>Voici VOTRE code de validation :</p>
              
              <div class="code">${code}</div>
              
              <div class="info">
                <strong> Étapes suivantes :</strong>
                <ol>
                  <li>Conservez ce code</li>
                  <li>Contactez le Trésorier pour obtenir SON code</li>
                  <li>Soumettez les DEUX codes pour valider l'action</li>
                </ol>
              </div>
              
              <div class="warning">
                <strong> Important :</strong>
                <ul>
                  <li>Ce code est valide pendant <strong>15 minutes</strong></li>
                  <li>Vous avez <strong>3 tentatives</strong> maximum</li>
                  <li>Les DEUX codes (Admin + Trésorier) sont nécessaires</li>
                </ul>
              </div>
              
              <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email et modifiez immédiatement votre mot de passe.</p>
              
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
      subject: `Code de validation requis - ${actionLabels[actionType]}`,
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
            .info { background: #e8f5e9; border-left: 4px solid #4CAF50; padding: 15px; margin: 20px 0; }
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
              
              <p>Un Administrateur a initié une demande de <strong>${actionLabels[actionType]}</strong> pour :</p>
              <p><strong>${resourceName}</strong></p>
              
              <p>Votre validation est requise. Voici VOTRE code :</p>
              
              <div class="code">${code}</div>
              
              <div class="info">
                <strong> Que faire ?</strong>
                <ol>
                  <li>Conservez ce code en sécurité</li>
                  <li>L'Administrateur vous contactera pour demander ce code</li>
                  <li>Ne partagez ce code QU'AVEC l'Administrateur qui a initié l'action</li>
                  <li>Vérifiez que l'action est légitime avant de partager le code</li>
                </ol>
              </div>
              
              <div class="warning">
                <strong> Important :</strong>
                <ul>
                  <li>Ce code est valide pendant <strong>15 minutes</strong></li>
                  <li>NE partagez ce code qu'après avoir vérifié la légitimité de l'action</li>
                  <li>Les DEUX codes (Admin + Trésorier) sont nécessaires pour exécuter l'action</li>
                  <li>Vous pouvez REJETER cette demande si elle vous semble suspecte</li>
                </ul>
              </div>
              
              <p>Si vous n'êtes pas au courant de cette action, <strong>ne partagez pas ce code</strong> et contactez immédiatement l'équipe de direction.</p>
              
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
 * Envoyer notification de validation complète
 */
const sendValidationCompleteNotification = async (admin, tresorier, actionType, resourceName) => {
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

    // Email à l'Admin
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: admin.email,
      subject: ` Validation complète - ${actionLabels[actionType]}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #4CAF50;"> Validation Complète</h2>
          <p>Bonjour <strong>${admin.prenom}</strong>,</p>
          <p>La double validation pour <strong>${actionLabels[actionType]}</strong> concernant <strong>${resourceName}</strong> a été complétée avec succès.</p>
          <p><strong>Les deux codes ont été validés :</strong></p>
          <ul>
            <li> Code Admin : Validé</li>
            <li> Code Trésorier : Validé</li>
          </ul>
          <p>L'action a été exécutée automatiquement.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">DigiTontine - Gestion de Tontines Digitales</p>
        </div>
      `,
    });

    // Email au Trésorier
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: tresorier.email,
      subject: ` Validation complète - ${actionLabels[actionType]}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #4CAF50;"> Action Validée et Exécutée</h2>
          <p>Bonjour <strong>${tresorier.prenom}</strong>,</p>
          <p>L'action <strong>${actionLabels[actionType]}</strong> pour <strong>${resourceName}</strong> a été validée avec les deux codes et a été exécutée.</p>
          <p>Merci pour votre validation.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">DigiTontine - Gestion de Tontines Digitales</p>
        </div>
      `,
    });

    logger.info(` Notifications validation complète envoyées`);
    return true;
  } catch (error) {
    logger.error(' Erreur envoi notification complète:', error);
    throw error;
  }
};

/**
 * Envoyer notification de rejet
 */
const sendRejectionNotification = async (recipient, actionType, resourceName, reason, rejectedBy) => {
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
      to: recipient.email,
      subject: ` Demande rejetée - ${actionLabels[actionType]}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #f44336;"> Demande Rejetée</h2>
          <p>Bonjour <strong>${recipient.prenom}</strong>,</p>
          <p>La demande de <strong>${actionLabels[actionType]}</strong> pour <strong>${resourceName}</strong> a été rejetée par le <strong>${rejectedBy}</strong>.</p>
          <p><strong>Raison :</strong> ${reason}</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">DigiTontine - Gestion de Tontines Digitales</p>
        </div>
      `,
    });

    logger.info(` Notification rejet envoyée à ${recipient.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur envoi notification rejet:', error);
    throw error;
  }
};

module.exports = {
  sendAdminOTP,
  sendTresorierOTP,
  sendValidationCompleteNotification,
  sendRejectionNotification,
};