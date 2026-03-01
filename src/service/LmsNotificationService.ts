/**
 * Central LMS notification service.
 * Creates in-app notifications in MySQL (notifications table).
 * Use for all main events: Admin, Borrower, Lender, Company.
 * No external push service - everything is stored and listed from this DB.
 */

import { NotificationRepository } from '../repository/NotificationRepository';
import { NotificationTemplateRepository } from '../repository/NotificationTemplateRepository';
import { Notification } from '../domain/Notification';

export class LmsNotificationService {
  private notificationRepo: NotificationRepository;
  private templateRepo: NotificationTemplateRepository;

  constructor() {
    this.notificationRepo = new NotificationRepository();
    this.templateRepo = new NotificationTemplateRepository();
  }

  /**
   * Create a notification with explicit title and message.
   * Payload is stored as JSON: { title, message, ...extra } for list API.
   */
  async notify(
    userId: number,
    type: string,
    title: string,
    message: string,
    extra?: Record<string, unknown>
  ): Promise<Notification> {
    const payload: Record<string, unknown> = { title, message, ...extra };
    const notification = new Notification();
    notification.userId = userId;
    notification.type = type;
    notification.payload = JSON.stringify(payload);
    notification.read = false;
    return this.notificationRepo.create(notification);
  }

  /**
   * Create notification from a template (code + locale).
   * Replaces {{variableName}} in titleTemplate and bodyTemplate with values from payloadVars.
   */
  async createFromTemplate(
    userId: number,
    templateCode: string,
    payloadVars: Record<string, string>,
    locale: string = 'en'
  ): Promise<Notification> {
    const template = await this.templateRepo.findByCodeAndLocale(templateCode, locale);
    const title = template?.titleTemplate
      ? this.replacePlaceholders(template.titleTemplate, payloadVars)
      : templateCode;
    const message = template?.bodyTemplate
      ? this.replacePlaceholders(template.bodyTemplate, payloadVars)
      : '';
    return this.notify(userId, templateCode, title, message, payloadVars);
  }

  private replacePlaceholders(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  }

  /**
   * Notify multiple users (e.g. admins, company users).
   */
  async notifyMultiple(
    userIds: number[],
    type: string,
    title: string,
    message: string,
    extra?: Record<string, unknown>
  ): Promise<Notification[]> {
    const promises = userIds.map((userId) => this.notify(userId, type, title, message, extra));
    return Promise.all(promises);
  }
}
