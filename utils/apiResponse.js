// utils/apiResponse.js
const { HTTP_STATUS } = require('../config/constants');

class ApiResponse {
  /**
   * Réponse de succès
   */
  static success(res, data = null, message = 'Succès', statusCode = HTTP_STATUS.OK) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Réponse de succès avec pagination
   */
  static successWithPagination(res, data, pagination, message = 'Succès') {
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit),
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Réponse d'erreur
   */
  static error(res, message = 'Erreur', statusCode = HTTP_STATUS.BAD_REQUEST, errors = null) {
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString(),
    };

    if (errors) {
      response.errors = errors;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Erreur de validation
   */
  static validationError(res, errors) {
    return this.error(
      res,
      'Erreur de validation',
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      errors
    );
  }

  /**
   * Non autorisé (401)
   */
  static unauthorized(res, message = 'Accès non autorisé') {
    return this.error(res, message, HTTP_STATUS.UNAUTHORIZED);
  }

  /**
   * Interdit (403)
   */
  static forbidden(res, message = 'Accès interdit') {
    return this.error(res, message, HTTP_STATUS.FORBIDDEN);
  }

  /**
   * Non trouvé (404)
   */
  static notFound(res, message = 'Ressource non trouvée') {
    return this.error(res, message, HTTP_STATUS.NOT_FOUND);
  }

  /**
   * Conflit (409)
   */
  static conflict(res, message = 'Conflit détecté') {
    return this.error(res, message, HTTP_STATUS.CONFLICT);
  }

  /**
   * Erreur serveur (500)
   */
  static serverError(res, message = 'Erreur serveur', error = null) {
    // Log l'erreur complète côté serveur
    if (error) {
      console.error('Server Error:', error);
    }

    return this.error(
      res,
      message,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      process.env.NODE_ENV === 'development' && error ? { stack: error.stack } : null
    );
  }
}

module.exports = ApiResponse;