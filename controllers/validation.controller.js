// controllers/validation.controller.js
const ValidationRequest = require('../models/ValidationRequest');
const User = require('../models/User');
const Tontine = require('../models/Tontine');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { getPaginationParams } = require('../utils/helpers');
const otpService = require('../services/otp.service');
const { ROLES } = require('../config/constants');

/**
 * @desc    Créer une demande de validation (Trésorier initie)
 * @route   POST /api/v1/validation/request
 * @access  Trésorier
 */
const createValidationRequest = async (req, res) => {
  try {
    const { actionType, resourceType, resourceId, reason, assignedAdminId } = req.body;
    const tresorier = req.user;

    // Vérifier que l'utilisateur est Trésorier
    if (tresorier.role !== ROLES.TRESORIER) {
      return ApiResponse.forbidden(res, 'Seul un Trésorier peut créer une demande de validation');
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

    // Trouver un Admin disponible (ou utiliser celui assigné)
    let admin;
    if (assignedAdminId) {
      admin = await User.findOne({ _id: assignedAdminId, role: ROLES.ADMIN, isActive: true });
      if (!admin) {
        return ApiResponse.notFound(res, 'Admin introuvable ou inactif');
      }
    } else {
      // Trouver le premier Admin actif
      admin = await User.findOne({ role: ROLES.ADMIN, isActive: true });
      if (!admin) {
        return ApiResponse.error(res, 'Aucun Admin disponible pour valider', 500);
      }
    }

    // Créer la demande de validation
    const validationRequest = new ValidationRequest({
      actionType,
      resourceType,
      resourceId,
      initiatedBy: tresorier._id,
      initiatedByRole: tresorier.role,
      assignedAdmin: admin._id,
      reason,
      status: 'pending',
      metadata: {
        resourceName,
        resourceEmail: resource.email || null,
      },
    });

    // Générer OTP Trésorier
    const tresorierOTPCode = validationRequest.setTresorierOTP();

    // Sauvegarder
    await validationRequest.save();

    // Envoyer OTP par email au Trésorier
    try {
      await otpService.sendTresorierOTP(tresorier, tresorierOTPCode, actionType, resourceName);
      validationRequest.notificationsSent.tresorierOTPSent = true;
      await validationRequest.save();
    } catch (emailError) {
      logger.error('❌ Erreur envoi email OTP Trésorier:', emailError);
      // On continue quand même
    }

    logger.info(`📝 Demande de validation créée - ${actionType} pour ${resourceName} par ${tresorier.email}`);

    return ApiResponse.success(
      res,
      {
        validationRequestId: validationRequest._id,
        actionType,
        resourceName,
        assignedAdmin: {
          prenom: admin.prenom,
          nom: admin.nom,
          email: admin.email,
        },
        nextStep: 'Entrez le code OTP reçu par email pour confirmer',
      },
      'Demande de validation créée. Vérifiez votre email.',
      201
    );
  } catch (error) {
    logger.error('❌ Erreur createValidationRequest:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Confirmer OTP Trésorier
 * @route   POST /api/v1/validation/confirm/tresorier/:validationRequestId
 * @access  Trésorier (initiateur)
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

    // Générer OTP Admin maintenant
    const adminOTPCode = validationRequest.setAdminOTP();
    await validationRequest.save();

    // Récupérer l'Admin
    const admin = await User.findById(validationRequest.assignedAdmin);

    // Envoyer OTP à l'Admin
    try {
      await otpService.sendAdminOTP(
        admin,
        adminOTPCode,
        validationRequest.actionType,
        validationRequest.metadata.resourceName,
        user
      );
      validationRequest.notificationsSent.adminOTPSent = true;
      validationRequest.notificationsSent.tresorierConfirmed = true;
      await validationRequest.save();
    } catch (emailError) {
      logger.error('❌ Erreur envoi email OTP Admin:', emailError);
    }

    logger.info(`✅ Trésorier ${user.email} a validé son OTP - En attente Admin`);

    return ApiResponse.success(res, {
      status: validationRequest.status,
      message: 'Code Trésorier validé. L\'Admin a reçu son code de validation.',
      nextStep: 'Attendre que l\'Admin entre son code OTP',
    });
  } catch (error) {
    logger.error('❌ Erreur confirmTresorierOTP:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Confirmer OTP Admin
 * @route   POST /api/v1/validation/confirm/admin/:validationRequestId
 * @access  Admin (assigné)
 */
const confirmAdminOTP = async (req, res) => {
  try {
    const { code } = req.body;
    const { validationRequest, user } = req;

    // Vérifier le code
    const result = validationRequest.verifyAdminOTP(code);

    if (!result.success) {
      await validationRequest.save(); // Sauvegarder les tentatives
      return ApiResponse.error(res, result.message, 400);
    }

    await validationRequest.save();

    // Récupérer le Trésorier
    const tresorier = await User.findById(validationRequest.initiatedBy);

    // Envoyer notification de validation complète
    try {
      await otpService.sendValidationCompleteNotification(
        tresorier,
        user,
        validationRequest.actionType,
        validationRequest.metadata.resourceName
      );
      validationRequest.notificationsSent.adminConfirmed = true;
      await validationRequest.save();
    } catch (emailError) {
      logger.error('❌ Erreur envoi notification complète:', emailError);
    }

    logger.info(`✅ Admin ${user.email} a validé - Action ${validationRequest.actionType} autorisée`);

    return ApiResponse.success(res, {
      status: 'completed',
      validationRequestId: validationRequest._id,
      message: 'Validation complète ! L\'action peut maintenant être exécutée.',
      actionType: validationRequest.actionType,
      resourceId: validationRequest.resourceId,
    });
  } catch (error) {
    logger.error('❌ Erreur confirmAdminOTP:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Rejeter une demande de validation (Admin)
 * @route   POST /api/v1/validation/reject/:validationRequestId
 * @access  Admin
 */
const rejectValidationRequest = async (req, res) => {
  try {
    const { reason } = req.body;
    const { validationRequest, user } = req;

    // Rejeter
    validationRequest.reject(reason);
    await validationRequest.save();

    // Notifier le Trésorier
    const tresorier = await User.findById(validationRequest.initiatedBy);
    try {
      await otpService.sendRejectionNotification(
        tresorier,
        validationRequest.actionType,
        validationRequest.metadata.resourceName,
        reason
      );
    } catch (emailError) {
      logger.error('❌ Erreur envoi notification rejet:', emailError);
    }

    logger.info(`❌ Admin ${user.email} a rejeté la demande - Raison: ${reason}`);

    return ApiResponse.success(res, {
      message: 'Demande rejetée avec succès',
      rejectionReason: reason,
    });
  } catch (error) {
    logger.error('❌ Erreur rejectValidationRequest:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Obtenir les demandes en attente (Admin)
 * @route   GET /api/v1/validation/pending
 * @access  Admin
 */
const getPendingRequests = async (req, res) => {
  try {
    const admin = req.user;

    const requests = await ValidationRequest.getPendingForAdmin(admin._id);

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
        tresorierValidated: r.tresorierOTP.verified,
        createdAt: r.createdAt,
        expiresAt: r.adminOTP.codeExpiry || r.tresorierOTP.codeExpiry,
      })),
    });
  } catch (error) {
    logger.error('❌ Erreur getPendingRequests:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Obtenir mes demandes (Trésorier)
 * @route   GET /api/v1/validation/my-requests
 * @access  Trésorier
 */
const getMyRequests = async (req, res) => {
  try {
    const tresorier = req.user;
    const { page, limit, skip } = getPaginationParams(req.query);

    const query = { initiatedBy: tresorier._id };

    if (req.query.status) {
      query.status = req.query.status;
    }

    const [requests, total] = await Promise.all([
      ValidationRequest.find(query)
        .populate('assignedAdmin', 'prenom nom email')
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
        assignedAdmin: r.assignedAdmin
          ? `${r.assignedAdmin.prenom} ${r.assignedAdmin.nom}`
          : 'Non assigné',
        status: r.status,
        tresorierValidated: r.tresorierOTP.verified,
        adminValidated: r.adminOTP.verified,
        createdAt: r.createdAt,
      })),
      { page, limit, total }
    );
  } catch (error) {
    logger.error('❌ Erreur getMyRequests:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Obtenir détails d'une demande
 * @route   GET /api/v1/validation/:validationRequestId
 * @access  Trésorier (initiateur) ou Admin (assigné)
 */
const getRequestDetails = async (req, res) => {
  try {
    const { validationRequest, user } = req;

    // Vérifier autorisation
    const isTresorier = validationRequest.initiatedBy._id.toString() === user._id.toString();
    const isAdmin =
      validationRequest.assignedAdmin &&
      validationRequest.assignedAdmin._id.toString() === user._id.toString();

    if (!isTresorier && !isAdmin && user.role !== ROLES.ADMIN) {
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
      },
      assignedAdmin: validationRequest.assignedAdmin
        ? {
            prenom: validationRequest.assignedAdmin.prenom,
            nom: validationRequest.assignedAdmin.nom,
            email: validationRequest.assignedAdmin.email,
          }
        : null,
      tresorier: {
        verified: validationRequest.tresorierOTP.verified,
        verifiedAt: validationRequest.tresorierOTP.verifiedAt,
        attemptsRemaining: 3 - validationRequest.tresorierOTP.attempts,
        expiresAt: validationRequest.tresorierOTP.codeExpiry,
      },
      admin: {
        verified: validationRequest.adminOTP.verified,
        verifiedAt: validationRequest.adminOTP.verifiedAt,
        attemptsRemaining: 3 - validationRequest.adminOTP.attempts,
        expiresAt: validationRequest.adminOTP.codeExpiry,
      },
      createdAt: validationRequest.createdAt,
      completedAt: validationRequest.completedAt,
      rejectedAt: validationRequest.rejectedAt,
      rejectionReason: validationRequest.rejectionReason,
    });
  } catch (error) {
    logger.error('❌ Erreur getRequestDetails:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Renvoyer un code OTP
 * @route   POST /api/v1/validation/resend-otp/:validationRequestId
 * @access  Trésorier (pour son OTP) ou Admin (pour son OTP)
 */
const resendOTP = async (req, res) => {
  try {
    const { otpType } = req.body;
    const { validationRequest, user } = req;

    if (otpType === 'tresorier') {
      // Vérifier que c'est le Trésorier initiateur
      if (validationRequest.initiatedBy._id.toString() !== user._id.toString()) {
        return ApiResponse.forbidden(res, 'Seul le Trésorier initiateur peut renvoyer son OTP');
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
    } else if (otpType === 'admin') {
      // Vérifier que c'est l'Admin assigné
      if (
        !validationRequest.assignedAdmin ||
        validationRequest.assignedAdmin._id.toString() !== user._id.toString()
      ) {
        return ApiResponse.forbidden(res, 'Seul l\'Admin assigné peut renvoyer son OTP');
      }

      // Vérifier que le Trésorier a déjà validé
      if (!validationRequest.tresorierOTP.verified) {
        return ApiResponse.error(res, 'Le Trésorier doit valider en premier', 400);
      }

      // Régénérer OTP
      const newCode = validationRequest.setAdminOTP();
      await validationRequest.save();

      // Renvoyer email
      const tresorier = await User.findById(validationRequest.initiatedBy);
      await otpService.sendAdminOTP(
        user,
        newCode,
        validationRequest.actionType,
        validationRequest.metadata.resourceName,
        tresorier
      );

      return ApiResponse.success(res, { message: 'Code Admin renvoyé par email' });
    }

    return ApiResponse.error(res, 'Type d\'OTP invalide', 400);
  } catch (error) {
    logger.error('❌ Erreur resendOTP:', error);
    return ApiResponse.serverError(res);
  }
};

module.exports = {
  createValidationRequest,
  confirmTresorierOTP,
  confirmAdminOTP,
  rejectValidationRequest,
  getPendingRequests,
  getMyRequests,
  getRequestDetails,
  resendOTP,
};