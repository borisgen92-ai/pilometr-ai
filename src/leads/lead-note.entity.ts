import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';

import { Lead } from './lead.entity';

@Entity('lead_notes')
export class LeadNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'text',
  })
  text: string;

  @Column({
    nullable: true,
  })
  authorName: string;

  @ManyToOne(() => Lead, (lead) => lead.notes, {
    onDelete: 'CASCADE',
  })
  lead: Lead;

  @CreateDateColumn()
  createdAt: Date;
}