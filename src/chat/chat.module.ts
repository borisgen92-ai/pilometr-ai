import { Module } from '@nestjs/common';

import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

import { ProductsModule } from '../products/products.module';
import { CalculatorModule } from '../calculator/calculator.module';
import { LeadsModule } from '../leads/leads.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    ProductsModule,
    CalculatorModule,
    LeadsModule,
    AiModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}