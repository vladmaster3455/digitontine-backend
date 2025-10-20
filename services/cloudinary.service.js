// services/cloudinary.service.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const logger = require('../utils/logger');

// ========================================
// CONFIGURATION CLOUDINARY
// ========================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ========================================
// STORAGE CONFIGURATIONS
// ========================================

// Storage pour les photos d'identité (non modifiables après création)
const identityPhotoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'digitontine/identity_photos',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [
      { width: 800, height: 1000, crop: 'limit' },
      { quality: 'auto:good' },
    ],
    public_id: (req, file) => {
      const carteIdentite = req.body.carteIdentite || Date.now();
      return `identity_${carteIdentite}_${Date.now()}`;
    },
  },
});

// Storage pour les photos de profil (modifiables)
const profilePhotoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'digitontine/profile_photos',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' },
      { quality: 'auto:good' },
    ],
    public_id: (req, file) => {
      const userId = req.user?._id || req.params.userId || Date.now();
      return `profile_${userId}_${Date.now()}`;
    },
  },
});

// ========================================
// FILTRES ET VALIDATIONS
// ========================================

// Filtre de fichiers (sécurité)
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Seules les images sont autorisées (JPG, PNG)'), false);
  }
};

// Wrapper pour gérer les erreurs Multer
const handleMulterError = (upload) => {
  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        // Erreurs Multer spécifiques
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'Fichier trop volumineux',
            details: `Taille maximale: ${err.field === 'photoIdentite' ? '5MB' : '2MB'}`,
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Erreur lors du téléchargement',
          error: err.message,
        });
      } else if (err) {
        // Autres erreurs (ex: type de fichier)
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }
      next();
    });
  };
};

/**
 * Vérifier qu'un fichier a été uploadé
 */
const validateFileUpload = (fieldName) => {
  return (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: `Le champ '${fieldName}' est requis`,
      });
    }
    next();
  };
};

// ========================================
// MIDDLEWARES MULTER
// ========================================

// Middleware Multer pour photo d'identité (OBLIGATOIRE à la création)
const uploadIdentityPhoto = handleMulterError(
  multer({
    storage: identityPhotoStorage,
    fileFilter: fileFilter,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB max
    },
  }).single('photoIdentite')
);

// Middleware Multer pour photo de profil (OPTIONNELLE et MODIFIABLE)
const uploadProfilePhoto = handleMulterError(
  multer({
    storage: profilePhotoStorage,
    fileFilter: fileFilter,
    limits: {
      fileSize: 2 * 1024 * 1024, // 2MB max
    },
  }).single('photoProfil')
);

// ========================================
// FONCTIONS UTILITAIRES
// ========================================

/**
 * Supprimer une image de Cloudinary
 * @param {string} publicId - Public ID de l'image
 * @returns {Promise<Object>} - Résultat de la suppression
 */
const deleteImage = async (publicId) => {
  try {
    if (!publicId) {
      logger.warn(' Aucun public_id fourni pour suppression');
      return null;
    }

    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result === 'ok') {
      logger.info(` Image supprimée de Cloudinary: ${publicId}`);
    } else {
      logger.warn(` Image non trouvée sur Cloudinary: ${publicId}`);
    }
    
    return result;
  } catch (error) {
    logger.error(' Erreur suppression Cloudinary:', error);
    throw error;
  }
};

/**
 * Extraire le public_id d'une URL Cloudinary
 * @param {string} url - URL Cloudinary complète
 * @returns {string|null} - Public ID ou null
 * 
 * Exemples d'URL:
 * - https://res.cloudinary.com/xxx/image/upload/v123456/digitontine/identity_photos/identity_xxx.jpg
 * - https://res.cloudinary.com/xxx/image/upload/digitontine/profile_photos/profile_xxx.png
 */
const getPublicIdFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  
  try {
    // Extraire tout après "/upload/" jusqu'à l'extension
    const regex = /\/upload\/(?:v\d+\/)?(digitontine\/[^.]+)/;
    const match = url.match(regex);
    
    if (match && match[1]) {
      return match[1]; // Ex: "digitontine/identity_photos/identity_123"
    }
    
    logger.warn(` Impossible d'extraire public_id de: ${url}`);
    return null;
  } catch (error) {
    logger.error(' Erreur extraction public_id:', error);
    return null;
  }
};

// ========================================
// EXPORTS
// ========================================
module.exports = {
  cloudinary,
  uploadIdentityPhoto,
  uploadProfilePhoto,
  validateFileUpload,
  deleteImage,
  getPublicIdFromUrl,
};