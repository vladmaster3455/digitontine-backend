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

    // Générer  new accept
    //  Créer notification pour le Trésorier
    const notificationService = require('../services/notification.service');
    const notifResult = await notificationService.sendValidationRequestNotification(
      tresorier,
      admin,
      validationRequest,
      actionType,
      resourceName
    );

    if (!notifResult.success) {
      logger.error('Erreur création notification:', notifResult.error);
      return ApiResponse.error(res, 'Erreur lors de la création de la notification', 500);
    }

    validationRequest.notificationId = notifResult.notification._id;
    await validationRequest.save();

    //  Envoyer email informatif (pas d'OTP)
    try {
      const emailService = require('../services/email.service');
      await emailService.sendValidationRequestEmail(tresorier, admin, actionType, resourceName);
    } catch (emailError) {
      logger.error('Erreur envoi email:', emailError);
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
       nextStep: 'Le Trésorier doit accepter ou refuser cette demande via sa notification',
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
 * @desc    Accepter une demande de validation
 * @route   POST /api/v1/validation/accept/:validationRequestId
 * @access  Trésorier (assigné)
 */
const acceptValidation = async (req, res) => {
  try {
    const { validationRequest, user } = req;

    // Accepter la demande
    validationRequest.accept();
    await validationRequest.save();

    // Récupérer l'Admin initiateur
    const admin = await User.findById(validationRequest.initiatedBy);

    // Créer notification pour l'Admin
    const Notification = require('../models/Notification');
    await Notification.create({
      userId: admin._id,
      type: 'SYSTEM',
      titre: `Demande acceptée par ${user.nomComplet}`,
      message: `Votre demande "${validationRequest.actionType}" pour "${validationRequest.metadata.resourceName}" a été acceptée. Vous pouvez maintenant exécuter l'action.`,
      data: { validationRequestId: validationRequest._id },
      requiresAction: false,
    });

    // Envoyer email à l'Admin
    try {
      const emailService = require('../services/email.service');
      await emailService.sendValidationAcceptedEmail(
        admin,
        user,
        validationRequest.actionType,
        validationRequest.metadata.resourceName
      );
    } catch (emailError) {
      logger.error('Erreur envoi email acceptation:', emailError);
    }

    logger.info(`Trésorier ${user.email} a accepté - Action ${validationRequest.actionType}`);

    return ApiResponse.success(res, {
      status: 'accepted',
      validationRequestId: validationRequest._id,
      message: 'Demande acceptée ! L\'Admin peut maintenant exécuter l\'action.',
      actionType: validationRequest.actionType,
      resourceId: validationRequest.resourceId,
    });
  } catch (error) {
    logger.error('Erreur acceptValidation:', error);
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
   // Notifier l'Admin
    const admin = await User.findById(validationRequest.initiatedBy);
    
    // Créer notification
    const Notification = require('../models/Notification');
    await Notification.create({
      userId: admin._id,
      type: 'SYSTEM',
      titre: ` Demande refusée par ${user.nomComplet}`,
      message: `Votre demande "${validationRequest.actionType}" pour "${validationRequest.metadata.resourceName}" a été refusée. Raison : ${reason}`,
      data: { validationRequestId: validationRequest._id },
      requiresAction: false,
    });

    // Envoyer email
    try {
      const emailService = require('../services/email.service');
      await emailService.sendValidationRejectedEmail(admin, validationRequest, reason);
    } catch (emailError) {
      logger.error('Erreur envoi email rejet:', emailError);
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
        expiresAt: r.expiresAt,
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
        hasAccepted: validationRequest.status === 'accepted',
        expiresAt: validationRequest.expiresAt,
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



module.exports = {
  createValidationRequest,
  acceptValidation, 
  rejectValidationRequest,
  getPendingRequests,
  getMyRequests,
  getRequestDetails,

};