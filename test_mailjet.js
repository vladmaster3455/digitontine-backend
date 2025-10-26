// test-mailjet.js - Script de test simple pour Mailjet
require('dotenv').config();
const Mailjet = require('node-mailjet');

async function testMailjet() {
  console.log('\n========================================');
  console.log('TEST MAILJET');
  console.log('========================================\n');

  // Verifier les variables d'environnement
  console.log('1. Verification des variables d\'environnement...');
  
  if (!process.env.MAILJET_API_KEY) {
    console.error('❌ MAILJET_API_KEY manquante dans .env');
    return;
  }
  console.log('✅ MAILJET_API_KEY presente');

  if (!process.env.MAILJET_SECRET_KEY) {
    console.error('❌ MAILJET_SECRET_KEY manquante dans .env');
    return;
  }
  console.log('✅ MAILJET_SECRET_KEY presente');

  if (!process.env.MAILJET_FROM_EMAIL) {
    console.error('❌ MAILJET_FROM_EMAIL manquante dans .env');
    return;
  }
  console.log('✅ MAILJET_FROM_EMAIL presente:', process.env.MAILJET_FROM_EMAIL);

  // Initialiser Mailjet
  console.log('\n2. Initialisation de Mailjet...');
  const mailjet = Mailjet.apiConnect(
    process.env.MAILJET_API_KEY,
    process.env.MAILJET_SECRET_KEY
  );
  console.log('✅ Client Mailjet initialise');

  // Envoyer un email de test
  console.log('\n3. Envoi d\'un email de test...');
  console.log('Destinataire:', process.env.MAILJET_FROM_EMAIL);

  try {
    const request = mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: {
            Email: process.env.MAILJET_FROM_EMAIL,
            Name: process.env.MAILJET_FROM_NAME || 'DigiTontine Test'
          },
          To: [
            {
              Email: process.env.MAILJET_FROM_EMAIL,
              Name: 'Test Recipient'
            }
          ],
          Subject: 'Test DigiTontine - Mailjet Configuration',
          HTMLPart: `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; padding: 20px; background: #f4f4f4; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 5px; margin-bottom: 20px; }
                .success { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 5px; }
                .info { background: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 5px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Test Mailjet</h1>
                </div>
                <div class="success">
                  <strong>✅ Configuration Mailjet reussie !</strong>
                </div>
                <div class="info">
                  <p><strong>Date :</strong> ${new Date().toLocaleString('fr-FR')}</p>
                  <p><strong>From :</strong> ${process.env.MAILJET_FROM_EMAIL}</p>
                  <p><strong>Service :</strong> DigiTontine Backend</p>
                </div>
                <p>Si vous recevez cet email, votre configuration Mailjet fonctionne parfaitement !</p>
                <p>Vous pouvez maintenant deployer sur Render en toute confiance.</p>
                <hr>
                <p style="font-size: 12px; color: #666; text-align: center;">
                  DigiTontine - Test automatique
                </p>
              </div>
            </body>
            </html>
          `,
          TextPart: 'Test DigiTontine - Configuration Mailjet reussie'
        }
      ]
    });

    const result = await request;
    
    console.log('\n✅ EMAIL ENVOYE AVEC SUCCES !');
    console.log('\nDetails:');
    console.log('- Status:', result.body.Messages[0].Status);
    console.log('- To:', result.body.Messages[0].To[0].Email);
    console.log('- MessageID:', result.body.Messages[0].To[0].MessageID);
    
    console.log('\n========================================');
    console.log('✅ TEST REUSSI');
    console.log('========================================');
    console.log('\nVa verifier ton email:', process.env.MAILJET_FROM_EMAIL);
    console.log('(Pense a verifier le dossier Spam/Courrier indesirable)\n');

  } catch (error) {
    console.error('\n❌ ERREUR lors de l\'envoi:');
    console.error('Message:', error.message);
    
    if (error.statusCode) {
      console.error('Status Code:', error.statusCode);
    }
    
    if (error.response && error.response.body) {
      console.error('Details:', JSON.stringify(error.response.body, null, 2));
    }

    console.log('\n========================================');
    console.log('❌ TEST ECHOUE');
    console.log('========================================');
    console.log('\nVerifie:');
    console.log('1. Tes cles API sont correctes dans .env');
    console.log('2. Ton email expediteur est verifie dans Mailjet');
    console.log('3. Tu n\'as pas depasse la limite de 200 emails/jour\n');
  }
}

// Executer le test
testMailjet().catch(console.error);