// services/email.service.js
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const { formatDate, formatCurrency } = require('../utils/helpers');

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
 * Template HTML de base
 */
const getEmailTemplate = (title, content) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
        .content { padding: 30px; background: #ffffff; }
        .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white !important; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: 600; }
        .info-box { background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .warning-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .success-box { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .footer { text-align: center; padding: 20px; background: #f8f9fa; font-size: 12px; color: #666; border-top: 1px solid #e9ecef; }
        .credentials { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; }
        .credential-item { margin: 10px 0; font-size: 16px; }
        .credential-label { font-weight: 600; color: #666; }
        .credential-value { color: #667eea; font-weight: 700; font-size: 18px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1> ${title}</h1></div>
        <div class="content">${content}</div>
        <div class="footer">
          <p><strong>DigiTontine</strong> - Gestion de Tontines Digitales</p>
          <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Envoyer les identifiants de connexion (US 1.3, 1.4)
 */
const sendAccountCredentials = async (user, temporaryPassword) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      <p>Votre compte DigiTontine a été créé avec succès ! 🎉</p>
      
      <div class="success-box"> <strong>Votre compte est maintenant actif</strong></div>
      
      <div class="credentials">
        <div class="credential-item">
          <span class="credential-label"> Email :</span><br>
          <span class="credential-value">${user.email}</span>
        </div>
        <div class="credential-item">
          <span class="credential-label"> Mot de passe temporaire :</span><br>
          <span class="credential-value">${temporaryPassword}</span>
        </div>
        <div class="credential-item">
          <span class="credential-label"> Rôle :</span><br>
          <span class="credential-value">${user.role}</span>
        </div>
      </div>
      
      <div class="warning-box">
         <strong>Sécurité :</strong> Vous devrez changer ce mot de passe lors de votre première connexion.
      </div>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/login" class="button"> Se connecter</a>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: ' Bienvenue sur DigiTontine - Vos identifiants',
      html: getEmailTemplate('Bienvenue sur DigiTontine', content),
    });

    logger.info(` Email identifiants envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur envoi email identifiants:', error);
    throw error;
  }
};

/**
 * Envoyer code de réinitialisation (US 1.7)
 */
const sendPasswordResetCode = async (user, resetCode) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
      
      <div class="info-box">
        <strong>Votre code de vérification :</strong>
        <div style="font-size: 32px; font-weight: bold; color: #667eea; text-align: center; margin: 20px 0; letter-spacing: 5px;">
          ${resetCode}
        </div>
      </div>
      
      <div class="warning-box">
         Ce code est valide pendant <strong>15 minutes</strong>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: ' Réinitialisation de mot de passe',
      html: getEmailTemplate('Réinitialisation', content),
    });

    logger.info(` Code reset envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur envoi code reset:', error);
    throw error;
  }
};

/**
 * Confirmer changement de mot de passe (US 1.6, 1.7)
 */
const sendPasswordChangeConfirmation = async (user) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">
         <strong>Votre mot de passe a été modifié avec succès</strong><br>
        Date : ${formatDate(new Date(), 'full')}
      </div>
      
      <p>Si vous n'êtes pas à l'origine de ce changement, contactez immédiatement l'administrateur.</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: ' Confirmation changement de mot de passe',
      html: getEmailTemplate('Mot de passe modifié', content),
    });

    logger.info(` Confirmation MDP envoyée à ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur confirmation MDP:', error);
    throw error;
  }
};

/**
 * Notifier désactivation de compte (US 1.11)
 */
const sendAccountDeactivatedNotification = async (user, raison = null) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="warning-box">
         <strong>Votre compte a été désactivé</strong>
      </div>
      
      ${raison ? `<div class="info-box"><strong>Raison :</strong> ${raison}</div>` : ''}
      
      <p>Pour réactiver votre compte, contactez l'administrateur.</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: ' Compte désactivé',
      html: getEmailTemplate('Compte désactivé', content),
    });

    logger.info(` Notification désactivation envoyée à ${user.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur notification désactivation:', error);
    throw error;
  }
};

/**
 * Notifier ajout à tontine (US 2.2)
 */
const sendAddedToTontineNotification = async (user, tontine) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box"> Vous avez été ajouté à une tontine !</div>
      
      <div class="info-box">
        <strong>Nom :</strong> ${tontine.nom}<br>
        <strong>Montant :</strong> ${formatCurrency(tontine.montantCotisation)}<br>
        <strong>Fréquence :</strong> ${tontine.frequence}<br>
        <strong>Date début :</strong> ${formatDate(tontine.dateDebut)}
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: ` Nouvelle tontine "${tontine.nom}"`,
      html: getEmailTemplate('Nouvelle tontine', content),
    });

    logger.info(` Notification tontine envoyée à ${user.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur notification tontine:', error);
    throw error;
  }
};

/**
 * Notifier activation tontine (US 2.4)
 */
const sendTontineActivatedNotification = async (user, tontine) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box"> La tontine "${tontine.nom}" est active !</div>
      
      <div class="info-box">
        <strong>Première échéance :</strong> ${formatDate(tontine.calendrierCotisations[0]?.dateEcheance)}<br>
        <strong>Montant :</strong> ${formatCurrency(tontine.montantCotisation)}
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: ` Tontine "${tontine.nom}" activée`,
      html: getEmailTemplate('Tontine activée', content),
    });

    logger.info(` Notification activation envoyée à ${user.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur notification activation:', error);
    throw error;
  }
};

/**
 * Envoyer reçu de paiement (US 4.1)
 */
const sendPaymentReceipt = async (user, transaction, tontine) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box"> Paiement reçu</div>
      
      <div class="info-box">
        <strong>Référence :</strong> ${transaction.referenceTransaction}<br>
        <strong>Tontine :</strong> ${tontine.nom}<br>
        <strong>Montant :</strong> ${formatCurrency(transaction.montant)}<br>
        <strong>Date :</strong> ${formatDate(transaction.dateTransaction)}
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: ` Reçu - ${transaction.referenceTransaction}`,
      html: getEmailTemplate('Reçu de paiement', content),
    });

    logger.info(` Reçu envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur envoi reçu:', error);
    throw error;
  }
};

/**
 * Notifier validation paiement (US 4.3)
 */
const sendPaymentValidatedNotification = async (user, transaction, tontine) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box"> Paiement validé !</div>
      
      <div class="info-box">
        <strong>Référence :</strong> ${transaction.referenceTransaction}<br>
        <strong>Tontine :</strong> ${tontine.nom}<br>
        <strong>Montant :</strong> ${formatCurrency(transaction.montant)}
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: ` Paiement validé - ${tontine.nom}`,
      html: getEmailTemplate('Paiement validé', content),
    });

    logger.info(` Notification validation envoyée à ${user.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur notification validation:', error);
    throw error;
  }
};

/**
 * Rappel de cotisation (US 4.2)
 */
const sendPaymentReminder = async (user, tontine, echeance, joursAvant) => {
  try {
    const transporter = createTransporter();

    let message;
    if (joursAvant > 0) {
      message = ` Cotisation due dans ${joursAvant} jour(s)`;
    } else if (joursAvant === 0) {
      message = ` Aujourd'hui : Date limite`;
    } else {
      message = ` Retard de ${Math.abs(joursAvant)} jour(s)`;
    }

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="${joursAvant >= 0 ? 'info-box' : 'warning-box'}">${message}</div>
      
      <div class="info-box">
        <strong>Tontine :</strong> ${tontine.nom}<br>
        <strong>Montant :</strong> ${formatCurrency(tontine.montantCotisation)}<br>
        <strong>Date limite :</strong> ${formatDate(echeance.dateEcheance)}
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: joursAvant >= 0 ? ` Rappel - ${tontine.nom}` : ` Retard - ${tontine.nom}`,
      html: getEmailTemplate('Rappel cotisation', content),
    });

    logger.info(` Rappel envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur rappel:', error);
    throw error;
  }
};

/**
 * Notifier gagnant tirage
 */
const sendTirageWinnerNotification = async (user, tirage, tontine) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box"> Vous avez gagné le tirage !</div>
      
      <div class="info-box">
        <strong>Tontine :</strong> ${tontine.nom}<br>
        <strong>Montant :</strong> ${formatCurrency(tirage.montantDistribue)}<br>
        <strong>Date :</strong> ${formatDate(tirage.dateTirage)}
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Tirage gagné - ${tontine.nom}`,
      html: getEmailTemplate('Tirage gagné', content),
    });

    logger.info(` Notification gagnant envoyée à ${user.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur notification gagnant:', error);
    throw error;
  }
};

/**
 * Email de test
 */
const sendTestEmail = async (toEmail) => {
  try {
    const transporter = createTransporter();

    const content = `
      <div class="success-box"> Configuration email OK</div>
      <p>Date : ${formatDate(new Date(), 'full')}</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: toEmail,
      subject: ' Test DigiTontine',
      html: getEmailTemplate('Test Email', content),
    });

    logger.info(` Test envoyé à ${toEmail}`);
    return true;
  } catch (error) {
    logger.error(' Erreur test:', error);
    throw error;
  }
  
};
/**
 * Notifier invitation à tontine (US 2.2)
 */
const sendTontineInvitation = async (user, tontine) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">
        <strong>Vous avez été invité(e) à rejoindre une tontine !</strong>
      </div>
      
      <div class="info-box">
        <strong>Nom de la tontine :</strong> ${tontine.nom}<br>
        ${tontine.description ? `<strong>Description :</strong> ${tontine.description}<br>` : ''}
        <strong>Montant de cotisation :</strong> ${formatCurrency(tontine.montantCotisation)}<br>
        <strong>Fréquence :</strong> ${tontine.frequence}<br>
        <strong>Date de début :</strong> ${formatDate(tontine.dateDebut)}<br>
        <strong>Date de fin :</strong> ${formatDate(tontine.dateFin)}<br>
        <strong>Nombre de membres :</strong> ${tontine.nombreMembres} / ${tontine.nombreMembresMax}
      </div>
      
      <p>La tontine sera activée une fois le nombre minimum de membres atteint.</p>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/tontines/${tontine._id}" class="button">Voir les détails</a>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Invitation à la tontine "${tontine.nom}"`,
      html: getEmailTemplate('Invitation Tontine', content),
    });

    logger.info(`Email invitation tontine envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi invitation tontine:', error);
    throw error;
  }
};

/**
 * Notifier retrait d'une tontine (US 2.3)
 */
const sendTontineRemovalNotification = async (user, tontine) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="warning-box">
        <strong>Vous avez été retiré(e) de la tontine "${tontine.nom}"</strong>
      </div>
      
      <p>Si vous pensez qu'il s'agit d'une erreur, veuillez contacter l'administrateur.</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Retrait de la tontine "${tontine.nom}"`,
      html: getEmailTemplate('Retrait Tontine', content),
    });

    logger.info(`Email retrait tontine envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi retrait tontine:', error);
    throw error;
  }
};

/**
 * Notifier activation de tontine (US 2.4)
 */
const sendTontineActivationNotification = async (user, tontine) => {
  try {
    const transporter = createTransporter();

    const premiereEcheance = tontine.calendrierCotisations?.[0];

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">
        <strong>La tontine "${tontine.nom}" est maintenant active !</strong>
      </div>
      
      <div class="info-box">
        <strong>Date d'activation :</strong> ${formatDate(tontine.dateActivation || new Date())}<br>
        <strong>Nombre de membres :</strong> ${tontine.nombreMembres}<br>
        <strong>Montant par cotisation :</strong> ${formatCurrency(tontine.montantCotisation)}<br>
        <strong>Fréquence :</strong> ${tontine.frequence}
      </div>
      
      ${premiereEcheance ? `
        <div class="warning-box">
          <strong>Première échéance :</strong> ${formatDate(premiereEcheance.dateEcheance)}<br>
          <strong>Montant à payer :</strong> ${formatCurrency(premiereEcheance.montant)}
        </div>
      ` : ''}
      
      <p>Vous recevrez des rappels avant chaque échéance de paiement.</p>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/tontines/${tontine._id}" class="button">Voir ma tontine</a>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Tontine "${tontine.nom}" activée - Première cotisation`,
      html: getEmailTemplate('Tontine Activée', content),
    });

    logger.info(`Email activation tontine envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi activation tontine:', error);
    throw error;
  }
};

/**
 * Notifier blocage de tontine (US 2.6)
 */
const sendTontineBlockedNotification = async (user, tontine, motif) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="warning-box">
        <strong>La tontine "${tontine.nom}" a été temporairement bloquée</strong>
      </div>
      
      <div class="info-box">
        <strong>Motif :</strong><br>
        ${motif}
      </div>
      
      <p>Les cotisations et tirages sont suspendus jusqu'à nouvel ordre.</p>
      <p>Vous serez informé(e) dès la réactivation de la tontine.</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Tontine "${tontine.nom}" bloquée`,
      html: getEmailTemplate('Tontine Bloquée', content),
    });

    logger.info(`Email blocage tontine envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi blocage tontine:', error);
    throw error;
  }
};

/**
 * Notifier déblocage de tontine (US 2.7)
 */
const sendTontineUnblockedNotification = async (user, tontine) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">
        <strong>La tontine "${tontine.nom}" a été réactivée !</strong>
      </div>
      
      <p>Les activités reprennent normalement :</p>
      <ul>
        <li>Les cotisations sont de nouveau acceptées</li>
        <li>Les tirages reprendront selon le calendrier</li>
      </ul>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/tontines/${tontine._id}" class="button">Voir ma tontine</a>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Tontine "${tontine.nom}" réactivée`,
      html: getEmailTemplate('Tontine Réactivée', content),
    });

    logger.info(`Email déblocage tontine envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi déblocage tontine:', error);
    throw error;
  }
};
/**
 * Envoyer OTP de connexion
 */
const sendLoginOTP = async (user, code) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <p>Vous tentez de vous connecter à DigiTontine.</p>
      
      <div class="info-box">
        <strong>Votre code de vérification :</strong>
        <div style="font-size: 32px; font-weight: bold; color: #667eea; text-align: center; margin: 20px 0; letter-spacing: 5px;">
          ${code}
        </div>
      </div>
      
      <div class="warning-box">
         Ce code est valide pendant <strong>15 minutes</strong><br>
         Vous avez <strong>3 tentatives</strong> maximum
      </div>
      
      <p>Si vous n'êtes pas à l'origine de cette tentative de connexion, ignorez cet email et changez votre mot de passe immédiatement.</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: ' Code de connexion DigiTontine',
      html: getEmailTemplate('Code de connexion', content),
    });

    logger.info(` OTP connexion envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur envoi OTP connexion:', error);
    throw error;
  }
};

/**
 * Envoyer demande de confirmation de changement de mot de passe
 */
const sendPasswordChangeConfirmationRequest = async (user, confirmationToken) => {
  try {
    const transporter = createTransporter();

    const approveUrl = `${process.env.FRONTEND_URL}/auth/confirm-password-change/${confirmationToken}?action=approve`;
    const rejectUrl = `${process.env.FRONTEND_URL}/auth/confirm-password-change/${confirmationToken}?action=reject`;

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="warning-box">
        <strong> Demande de changement de mot de passe</strong><br>
        Une demande de changement de mot de passe a été effectuée sur votre compte.
      </div>
      
      <div class="info-box">
        <strong> Date de la demande :</strong> ${formatDate(new Date(), 'full')}<br>
        <strong> Validité :</strong> 30 minutes
      </div>
      
      <p><strong>Êtes-vous à l'origine de cette demande ?</strong></p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${approveUrl}" class="button" style="background: #28a745; margin-right: 10px;">
           OUI, confirmer le changement
        </a>
        <a href="${rejectUrl}" class="button" style="background: #dc3545;">
           NON, annuler la demande
        </a>
      </div>
      
      <div class="warning-box">
        <strong>Important :</strong>
        <ul>
          <li>Si vous confirmez (OUI), votre nouveau mot de passe sera activé</li>
          <li>Si vous refusez (NON), votre ancien mot de passe restera actif</li>
          <li>Vous DEVEZ cliquer sur l'un des boutons pour vous reconnecter</li>
          <li>Ce lien expire dans 30 minutes</li>
        </ul>
      </div>
      
      <p style="color: #dc3545; font-weight: bold;">
         Si vous n'êtes pas à l'origine de cette demande, cliquez sur NON et contactez immédiatement l'administrateur.
      </p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: ' Confirmation requise - Changement de mot de passe',
      html: getEmailTemplate('Confirmation requise', content),
    });

    logger.info(` Email confirmation changement MDP envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur envoi confirmation changement MDP:', error);
    throw error;
  }
};

/**
 * Envoyer notification de changement de mot de passe approuvé
 */
const sendPasswordChangeApproved = async (user) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">
         <strong>Changement de mot de passe confirmé</strong><br>
        Date : ${formatDate(new Date(), 'full')}
      </div>
      
      <p>Votre nouveau mot de passe est maintenant actif. Vous pouvez vous connecter avec celui-ci.</p>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/login" class="button">🔐 Se connecter</a>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: ' Mot de passe changé avec succès',
      html: getEmailTemplate('Changement confirmé', content),
    });

    logger.info(` Email confirmation approuvée envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur envoi confirmation approuvée:', error);
    throw error;
  }
};

/**
 * Envoyer notification de changement de mot de passe rejeté
 */
const sendPasswordChangeRejected = async (user) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="info-box">
         <strong>Changement de mot de passe annulé</strong><br>
        Date : ${formatDate(new Date(), 'full')}
      </div>
      
      <p>Le changement de mot de passe a été annulé. Votre ancien mot de passe reste actif.</p>
      
    
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/login" class="button">🔐 Se connecter</a>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'ℹ Changement de mot de passe annulé',
      html: getEmailTemplate('Changement annulé', content),
    });

    logger.info(` Email confirmation rejetée envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error(' Erreur envoi confirmation rejetée:', error);
    throw error;
  }
};
/**
 * Notifier clôture de tontine (US 2.8)
 */
const sendTontineClosedNotification = async (user, tontine, rapportUrl = null) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">
        <strong>La tontine "${tontine.nom}" est maintenant clôturée</strong>
      </div>
      
      <p>Félicitations ! Tous les membres ont bénéficié du tirage.</p>
      
      <div class="info-box">
        <strong>Statistiques finales :</strong><br>
        <strong>Nombre de membres :</strong> ${tontine.nombreMembres}<br>
        <strong>Total collecté :</strong> ${formatCurrency(tontine.stats?.montantTotalCollecte || 0)}<br>
        <strong>Total distribué :</strong> ${formatCurrency(tontine.stats?.montantTotalDistribue || 0)}<br>
        <strong>Taux de participation :</strong> ${tontine.stats?.tauxParticipation?.toFixed(1) || 0}%<br>
        <strong>Date de clôture :</strong> ${formatDate(tontine.dateCloture || new Date())}
      </div>
      
      ${rapportUrl ? `
        <div style="text-align: center;">
          <a href="${rapportUrl}" class="button">Télécharger le rapport final</a>
        </div>
      ` : ''}
      
      <p>Merci pour votre participation à cette tontine !</p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Tontine "${tontine.nom}" clôturée - Rapport final`,
      html: getEmailTemplate('Tontine Clôturée', content),
    });

    logger.info(`Email clôture tontine envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi clôture tontine:', error);
    throw error;
  }
};

/**
 * Notifier rejet de paiement (US 4.3)
 */
const sendPaymentRejectedNotification = async (user, transaction, motifRejet) => {
  try {
    const transporter = createTransporter();

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="warning-box">
        <strong>Votre paiement a été rejeté</strong>
      </div>
      
      <div class="info-box">
        <strong>Référence :</strong> ${transaction.referenceTransaction}<br>
        <strong>Montant :</strong> ${formatCurrency(transaction.montant)}<br>
        <strong>Date :</strong> ${formatDate(transaction.dateTransaction)}
      </div>
      
      <div class="warning-box">
        <strong>Motif du rejet :</strong><br>
        ${motifRejet}
      </div>
      
      <p>Veuillez effectuer un nouveau paiement en tenant compte du motif de rejet.</p>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/transactions/new" class="button">Effectuer un nouveau paiement</a>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Paiement rejeté - ${transaction.referenceTransaction}`,
      html: getEmailTemplate('Paiement Rejeté', content),
    });

    logger.info(`Email rejet paiement envoyé à ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi rejet paiement:', error);
    throw error;
  }
};
/**
 * Notifier les membres d'un tirage à venir
 */
const sendTirageNotification = async (user, tontine, dateTirage) => {
  try {
    const transporter = createTransporter();
    
    const dateEcheanceOptOut = new Date();
    dateEcheanceOptOut.setDate(dateEcheanceOptOut.getDate() + 2);

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="info-box">
        <strong>Tirage au sort prévu</strong><br>
        <strong>Tontine :</strong> ${tontine.nom}<br>
        <strong>Date du tirage :</strong> ${formatDate(dateTirage)}<br>
        <strong>Montant à gagner :</strong> ${formatCurrency(tontine.montantCotisation * tontine.nombreMembres)}
      </div>
      
      <p><strong>Souhaitez-vous participer à ce tirage ?</strong></p>
      
      <div class="success-box">
        Par défaut, vous participez automatiquement au tirage.
      </div>
      
      <div class="warning-box">
        <strong>Important :</strong> Si vous ne souhaitez PAS participer à ce tirage, 
        vous devez nous en informer avant le <strong>${formatDate(dateEcheanceOptOut)}</strong>.<br><br>
        Après cette date, votre participation sera considérée comme confirmée.
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL}/tontines/${tontine._id}/opt-out" class="button" style="background: #dc3545;">
          Ne pas participer à ce tirage
        </a>
      </div>
      
      <p style="color: #666; font-size: 14px;">
        Note : Vous pourrez participer aux tirages suivants même si vous refusez celui-ci.
      </p>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Tirage au sort - ${tontine.nom}`,
      html: getEmailTemplate('Tirage au sort', content),
    });

    logger.info(`Notification tirage envoyée à ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur notification tirage:', error);
    throw error;
  }
};

module.exports = {
  sendAccountCredentials,
  sendPasswordResetCode,
  sendPasswordChangeConfirmation,
  sendAccountDeactivatedNotification,
  sendAddedToTontineNotification,
  sendTontineActivatedNotification,
  sendPaymentReceipt,
  sendPaymentValidatedNotification,
  sendPaymentReminder,
  sendTirageWinnerNotification,
  sendTestEmail,
    // MÉTHODES TONTINES
  sendTontineInvitation,
  sendTontineRemovalNotification,
  sendTontineActivationNotification,
  sendTontineBlockedNotification,
  sendTontineUnblockedNotification,
  sendTontineClosedNotification,
  
  // MÉTHODES TRANSACTIONS 
  sendPaymentRejectedNotification,
  sendTirageNotification, 
  sendLoginOTP,
  sendPasswordChangeConfirmationRequest,
  sendPasswordChangeApproved,
  sendPasswordChangeRejected,
  
};