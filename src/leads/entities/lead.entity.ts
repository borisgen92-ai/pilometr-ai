import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany
} from 'typeorm';

import { LeadItem } from './lead-item.entity';

export enum LeadStatus {
  NEW = 'new',
  IN_PROGRESS = 'in_progress',
  NEGOTIATION = 'negotiation',
  WON = 'won',
  LOST = 'lost',
}

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 👤 Имя клиента
  @Column({ nullable: true })
  clientName: string;

  // 📞 Телефон
  @Column({ nullable: true })
  phone: string;

  // 💬 Telegram ID
  @Column({ nullable: true })
  telegramId: string;

  // 🪵 Интересующий товар
  @Column({ nullable: true })
  productInterest: string;

  // 🌍 Источник лида
  @Column({ nullable: true })
  source: string;

  // 📊 Статус сделки
  @Column({
    type: 'enum',
    enum: LeadStatus,
    default: LeadStatus.NEW,
  })
  status: LeadStatus;

  // 💰 Бюджет клиента
  @Column({
    type: 'float',
    nullable: true,
  })
  budget: number;

  // 🧠 AI summary
  @Column({
    type: 'text',
    nullable: true,
  })
  aiSummary: string;

  // 👨‍💼 Менеджер
  @Column({ nullable: true })
  assignedManagerId: string;

  // ⏱ Даты
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
updatedAt: Date;

@OneToMany(() => LeadItem, (item) => item.lead, {
  cascade: true,
})
items: LeadItem[];
}