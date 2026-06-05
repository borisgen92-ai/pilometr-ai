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

    const searchQuery = message;

    let products = await this.productsService.search(searchQuery);

    if (products.length === 0 && dimensions) {
      products = await this.productsService.findByDimensions(
        dimensions.width,
        dimensions.height,
        dimensions.length,
        message,
      );
    }

    if (products.length === 0) {
      const allProducts = await this.productsService.findAll();

      const relevantProducts = allProducts.filter(
        (item) =>
          message.toLowerCase().includes(item.category.toLowerCase()) ||
          message.includes('50') ||
          message.includes('100') ||
          message.includes('150') ||
          message.includes('200'),
      );

      const catalogContext = (relevantProducts.length > 0
        ? relevantProducts
        : allProducts
      )
        .slice(0, 20)
        .map(
          (item) =>
            `Товар: ${item.name}
Цена: ${item.price} ₽/${this.formatUnit(item.unit)}
Остаток: ${item.stock} ${this.formatUnit(item.unit)}
Описание: ${item.description || 'нет описания'}`,
        )
        .join('\n\n');

      let lead: Lead | null = null;

      if (phone) {
        lead = await this.leadsService.create({
          phone,
          source: 'chat',
          aiSummary: `[Категория: ${this.detectLeadCategory(message)}] ${message}`,
          productInterest: message
            .replace(/(\+?\d[\d\s\-()]{8,}\d)/g, '')
            .replace(/телефон[:\s]*/gi, '')
            .trim()
            .slice(0, 100),
        });
      }

      const aiResponse = await this.aiService.ask(message, catalogContext);

      return {
        userMessage: message,
        searchQuery,
        response:
          aiResponse +
          (lead ? ' Заявка создана. Менеджер свяжется с вами.' : ''),
        products: [],
        lead,
        source: 'openai_with_catalog',
      };
    }

    const product = products[0];

    let lead: Lead | null = null;

    if (phone) {
      lead = await this.leadsService.create({
        phone,
        source: 'chat',
        aiSummary: `[Категория: ${this.detectLeadCategory(message)}] ${message}`,
        productInterest: message
          .replace(/(\+?\d[\d\s\-()]{8,}\d)/g, '')
          .replace(/телефон[:\s]*/gi, '')
          .trim()
          .slice(0, 100),
      });
    }

    if (quantity && dimensions) {
      const volumeResult = this.calculatorService.calculateWoodVolume(
        dimensions.width,
        dimensions.height,
        dimensions.length,
        quantity,
      );

      const totalCost =
  product.unit === 'шт'
    ? product.price * quantity
    : this.calculatorService.calculateCost(
        product.price,
        volumeResult.totalVolume,
      );

      const stockStatus =
        product.stock >= quantity
          ? `В наличии достаточно: ${product.stock} ${this.formatUnit(
              product.unit,
            )}.`
          : `В наличии только ${product.stock} ${this.formatUnit(
              product.unit,
            )}. Не хватает ${quantity - product.stock} шт.`;

      const alternatives =
        product.stock >= quantity
          ? []
          : await this.productsService.findAlternatives(product.category, product.id);

      const alternativesText =
        alternatives.length > 0
          ? ` Могу предложить альтернативы: ${alternatives
              .map(
                (item) =>
                  `${item.name} — в наличии ${item.stock} ${this.formatUnit(
                    item.unit,
                  )}`,
              )
              .join('; ')}.`
          : '';

      const response =
        `Нашёл товар: ${product.name}. ` +
        `Количество: ${quantity} шт. ` +
        `Объём: ${volumeResult.totalVolume} м³. ` +
        `Стоимость: ${totalCost} ₽. ` +
        `${stockStatus} ` +
        `${alternativesText} ` +
        (lead
          ? 'Заявка создана, менеджер свяжется с вами.'
          : 'Если хотите, оставьте телефон — создам заявку для менеджера.');

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

    const productsContext = products
      .slice(0, 5)
      .map(
        (item, index) =>
          `${index + 1}. ${item.name}
Категория: ${item.category}
Цена: ${item.price} ₽/${this.formatUnit(item.unit)}
Остаток: ${item.stock} ${this.formatUnit(item.unit)}
Размеры: ${item.height}х${item.width}х${item.length} мм`,
      )
      .join('\n\n');

    const aiResponse = await this.aiService.ask(
      `Клиент спрашивает: "${message}"

Вот найденные товары из реального каталога:
${productsContext}

Ответь клиенту коротко и по делу. 
Если товар найден точно — скажи цену и наличие.
Если есть несколько вариантов — перечисли 2-3 лучших.
Не говори, что товара нет, если он есть в списке.`,
    );

    return {
      userMessage: message,
      searchQuery,
      response: aiResponse,
      products,
      lead,
      source: 'openai_with_products',
    };
  }

  private extractQuantity(message: string): number | null {
    const normalizedMessage = message
      .replace(/х/g, 'x')
      .replace(/Х/g, 'x')
      .replace(/\*/g, 'x');

    const withoutDimensions = normalizedMessage.replace(
      /\d+\s*x\s*\d+\s*x\s*\d+/gi,
      '',
    );

    const match = withoutDimensions.match(
      /(\d+)\s*(шт|штук|досок|доски|доска|бруса|брус|брусьев)/i,
    );

    if (!match) {
      return null;
    }

    return Number(match[1]);
  }

  private extractDimensions(
    message: string,
  ): { width: number; height: number; length: number } | null {
    const normalizedMessage = message
      .replace(/х/g, 'x')
      .replace(/Х/g, 'x')
      .replace(/\*/g, 'x');

    const match = normalizedMessage.match(/(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i);

    if (!match) {
      return null;
    }

    return {
      height: Number(match[1]),
      width: Number(match[2]),
      length: Number(match[3]),
    };
  }

  private extractPhone(message: string): string | null {
    const match = message.match(/(\+?\d[\d\s\-()]{8,}\d)/);

    if (!match) {
      return null;
    }

    return match[1].replace(/\s/g, '');
  }

  private formatUnit(unit: string): string {
    if (unit === 'm3') {
      return 'м³';
    }

    return unit;
  }

  private detectLeadCategory(message: string): string {
    const text = message.toLowerCase();

    if (text.includes('слэб')) {
      return 'Слэб';
    }

    if (text.includes('доск')) {
      return 'Доска';
    }

    if (text.includes('брус')) {
      return 'Брус';
    }

    if (
      text.includes('рассчит') ||
      text.includes('посчитай') ||
      text.includes('сколько будет')
    ) {
      return 'Расчёт';
    }

    return 'Консультация';
  }
}