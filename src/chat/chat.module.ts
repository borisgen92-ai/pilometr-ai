import { Module } from '@nestjs/common';

import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

import { ProductsModule } from '../products/products.module';
import { CalculatorModule } from '../calculator/calculator.module';
import { LeadsModule } from '../leads/leads.module';
import { AiModule } from '../ai/ai.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    ProductsModule,
    CalculatorModule,
    LeadsModule,
    AiModule,
    MessagesModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}