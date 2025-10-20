// services/payment.service.js
const axios = require('axios');
const logger = require('../utils/logger');
const { PAYMENT_METHODS } = require('../config/constants');

/**
 * Configuration Wave API (Sénégal)
 * Documentation: https://docs.wave.com
 */
const WAVE_CONFIG = {
  apiKey: process.env.WAVE_API_KEY,
  apiSecret: process.env.WAVE_API_SECRET,
  baseUrl: process.env.WAVE_BASE_URL || 'https://api.wave.com/v1',
  callbackUrl: process.env.WAVE_CALLBACK_URL,
};

/**
 * Initier un paiement Wave
 * @param {Object} paymentData - Données du paiement
 * @returns {Object} - URL de paiement et référence
 */
const initiateWavePayment = async (paymentData) => {
  try {
    const { 
      amount, 
      currency = 'XOF', 
      phoneNumber, 
      reference, 
      description,
      userEmail,
      userName 
    } = paymentData;

    logger.info(`Initiation paiement Wave - Montant: ${amount} ${currency} - Ref: ${reference}`);

    // Validation des données
    if (!amount || amount < 100) {
      throw new Error('Montant invalide (minimum 100 FCFA)');
    }

    if (!reference) {
      throw new Error('Référence de transaction requise');
    }

    // Créer la session de paiement Wave
    const response = await axios.post(
      `${WAVE_CONFIG.baseUrl}/checkout/sessions`,
      {
        amount: amount.toString(),
        currency,
        error_url: `${WAVE_CONFIG.callbackUrl}/error`,
        success_url: `${WAVE_CONFIG.callbackUrl}/success`,
        client_reference: reference,
        metadata: {
          phoneNumber: phoneNumber || '',
          description: description || 'Cotisation tontine',
          userEmail: userEmail || '',
          userName: userName || '',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WAVE_CONFIG.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 secondes
      }
    );

    logger.info(`Paiement Wave initié avec succès - Session ID: ${response.data.id}`);

    return {
      success: true,
      paymentUrl: response.data.wave_launch_url,
      paymentId: response.data.id,
      reference: response.data.client_reference,
      expiresAt: response.data.when_expires,
      status: 'pending',
    };
  } catch (error) {
    logger.error('Erreur initiation paiement Wave:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Erreur lors de l\'initiation du paiement Wave',
      errorCode: error.response?.status,
    };
  }
};

/**
 * Vérifier le statut d'un paiement Wave
 * @param {String} paymentId - ID de la session Wave
 * @returns {Object} - Statut du paiement
 */
const checkWavePaymentStatus = async (paymentId) => {
  try {
    logger.info(`Vérification statut paiement Wave - Session ID: ${paymentId}`);

    const response = await axios.get(
      `${WAVE_CONFIG.baseUrl}/checkout/sessions/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${WAVE_CONFIG.apiKey}`,
        },
        timeout: 15000,
      }
    );

    const data = response.data;
    const status = data.payment_status; // 'pending', 'successful', 'failed', 'cancelled'

    logger.info(`Statut paiement Wave ${paymentId}: ${status}`);

    return {
      success: true,
      status,
      isPaid: status === 'successful',
      isFailed: status === 'failed',
      isCancelled: status === 'cancelled',
      isPending: status === 'pending',
      amount: parseFloat(data.amount),
      currency: data.currency,
      reference: data.client_reference,
      paidAt: data.when_completed || null,
      createdAt: data.when_created,
      expiresAt: data.when_expires,
    };
  } catch (error) {
    logger.error('Erreur vérification statut Wave:', {
      message: error.message,
      response: error.response?.data,
    });
    
    return {
      success: false,
      error: error.response?.data?.message || 'Impossible de vérifier le statut du paiement',
    };
  }
};

/**
 * Traiter un webhook Wave
 * @param {Object} webhookData - Données du webhook
 * @returns {Object} - Données traitées
 */
const processWaveWebhook = async (webhookData) => {
  try {
    logger.info('Traitement webhook Wave:', webhookData);

    const { 
      id, 
      payment_status, 
      client_reference, 
      amount, 
      currency,
      when_completed 
    } = webhookData;

    // Vérifier la signature du webhook (si Wave le supporte)
    // TODO: Implémenter la vérification de signature si disponible

    return {
      success: true,
      sessionId: id,
      status: payment_status,
      reference: client_reference,
      amount: parseFloat(amount),
      currency,
      completedAt: when_completed,
      isPaid: payment_status === 'successful',
    };
  } catch (error) {
    logger.error('Erreur traitement webhook Wave:', error);
    
    return {
      success: false,
      error: 'Erreur lors du traitement du webhook',
    };
  }
};

/**
 * Effectuer un remboursement Wave (si supporté)
 * @param {String} paymentId - ID de la session
 * @param {Number} amount - Montant à rembourser
 * @returns {Object} - Résultat du remboursement
 */
const refundWavePayment = async (paymentId, amount = null) => {
  try {
    logger.info(`Demande remboursement Wave - Session: ${paymentId}, Montant: ${amount || 'Total'}`);

    // NOTE: Vérifier si Wave supporte les remboursements via API
    // Sinon, cette fonctionnalité devra être gérée manuellement

    const response = await axios.post(
      `${WAVE_CONFIG.baseUrl}/checkout/sessions/${paymentId}/refund`,
      {
        amount: amount ? amount.toString() : undefined,
      },
      {
        headers: {
          Authorization: `Bearer ${WAVE_CONFIG.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info(`Remboursement Wave initié - Refund ID: ${response.data.refund_id}`);

    return {
      success: true,
      refundId: response.data.refund_id,
      amount: response.data.amount,
      status: response.data.status,
    };
  } catch (error) {
    logger.error('Erreur remboursement Wave:', error.response?.data || error.message);
    
    // Si l'API ne supporte pas les remboursements
    if (error.response?.status === 404) {
      logger.warn('Les remboursements Wave doivent être effectués manuellement');
      return {
        success: false,
        error: 'Remboursement manuel requis - contactez le support Wave',
        manualRefundRequired: true,
      };
    }
    
    return {
      success: false,
      error: 'Erreur lors du remboursement',
    };
  }
};

/**
 * Vérifier la configuration Wave
 * @returns {Boolean} - True si configuré correctement
 */
const isWaveConfigured = () => {
  const isConfigured = !!(
    WAVE_CONFIG.apiKey && 
    WAVE_CONFIG.apiSecret && 
    WAVE_CONFIG.baseUrl
  );

  if (!isConfigured) {
    logger.warn('Configuration Wave incomplète dans .env');
  }

  return isConfigured;
};

/**
 * Router le paiement selon le moyen choisi
 * @param {String} paymentMethod - Méthode de paiement
 * @param {Object} paymentData - Données du paiement
 * @returns {Object} - Résultat de l'initiation
 */
const initiatePayment = async (paymentMethod, paymentData) => {
  try {
    logger.info(`Initiation paiement - Méthode: ${paymentMethod}`);

    switch (paymentMethod) {
      case PAYMENT_METHODS.WAVE:
        if (!isWaveConfigured()) {
          throw new Error('Wave non configuré');
        }
        return await initiateWavePayment(paymentData);

      case PAYMENT_METHODS.ORANGE_MONEY:
        // TODO: Implémenter si nécessaire
        logger.warn('Orange Money non implémenté');
        return {
          success: false,
          error: 'Orange Money non disponible pour le moment',
        };

      case PAYMENT_METHODS.CASH:
        // Paiement cash - pas d'intégration API
        logger.info('Paiement cash - validation manuelle requise');
        return {
          success: true,
          paymentMethod: 'cash',
          requiresManualValidation: true,
          message: 'Paiement cash enregistré - validation manuelle requise',
        };

      default:
        throw new Error(`Méthode de paiement non supportée: ${paymentMethod}`);
    }
  } catch (error) {
    logger.error('Erreur initiation paiement:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Vérifier le statut d'un paiement selon la méthode
 * @param {String} paymentMethod - Méthode de paiement
 * @param {String} paymentId - ID du paiement
 * @returns {Object} - Statut du paiement
 */
const checkPaymentStatus = async (paymentMethod, paymentId) => {
  try {
    switch (paymentMethod) {
      case PAYMENT_METHODS.WAVE:
        return await checkWavePaymentStatus(paymentId);

      case PAYMENT_METHODS.ORANGE_MONEY:
        return {
          success: false,
          error: 'Orange Money non implémenté',
        };

      case PAYMENT_METHODS.CASH:
        return {
          success: true,
          status: 'pending',
          requiresManualValidation: true,
        };

      default:
        throw new Error(`Méthode non supportée: ${paymentMethod}`);
    }
  } catch (error) {
    logger.error('Erreur vérification statut:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  initiateWavePayment,
  checkWavePaymentStatus,
  processWaveWebhook,
  refundWavePayment,
  isWaveConfigured,
  initiatePayment,
  checkPaymentStatus,
};