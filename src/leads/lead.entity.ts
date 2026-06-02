import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

import { LeadNote } from './lead-note.entity';

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

  @Column({ nullable: true })
  clientName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  telegramId: string;

  @Column({ nullable: true })
  productInterest: string;

  @Column({ nullable: true })
  source: string;

  @Column({
    type: 'enum',
    enum: LeadStatus,
    default: LeadStatus.NEW,
  })
  status: LeadStatus;

  @Column({
    type: 'float',
    nullable: true,
  })
  budget: number;

  @Column({
    type: 'text',
    nullable: true,
  })
  aiSummary: string;

  @Column({ nullable: true })
  assignedManagerId: string;

  @OneToMany(() => LeadNote, (note) => note.lead)
  notes: LeadNote[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}