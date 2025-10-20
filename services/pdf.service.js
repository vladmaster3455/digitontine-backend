// services/pdf.service.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { formatDate, formatCurrency } = require('../utils/helpers');

/**
 * Generer un recu de paiement (US 4.1)
 */
const generatePaymentReceipt = async (transaction, user, tontine) => {
  return new Promise((resolve, reject) => {
    try {
      const fileName = `recu-${transaction.referenceTransaction}.pdf`;
      const filePath = path.join(__dirname, '../uploads/receipts', fileName);

      // Creer le dossier si inexistant
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // En-tete
      doc
        .fontSize(20)
        .text('RECU DE PAIEMENT', { align: 'center' })
        .moveDown();

      doc
        .fontSize(12)
        .text('DigiTontine', { align: 'center' })
        .text('Gestion de Tontines Digitales', { align: 'center' })
        .moveDown(2);

      // Informations transaction
      doc.fontSize(14).text('DETAILS DE LA TRANSACTION', { underline: true }).moveDown();

      doc
        .fontSize(10)
        .text(`Reference : ${transaction.referenceTransaction}`)
        .text(`Date : ${formatDate(transaction.dateTransaction)}`)
        .text(`Statut : ${transaction.statut}`)
        .moveDown();

      // Informations membre
      doc.fontSize(14).text('MEMBRE', { underline: true }).moveDown();

      doc
        .fontSize(10)
        .text(`Nom : ${user.prenom} ${user.nom}`)
        .text(`Email : ${user.email}`)
        .text(`Telephone : ${user.numeroTelephone}`)
        .moveDown();

      // Informations tontine
      doc.fontSize(14).text('TONTINE', { underline: true }).moveDown();

      doc
        .fontSize(10)
        .text(`Nom : ${tontine.nom}`)
        .text(`Frequence : ${tontine.frequence}`)
        .moveDown();

      // Montants
      doc.fontSize(14).text('MONTANTS', { underline: true }).moveDown();

      const montantCotisation = transaction.montantCotisation || transaction.montant;
      const montantPenalite = transaction.montantPenalite || 0;
      const montantTotal = transaction.montant;

      doc
        .fontSize(10)
        .text(`Cotisation : ${formatCurrency(montantCotisation)}`)
        .text(`Penalite : ${formatCurrency(montantPenalite)}`)
        .fontSize(12)
        .text(`TOTAL : ${formatCurrency(montantTotal)}`, { bold: true })
        .moveDown();

      // Moyen de paiement
      doc
        .fontSize(10)
        .text(`Moyen de paiement : ${transaction.moyenPaiement}`)
        .text(`Reference paiement : ${transaction.referencePaiement || 'N/A'}`)
        .moveDown(2);

      // Pied de page
      doc
        .fontSize(8)
        .text('Ce recu est genere automatiquement et ne necessite pas de signature', {
          align: 'center',
        })
        .text(`Genere le ${formatDate(new Date())}`, { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        logger.info(`Recu PDF genere: ${fileName}`);
        resolve({
          success: true,
          filePath,
          fileName,
          url: `/uploads/receipts/${fileName}`,
        });
      });

      stream.on('error', (error) => {
        logger.error('Erreur generation PDF:', error);
        reject(error);
      });
    } catch (error) {
      logger.error('Erreur generation recu:', error);
      reject(error);
    }
  });
};

/**
 * Generer rapport final tontine (US 2.8)
 */
const generateFinalReport = async (tontine, membres, tirages, transactions) => {
  return new Promise((resolve, reject) => {
    try {
      const fileName = `rapport-${tontine.nom.replace(/\s/g, '-')}-${Date.now()}.pdf`;
      const filePath = path.join(__dirname, '../uploads/reports', fileName);

      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // En-tete
      doc
        .fontSize(24)
        .text('RAPPORT FINAL DE TONTINE', { align: 'center' })
        .moveDown(2);

      // Informations tontine
      doc.fontSize(16).text('INFORMATIONS GENERALES', { underline: true }).moveDown();

      doc
        .fontSize(10)
        .text(`Nom : ${tontine.nom}`)
        .text(`Description : ${tontine.description || 'N/A'}`)
        .text(`Date debut : ${formatDate(tontine.dateDebut)}`)
        .text(`Date fin : ${formatDate(tontine.dateFin)}`)
        .text(`Date cloture : ${formatDate(tontine.dateCloture)}`)
        .text(`Montant cotisation : ${formatCurrency(tontine.montantCotisation)}`)
        .text(`Frequence : ${tontine.frequence}`)
        .text(`Nombre de membres : ${membres.length}`)
        .moveDown(2);

      // Statistiques
      doc.fontSize(16).text('STATISTIQUES', { underline: true }).moveDown();

      const totalCollecte = tontine.stats?.montantTotalCollecte || 0;
      const totalDistribue = tontine.stats?.montantTotalDistribue || 0;
      const tauxParticipation = tontine.stats?.tauxParticipation || 0;

      doc
        .fontSize(10)
        .text(`Total collecte : ${formatCurrency(totalCollecte)}`)
        .text(`Total distribue : ${formatCurrency(totalDistribue)}`)
        .text(`Taux de participation : ${tauxParticipation.toFixed(2)}%`)
        .text(`Nombre de tirages : ${tirages.length}`)
        .moveDown(2);

      // Liste des membres
      doc.fontSize(16).text('LISTE DES MEMBRES', { underline: true }).moveDown();

      membres.forEach((membre, index) => {
        doc
          .fontSize(9)
          .text(
            `${index + 1}. ${membre.prenom} ${membre.nom} - ${membre.email} ${membre.aGagne ? '(Gagnant)' : ''}`
          );
      });

      doc.moveDown(2);

      // Historique des tirages
      doc.fontSize(16).text('HISTORIQUE DES TIRAGES', { underline: true }).moveDown();

      tirages.forEach((tirage, index) => {
        doc
          .fontSize(9)
          .text(
            `Tirage ${index + 1} - ${formatDate(tirage.dateTirage)} - Beneficiaire : ${tirage.beneficiaire?.prenom} ${tirage.beneficiaire?.nom} - ${formatCurrency(tirage.montant)}`
          );
      });

      doc.moveDown(2);

      // Pied de page
      doc
        .fontSize(8)
        .text(`Rapport genere le ${formatDate(new Date())}`, { align: 'center' })
        .text('DigiTontine - Gestion de Tontines Digitales', { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        logger.info(`Rapport final genere: ${fileName}`);
        resolve({
          success: true,
          filePath,
          fileName,
          url: `/uploads/reports/${fileName}`,
        });
      });

      stream.on('error', (error) => {
        logger.error('Erreur generation rapport:', error);
        reject(error);
      });
    } catch (error) {
      logger.error('Erreur generation rapport final:', error);
      reject(error);
    }
  });
};

/**
 * Generer export transactions (US 4.4)
 */
const generateTransactionsExport = async (transactions, filters = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const fileName = `transactions-export-${Date.now()}.pdf`;
      const filePath = path.join(__dirname, '../uploads/exports', fileName);

      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // En-tete
      doc
        .fontSize(20)
        .text('EXPORT DES TRANSACTIONS', { align: 'center' })
        .moveDown();

      // Filtres appliques
      if (Object.keys(filters).length > 0) {
        doc.fontSize(10).text('Filtres appliques :');
        Object.entries(filters).forEach(([key, value]) => {
          if (value) {
            doc.fontSize(8).text(`- ${key}: ${value}`);
          }
        });
        doc.moveDown();
      }

      // Tableau des transactions
      doc.fontSize(12).text('LISTE DES TRANSACTIONS', { underline: true }).moveDown();

      const tableTop = doc.y;
      const colWidths = [80, 120, 80, 80, 80, 100];
      const headers = ['Reference', 'Membre', 'Montant', 'Statut', 'Date', 'Moyen'];

      // En-tetes
      let x = 50;
      headers.forEach((header, i) => {
        doc.fontSize(8).text(header, x, tableTop, { width: colWidths[i], bold: true });
        x += colWidths[i];
      });

      let y = tableTop + 20;

      // Lignes
      transactions.forEach((transaction) => {
        if (y > 500) {
          doc.addPage();
          y = 50;
        }

        x = 50;
        const row = [
          transaction.referenceTransaction,
          `${transaction.user?.prenom} ${transaction.user?.nom}`,
          formatCurrency(transaction.montant),
          transaction.statut,
          formatDate(transaction.dateTransaction, 'short'),
          transaction.moyenPaiement,
        ];

        row.forEach((cell, i) => {
          doc.fontSize(7).text(cell, x, y, { width: colWidths[i] });
          x += colWidths[i];
        });

        y += 15;
      });

      // Total
      const total = transactions.reduce((sum, t) => sum + t.montant, 0);
      doc
        .moveDown()
        .fontSize(10)
        .text(`Total : ${transactions.length} transaction(s)`, 50, y + 20)
        .text(`Montant total : ${formatCurrency(total)}`, 50, y + 35);

      // Pied de page
      doc
        .fontSize(8)
        .text(`Genere le ${formatDate(new Date())}`, { align: 'center' })
        .text('DigiTontine', { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        logger.info(`Export transactions genere: ${fileName}`);
        resolve({
          success: true,
          filePath,
          fileName,
          url: `/uploads/exports/${fileName}`,
        });
      });

      stream.on('error', (error) => {
        logger.error('Erreur generation export:', error);
        reject(error);
      });
    } catch (error) {
      logger.error('Erreur generation export transactions:', error);
      reject(error);
    }
  });
};

/**
 * Generer historique membre (US 3.3)
 */
const generateMemberHistory = async (user, tontines, transactions, tirages) => {
  return new Promise((resolve, reject) => {
    try {
      const fileName = `historique-${user.nom}-${Date.now()}.pdf`;
      const filePath = path.join(__dirname, '../uploads/history', fileName);

      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // En-tete
      doc
        .fontSize(20)
        .text('HISTORIQUE DE PARTICIPATION', { align: 'center' })
        .moveDown(2);

      // Informations membre
      doc.fontSize(14).text('MEMBRE', { underline: true }).moveDown();

      doc
        .fontSize(10)
        .text(`Nom complet : ${user.prenom} ${user.nom}`)
        .text(`Email : ${user.email}`)
        .text(`Telephone : ${user.numeroTelephone}`)
        .moveDown(2);

      // Statistiques
      const totalCotise = transactions
        .filter((t) => t.statut === 'Validee')
        .reduce((sum, t) => sum + t.montant, 0);
      const totalGagne = tirages.reduce((sum, t) => sum + t.montant, 0);

      doc.fontSize(14).text('STATISTIQUES GLOBALES', { underline: true }).moveDown();

      doc
        .fontSize(10)
        .text(`Tontines participees : ${tontines.length}`)
        .text(`Transactions effectuees : ${transactions.length}`)
        .text(`Total cotise : ${formatCurrency(totalCotise)}`)
        .text(`Total gagne : ${formatCurrency(totalGagne)}`)
        .text(`Tirages gagnes : ${tirages.length}`)
        .moveDown(2);

      // Tontines
      doc.fontSize(14).text('MES TONTINES', { underline: true }).moveDown();

      tontines.forEach((tontine, index) => {
        doc
          .fontSize(9)
          .text(
            `${index + 1}. ${tontine.nom} - ${formatCurrency(tontine.montantCotisation)} - ${tontine.statut}`
          );
      });

      doc.moveDown(2);

      // Tirages gagnes
      if (tirages.length > 0) {
        doc.fontSize(14).text('TIRAGES GAGNES', { underline: true }).moveDown();

        tirages.forEach((tirage, index) => {
          doc
            .fontSize(9)
            .text(
              `${index + 1}. ${formatDate(tirage.dateTirage)} - ${tirage.tontine?.nom} - ${formatCurrency(tirage.montant)}`
            );
        });
      }

      doc.moveDown(2);

      // Pied de page
      doc
        .fontSize(8)
        .text(`Historique genere le ${formatDate(new Date())}`, { align: 'center' })
        .text('DigiTontine', { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        logger.info(`Historique membre genere: ${fileName}`);
        resolve({
          success: true,
          filePath,
          fileName,
          url: `/uploads/history/${fileName}`,
        });
      });

      stream.on('error', (error) => {
        logger.error('Erreur generation historique:', error);
        reject(error);
      });
    } catch (error) {
      logger.error('Erreur generation historique membre:', error);
      reject(error);
    }
  });
};

module.exports = {
  generatePaymentReceipt,
  generateFinalReport,
  generateTransactionsExport,
  generateMemberHistory,
};