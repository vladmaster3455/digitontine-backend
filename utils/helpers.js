// utils/helpers.js
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * Générer un mot de passe temporaire aléatoire sécurisé
 * Format: Aa1@xxxx (8 caractères minimum)
 */
const generateTemporaryPassword = () => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const specials = '@#$%&*!';

  // Garantir au moins 1 de chaque type
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += specials[Math.floor(Math.random() * specials.length)];

  // Compléter avec des caractères aléatoires (4 de plus = 8 total)
  const allChars = uppercase + lowercase + numbers + specials;
  for (let i = 0; i < 4; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Mélanger les caractères
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

/**
 * Générer un code de vérification à 6 chiffres
 */
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Hasher un mot de passe avec bcrypt
 */
const hashPassword = async (password) => {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
  return await bcrypt.hash(password, rounds);
};

/**
 * Comparer un mot de passe avec son hash
 */
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Valider le format d'un email
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Valider le format d'un numéro de téléphone sénégalais
 * Formats acceptés: +221771234567, 771234567, 77 123 45 67
 */
const isValidSenegalPhone = (phone) => {
  // Nettoyer le numéro
  const cleaned = phone.replace(/[\s-]/g, '');
  
  // Formats acceptés
  const patterns = [
    /^\+221[7][0-9]{8}$/, // +221771234567
    /^[7][0-9]{8}$/,       // 771234567
  ];

  return patterns.some(pattern => pattern.test(cleaned));
};

/**
 * Normaliser un numéro de téléphone sénégalais
 * Retourne toujours: +221XXXXXXXXX
 */
const normalizePhoneNumber = (phone) => {
  // Nettoyer
  let cleaned = phone.replace(/[\s-]/g, '');

  // Ajouter +221 si manquant
  if (!cleaned.startsWith('+221')) {
    if (cleaned.startsWith('221')) {
      cleaned = '+' + cleaned;
    } else if (cleaned.startsWith('7')) {
      cleaned = '+221' + cleaned;
    }
  }

  return cleaned;
};

/**
 * Valider la force d'un mot de passe
 * Règles: 8+ caractères, 1 maj, 1 min, 1 chiffre, 1 spécial
 */
const validatePasswordStrength = (password) => {
  const errors = [];

  if (password.length < 8) {
    errors.push('Le mot de passe doit contenir au moins 8 caractères');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une majuscule');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins une minuscule');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un chiffre');
  }

  if (!/[@#$%&*!]/.test(password)) {
    errors.push('Le mot de passe doit contenir au moins un caractère spécial (@#$%&*!)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Générer un token aléatoire sécurisé
 */
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Calculer l'âge à partir d'une date de naissance
 */
const calculateAge = (dateOfBirth) => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
};

/**
 * Formater un montant en FCFA
 */
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(amount);
};

/**
 * Formater une date en français
 */
const formatDate = (date, format = 'long') => {
  const options = {
    short: { year: 'numeric', month: '2-digit', day: '2-digit' },
    long: { year: 'numeric', month: 'long', day: 'numeric' },
    full: { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    },
  };

  return new Intl.DateTimeFormat('fr-FR', options[format] || options.long).format(new Date(date));
};

/**
 * Calculer la différence en jours entre deux dates
 */
const daysBetween = (date1, date2) => {
  const oneDay = 24 * 60 * 60 * 1000;
  const firstDate = new Date(date1);
  const secondDate = new Date(date2);
  return Math.round(Math.abs((firstDate - secondDate) / oneDay));
};

/**
 * Ajouter des jours à une date
 */
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Vérifier si une date est passée
 */
const isPastDate = (date) => {
  return new Date(date) < new Date();
};

/**
 * Vérifier si une date est future
 */
const isFutureDate = (date) => {
  return new Date(date) > new Date();
};

/**
 * Masquer partiellement un email
 * exemple@gmail.com -> e****e@gmail.com
 */
const maskEmail = (email) => {
  if (!email) return '';
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) return email;
  
  const masked = localPart[0] + '*'.repeat(localPart.length - 2) + localPart[localPart.length - 1];
  return `${masked}@${domain}`;
};

/**
 * Masquer partiellement un numéro de téléphone
 * +221771234567 -> +221****4567
 */
const maskPhone = (phone) => {
  if (!phone) return '';
  if (phone.length < 8) return phone;
  
  return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
};

/**
 * Slugifier une chaîne (pour URLs)
 */
const slugify = (text) => {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
};

/**
 * Générer un identifiant unique de transaction
 */
const generateTransactionId = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `TXN-${timestamp}-${randomStr}`.toUpperCase();
};

/**
 * Pagination helper
 */
const getPaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Nettoyer un objet (supprimer les valeurs null/undefined)
 */
const cleanObject = (obj) => {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      acc[key] = value;
    }
    return acc;
  }, {});
};

module.exports = {
  generateTemporaryPassword,
  generateVerificationCode,
  hashPassword,
  comparePassword,
  isValidEmail,
  isValidSenegalPhone,
  normalizePhoneNumber,
  validatePasswordStrength,
  generateSecureToken,
  calculateAge,
  formatCurrency,
  formatDate,
  daysBetween,
  addDays,
  isPastDate,
  isFutureDate,
  maskEmail,
  maskPhone,
  slugify,
  generateTransactionId,
  getPaginationParams,
  cleanObject,
};