import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Lead } from '../lead.entity';

@Entity()
export class LeadItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Lead, (lead) => lead.items, {
    onDelete: 'CASCADE',
  })
  lead: Lead;

  @Column()
  productId: string;

  @Column()
  productName: string;

  @Column('float')
  price: number;

  @Column('float')
  quantity: number;

  @Column('float')
  total: number;
}