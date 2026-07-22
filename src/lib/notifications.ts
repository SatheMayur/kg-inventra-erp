import { db } from './db';
import { emitNotificationCreated } from './realtime';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export async function createNotification({
  userId,
  title,
  message,
  type = 'info',
  link,
}: {
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
}) {
  try {
    const notification = await db.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        link,
      },
    });
    emitNotificationCreated(notification);
    return notification;
  } catch (error) {
    console.error('[NotificationService] Failed to create notification:', error);
  }
}
