// controllers/validation.controller.js - LOGIQUE CORRIGÉE
const ValidationRequest = require('../models/ValidationRequest');
const User = require('../models/User');
const Tontine = require('../models/Tontine');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { getPaginationParams } = require('../utils/helpers');
const otpService = require('../services/otp.service');
const { ROLES } = require('../config/constants');

/**
 * @desc    Créer une demande de validation (ADMIN initie)
 * @route   POST /api/v1/validation/request
 * @access  Admin
 * 
 *  LOGIQUE CORRIGÉE : C'est l'ADMIN qui initie, pas le Trésorier
 */
const createValidationRequest = async (req, res) => {
  try {
    const { actionType, resourceType, resourceId, reason, assignedTresorier } = req.body;
    const admin = req.user;

    //  Vérifier que l'utilisateur est Admin
    if (admin.role !== ROLES.ADMIN) {
      return ApiResponse.forbidden(res, 'Seul un Admin peut créer une demande de validation');
    }

    // Vérifier si une demande existe déjà pour cette ressource
    const existingRequest = await ValidationRequest.existsPending(actionType, resourceId);
    if (existingRequest) {
      return ApiResponse.conflict(res, 'Une demande est déjà en cours pour cette ressource');
    }

    // Récupérer la ressource pour obtenir son nom
    let resource;
    let resourceName = 'Ressource inconnue';

    if (resourceType === 'User') {
      resource = await User.findById(resourceId);
      if (!resource) {
        return ApiResponse.notFound(res, 'Utilisateur introuvable');
      }
      resourceName = `${resource.prenom} ${resource.nom} (${resource.email})`;
    } else if (resourceType === 'Tontine') {
      resource = await Tontine.findById(resourceId);
      if (!resource) {
        return ApiResponse.notFound(res, 'Tontine introuvable');
      }
      resourceName = resource.nom;
    }

    // Trouver un Trésorier disponible (ou utiliser celui assigné)
    let tresorier;
    if (assignedTresorier) {
      tresorier = await User.findOne({ 
        _id: assignedTresorier, 
        role: ROLES.TRESORIER, 
        isActive: true 
      });
      if (!tresorier) {
        return ApiResponse.notFound(res, 'Trésorier introuvable ou inactif');
      }
    } else {
      // Trouver le premier Trésorier actif
      tresorier = await User.findOne({ role: ROLES.TRESORIER, isActive: true });
      if (!tresorier) {
        return ApiResponse.error(res, 'Aucun Trésorier disponible pour valider', 500);
      }
    }

    // Créer la demande de validation
    const validationRequest = new ValidationRequest({
      actionType,
      resourceType,
      resourceId,
      initiatedBy: admin._id,          //  ADMIN initie
      initiatedByRole: admin.role,     //  ADMIN
      assignedTresorier: tresorier._id, //  Trésorier valide
      reason,
      status: 'pending',
      metadata: {
        resourceName,
        resourceEmail: resource.email || null,
      },
    });

    //  Générer OTP pour le TRÉSORIER (pas l'Admin)
    const tresorierOTPCode = validationRequest.setTresorierOTP();

    // Sauvegarder
    await validationRequest.save();

    //  Envoyer OTP par email au TRÉSORIER
    try {
      await otpService.sendTresorierOTP(
        tresorier, 
        tresorierOTPCode, 
        actionType, 
        resourceName
      );
      validationRequest.notificationsSent.tresorierOTPSent = true;
      await validationRequest.save();
    } catch (emailError) {
      logger.error('Erreur envoi email OTP Trésorier:', emailError);
    }

    logger.info(` Demande validation créée par ADMIN ${admin.email} - Action: ${actionType} - Validation par Trésorier ${tresorier.email}`);

    return ApiResponse.success(
      res,
      {
        validationRequestId: validationRequest._id,
        actionType,
        resourceName,
        assignedTresorier: {
          prenom: tresorier.prenom,
          nom: tresorier.nom,
          email: tresorier.email,
        },
        nextStep: 'Le Trésorier doit entrer le code OTP reçu par email',
      },
      'Demande de validation créée. Le Trésorier a reçu le code.',
      201
    );
  } catch (error) {
    logger.error(' Erreur createValidationRequest:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Confirmer OTP Trésorier (validation finale)
 * @route   POST /api/v1/validation/confirm/tresorier/:validationRequestId
 * @access  Trésorier (assigné)
 * 
 *  LOGIQUE CORRIGÉE : Le Trésorier valide et l'action est exécutée
 */
const confirmTresorierOTP = async (req, res) => {
  try {
    const { code } = req.body;
    const { validationRequest, user } = req;

    // Vérifier le code
    const result = validationRequest.verifyTresorierOTP(code);

    if (!result.success) {
      await validationRequest.save(); // Sauvegarder les tentatives
      return ApiResponse.error(res, result.message, 400);
    }

    //  Validation complète - L'action peut être exécutée
    await validationRequest.save();

    // Récupérer l'Admin initiateur
    const admin = await User.findById(validationRequest.initiatedBy);

    // Envoyer notification de validation complète
    try {
      await otpService.sendValidationCompleteNotification(
        admin,
        user,
        validationRequest.actionType,
        validationRequest.metadata.resourceName
      );
      validationRequest.notificationsSent.tresorierConfirmed = true;
      await validationRequest.save();
    } catch (emailError) {
      logger.error(' Erreur envoi notification complète:', emailError);
    }

    logger.info(` Trésorier ${user.email} a validé - Action ${validationRequest.actionType} autorisée`);

    return ApiResponse.success(res, {
      status: 'completed',
      validationRequestId: validationRequest._id,
      message: 'Validation complète ! L\'action peut maintenant être exécutée.',
      actionType: validationRequest.actionType,
      resourceId: validationRequest.resourceId,
    });
  } catch (error) {
    logger.error(' Erreur confirmTresorierOTP:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Rejeter une demande de validation (Trésorier)
 * @route   POST /api/v1/validation/reject/:validationRequestId
 * @access  Trésorier
 * 
 *  LOGIQUE CORRIGÉE : Le Trésorier peut rejeter la demande de l'Admin
 */
const rejectValidationRequest = async (req, res) => {
  try {
    const { reason } = req.body;
    const { validationRequest, user } = req;

    // Rejeter
    validationRequest.reject(reason);
    await validationRequest.save();

    // Notifier l'Admin
    const admin = await User.findById(validationRequest.initiatedBy);
    try {
      await otpService.sendRejectionNotification(
        admin,
        validationRequest.actionType,
        validationRequest.metadata.resourceName,
        reason
      );
    } catch (emailError) {
      logger.error(' Erreur envoi notification rejet:', emailError);
    }

    logger.info(` Trésorier ${user.email} a rejeté la demande Admin - Raison: ${reason}`);

    return ApiResponse.success(res, {
      message: 'Demande rejetée avec succès',
      rejectionReason: reason,
    });
  } catch (error) {
    logger.error(' Erreur rejectValidationRequest:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Obtenir les demandes en attente (Trésorier)
 * @route   GET /api/v1/validation/pending
 * @access  Trésorier
 * 
 *  LOGIQUE CORRIGÉE : Le Trésorier voit les demandes des Admins
 */
const getPendingRequests = async (req, res) => {
  try {
    const tresorier = req.user;

    const requests = await ValidationRequest.getPendingForTresorier(tresorier._id);

    return ApiResponse.success(res, {
      total: requests.length,
      requests: requests.map((r) => ({
        id: r._id,
        actionType: r.actionType,
        resourceType: r.resourceType,
        resourceName: r.metadata.resourceName,
        initiatedBy: {
          prenom: r.initiatedBy.prenom,
          nom: r.initiatedBy.nom,
          email: r.initiatedBy.email,
        },
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
        expiresAt: r.tresorierOTP.codeExpiry,
      })),
    });
  } catch (error) {
    logger.error(' Erreur getPendingRequests:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Obtenir mes demandes (Admin)
 * @route   GET /api/v1/validation/my-requests
 * @access  Admin
 * 
 *  LOGIQUE CORRIGÉE : L'Admin voit ses propres demandes
 */
const getMyRequests = async (req, res) => {
  try {
    const admin = req.user;
    const { page, limit, skip } = getPaginationParams(req.query);

    const query = { initiatedBy: admin._id };

    if (req.query.status) {
      query.status = req.query.status;
    }

    const [requests, total] = await Promise.all([
      ValidationRequest.find(query)
        .populate('assignedTresorier', 'prenom nom email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip),
      ValidationRequest.countDocuments(query),
    ]);

    return ApiResponse.successWithPagination(
      res,
      requests.map((r) => ({
        id: r._id,
        actionType: r.actionType,
        resourceName: r.metadata.resourceName,
        assignedTresorier: r.assignedTresorier
          ? `${r.assignedTresorier.prenom} ${r.assignedTresorier.nom}`
          : 'Non assigné',
        status: r.status,
        tresorierValidated: r.tresorierOTP.verified,
        createdAt: r.createdAt,
      })),
      { page, limit, total }
    );
  } catch (error) {
    logger.error(' Erreur getMyRequests:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Obtenir détails d'une demande
 * @route   GET /api/v1/validation/:validationRequestId
 * @access  Admin (initiateur) ou Trésorier (assigné)
 */
const getRequestDetails = async (req, res) => {
  try {
    const { validationRequest, user } = req;

    // Vérifier autorisation
    const isAdmin = validationRequest.initiatedBy._id.toString() === user._id.toString();
    const isTresorier =
      validationRequest.assignedTresorier &&
      validationRequest.assignedTresorier._id.toString() === user._id.toString();

    if (!isAdmin && !isTresorier) {
      return ApiResponse.forbidden(res, 'Vous n\'avez pas accès à cette demande');
    }

    return ApiResponse.success(res, {
      id: validationRequest._id,
      actionType: validationRequest.actionType,
      resourceType: validationRequest.resourceType,
      resourceName: validationRequest.metadata.resourceName,
      reason: validationRequest.reason,
      status: validationRequest.status,
      initiatedBy: {
        prenom: validationRequest.initiatedBy.prenom,
        nom: validationRequest.initiatedBy.nom,
        email: validationRequest.initiatedBy.email,
        role: 'Admin',
      },
      assignedTresorier: validationRequest.assignedTresorier
        ? {
            prenom: validationRequest.assignedTresorier.prenom,
            nom: validationRequest.assignedTresorier.nom,
            email: validationRequest.assignedTresorier.email,
          }
        : null,
      tresorier: {
        verified: validationRequest.tresorierOTP.verified,
        verifiedAt: validationRequest.tresorierOTP.verifiedAt,
        attemptsRemaining: 3 - validationRequest.tresorierOTP.attempts,
        expiresAt: validationRequest.tresorierOTP.codeExpiry,
      },
      createdAt: validationRequest.createdAt,
      completedAt: validationRequest.completedAt,
      rejectedAt: validationRequest.rejectedAt,
      rejectionReason: validationRequest.rejectionReason,
    });
  } catch (error) {
    logger.error(' Erreur getRequestDetails:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Renvoyer un code OTP
 * @route   POST /api/v1/validation/resend-otp/:validationRequestId
 * @access  Trésorier
 */
const resendOTP = async (req, res) => {
  try {
    const { validationRequest, user } = req;

    // Vérifier que c'est le Trésorier assigné
    if (
      !validationRequest.assignedTresorier ||
      validationRequest.assignedTresorier._id.toString() !== user._id.toString()
    ) {
      return ApiResponse.forbidden(res, 'Seul le Trésorier assigné peut renvoyer son OTP');
    }

    // Régénérer OTP
    const newCode = validationRequest.setTresorierOTP();
    await validationRequest.save();

    // Renvoyer email
    await otpService.sendTresorierOTP(
      user,
      newCode,
      validationRequest.actionType,
      validationRequest.metadata.resourceName
    );

    return ApiResponse.success(res, { message: 'Code Trésorier renvoyé par email' });
  } catch (error) {
    logger.error(' Erreur resendOTP:', error);
    return ApiResponse.serverError(res);
  }
};

module.exports = {
  createValidationRequest,
  confirmTresorierOTP,
  rejectValidationRequest,
  getPendingRequests,
  getMyRequests,
  getRequestDetails,
  resendOTP,
};