// config/jwt.js
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * Générer un token JWT d'accès
 * @param {Object} user - Objet utilisateur
 * @returns {string} Token JWT
 */
const generateAccessToken = (user) => {
  try {
    const payload = {
      userId: user._id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isFirstLogin: user.isFirstLogin, //  AJOUT CRITIQUE
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || '24h',
      issuer: process.env.APP_NAME || 'DigiTontine',
      audience: 'digitontine-users',
    });

    logger.debug(` Token généré pour ${user.email} (isFirstLogin: ${user.isFirstLogin})`);
    return token;
  } catch (error) {
    logger.error(' Erreur génération token:', error);
    throw error;
  }
};

/**
 * Générer un refresh token
 * @param {Object} user - Objet utilisateur
 * @returns {string} Refresh token
 */
const generateRefreshToken = (user) => {
  try {
    const payload = {
      userId: user._id,
      email: user.email,
      type: 'refresh',
    };

    const token = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
      issuer: process.env.APP_NAME || 'DigiTontine',
      audience: 'digitontine-users',
    });

    logger.debug(` Refresh token généré pour ${user.email}`);
    return token;
  } catch (error) {
    logger.error(' Erreur génération refresh token:', error);
    throw error;
  }
};

/**
 * Vérifier un token JWT
 * @param {string} token - Token à vérifier
 * @returns {Object} Payload décodé
 */
const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.APP_NAME || 'DigiTontine',
      audience: 'digitontine-users',
    });

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expiré');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Token invalide');
    }
    throw error;
  }
};

/**
 * Vérifier un refresh token
 * @param {string} token - Refresh token
 * @returns {Object} Payload décodé
 */
const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
      issuer: process.env.APP_NAME || 'DigiTontine',
      audience: 'digitontine-users',
    });

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Refresh token expiré');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Refresh token invalide');
    }
    throw error;
  }
};

/**
 * Décoder un token sans vérification (pour debug)
 * @param {string} token - Token à décoder
 * @returns {Object} Payload décodé
 */
const decodeToken = (token) => {
  return jwt.decode(token, { complete: true });
};

/**
 * Générer une paire de tokens (access + refresh)
 * @param {Object} user - Objet utilisateur
 * @returns {Object} { accessToken, refreshToken }
 */
const generateTokenPair = (user) => {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
  };
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  generateTokenPair,
};