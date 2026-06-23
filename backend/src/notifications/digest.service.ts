import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ConfigService } from '@nestjs/config';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';
import { NotificationDigestState } from './entities/notification-digest-state.entity';
import { EmailService } from './email.service';
import { renderEmailTemplate, DigestItem } from './email-templates';

@Injectable()
export class DigestService implements OnModuleInit {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    @InjectRepository(UserPreferences)
    private readonly prefsRepo: Repository<UserPreferences>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationDigestState)
    private readonly digestStateRepo: Repository<NotificationDigestState>,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('DIGEST_ENABLED') === 'false') {
      this.logger.log('Digest disabled via DIGEST_ENABLED=false');
      return;
    }

    const hour = parseInt(
      this.config.get<string>('DIGEST_DAILY_HOUR_UTC') ?? '8',
      10,
    );
    const weekDay = parseInt(
      this.config.get<string>('DIGEST_WEEKLY_DAY') ?? '1',
      10,
    );

    const dailyJob = new CronJob(`0 0 ${hour} * * *`, () => {
      void this.sendDailyDigests();
    });
    const weeklyJob = new CronJob(`0 0 ${hour} * * ${weekDay}`, () => {
      void this.sendWeeklyDigests();
    });

    this.schedulerRegistry.addCronJob('digest-daily', dailyJob);
    this.schedulerRegistry.addCronJob('digest-weekly', weeklyJob);

    dailyJob.start();
    weeklyJob.start();

    this.logger.log(
      `Digest cron registered — daily at ${hour}:00 UTC, weekly on day ${weekDay}`,
    );
  }

  async sendDailyDigests(): Promise<void> {
    const periodKey = this.getDailyPeriodKey(new Date());
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.logger.log(`Running daily digest for period ${periodKey}`);
    await this.runDigests('daily', periodKey, windowStart);
  }

  async sendWeeklyDigests(): Promise<void> {
    const periodKey = this.getWeeklyPeriodKey(new Date());
    const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    this.logger.log(`Running weekly digest for period ${periodKey}`);
    await this.runDigests('weekly', periodKey, windowStart);
  }

  private async runDigests(
    frequency: 'daily' | 'weekly',
    periodKey: string,
    windowStart: Date,
  ): Promise<void> {
    const prefs = await this.prefsRepo.find({
      where: { digest_frequency: frequency, email_notifications: true },
    });

    for (const pref of prefs) {
      try {
        await this.processUserDigest(pref, frequency, periodKey, windowStart);
      } catch (err) {
        this.logger.error(
          `Digest failed for user ${pref.userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async processUserDigest(
    pref: UserPreferences,
    frequency: 'daily' | 'weekly',
    periodKey: string,
    windowStart: Date,
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: pref.userId } });
    if (!user?.email) return;

    // idempotency: skip if this period was already sent
    let state = await this.digestStateRepo.findOne({
      where: { userId: pref.userId },
    });
    const lastPeriod =
      frequency === 'daily' ? state?.lastDailyPeriod : state?.lastWeeklyPeriod;
    if (lastPeriod === periodKey) return;

    // fetch unread notifications created in the window (cap at 20 items)
    const notifications = await this.notificationRepo.find({
      where: {
        user_address: user.stellar_address,
        read: false,
        created_at: MoreThanOrEqual(windowStart),
      },
      order: { created_at: 'DESC' },
      take: 20,
    });

    if (notifications.length === 0) return;

    const items: DigestItem[] = notifications.map((n) => ({
      title: n.title,
      message: n.message,
    }));

    const rendered = renderEmailTemplate('digest', {
      digestFrequency: frequency,
      digestItems: items,
      digestPeriod: periodKey,
    });

    await this.emailService.queueEmail({
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    // persist the sent period to prevent duplicates
    if (!state) {
      state = this.digestStateRepo.create({ userId: pref.userId });
    }
    if (frequency === 'daily') {
      state.lastDailyPeriod = periodKey;
    } else {
      state.lastWeeklyPeriod = periodKey;
    }
    await this.digestStateRepo.save(state);

    this.logger.log(
      `Digest sent to ${user.email} (${frequency}, ${periodKey}, ${items.length} items)`,
    );
  }

  private getDailyPeriodKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private getWeeklyPeriodKey(date: Date): string {
    const d = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
}
