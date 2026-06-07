import { Injectable } from '@nestjs/common';

import { detectIntent } from './intent';
import { MessagesService } from '../messages/messages.service';
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
    private readonly messagesService: MessagesService,
  ) {}

  async processMessage(message: string, sessionId = 'test-session') {
    await this.messagesService.saveMessage(sessionId, 'user', message);

    const historyContext =
      await this.messagesService.buildContext(sessionId);

    const intent = detectIntent(message);

    if (intent === 'delivery') {
      const aiResponse = await this.aiService.ask(
        `История диалога:
${historyContext}

Новое сообщение клиента:
"${message}"

Клиент спрашивает про доставку или получение заказа.

Ответь как продавец Пилометра.
Используй правила доставки, самовывоза и транспортной компании из базы знаний.
Не ищи товар.
Не называй точную стоимость доставки, если её нет в данных.
Если нужен расчёт — попроси город доставки и состав заказа.`,
      );

      return this.saveAndReturn(sessionId, aiResponse, {
        userMessage: message,
        sessionId,
        intent,
        response: aiResponse,
        products: [],
        lead: null,
        source: 'intent_delivery',
      });
    }

    if (intent === 'payment') {
      const aiResponse = await this.aiService.ask(
        `История диалога:
${historyContext}

Новое сообщение клиента:
"${message}"

Клиент спрашивает про оплату.

Ответь как продавец Пилометра.
Используй правила оплаты из базы знаний.
Не ищи товар.
Объясни кратко и понятно.`,
      );

      return this.saveAndReturn(sessionId, aiResponse, {
        userMessage: message,
        sessionId,
        intent,
        response: aiResponse,
        products: [],
        lead: null,
        source: 'intent_payment',
      });
    }

    if (intent === 'return') {
      const aiResponse = await this.aiService.ask(
        `История диалога:
${historyContext}

Новое сообщение клиента:
"${message}"

Клиент спрашивает про возврат или обмен.

Ответь как продавец Пилометра.
Используй правила возврата из базы знаний.
Не ищи товар.
Отвечай спокойно, культурно и по делу.`,
      );

      return this.saveAndReturn(sessionId, aiResponse, {
        userMessage: message,
        sessionId,
        intent,
        response: aiResponse,
        products: [],
        lead: null,
        source: 'intent_return',
      });
    }

    if (intent === 'consultation') {
      const aiResponse = await this.aiService.ask(
        `История диалога:
${historyContext}

Новое сообщение клиента:
"${message}"

Клиент просит консультацию.

Ответь как опытный продавец Пилометра.
Не ищи конкретный товар, если клиент не указал точные размеры или название.
Сначала помоги разобраться с задачей.
Задай 1–3 коротких уточняющих вопроса, если данных мало.`,
      );

      return this.saveAndReturn(sessionId, aiResponse, {
        userMessage: message,
        sessionId,
        intent,
        response: aiResponse,
        products: [],
        lead: null,
        source: 'intent_consultation',
      });
    }

    if (intent === 'contact') {
      const phone = this.extractPhone(message);

      let lead: Lead | null = null;

      if (phone) {
        const directInterest = this.cleanProductInterest(message);

const historyInterest =
  directInterest || this.extractInterestFromHistory(historyContext);

const interest = historyInterest || 'Консультация';

        lead = await this.leadsService.create({
          phone,
          source: 'chat',
          aiSummary: `[Категория: Контакт] ${message}`,
          productInterest: interest,
        });

        const response =
          'Спасибо, номер получил. Передам заявку менеджеру — он свяжется с вами и поможет с заказом.';

        return this.saveAndReturn(sessionId, response, {
          userMessage: message,
          sessionId,
          intent,
          response,
          products: [],
          lead,
          source: 'intent_contact_created',
        });
      }

      const response =
        'Можете написать номер телефона — передам заявку менеджеру. По вопросам счёта для организаций также можно написать на pilometr@pilometr.ru.';

      return this.saveAndReturn(sessionId, response, {
        userMessage: message,
        sessionId,
        intent,
        response,
        products: [],
        lead: null,
        source: 'intent_contact',
      });
    }

    if (intent === 'order') {
      const response =
        'Хорошо, помогу с заказом. Напишите, пожалуйста, какой товар нужен, количество и удобный способ получения: самовывоз или отправка транспортной компанией.';

      return this.saveAndReturn(sessionId, response, {
        userMessage: message,
        sessionId,
        intent,
        response,
        products: [],
        lead: null,
        source: 'intent_order',
      });
    }

    const quantity = this.extractQuantity(message);
    const dimensions = this.extractDimensions(message);
    const phone = this.extractPhone(message);
    const searchQuery = this.buildSearchQuery(message);

    let products;

    if (dimensions) {
      products = await this.productsService.findByDimensions(
        dimensions.width,
        dimensions.height,
        dimensions.length,
        message,
      );
    } else {
      products = await this.productsService.search(searchQuery);
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
          aiSummary: `[Категория: ${this.detectLeadCategory(
            message,
          )}] ${message}`,
          productInterest: this.cleanProductInterest(message),
        });
      }

      const aiResponse = await this.aiService.ask(
        `История диалога:
${historyContext}

Новое сообщение клиента:
${message}`,
        catalogContext,
      );

      const response =
        aiResponse +
        (lead ? ' Заявка создана. Менеджер свяжется с вами.' : '');

      return this.saveAndReturn(sessionId, response, {
        userMessage: message,
        sessionId,
        searchQuery,
        response,
        products: [],
        lead,
        source: 'openai_with_catalog',
      });
    }

    if (!dimensions && products.length > 0) {
      const productsContext = this.buildProductsContext(products, 10);

      const aiResponse = await this.aiService.ask(
        `История диалога:
${historyContext}

Клиент спрашивает:
"${message}"

Найденные товары из каталога:
${productsContext}

Ответь как продавец Пилометра.
Если клиент спрашивает про стол или столешницу — рекомендуй мебельный щит 40 мм, а 28 мм как более лёгкий вариант.
Если клиент спрашивает общую категорию, не просто перечисляй первые товары, а помоги выбрать по задаче.`,
        productsContext,
      );

      return this.saveAndReturn(sessionId, aiResponse, {
        userMessage: message,
        sessionId,
        searchQuery,
        response: aiResponse,
        products,
        lead: null,
        source: 'openai_with_catalog_and_knowledge',
      });
    }

    const product = products[0];

    let lead: Lead | null = null;

    if (phone) {
      lead = await this.leadsService.create({
        phone,
        source: 'chat',
        aiSummary: `[Категория: ${this.detectLeadCategory(
          message,
        )}] ${message}`,
        productInterest: this.cleanProductInterest(message),
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
          : await this.productsService.findAlternatives(
              product.category,
              product.id,
            );

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

      const warehouseStockText =
        this.formatWarehouseStock(product);

      const response =
        `Нашёл товар: ${product.name}. ` +
        `Количество: ${quantity} шт. ` +
        `Объём: ${volumeResult.totalVolume} м³. ` +
        `Стоимость: ${totalCost} ₽. ` +
        `${stockStatus}\n` +
        `${warehouseStockText}\n` +
        `${alternativesText}` +
        (alternativesText ? '\n' : '') +
        (lead
          ? 'Заявка создана, менеджер свяжется с вами.'
          : 'Если хотите, оставьте телефон — создам заявку для менеджера.');

      return this.saveAndReturn(sessionId, response, {
        userMessage: message,
        sessionId,
        searchQuery,
        response,
        product,
        calculation: volumeResult,
        totalCost,
        lead,
        source: 'rules',
      });
    }

    const productsContext = this.buildProductsContext(products, 5);

    const aiResponse = await this.aiService.ask(
      `История диалога:
${historyContext}

Клиент спрашивает:
"${message}"

Вот найденные товары из реального каталога:
${productsContext}

Ответь как продавец Пилометра.
Используй базу знаний Пилометра из system prompt.
Если клиент спрашивает про стол или столешницу — опирайся на знания о мебельном щите 40 мм, 28 мм и сортах.
Если клиент спрашивает общую категорию, не просто перечисляй первые товары, а помоги выбрать по задаче.`,
      productsContext,
    );

    return this.saveAndReturn(sessionId, aiResponse, {
      userMessage: message,
      sessionId,
      searchQuery,
      response: aiResponse,
      products,
      lead,
      source: 'openai_with_products',
    });
  }

private async saveAndReturn(
  sessionId: string,
  response: string | null,
  data: any,
) {
  const safeResponse =
    response || 'Не смог подготовить ответ. Передам вопрос менеджеру.';

  await this.messagesService.saveMessage(
    sessionId,
    'assistant',
    safeResponse,
  );

  return {
    ...data,
    response: safeResponse,
  };
}

  private cleanProductInterest(message: string): string {
    return message
      .replace(/(\+?\d[\d\s\-()]{8,}\d)/g, '')
      .replace(/телефон[:\s]*/gi, '')
      .replace(/мой/gi, '')
      .replace(/беру/gi, '')
      .replace(/хочу купить/gi, '')
      .replace(/оформить/gi, '')
      .replace(/заказать/gi, '')
      .replace(/[,.]/g, '')
      .trim()
      .slice(0, 100);
  }

  private buildProductsContext(products: any[], limit: number): string {
    return products
      .slice(0, limit)
      .map(
        (item, index) =>
          `${index + 1}. ${item.name}
Категория: ${item.category}
Цена: ${item.price} ₽/${this.formatUnit(item.unit)}
Общий остаток: ${item.stock} ${this.formatUnit(item.unit)}
Остатки по точкам:
- Север: ${item.volhovStock} ${this.formatUnit(item.unit)}
- Марьино: ${item.lomonosovStock} ${this.formatUnit(item.unit)}
- Рощино: ${item.roshinoStock} ${this.formatUnit(item.unit)}
- Ладога: ${item.ladogaStock} ${this.formatUnit(item.unit)}
Размеры: ${item.height}х${item.width}х${item.length} мм`,
      )
      .join('\n\n');
  }

  private formatWarehouseStock(product: any): string {
    return (
      `Остатки по точкам:\n` +
      `📍 Север — ${product.volhovStock} ${this.formatUnit(
        product.unit,
      )}\n` +
      `📍 Марьино — ${product.lomonosovStock} ${this.formatUnit(
        product.unit,
      )}\n` +
      `📍 Рощино — ${product.roshinoStock} ${this.formatUnit(
        product.unit,
      )}\n` +
      `📍 Ладога — ${product.ladogaStock} ${this.formatUnit(
        product.unit,
      )}`
    );
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

    const match = normalizedMessage.match(
      /(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i,
    );

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

  private buildSearchQuery(message: string): string {
    const text = message.toLowerCase();

    if (text.includes('стол') || text.includes('столешниц')) {
      return 'щит 40';
    }

    if (text.includes('щит')) {
      return 'щит';
    }

    if (text.includes('доск')) {
      return 'дос';
    }

    if (text.includes('брус')) {
      return 'брус';
    }

    if (text.includes('ступ')) {
      return 'ступень';
    }

    if (text.includes('слэб')) {
      return 'слэб';
    }

    return message;
  }
  

  private extractInterestFromHistory(historyContext: string): string {
    const text = historyContext.toLowerCase();

    const parts: string[] = [];

    if (text.includes('слэб')) {
      parts.push('Слэб');
    }

    const dimensionsMatch = historyContext.match(
      /(\d{2,3})[хx](\d{2,3})[хx](\d{3,4})/,
    );

    if (dimensionsMatch) {
      parts.push(dimensionsMatch[0]);
    }

    const quantityMatches = [
  ...historyContext.matchAll(
    /(\d+)\s*(шт|штук|штуки)/gi,
  ),
];

const clientQuantityMatch = quantityMatches.find(
  (match) => Number(match[1]) < 100,
);

if (clientQuantityMatch) {
  parts.push(`${clientQuantityMatch[1]} шт`);
}

    if (text.includes('рощино')) {
      parts.push('Рощино');
    }

    if (text.includes('север')) {
      parts.push('Север');
    }

    if (text.includes('марьино')) {
      parts.push('Марьино');
    }

    if (text.includes('ладога')) {
      parts.push('Ладога');
    }

    return parts.length > 0 ? parts.join(', ') : '';
  }
}