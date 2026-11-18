const admin = require('firebase-admin');
const { cert, initializeApp, getApps } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');
const fs = require('fs');

let messagingInstance = null;

try {
  let serviceAccount = null;

  // 1. Check for Base64 encoded Service Account in ENV (ideal for Render / Cloud deploy)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      const decodedJson = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
      serviceAccount = JSON.parse(decodedJson);
    } catch (e) {
      console.warn('[FCM Config] Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64:', e.message);
    }
  }

  // 2. Check for local file path if base64 not available
  if (!serviceAccount) {
    const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH 
      ? path.resolve(__dirname, '../../', process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
      : path.resolve(__dirname, '../../config/firebase-service-account.json');

    if (fs.existsSync(filePath)) {
      serviceAccount = require(filePath);
    }
  }

  if (serviceAccount) {
    let app;
    if (getApps().length === 0) {
      app = initializeApp({
        credential: cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID || 'tt-crm-f6a6c',
      });
    } else {
      app = getApps()[0];
    }
    messagingInstance = getMessaging(app);
    console.log('🔥 Firebase Admin SDK initialized successfully for FCM notifications');
  } else {
    console.warn('⚠️ Firebase service account not found. Push notifications will be mocked.');
  }
} catch (error) {
  console.error('[FCM Init Error]:', error.message);
}

/**
 * Send Multicast or Single FCM Push Notification
 * @param {Object} options
 * @param {string|string[]} options.tokens - Single FCM token or array of tokens
 * @param {string} options.title - Notification title
 * @param {string} options.body - Notification body description
 * @param {Object} [options.data] - Custom payload data (e.g. orderId, screen, type)
 * @param {string} [options.imageUrl] - Optional image URL for rich notifications
 */
async function sendPushNotification({ tokens, title, body, data = {}, imageUrl = '' }) {
  if (!tokens || (Array.isArray(tokens) && tokens.length === 0)) {
    return { success: false, message: 'No device tokens provided' };
  }

  const tokenList = Array.isArray(tokens) ? tokens.filter(Boolean) : [tokens].filter(Boolean);
  if (tokenList.length === 0) {
    return { success: false, message: 'No valid device tokens' };
  }

  // If Firebase is not initialized, log in console
  if (!messagingInstance) {
    console.log(`[Mock FCM Push] Title: "${title}" | Body: "${body}" | Tokens: ${tokenList.length}`);
    return { success: true, mocked: true };
  }

  try {
    const payload = {
      notification: {
        title,
        body,
        ...(imageUrl ? { imageUrl } : {}),
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        ...Object.keys(data).reduce((acc, k) => {
          acc[k] = String(data[k]);
          return acc;
        }, {}),
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'contract_bazar_high_importance',
          priority: 'max',
          defaultVibrateTimings: true,
          defaultSound: true,
        },
      },
    };

    if (tokenList.length === 1) {
      const response = await messagingInstance.send({
        token: tokenList[0],
        ...payload,
      });
      return { success: true, messageId: response };
    } else {
      const response = await messagingInstance.sendEachForMulticast({
        tokens: tokenList,
        ...payload,
      });
      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    }
  } catch (error) {
    console.error('[FCM Send Error]:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  admin,
  sendPushNotification,
};