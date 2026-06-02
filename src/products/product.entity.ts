import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  category: string;

  @Column({ nullable: true })
  woodType: string;

  @Column({
    type: 'float',
    nullable: true,
  })
  width: number;

  @Column({
    type: 'float',
    nullable: true,
  })
  height: number;

  @Column({
    type: 'float',
    nullable: true,
  })
  length: number;

  @Column({ nullable: true })
  grade: string;

  @Column({ nullable: true })
  humidity: string;

  @Column({
    type: 'float',
    default: 0,
  })
  price: number;

  @Column({
    default: 0,
  })
  stock: number;

  @Column({
    default: 'm3',
  })
  unit: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}