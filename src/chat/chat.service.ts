import { Injectable } from '@nestjs/common';

import { ProductsService } from '../products/products.service';
import { CalculatorService } from '../calculator/calculator.service';
import { LeadsService } from '../leads/leads.service';
import { Lead } from '../leads/lead.entity';
import { AiService } from '../ai/ai.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly calculatorService: CalculatorService,
    private readonly leadsService: LeadsService,
    private readonly aiService: AiService,
  ) {}

  async processMessage(message: string) {
    const quantity = this.extractQuantity(message);
    const dimensions = this.extractDimensions(message);
    const phone = this.extractPhone(message);

    const searchQuery = dimensions
      ? `${dimensions.width}x${dimensions.height}x${dimensions.length}`
      : message;

    const products = await this.productsService.search(searchQuery);

    if (products.length === 0) {
      const aiResponse = await this.aiService.ask(message);

      return {
        userMessage: message,
        searchQuery,
        response: aiResponse,
        products: [],
        source: 'openai',
      };
    }

    const product = products[0];

    let lead: Lead | null = null;

    if (phone) {
      lead = await this.leadsService.create({
        phone,
        productInterest: product.name,
        source: 'chat',
        aiSummary: message,
      });
    }

    if (quantity && dimensions) {
      const volumeResult =
        this.calculatorService.calculateWoodVolume(
          dimensions.width,
          dimensions.height,
          dimensions.length,
          quantity,
        );

      const totalCost =
        this.calculatorService.calculateCost(
          product.price,
          volumeResult.totalVolume,
        );
        const stockStatus =
  product.stock >= quantity
    ? `В наличии достаточно: ${product.stock} ${product.unit}.`
    : `В наличии только ${product.stock} ${product.unit}. Не хватает ${quantity - product.stock} шт.`;

    const response =
  `Нашёл товар: ${product.name}. ` +
  `Количество: ${quantity} шт. ` +
  `Объём: ${volumeResult.totalVolume} м³. ` +
  `Стоимость: ${totalCost} ₽. ` +
  `${stockStatus} ` +
  (lead
    ? `Заявка создана, менеджер свяжется с вами.`
    : `Если хотите, оставьте телефон — создам заявку для менеджера.`);

      return {
        userMessage: message,
        searchQuery,
        response,
        product,
        calculation: volumeResult,
        totalCost,
        lead,
        source: 'rules',
      };
    }

    const aiResponse = await this.aiService.ask(
      `Клиент спрашивает: "${message}". 
      В каталоге найден товар: ${product.name}, цена ${product.price} ₽/${product.unit}, остаток ${product.stock}. 
      Ответь клиенту коротко и по делу.`,
    );

    return {
      userMessage: message,
      searchQuery,
      response: aiResponse,
      products,
      lead,
      source: 'openai_with_product',
    };
  }

  private extractQuantity(message: string): number | null {
    const match = message.match(
      /(\d+)\s*(шт|штук|досок|доски|доска|бруса|брус|брусьев)?/i,
    );

    if (!match) {
      return null;
    }

    return Number(match[1]);
  }

  private extractDimensions(message: string):
    | { width: number; height: number; length: number }
    | null {
    const normalizedMessage = message
      .replace(/х/g, 'x')
      .replace(/Х/g, 'x')
      .replace(/\*/g, 'x');

    const match = normalizedMessage.match(
      /(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i,
    );

    if (!match) {
      return null;
    }

    return {
      width: Number(match[1]),
      height: Number(match[2]),
      length: Number(match[3]),
    };
  }

  private extractPhone(message: string): string | null {
    const match = message.match(
      /(\+?\d[\d\s\-()]{8,}\d)/,
    );

    if (!match) {
      return null;
    }

    return match[1].replace(/\s/g, '');
  }
}