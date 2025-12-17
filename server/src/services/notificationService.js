/**
 * Notification Service
 * Handles SMS and Email notifications using job queue
 * Note: Queue and SMS features require Redis and Twilio credentials
 */

const db = require('../config/database');
const logger = require('../utils/logger');

// Try to load optional dependencies
let Queue, twilio;
try {
  Queue = require('bull');
} catch (e) {
  logger.warn('Bull queue not available - background jobs disabled');
}

try {
  twilio = require('twilio');
} catch (e) {
  logger.warn('Twilio not available - SMS notifications disabled');
}

// Initialize Redis queue for background job processing
let smsQueue = null;

const initializeQueue = () => {
  if (!Queue) {
    logger.info('Queue disabled - Redis not configured');
    return null;
  }
  
  if (smsQueue) return smsQueue;

  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  };

  try {
    smsQueue = new Queue('sms-notifications', {
      redis: redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5 seconds initial delay
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
      },
    });

    // Process SMS jobs
    smsQueue.process(async (job) => {
      const { notificationId, phone, message } = job.data;
      
      try {
        await sendSMS(phone, message);
        
        // Update notification status
        await db.query(
          `UPDATE NotificationQueue 
           SET Status = 'SENT', SentAt = GETDATE(), Attempts = Attempts + 1
           WHERE NotificationID = @id`,
          { id: notificationId }
        );
      
        logger.info(`SMS sent successfully to ${phone}`);
        return { success: true, phone };
      } catch (error) {
        // Update notification with error
        await db.query(
          `UPDATE NotificationQueue 
           SET Status = 'FAILED', ErrorMessage = @error, Attempts = Attempts + 1, LastAttemptAt = GETDATE()
           WHERE NotificationID = @id`,
          { id: notificationId, error: error.message }
        );
        
        throw error;
      }
    });

    // Queue event handlers
    smsQueue.on('completed', (job, result) => {
      logger.info(`SMS job ${job.id} completed:`, result);
    });

    smsQueue.on('failed', (job, err) => {
      logger.error(`SMS job ${job.id} failed:`, err.message);
    });

    smsQueue.on('error', (error) => {
      logger.error('SMS queue error:', error);
    });

    logger.info('SMS notification queue initialized');
    return smsQueue;
  } catch (queueError) {
    logger.error('Failed to initialize queue:', queueError);
    return null;
  }
};

/**
 * Send SMS via Twilio
 */
const sendSMS = async (phone, message) => {
  if (!twilio) {
    logger.warn('Twilio not available, skipping SMS');
    return { success: false, reason: 'Twilio not installed' };
  }
  
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    logger.warn('Twilio credentials not configured, skipping SMS');
    return { success: false, reason: 'SMS not configured' };
  }

  const client = twilio(accountSid, authToken);

  // Format phone number for Pakistan
  let formattedPhone = phone.replace(/\D/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '+92' + formattedPhone.substring(1);
  } else if (!formattedPhone.startsWith('+')) {
    formattedPhone = '+' + formattedPhone;
  }

  const result = await client.messages.create({
    body: message,
    from: fromNumber,
    to: formattedPhone,
  });

  return {
    success: true,
    messageId: result.sid,
    status: result.status,
  };
};

/**
 * Add SMS to queue for async processing
 */
const addToSMSQueue = async ({ phone, message, referenceType, referenceId }) => {
  try {
    // Check if SMS is enabled
    const settingResult = await db.query(
      `SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'sms_enabled'`
    );
    
    const smsEnabled = settingResult.recordset[0]?.SettingValue === 'true';
    
    if (!smsEnabled) {
      logger.info('SMS notifications disabled, skipping');
      return { queued: false, reason: 'SMS disabled' };
    }

    // Insert into notification queue
    const result = await db.query(
      `INSERT INTO NotificationQueue (
        NotificationType, RecipientPhone, Message, ReferenceType, ReferenceID, Status
       )
       OUTPUT INSERTED.NotificationID
       VALUES ('SMS', @phone, @message, @referenceType, @referenceId, 'PENDING')`,
      {
        phone,
        message,
        referenceType: referenceType || null,
        referenceId: referenceId || null,
      }
    );

    const notificationId = result.recordset[0].NotificationID;

    // Add to Bull queue
    const queue = initializeQueue();
    await queue.add({
      notificationId,
      phone,
      message,
    });

    logger.info(`SMS queued for ${phone}, notification ID: ${notificationId}`);
    return { queued: true, notificationId };
  } catch (error) {
    logger.error('Failed to queue SMS:', error);
    throw error;
  }
};

/**
 * Send immediate SMS (bypass queue)
 */
const sendImmediateSMS = async (phone, message) => {
  try {
    const result = await sendSMS(phone, message);
    return result;
  } catch (error) {
    logger.error('Immediate SMS failed:', error);
    throw error;
  }
};

/**
 * Get notification queue status
 */
const getQueueStatus = async () => {
  if (!smsQueue) {
    return { initialized: false };
  }

  const [waiting, active, completed, failed] = await Promise.all([
    smsQueue.getWaitingCount(),
    smsQueue.getActiveCount(),
    smsQueue.getCompletedCount(),
    smsQueue.getFailedCount(),
  ]);

  return {
    initialized: true,
    waiting,
    active,
    completed,
    failed,
  };
};

/**
 * Retry failed notifications
 */
const retryFailedNotifications = async () => {
  try {
    const result = await db.query(
      `SELECT * FROM NotificationQueue 
       WHERE Status = 'FAILED' AND Attempts < MaxAttempts
       ORDER BY CreatedAt`
    );

    const queue = initializeQueue();
    let retryCount = 0;

    for (const notification of result.recordset) {
      await queue.add({
        notificationId: notification.NotificationID,
        phone: notification.RecipientPhone,
        message: notification.Message,
      });
      
      await db.query(
        `UPDATE NotificationQueue SET Status = 'PENDING' WHERE NotificationID = @id`,
        { id: notification.NotificationID }
      );
      
      retryCount++;
    }

    logger.info(`Retried ${retryCount} failed notifications`);
    return { retried: retryCount };
  } catch (error) {
    logger.error('Failed to retry notifications:', error);
    throw error;
  }
};

/**
 * Send promotional SMS to customers
 */
const sendPromotionalSMS = async (customerFilter, message) => {
  try {
    let query = `
      SELECT CustomerID, Phone, FirstName 
      FROM Customers 
      WHERE OptInSMS = 1 AND Phone IS NOT NULL
    `;

    if (customerFilter.type) {
      query += ` AND CustomerType = '${customerFilter.type}'`;
    }

    if (customerFilter.minSpend) {
      query += ` AND TotalSpend >= ${customerFilter.minSpend}`;
    }

    const customers = await db.query(query);
    const queue = initializeQueue();
    let queuedCount = 0;

    for (const customer of customers.recordset) {
      // Personalize message
      const personalizedMessage = message.replace('{name}', customer.FirstName || 'Valued Customer');

      const notificationResult = await db.query(
        `INSERT INTO NotificationQueue (
          NotificationType, RecipientPhone, Message, ReferenceType, Status
         )
         OUTPUT INSERTED.NotificationID
         VALUES ('SMS', @phone, @message, 'PROMOTION', 'PENDING')`,
        {
          phone: customer.Phone,
          message: personalizedMessage,
        }
      );

      await queue.add({
        notificationId: notificationResult.recordset[0].NotificationID,
        phone: customer.Phone,
        message: personalizedMessage,
      });

      queuedCount++;
    }

    logger.info(`Promotional SMS queued for ${queuedCount} customers`);
    return { queued: queuedCount };
  } catch (error) {
    logger.error('Failed to send promotional SMS:', error);
    throw error;
  }
};

module.exports = {
  initializeQueue,
  addToSMSQueue,
  sendImmediateSMS,
  getQueueStatus,
  retryFailedNotifications,
  sendPromotionalSMS,
};
