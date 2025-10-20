// controllers/user.controller.js
const User = require('../models/User');
const ValidationRequest = require('../models/ValidationRequest');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { 
  generateTemporaryPassword, 
  getPaginationParams, 
  normalizePhoneNumber,
  calculateAge,
} = require('../utils/helpers');
const { ROLES } = require('../config/constants');
const emailService = require('../services/email.service');
const { deleteImage, getPublicIdFromUrl } = require('../services/cloudinary.service');

/**
 * @desc    Créer un compte Membre (par Admin) AVEC PHOTO
 * @route   POST /api/v1/users/membre
 * @access  Admin
 */
const createMembre = async (req, res) => {
  try {
    const { prenom, nom, email, numeroTelephone, adresse, carteIdentite, dateNaissance } = req.body;
    const admin = req.user;

    // Vérifications manuelles pour les champs critiques
    if (!email) {
      if (req.file) await deleteImage(req.file.filename);
      return ApiResponse.error(res, "L'email est requis", 400);
    }
    if (!numeroTelephone) {
      if (req.file) await deleteImage(req.file.filename);
      return ApiResponse.error(res, "Le numéro de téléphone est requis", 400);
    }

    // Vérifications unicité
    if (await User.emailExists(email)) {
      if (req.file) await deleteImage(req.file.filename);
      return ApiResponse.conflict(res, 'Un utilisateur avec cet email existe déjà');
    }

    const normalizedPhone = normalizePhoneNumber(numeroTelephone);
    if (await User.phoneExists(normalizedPhone)) {
      if (req.file) await deleteImage(req.file.filename);
      return ApiResponse.conflict(res, 'Un utilisateur avec ce numéro existe déjà');
    }

    if (carteIdentite && await User.carteIdentiteExists(carteIdentite)) {
      if (req.file) await deleteImage(req.file.filename);
      return ApiResponse.conflict(res, 'Cette carte d\'identité est déjà enregistrée');
    }

    if (dateNaissance) {
      const age = calculateAge(dateNaissance);
      if (age < 18) {
        if (req.file) await deleteImage(req.file.filename);
        return ApiResponse.error(res, "L'utilisateur doit avoir au moins 18 ans", 400);
      }
    }

    const temporaryPassword = generateTemporaryPassword();

    // Préparer l'objet photoIdentite (optionnel)
    const photoIdentite = req.file
      ? {
          url: req.file.path,
          publicId: req.file.filename,
          uploadedAt: Date.now(),
          isLocked: true,
        }
      : undefined;

    const user = await User.create({
      prenom,
      nom,
      email: email.toLowerCase(),
      numeroTelephone: normalizedPhone,
      adresse,
      carteIdentite: carteIdentite?.toUpperCase(),
      dateNaissance,
      photoIdentite, // Undefined si pas de fichier
      motDePasse: temporaryPassword,
      role: ROLES.MEMBRE,
      isFirstLogin: true,
      createdBy: admin._id,
    });

    logger.info(`Membre créé${req.file ? ' avec photo' : ' sans photo'} - ${user.email} par ${admin.email}`);

    try {
      await emailService.sendAccountCredentials(user, temporaryPassword);
    } catch (emailError) {
      logger.error('Erreur envoi email:', emailError);
    }

    return ApiResponse.success(
      res,
      {
        user: {
          id: user._id,
          prenom: user.prenom,
          nom: user.nom,
          email: user.email,
          numeroTelephone: user.numeroTelephone,
          role: user.role,
          photoIdentite: user.photoIdentite?.url,
        },
        temporaryPassword: process.env.NODE_ENV === 'development' ? temporaryPassword : undefined,
      },
      'Membre créé avec succès',
      201
    );
  } catch (error) {
    if (req.file) {
      await deleteImage(req.file.filename);
    }
    logger.error('Erreur createMembre:', { message: error.message, stack: error.stack });
    return ApiResponse.serverError(res, error.message);
  }
};

/**
 * @desc    Créer un compte Trésorier (par Admin) AVEC PHOTO
 * @route   POST /api/v1/users/tresorier
 * @access  Admin
 */
const createTresorier = async (req, res) => {
  try {
    const { prenom, nom, email, numeroTelephone, adresse, carteIdentite, dateNaissance } = req.body;
    const admin = req.user;

    // Vérifications manuelles pour les champs critiques
    if (!email) {
      if (req.file) await deleteImage(req.file.filename);
      return ApiResponse.error(res, "L'email est requis", 400);
    }
    if (!numeroTelephone) {
      if (req.file) await deleteImage(req.file.filename);
      return ApiResponse.error(res, "Le numéro de téléphone est requis", 400);
    }

    // Vérifications unicité
    if (await User.emailExists(email)) {
      if (req.file) await deleteImage(req.file.filename);
      return ApiResponse.conflict(res, 'Un utilisateur avec cet email existe déjà');
    }

    const normalizedPhone = normalizePhoneNumber(numeroTelephone);
    if (await User.phoneExists(normalizedPhone)) {
      if (req.file) await deleteImage(req.file.filename);
      return ApiResponse.conflict(res, 'Un utilisateur avec ce numéro existe déjà');
    }

    if (carteIdentite && await User.carteIdentiteExists(carteIdentite)) {
      if (req.file) await deleteImage(req.file.filename);
      return ApiResponse.conflict(res, 'Cette carte d\'identité est déjà enregistrée');
    }

    if (dateNaissance) {
      const age = calculateAge(dateNaissance);
      if (age < 18) {
        if (req.file) await deleteImage(req.file.filename);
        return ApiResponse.error(res, "L'utilisateur doit avoir au moins 18 ans", 400);
      }
    }

    const temporaryPassword = generateTemporaryPassword();

    // Préparer l'objet photoIdentite (optionnel)
    const photoIdentite = req.file
      ? {
          url: req.file.path,
          publicId: req.file.filename,
          uploadedAt: Date.now(),
          isLocked: true,
        }
      : undefined;

    const user = await User.create({
      prenom,
      nom,
      email: email.toLowerCase(),
      numeroTelephone: normalizedPhone,
      adresse,
      carteIdentite: carteIdentite?.toUpperCase(),
      dateNaissance,
      photoIdentite, // Undefined si pas de fichier
      motDePasse: temporaryPassword,
      role: ROLES.TRESORIER,
      isFirstLogin: true,
      createdBy: admin._id,
    });

    logger.info(`Trésorier créé${req.file ? ' avec photo' : ' sans photo'} - ${user.email} par ${admin.email}`);

    try {
      await emailService.sendAccountCredentials(user, temporaryPassword);
    } catch (emailError) {
      logger.error('Erreur envoi email:', emailError);
    }

    return ApiResponse.success(
      res,
      {
        user: {
          id: user._id,
          prenom: user.prenom,
          nom: user.nom,
          email: user.email,
          numeroTelephone: user.numeroTelephone,
          role: user.role,
          photoIdentite: user.photoIdentite?.url,
        },
        temporaryPassword: process.env.NODE_ENV === 'development' ? temporaryPassword : undefined,
      },
      'Trésorier créé avec succès',
      201
    );
  } catch (error) {
    if (req.file) {
      await deleteImage(req.file.filename);
    }
    logger.error('Erreur createTresorier:', { message: error.message, stack: error.stack });
    return ApiResponse.serverError(res, error.message);
  }
};
/**
 *  @desc    Mettre à jour la photo de profil (MODIFIABLE)
 * @route   PUT /api/v1/users/me/photo-profil
 * @access  Private (tous)
 */
const updateProfilePhoto = async (req, res) => {
  try {
    const user = req.user;

    // Si aucun fichier n'est fourni, retourner une réponse sans erreur
    if (!req.file) {
      return ApiResponse.success(res, {
        photoProfil: user.photoProfil || null,
      }, 'Aucune nouvelle photo fournie, profil inchangé');
    }

    // Supprimer l'ancienne photo si elle existe
    if (user.photoProfil?.publicId) {
      try {
        await deleteImage(user.photoProfil.publicId);
      } catch (error) {
        logger.warn('Impossible de supprimer l\'ancienne photo:', error);
      }
    }

    // Mettre à jour avec la nouvelle photo
    user.updateProfilePhoto(req.file.path, req.file.filename);
    await user.save();

    logger.info(`Photo de profil mise à jour - ${user.email}`);

    return ApiResponse.success(res, {
      photoProfil: {
        url: user.photoProfil.url,
        uploadedAt: user.photoProfil.uploadedAt,
      },
    }, 'Photo de profil mise à jour');
  } catch (error) {
    if (req.file) {
      await deleteImage(req.file.filename);
    }
    logger.error('Erreur updateProfilePhoto:', error);
    return ApiResponse.serverError(res);
  }
};
/**
 *  @desc    Supprimer la photo de profil
 * @route   DELETE /api/v1/users/me/photo-profil
 * @access  Private (tous)
 */
const deleteProfilePhoto = async (req, res) => {
  try {
    const user = req.user;

    if (!user.photoProfil?.publicId) {
      return ApiResponse.error(res, 'Aucune photo de profil à supprimer', 400);
    }

    // Supprimer de Cloudinary
    await deleteImage(user.photoProfil.publicId);

    // Supprimer de la base de données
    user.photoProfil = undefined;
    await user.save();

    logger.info(` Photo de profil supprimée - ${user.email}`);

    return ApiResponse.success(res, {
      message: 'Photo de profil supprimée',
    });
  } catch (error) {
    logger.error(' Erreur deleteProfilePhoto:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Modifier un compte utilisateur (par Admin)
 * @route   PUT /api/v1/users/:userId
 * @access  Admin
 */
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { prenom, nom, email, numeroTelephone, adresse, dateNaissance, role } = req.body;
    const admin = req.user;

    const user = await User.findById(userId);
    if (!user) {
      return ApiResponse.notFound(res, 'Utilisateur introuvable');
    }

    if (user._id.toString() === admin._id.toString()) {
      return ApiResponse.error(res, 'Utilisez la route /auth/me pour modifier votre profil', 400);
    }

    // ⚠️ LA PHOTO D'IDENTITÉ N'EST JAMAIS MODIFIABLE
    if (req.body.photoIdentite || req.file) {
      return ApiResponse.error(res, 'La photo d\'identité ne peut pas être modifiée', 403);
    }

    if (email && email.toLowerCase() !== user.email) {
      if (await User.emailExists(email, userId)) {
        return ApiResponse.conflict(res, 'Cet email est déjà utilisé');
      }
      user.email = email.toLowerCase();
    }

    if (numeroTelephone) {
      const normalizedPhone = normalizePhoneNumber(numeroTelephone);
      if (normalizedPhone !== user.numeroTelephone) {
        if (await User.phoneExists(normalizedPhone, userId)) {
          return ApiResponse.conflict(res, 'Ce numéro est déjà utilisé');
        }
        user.numeroTelephone = normalizedPhone;
      }
    }

    if (dateNaissance) {
      const age = calculateAge(dateNaissance);
      if (age < 18) {
        return ApiResponse.error(res, 'L\'utilisateur doit avoir au moins 18 ans', 400);
      }
      user.dateNaissance = dateNaissance;
    }

    if (role && role !== user.role) {
      if (![ROLES.MEMBRE, ROLES.TRESORIER].includes(role)) {
        return ApiResponse.error(res, 'Rôle invalide', 400);
      }
      const oldRole = user.role;
      user.role = role;
      logger.info(` Changement de rôle - ${user.email}: ${oldRole} → ${role} par ${admin.email}`);
    }

    if (prenom) user.prenom = prenom;
    if (nom) user.nom = nom;
    if (adresse) user.adresse = adresse;

    user.lastModifiedBy = admin._id;
    await user.save();

    logger.info(` Utilisateur modifié - ${user.email} par ${admin.email}`);

    return ApiResponse.success(
      res,
      {
        user: {
          id: user._id,
          prenom: user.prenom,
          nom: user.nom,
          email: user.email,
          numeroTelephone: user.numeroTelephone,
          adresse: user.adresse,
          role: user.role,
          photoIdentite: user.photoIdentite.url,
          photoProfil: user.photoProfil?.url,
        },
      },
      'Utilisateur modifié avec succès'
    );
  } catch (error) {
    logger.error(' Erreur updateUser:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Modifier son propre profil
 * @route   PUT /api/v1/users/me
 * @access  Private
 */
const updateMyProfile = async (req, res) => {
  try {
    const { numeroTelephone, adresse, preferences } = req.body;
    const user = req.user;

    if (numeroTelephone) {
      const normalizedPhone = normalizePhoneNumber(numeroTelephone);
      if (normalizedPhone !== user.numeroTelephone) {
        if (await User.phoneExists(normalizedPhone, user._id)) {
          return ApiResponse.conflict(res, 'Ce numéro est déjà utilisé');
        }
        user.numeroTelephone = normalizedPhone;
      }
    }

    if (adresse !== undefined) user.adresse = adresse;
    if (preferences) {
      user.preferences = {
        ...user.preferences,
        ...preferences,
      };
    }

    await user.save();

    logger.info(` Profil modifié - ${user.email}`);

    return ApiResponse.success(
      res,
      {
        user: {
          id: user._id,
          prenom: user.prenom,
          nom: user.nom,
          email: user.email,
          numeroTelephone: user.numeroTelephone,
          adresse: user.adresse,
          preferences: user.preferences,
          photoIdentite: user.photoIdentite.url,
          photoProfil: user.photoProfil?.url,
        },
      },
      'Profil modifié avec succès'
    );
  } catch (error) {
    logger.error(' Erreur updateMyProfile:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Liste et recherche d'utilisateurs
 * @route   GET /api/v1/users
 * @access  Admin
 */
const listUsers = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req.query);
    const { role, isActive, search } = req.query;

    const query = {};

    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { prenom: { $regex: search, $options: 'i' } },
        { nom: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { numeroTelephone: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-motDePasse -resetPasswordToken -fcmTokens -loginHistory')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip),
      User.countDocuments(query),
    ]);

    return ApiResponse.successWithPagination(
      res,
      users.map(user => ({
        id: user._id,
        prenom: user.prenom,
        nom: user.nom,
        nomComplet: user.nomComplet,
        email: user.email,
        numeroTelephone: user.numeroTelephone,
        role: user.role,
        isActive: user.isActive,
        photoIdentite: user.photoIdentite.url,
        photoProfil: user.photoProfil?.url,
        createdAt: user.createdAt,
      })),
      { page, limit, total }
    );
  } catch (error) {
    logger.error(' Erreur listUsers:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Obtenir détails d'un utilisateur
 * @route   GET /api/v1/users/:userId
 * @access  Admin ou utilisateur lui-même
 */
const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;

    if (currentUser.role !== ROLES.ADMIN && currentUser._id.toString() !== userId) {
      return ApiResponse.forbidden(res, 'Vous ne pouvez consulter que votre propre profil');
    }

    const user = await User.findById(userId)
      .select('-motDePasse -resetPasswordToken')
      .populate('createdBy', 'prenom nom email')
      .populate('lastModifiedBy', 'prenom nom email');

    if (!user) {
      return ApiResponse.notFound(res, 'Utilisateur introuvable');
    }

    return ApiResponse.success(res, {
      user: {
        id: user._id,
        prenom: user.prenom,
        nom: user.nom,
        nomComplet: user.nomComplet,
        email: user.email,
        numeroTelephone: user.numeroTelephone,
        adresse: user.adresse,
        carteIdentite: user.carteIdentite,
        dateNaissance: user.dateNaissance,
        age: user.age,
        photoIdentite: user.photoIdentite.url,
        photoProfil: user.photoProfil?.url,
        role: user.role,
        isActive: user.isActive,
        isFirstLogin: user.isFirstLogin,
        lastPasswordChange: user.lastPasswordChange,
        preferences: user.preferences,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        createdBy: user.createdBy,
        lastModifiedBy: user.lastModifiedBy,
        loginHistory: currentUser.role === ROLES.ADMIN ? user.loginHistory.slice(-10) : undefined,
      },
    });
  } catch (error) {
    logger.error(' Erreur getUserDetails:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Activer/Désactiver compte utilisateur
 * @route   POST /api/v1/users/:userId/toggle-activation
 * @access  Admin (avec ValidationRequest)
 */
const toggleActivation = async (req, res) => {
  try {
    const { userId } = req.params;
    const { validationRequestId, raison } = req.body;
    const admin = req.user;

    const user = await User.findById(userId);
    if (!user) {
      return ApiResponse.notFound(res, 'Utilisateur introuvable');
    }

    if (user._id.toString() === admin._id.toString()) {
      return ApiResponse.error(res, 'Vous ne pouvez pas désactiver votre propre compte', 400);
    }

    if (!validationRequestId) {
      return ApiResponse.error(
        res,
        'Cette action nécessite une validation. Créez une demande via /api/v1/validation/request',
        400
      );
    }

    const validationRequest = await ValidationRequest.findById(validationRequestId);
    if (!validationRequest || validationRequest.status !== 'completed') {
      return ApiResponse.error(res, 'Validation incomplète ou invalide', 403);
    }

    const expectedAction = user.isActive ? 'DEACTIVATE_USER' : 'ACTIVATE_USER';
    if (
      validationRequest.actionType !== expectedAction ||
      validationRequest.resourceId.toString() !== userId
    ) {
      return ApiResponse.error(res, 'La validation ne correspond pas à cette action', 403);
    }

    user.isActive = !user.isActive;
    user.lastModifiedBy = admin._id;
    await user.save();

    const action = user.isActive ? 'activé' : 'désactivé';
    logger.info(` Compte ${action} - ${user.email} par ${admin.email}`);

    if (!user.isActive) {
      try {
        await emailService.sendAccountDeactivatedNotification(user, raison);
      } catch (emailError) {
        logger.error(' Erreur envoi notification:', emailError);
      }
    }

    return ApiResponse.success(
      res,
      {
        user: {
          id: user._id,
          email: user.email,
          isActive: user.isActive,
        },
        validation: {
          requestId: validationRequest._id,
          completedAt: validationRequest.completedAt,
        },
      },
      `Compte ${action} avec succès`
    );
  } catch (error) {
    logger.error(' Erreur toggleActivation:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Supprimer compte utilisateur
 * @route   DELETE /api/v1/users/:userId
 * @access  Admin (avec ValidationRequest)
 */
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { validationRequestId, confirmation } = req.body;
    const admin = req.user;

    if (confirmation !== 'SUPPRIMER') {
      return ApiResponse.error(res, 'Vous devez taper "SUPPRIMER" pour confirmer', 400);
    }

    const user = await User.findById(userId);
    if (!user) {
      return ApiResponse.notFound(res, 'Utilisateur introuvable');
    }

    if (user._id.toString() === admin._id.toString()) {
      return ApiResponse.error(res, 'Vous ne pouvez pas supprimer votre propre compte', 400);
    }

    if (!validationRequestId) {
      return ApiResponse.error(
        res,
        'Cette action nécessite une validation. Créez une demande via /api/v1/validation/request',
        400
      );
    }

    const validationRequest = await ValidationRequest.findById(validationRequestId);
    if (!validationRequest || validationRequest.status !== 'completed') {
      return ApiResponse.error(res, 'Validation incomplète ou invalide', 403);
    }

    if (
      validationRequest.actionType !== 'DELETE_USER' ||
      validationRequest.resourceId.toString() !== userId
    ) {
      return ApiResponse.error(res, 'La validation ne correspond pas à cette action', 403);
    }

    //  SUPPRIMER LES PHOTOS DE CLOUDINARY
    try {
      if (user.photoIdentite?.publicId) {
        await deleteImage(user.photoIdentite.publicId);
      }
      if (user.photoProfil?.publicId) {
        await deleteImage(user.photoProfil.publicId);
      }
    } catch (cloudinaryError) {
      logger.warn('Erreur suppression photos Cloudinary:', cloudinaryError);
    }

    await user.deleteOne();

    logger.info(` Utilisateur supprimé - ${user.email} par ${admin.email}`);

    return ApiResponse.success(
      res,
      {
        message: 'Utilisateur supprimé avec succès',
        deletedUser: {
          id: user._id,
          email: user.email,
        },
      },
      'Utilisateur supprimé avec succès'
    );
  } catch (error) {
    logger.error(' Erreur deleteUser:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Réinitialiser mot de passe utilisateur
 * @route   POST /api/v1/users/:userId/reset-password
 * @access  Admin
 */
const adminResetPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { notifyUser = true } = req.body;
    const admin = req.user;

    const user = await User.findById(userId);
    if (!user) {
      return ApiResponse.notFound(res, 'Utilisateur introuvable');
    }

    const newPassword = generateTemporaryPassword();

    user.motDePasse = newPassword;
    user.isFirstLogin = true;
    user.lastPasswordChange = Date.now();
    user.lastModifiedBy = admin._id;
    await user.save();

    logger.info(` MDP réinitialisé par admin - ${user.email} par ${admin.email}`);

    if (notifyUser) {
      try {
        await emailService.sendAccountCredentials(user, newPassword);
        logger.info(` Email nouveau MDP envoyé à ${user.email}`);
      } catch (emailError) {
        logger.error(' Erreur envoi email:', emailError);
      }
    }

    return ApiResponse.success(
      res,
      {
        message: 'Mot de passe réinitialisé avec succès',
        user: {
          id: user._id,
          email: user.email,
        },
        temporaryPassword: process.env.NODE_ENV === 'development' ? newPassword : undefined,
        emailSent: notifyUser,
      },
      'Mot de passe réinitialisé'
    );
  } catch (error) {
    logger.error('Erreur adminResetPassword:', error);
    return ApiResponse.serverError(res);
  }
};

/**
 * @desc    Obtenir statistiques utilisateurs
 * @route   GET /api/v1/users/stats
 * @access  Admin
 */
const getUserStats = async (req, res) => {
  try {
    const stats = await User.getStats();
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const inactiveUsers = totalUsers - activeUsers;

    return ApiResponse.success(res, {
      total: totalUsers,
      active: activeUsers,
      inactive: inactiveUsers,
      byRole: stats,
    });
  } catch (error) {
    logger.error(' Erreur getUserStats:', error);
    return ApiResponse.serverError(res);
  }
};

module.exports = {
  createMembre,
  createTresorier,
  updateUser,
  updateMyProfile,
  updateProfilePhoto,
  deleteProfilePhoto,
  listUsers,
  getUserDetails,
  toggleActivation,
  deleteUser,
  adminResetPassword,
  getUserStats,
}