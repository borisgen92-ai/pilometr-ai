import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LeadsModule } from './leads/leads.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { CalculatorModule } from './calculator/calculator.module';
import { ChatModule } from './chat/chat.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,

      autoLoadEntities: true,
      synchronize: true,
    }),

    LeadsModule,
    UsersModule,
    ProductsModule,
    CalculatorModule,
    ChatModule,
  ],
})
export class AppModule {}