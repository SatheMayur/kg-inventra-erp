import { db } from './db';

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
    return await db.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        link,
      },
    });
  } catch (error) {
    console.error('[NotificationService] Failed to create notification:', error);
  }
}
