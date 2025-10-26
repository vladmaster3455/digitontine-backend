// services/email.service.js - VERSION MAILJET
const Mailjet = require('node-mailjet');
const logger = require('../utils/logger');
const { formatDate, formatCurrency } = require('../utils/helpers');

// Initialiser Mailjet
let mailjetClient = null;

const initializeMailjet = () => {
  if (mailjetClient) return mailjetClient;

  if (!process.env.MAILJET_API_KEY || !process.env.MAILJET_SECRET_KEY) {
    logger.error('Configuration Mailjet manquante - Emails desactives');
    return null;
  }

  mailjetClient = Mailjet.apiConnect(
    process.env.MAILJET_API_KEY,
    process.env.MAILJET_SECRET_KEY
  );

  logger.info('Mailjet initialise avec succes');
  return mailjetClient;
};

/**
 * Envoyer un email via Mailjet
 */
const sendEmail = async (to, subject, htmlContent) => {
  try {
    const client = initializeMailjet();
    
    if (!client) {
      logger.warn('Mailjet non configure - Email ignore');
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
      logger.info(`Email envoye avec succes a ${to}`);
      return { success: true };
    } else {
      logger.error('Erreur envoi email:', result.body);
      return { success: false, error: 'Echec envoi' };
    }
  } catch (error) {
    logger.error('Erreur Mailjet:', error.message);
    return { success: false, error: error.message };
  }
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
        <div class="header"><h1>${title}</h1></div>
        <div class="content">${content}</div>
        <div class="footer">
          <p><strong>DigiTontine</strong> - Gestion de Tontines Digitales</p>
          <p>Cet email a ete envoye automatiquement, merci de ne pas y repondre.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Envoyer les identifiants de connexion
 */
const sendAccountCredentials = async (user, temporaryPassword) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      <p>Votre compte DigiTontine a ete cree avec succes !</p>
      
      <div class="success-box"><strong>Votre compte est maintenant actif</strong></div>
      
      <div class="credentials">
        <div class="credential-item">
          <span class="credential-label">Email :</span><br>
          <span class="credential-value">${user.email}</span>
        </div>
        <div class="credential-item">
          <span class="credential-label">Mot de passe temporaire :</span><br>
          <span class="credential-value">${temporaryPassword}</span>
        </div>
        <div class="credential-item">
          <span class="credential-label">Role :</span><br>
          <span class="credential-value">${user.role}</span>
        </div>
      </div>
      
      <div class="warning-box">
        <strong>Securite :</strong> Vous devrez changer ce mot de passe lors de votre premiere connexion.
      </div>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/login" class="button">Se connecter</a>
      </div>
    `;

    await sendEmail(
      user.email,
      'Bienvenue sur DigiTontine - Vos identifiants',
      getEmailTemplate('Bienvenue sur DigiTontine', content)
    );

    logger.info(`Email identifiants envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi email identifiants:', error);
    throw error;
  }
};

/**
 * Envoyer code de reinitialisation
 */
const sendPasswordResetCode = async (user, resetCode) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      <p>Vous avez demande la reinitialisation de votre mot de passe.</p>
      
      <div class="info-box">
        <strong>Votre code de verification :</strong>
        <div style="font-size: 32px; font-weight: bold; color: #667eea; text-align: center; margin: 20px 0; letter-spacing: 5px;">
          ${resetCode}
        </div>
      </div>
      
      <div class="warning-box">
        Ce code est valide pendant <strong>15 minutes</strong>
      </div>
    `;

    await sendEmail(
      user.email,
      'Reinitialisation de mot de passe',
      getEmailTemplate('Reinitialisation', content)
    );

    logger.info(`Code reset envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi code reset:', error);
    throw error;
  }
};

/**
 * Envoyer OTP de connexion
 */
const sendLoginOTP = async (user, code) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <p>Vous tentez de vous connecter a DigiTontine.</p>
      
      <div class="info-box">
        <strong>Votre code de verification :</strong>
        <div style="font-size: 32px; font-weight: bold; color: #667eea; text-align: center; margin: 20px 0; letter-spacing: 5px;">
          ${code}
        </div>
      </div>
      
      <div class="warning-box">
        Ce code est valide pendant <strong>15 minutes</strong><br>
        Vous avez <strong>3 tentatives</strong> maximum
      </div>
      
      <p>Si vous n'etes pas a l'origine de cette tentative de connexion, ignorez cet email et changez votre mot de passe immediatement.</p>
    `;

    await sendEmail(
      user.email,
      'Code de connexion DigiTontine',
      getEmailTemplate('Code de connexion', content)
    );

    logger.info(`OTP connexion envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi OTP connexion:', error);
    throw error;
  }
};
/**
 * Envoyer demande de confirmation de changement de mot de passe
 */
const sendPasswordChangeConfirmationRequest = async (user, confirmationToken) => {
  try {
  //Utiliser la bonne route /confirm avec token en query params
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const approveUrl = `${baseUrl}/confirm?token=${confirmationToken}&action=approve`;
    const rejectUrl = `${baseUrl}/confirm?token=${confirmationToken}&action=reject`;

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="warning-box">
        <strong>Demande de changement de mot de passe</strong><br>
        Une demande de changement de mot de passe a ete effectuee sur votre compte.
      </div>
      
      <div class="info-box">
        <strong>Date de la demande :</strong> ${formatDate(new Date(), 'full')}<br>
        <strong>Validite :</strong> 30 minutes
      </div>
      
      <p><strong>Etes-vous a l'origine de cette demande ?</strong></p>
      
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
          <li>Si vous confirmez (OUI), votre nouveau mot de passe sera active</li>
          <li>Si vous refusez (NON), votre ancien mot de passe restera actif</li>
          <li>Vous DEVEZ cliquer sur l'un des boutons pour vous reconnecter</li>
          <li>Ce lien expire dans 30 minutes</li>
        </ul>
      </div>
      
      <p style="color: #dc3545; font-weight: bold;">
        Si vous n'etes pas a l'origine de cette demande, cliquez sur NON et contactez immediatement l'administrateur.
      </p>
    `;

    await sendEmail(
      user.email,
      'Confirmation requise - Changement de mot de passe',
      getEmailTemplate('Confirmation requise', content)
    );

    logger.info(`Email confirmation changement MDP envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi confirmation changement MDP:', error);
    throw error;
  }
};
/**
 * Envoyer notification de changement de mot de passe approuve
 */
const sendPasswordChangeApproved = async (user) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">
        <strong>Changement de mot de passe confirme</strong><br>
        Date : ${formatDate(new Date(), 'full')}
      </div>
      
      <p>Votre nouveau mot de passe est maintenant actif. Vous pouvez vous connecter avec celui-ci.</p>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/login" class="button">Se connecter</a>
      </div>
    `;

    await sendEmail(
      user.email,
      'Mot de passe change avec succes',
      getEmailTemplate('Changement confirme', content)
    );

    logger.info(`Email confirmation approuvee envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi confirmation approuvee:', error);
    throw error;
  }
};

/**
 * Envoyer notification de changement de mot de passe rejete
 */
const sendPasswordChangeRejected = async (user) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="info-box">
        <strong>Changement de mot de passe annule</strong><br>
        Date : ${formatDate(new Date(), 'full')}
      </div>
      
      <p>Le changement de mot de passe a ete annule. Votre ancien mot de passe reste actif.</p>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/login" class="button">Se connecter</a>
      </div>
    `;

    await sendEmail(
      user.email,
      'Changement de mot de passe annule',
      getEmailTemplate('Changement annule', content)
    );

    logger.info(`Email confirmation rejetee envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi confirmation rejetee:', error);
    throw error;
  }
};

/**
 * Confirmer changement de mot de passe
 */
const sendPasswordChangeConfirmation = async (user) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">
        <strong>Votre mot de passe a ete modifie avec succes</strong><br>
        Date : ${formatDate(new Date(), 'full')}
      </div>
      
      <p>Si vous n'etes pas a l'origine de ce changement, contactez immediatement l'administrateur.</p>
    `;

    await sendEmail(
      user.email,
      'Confirmation changement de mot de passe',
      getEmailTemplate('Mot de passe modifie', content)
    );

    logger.info(`Confirmation MDP envoyee a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur confirmation MDP:', error);
    throw error;
  }
};

/**
 * Notifier desactivation de compte
 */
const sendAccountDeactivatedNotification = async (user, raison = null) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="warning-box">
        <strong>Votre compte a ete desactive</strong>
      </div>
      
      ${raison ? `<div class="info-box"><strong>Raison :</strong> ${raison}</div>` : ''}
      
      <p>Pour reactiver votre compte, contactez l'administrateur.</p>
    `;

    await sendEmail(
      user.email,
      'Compte desactive',
      getEmailTemplate('Compte desactive', content)
    );

    logger.info(`Notification desactivation envoyee a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur notification desactivation:', error);
    throw error;
  }
};

/**
 * Notifier invitation a tontine
 */
const sendTontineInvitation = async (user, tontine) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">
        <strong>Vous avez ete invite(e) a rejoindre une tontine !</strong>
      </div>
      
      <div class="info-box">
        <strong>Nom de la tontine :</strong> ${tontine.nom}<br>
        ${tontine.description ? `<strong>Description :</strong> ${tontine.description}<br>` : ''}
        <strong>Montant de cotisation :</strong> ${formatCurrency(tontine.montantCotisation)}<br>
        <strong>Frequence :</strong> ${tontine.frequence}<br>
        <strong>Date de debut :</strong> ${formatDate(tontine.dateDebut)}<br>
        <strong>Date de fin :</strong> ${formatDate(tontine.dateFin)}<br>
        <strong>Nombre de membres :</strong> ${tontine.nombreMembres} / ${tontine.nombreMembresMax}
      </div>
      
      <p>La tontine sera activee une fois le nombre minimum de membres atteint.</p>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/tontines/${tontine._id}" class="button">Voir les details</a>
      </div>
    `;

    await sendEmail(
      user.email,
      `Invitation a la tontine "${tontine.nom}"`,
      getEmailTemplate('Invitation Tontine', content)
    );

    logger.info(`Email invitation tontine envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi invitation tontine:', error);
    throw error;
  }
};

/**
 * Notifier retrait d'une tontine
 */
const sendTontineRemovalNotification = async (user, tontine) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="warning-box">
        <strong>Vous avez ete retire(e) de la tontine "${tontine.nom}"</strong>
      </div>
      
      <p>Si vous pensez qu'il s'agit d'une erreur, veuillez contacter l'administrateur.</p>
    `;

    await sendEmail(
      user.email,
      `Retrait de la tontine "${tontine.nom}"`,
      getEmailTemplate('Retrait Tontine', content)
    );

    logger.info(`Email retrait tontine envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi retrait tontine:', error);
    throw error;
  }
};

/**
 * Notifier activation de tontine
 */
const sendTontineActivationNotification = async (user, tontine) => {
  try {
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
        <strong>Frequence :</strong> ${tontine.frequence}
      </div>
      
      ${premiereEcheance ? `
        <div class="warning-box">
          <strong>Premiere echeance :</strong> ${formatDate(premiereEcheance.dateEcheance)}<br>
          <strong>Montant a payer :</strong> ${formatCurrency(premiereEcheance.montant)}
        </div>
      ` : ''}
      
      <p>Vous recevrez des rappels avant chaque echeance de paiement.</p>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/tontines/${tontine._id}" class="button">Voir ma tontine</a>
      </div>
    `;

    await sendEmail(
      user.email,
      `Tontine "${tontine.nom}" activee - Premiere cotisation`,
      getEmailTemplate('Tontine Activee', content)
    );

    logger.info(`Email activation tontine envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi activation tontine:', error);
    throw error;
  }
};

/**
 * Notifier blocage de tontine
 */
const sendTontineBlockedNotification = async (user, tontine, motif) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="warning-box">
        <strong>La tontine "${tontine.nom}" a ete temporairement bloquee</strong>
      </div>
      
      <div class="info-box">
        <strong>Motif :</strong><br>
        ${motif}
      </div>
      
      <p>Les cotisations et tirages sont suspendus jusqu'a nouvel ordre.</p>
      <p>Vous serez informe(e) des la reactivation de la tontine.</p>
    `;

    await sendEmail(
      user.email,
      `Tontine "${tontine.nom}" bloquee`,
      getEmailTemplate('Tontine Bloquee', content)
    );

    logger.info(`Email blocage tontine envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi blocage tontine:', error);
    throw error;
  }
};

/**
 * Notifier deblocage de tontine
 */
const sendTontineUnblockedNotification = async (user, tontine) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">
        <strong>La tontine "${tontine.nom}" a ete reactivee !</strong>
      </div>
      
      <p>Les activites reprennent normalement :</p>
      <ul>
        <li>Les cotisations sont de nouveau acceptees</li>
        <li>Les tirages reprendront selon le calendrier</li>
      </ul>
      
      <div style="text-align: center;">
        <a href="${process.env.FRONTEND_URL}/tontines/${tontine._id}" class="button">Voir ma tontine</a>
      </div>
    `;

    await sendEmail(
      user.email,
      `Tontine "${tontine.nom}" reactivee`,
      getEmailTemplate('Tontine Reactivee', content)
    );

    logger.info(`Email deblocage tontine envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi deblocage tontine:', error);
    throw error;
  }
};

/**
 * Notifier cloture de tontine
 */
const sendTontineClosedNotification = async (user, tontine, rapportUrl = null) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">
        <strong>La tontine "${tontine.nom}" est maintenant cloturee</strong>
      </div>
      
      <p>Felicitations ! Tous les membres ont beneficie du tirage.</p>
      
      <div class="info-box">
        <strong>Statistiques finales :</strong><br>
        <strong>Nombre de membres :</strong> ${tontine.nombreMembres}<br>
        <strong>Total collecte :</strong> ${formatCurrency(tontine.stats?.montantTotalCollecte || 0)}<br>
        <strong>Total distribue :</strong> ${formatCurrency(tontine.stats?.montantTotalDistribue || 0)}<br>
        <strong>Taux de participation :</strong> ${tontine.stats?.tauxParticipation?.toFixed(1) || 0}%<br>
        <strong>Date de cloture :</strong> ${formatDate(tontine.dateCloture || new Date())}
      </div>
      
      ${rapportUrl ? `
        <div style="text-align: center;">
          <a href="${rapportUrl}" class="button">Telecharger le rapport final</a>
        </div>
      ` : ''}
      
      <p>Merci pour votre participation a cette tontine !</p>
    `;

    await sendEmail(
      user.email,
      `Tontine "${tontine.nom}" cloturee - Rapport final`,
      getEmailTemplate('Tontine Cloturee', content)
    );

    logger.info(`Email cloture tontine envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi cloture tontine:', error);
    throw error;
  }
};

/**
 * Envoyer recu de paiement
 */
const sendPaymentReceipt = async (user, transaction, tontine) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">Paiement recu</div>
      
      <div class="info-box">
        <strong>Reference :</strong> ${transaction.referenceTransaction}<br>
        <strong>Tontine :</strong> ${tontine.nom}<br>
        <strong>Montant :</strong> ${formatCurrency(transaction.montant)}<br>
        <strong>Date :</strong> ${formatDate(transaction.dateTransaction)}
      </div>
    `;

    await sendEmail(
      user.email,
      `Recu - ${transaction.referenceTransaction}`,
      getEmailTemplate('Recu de paiement', content)
    );

    logger.info(`Recu envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi recu:', error);
    throw error;
  }
};

/**
 * Notifier validation paiement
 */
const sendPaymentValidatedNotification = async (user, transaction, tontine) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">Paiement valide !</div>
      
      <div class="info-box">
        <strong>Reference :</strong> ${transaction.referenceTransaction}<br>
        <strong>Tontine :</strong> ${tontine.nom}<br>
        <strong>Montant :</strong> ${formatCurrency(transaction.montant)}
      </div>
    `;

    await sendEmail(
      user.email,
      `Paiement valide - ${tontine.nom}`,
      getEmailTemplate('Paiement valide', content)
    );

    logger.info(`Notification validation envoyee a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur notification validation:', error);
    throw error;
  }
};

/**
 * Notifier rejet de paiement
 */
const sendPaymentRejectedNotification = async (user, transaction, motifRejet) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="warning-box">
        <strong>Votre paiement a ete rejete</strong>
      </div>
      
      <div class="info-box">
        <strong>Reference :</strong> ${transaction.referenceTransaction}<br>
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

    await sendEmail(
      user.email,
      `Paiement rejete - ${transaction.referenceTransaction}`,
      getEmailTemplate('Paiement Rejete', content)
    );

    logger.info(`Email rejet paiement envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur envoi rejet paiement:', error);
    throw error;
  }
};

/**
 * Rappel de cotisation
 */
const sendPaymentReminder = async (user, tontine, echeance, joursAvant) => {
  try {
    let message;
    if (joursAvant > 0) {
      message = `Cotisation due dans ${joursAvant} jour(s)`;
    } else if (joursAvant === 0) {
      message = `Aujourd'hui : Date limite`;
    } else {
      message = `Retard de ${Math.abs(joursAvant)} jour(s)`;
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

    await sendEmail(
      user.email,
      joursAvant >= 0 ? `Rappel - ${tontine.nom}` : `Retard - ${tontine.nom}`,
      getEmailTemplate('Rappel cotisation', content)
    );

    logger.info(`Rappel envoye a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur rappel:', error);
    throw error;
  }
};

/**
 * Notifier gagnant tirage
 */
const sendTirageWinnerNotification = async (user, tirage, tontine) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="success-box">Vous avez gagne le tirage !</div>
      
      <div class="info-box">
        <strong>Tontine :</strong> ${tontine.nom}<br>
        <strong>Montant :</strong> ${formatCurrency(tirage.montant)}<br>
        <strong>Date :</strong> ${formatDate(tirage.dateEffective)}
      </div>
    `;

    await sendEmail(
      user.email,
      `Tirage gagne - ${tontine.nom}`,
      getEmailTemplate('Tirage gagne', content)
    );

    logger.info(`Notification gagnant envoyee a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur notification gagnant:', error);
    throw error;
  }
};

/**
 * Notifier resultat tirage aux autres membres
 */
const sendTirageResultNotification = async (user, tirage, tontine, beneficiaire) => {
  try {
    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="info-box">
        <strong>Resultat du tirage - ${tontine.nom}</strong><br><br>
        Le gagnant est : <strong>${beneficiaire.prenom} ${beneficiaire.nom}</strong><br>
        Montant gagne : ${formatCurrency(tirage.montant)}<br>
        Date : ${formatDate(tirage.dateEffective)}
      </div>
      
      <p>Le prochain tirage aura lieu selon le calendrier de la tontine.</p>
    `;

    await sendEmail(
      user.email,
      `Resultat du tirage - ${tontine.nom}`,
      getEmailTemplate('Resultat du tirage', content)
    );

    logger.info(`Notification resultat tirage envoyee a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur notification resultat tirage:', error);
    throw error;
  }
};

/**
 * Notifier les membres d'un tirage a venir
 */
const sendTirageNotification = async (user, tontine, dateTirage) => {
  try {
    const dateEcheanceOptOut = new Date();
    dateEcheanceOptOut.setDate(dateEcheanceOptOut.getDate() + 2);

    const content = `
      <p>Bonjour <strong>${user.prenom} ${user.nom}</strong>,</p>
      
      <div class="info-box">
        <strong>Tirage au sort prevu</strong><br>
        <strong>Tontine :</strong> ${tontine.nom}<br>
        <strong>Date du tirage :</strong> ${formatDate(dateTirage)}<br>
        <strong>Montant a gagner :</strong> ${formatCurrency(tontine.montantCotisation * tontine.nombreMembres)}
      </div>
      
      <p><strong>Souhaitez-vous participer a ce tirage ?</strong></p>
      
      <div class="success-box">
        Par defaut, vous participez automatiquement au tirage.
      </div>
      
      <div class="warning-box">
        <strong>Important :</strong> Si vous ne souhaitez PAS participer a ce tirage, 
        vous devez nous en informer avant le <strong>${formatDate(dateEcheanceOptOut)}</strong>.<br><br>
        Apres cette date, votre participation sera consideree comme confirmee.
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL}/tontines/${tontine._id}/opt-out" class="button" style="background: #dc3545;">
          Ne pas participer a ce tirage
        </a>
      </div>
      
      <p style="color: #666; font-size: 14px;">
        Note : Vous pourrez participer aux tirages suivants meme si vous refusez celui-ci.
      </p>
    `;

    await sendEmail(
      user.email,
      `Tirage au sort - ${tontine.nom}`,
      getEmailTemplate('Tirage au sort', content)
    );

    logger.info(`Notification tirage envoyee a ${user.email}`);
    return true;
  } catch (error) {
    logger.error('Erreur notification tirage:', error);
    throw error;
  }
};

/**
 * Notifier ajout a tontine (ancienne fonction pour compatibilite)
 */
const sendAddedToTontineNotification = async (user, tontine) => {
  return await sendTontineInvitation(user, tontine);
};

/**
 * Notifier activation tontine (ancienne fonction pour compatibilite)
 */
const sendTontineActivatedNotification = async (user, tontine) => {
  return await sendTontineActivationNotification(user, tontine);
};

/**
 * Email de test
 */
const sendTestEmail = async (toEmail) => {
  try {
    const content = `
      <div class="success-box">Configuration email Mailjet OK</div>
      <p>Date : ${formatDate(new Date(), 'full')}</p>
      <p>Votre configuration Mailjet fonctionne correctement !</p>
    `;

    await sendEmail(
      toEmail,
      'Test DigiTontine - Mailjet',
      getEmailTemplate('Test Email', content)
    );

    logger.info(`Test envoye a ${toEmail}`);
    return true;
  } catch (error) {
    logger.error('Erreur test:', error);
    throw error;
  }
};

module.exports = {
  sendEmail,
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
  sendTontineInvitation,
  sendTontineRemovalNotification,
  sendTontineActivationNotification,
  sendTontineBlockedNotification,
  sendTontineUnblockedNotification,
  sendTontineClosedNotification,
  sendPaymentRejectedNotification,
  sendTirageNotification,
  sendTirageResultNotification,
  sendLoginOTP,
  sendPasswordChangeConfirmationRequest,
  sendPasswordChangeApproved,
  sendPasswordChangeRejected,
};