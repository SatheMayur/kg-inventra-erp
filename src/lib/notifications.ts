import { db } from './db';
import { emitNotificationCreated } from './realtime';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
type CreateNotificationInput = {
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
}

export async function createNotification({ userId, title, message, type = 'info', link }: CreateNotificationInput) {
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

export async function createNotificationOnce(
  input: CreateNotificationInput,
  options: { dedupeSince?: Date } = {},
) {
  try {
    const dedupeSince = options.dedupeSince ?? startOfKolkataDay()
    const existing = await db.notification.findFirst({
      where: {
        userId: input.userId,
        title: input.title,
        message: input.message,
        createdAt: { gte: dedupeSince },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (existing) return { notification: existing, created: false }

    const notification = await createNotification(input)
    return { notification, created: Boolean(notification) }
  } catch (error) {
    console.error('[NotificationService] Failed to create deduped notification:', error)
    return { notification: undefined, created: false }
  }
}

function startOfKolkataDay(date: Date = new Date()) {
  const dateStr = date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' })
  return new Date(`${dateStr}T00:00:00.000+05:30`)
}
