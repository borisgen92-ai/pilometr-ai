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
    const cleanMessage = message.trim().toLowerCase();

    if (cleanMessage.includes('мульч')) {
  return {
    response:
      'Для декоративной отсыпки и защиты почвы лучше подойдёт древесная мульча из сосны. Она помогает удерживать влагу, уменьшает рост сорняков и аккуратно смотрится на участке. Если важен внешний вид — выбирайте более чистую и ровную фракцию. Если задача больше практическая — можно взять обычную древесную мульчу.',
    lead: null,
  };
}

    if (cleanMessage === 'тест') {
      return {
        response: 'Связь работает. Бот Пилометр на месте 👍',
        lead: null,
      };
    }

    if (
      cleanMessage === 'привет' ||
      cleanMessage === 'здравствуйте' ||
      cleanMessage === 'добрый день'
    ) {
      return {
        response:
          'Здравствуйте! Я помощник Пилометра. Могу подсказать наличие, цену, размеры или помочь подобрать товар.',
        lead: null,
      };
    }

    await this.messagesService.saveMessage(sessionId, 'user', message);

    const historyContext =
      await this.messagesService.buildContext(sessionId);

    const intent = detectIntent(message);

    const needsClarification = this.needsProductClarification(message);

    if (needsClarification) {
      const response =
        'Уточните, пожалуйста, какой именно товар вас интересует:\n\n' +
        '• размер или толщина;\n' +
        '• сорт, если важен внешний вид;\n' +
        '• нужное количество;\n' +
        '• магазин для самовывоза, если нужен конкретный склад.\n\n' +
        'После этого посмотрю наличие по нужной точке.';

      return this.saveAndReturn(sessionId, response, {
        userMessage: message,
        sessionId,
        intent,
        response,
        products: [],
        lead: null,
        source: 'rules_need_product_clarification',
      });
    }

    if (intent === 'delivery') {
  const response =
    'Доставка рассчитывается индивидуально: зависит от города, объёма и состава заказа. ' +
    'По Москве можем отправить транспортной компанией. ' +
    'Напишите, пожалуйста, какой товар и количество нужны — менеджер рассчитает точную стоимость доставки.';

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    intent,
    response,
    products: [],
    lead: null,
    source: 'rules_delivery',
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

        const looksLikeOnlyName =
          directInterest.length > 0 &&
          !this.hasProductWords(directInterest);

        const historyInterest =
          this.extractInterestFromHistory(historyContext);

        const interest =
          !looksLikeOnlyName && directInterest
            ? directInterest
            : historyInterest || 'Консультация';

        const clientName = this.extractClientName(message);

                const dimensions = this.extractDimensions(message);
        const searchQuery = this.buildSearchQuery(message);

        const products = dimensions
          ? await this.productsService.findByDimensions(
              dimensions.width,
              dimensions.height,
              dimensions.length,
              message,
            )
          : await this.productsService.search(searchQuery);

        const product = products[0];

        lead = await this.leadsService.create({
          phone,
          clientName: clientName || undefined,
          source: 'chat',
          aiSummary: `[Категория: Контакт] ${message}`,
          productInterest: product?.name || interest,
        });

        const response =
          'Спасибо, номер получил. Передам заявку менеджеру — он свяжется с вами и поможет с заказом.';

        return this.saveAndReturn(sessionId, response, {
          userMessage: message,
          sessionId,
          intent,
          response,
                    products,
          product,
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

    const normalizedMessage = message
      .replace(/экстра/gi, 'Э')
      .replace(/сорт\s+э\b/gi, 'сорт Э')
      .replace(/нпс[-\s]?70/gi, 'НПС-70')
      .replace(/нрс[-\s]?70/gi, 'НРС-70')
      .replace(/нгс[-\s]?70/gi, '70');

    const searchQuery = this.buildSearchQuery(normalizedMessage);

    let products;

    if (dimensions) {
      products = await this.productsService.findByDimensions(
        dimensions.width,
        dimensions.height,
        dimensions.length,
        normalizedMessage,
      );
    } else {
      products = await this.productsService.search(searchQuery);
    }

    if (cleanMessage.includes('налич')) {
  products = products.filter((p) =>
    p.name.toLowerCase().includes('налич'),
  );
}

    const asksStockOrPrice =
      cleanMessage.includes('сколько') ||
      cleanMessage.includes('есть') ||
      cleanMessage.includes('налич') ||
      cleanMessage.includes('остат') ||
      cleanMessage.includes('цена') ||
      cleanMessage.includes('стоит');
      if (products.length === 0 && asksStockOrPrice) {
  const response =
    'Не нашёл точное совпадение в каталоге. Уточните название товара (например НПС-70, НРС-70, НГС-70) или напишите полный артикул.';

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    searchQuery,
    response,
    products: [],
    lead: null,
    source: 'rules_stock_not_found',
  });
}

    if (products.length > 0 && asksStockOrPrice) {
      const lowerMessage = message.toLowerCase();

      if (
        lowerMessage.includes('экстра') ||
        lowerMessage.includes('сорт э')
      ) {
        const extraProduct = products.find((p) =>
          p.name.toLowerCase().includes('сорт э') ||
          p.name.toLowerCase().includes('экстра'),
        );

        if (extraProduct) {
          products = [extraProduct];
        }
      }

      if (lowerMessage.includes('сорт в')) {
        const bProduct = products.find((p) =>
          p.name.toLowerCase().includes('сорт в'),
        );

        if (bProduct) {
          products = [bProduct];
        }
      }

      if (lowerMessage.includes('сорт а')) {
        const aProduct = products.find((p) =>
          p.name.toLowerCase().includes('сорт а'),
        );

        if (aProduct) {
          products = [aProduct];
        }
      }

      if (products.length > 1) {
        const options = products.slice(0, 5);

        const response =
          'Нашёл несколько похожих товаров. Уточните, какой именно нужен:\n\n' +
          options
            .map(
              (product, index) =>
                `${index + 1}. ${product.name}\n` +
                `Цена: ${product.price} ₽/${this.formatUnit(product.unit)}\n` +
                `Север: ${product.skotnoeStock} ${this.formatUnit(product.unit)}`,
            )
            .join('\n\n');

        return this.saveAndReturn(sessionId, response, {
          userMessage: message,
          sessionId,
          searchQuery,
          response,
          products: options,
          lead: null,
          source: 'rules_multiple_stock_price',
        });
      }

      const product = products[0];

      const response =
        `Нашёл товар: ${product.name}.\n` +
        `Цена: ${product.price} ₽/${this.formatUnit(product.unit)}.\n` +
        `Всего в наличии: ${product.stock} ${this.formatUnit(product.unit)}.\n\n` +
        `Остатки по точкам:\n` +
        `📍 Волхов (завод) — ${product.volhovStock} ${this.formatUnit(product.unit)}\n` +
        `📍 Север — ${product.skotnoeStock} ${this.formatUnit(product.unit)}\n` +
        `📍 Марьино — ${product.lomonosovStock} ${this.formatUnit(product.unit)}\n` +
        `📍 Рощино — ${product.roshinoStock} ${this.formatUnit(product.unit)}\n` +
        `📍 Ладога — ${product.ladogaStock} ${this.formatUnit(product.unit)}`;

      return this.saveAndReturn(sessionId, response, {
        userMessage: message,
        sessionId,
        searchQuery,
        response,
        products,
        lead: null,
        source: 'rules_stock_price',
      });
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
      console.log('FOUND PRODUCTS:', products.length);

      if (products.length > 0) {
        console.log('FIRST PRODUCT:', products[0]);
      }

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

    let filteredProducts = products;

    const wantsPremiumLook =
      message.toLowerCase().includes('без сучков') ||
      message.toLowerCase().includes('чистый внешний вид') ||
      message.toLowerCase().includes('красивый внешний вид') ||
      message.toLowerCase().includes('премиальный');

    if (wantsPremiumLook) {
      filteredProducts = products.filter(
        (p) =>
          p.name.toLowerCase().includes('сорт э') ||
          p.name.toLowerCase().includes('экстра'),
      );
    }

    const productsContext = this.buildProductsContext(filteredProducts, 5);

    const aiResponse = await this.aiService.ask(
      `История диалога:
${historyContext}

Клиент спрашивает:
"${message}"

Вот найденные товары из реального каталога:
${productsContext}

Ответь как продавец Пилометра.

ВАЖНО:
Если клиент спрашивает про конкретный склад:
- Север = используй только остаток после строки "📍 Север".
- Марьино = используй только остаток после строки "📍 Марьино".
- Рощино = используй только остаток после строки "📍 Рощино".
- Ладога = используй только остаток после строки "📍 Ладога".

Никогда не называй общий остаток по всем точкам остатком конкретного склада.

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
      products: filteredProducts,
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
      .split('\n')
      .filter((line) => !/(\+?\d[\d\s\-()]{8,}\d)/.test(line))
      .join(' ')
      .replace(/мой телефон.*$/gi, '')
      .replace(/телефон.*$/gi, '')
      .replace(/(\+?\d[\d\s\-()]{8,}\d)/g, '')
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
Общий остаток по всем точкам: ${item.stock} ${this.formatUnit(item.unit)}
Остатки по точкам:
📍 Волхов (завод) — ${item.volhovStock} ${this.formatUnit(item.unit)}
📍 Север — ${item.skotnoeStock} ${this.formatUnit(item.unit)}
📍 Марьино — ${item.lomonosovStock} ${this.formatUnit(item.unit)}
📍 Рощино — ${item.roshinoStock} ${this.formatUnit(item.unit)}
📍 Ладога — ${item.ladogaStock} ${this.formatUnit(item.unit)}
Размеры: ${item.height}х${item.width}х${item.length} мм`,
      )
      .join('\n\n');
  }

  private formatWarehouseStock(product: any): string {
    return (
      `Остатки по точкам:\n` +
      `📍 Волхов (завод) — ${product.volhovStock} ${this.formatUnit(product.unit)}\n` +
      `📍 Север — ${product.skotnoeStock} ${this.formatUnit(product.unit)}\n` +
      `📍 Марьино — ${product.lomonosovStock} ${this.formatUnit(product.unit)}\n` +
      `📍 Рощино — ${product.roshinoStock} ${this.formatUnit(product.unit)}\n` +
      `📍 Ладога — ${product.ladogaStock} ${this.formatUnit(product.unit)}`
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
      /(\d+)\s*(шт|штук|штуки|щит|щита|щитов|досок|доски|доска|бруса|брус|брусьев|слэб|слэба|слэбов|ступеней|ступени|ступень)/i,
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

  const digits = match[1].replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits.startsWith('7')) {
    return digits;
  }

  if (digits.length === 10) {
    return `7${digits}`;
  }

  return digits;
}

private extractClientName(message: string): string | null { 
     const vkNameMatch = message.match(/Имя клиента:\s*(.+)$/im);

  if (vkNameMatch?.[1]) {
    return vkNameMatch[1].trim();
  }

  const withoutPhone = message

    .replace(/(\+?\d[\d\s\-()]{8,}\d)/g, ' ')

    .replace(/[,:;.]/g, ' ')

    .trim();

  const stopWords = [

    'Хочу', 'Купить', 'Беру', 'Заказать', 'Оформить',

    'Телефон', 'Мой', 'Номер',

    'Слэб', 'Щит', 'Мебельный', 'Доска', 'Брус',

    'Сорт', 'Экстра', 'Север', 'Рощино', 'Марьино', 'Ладога',

  ];

  const words = withoutPhone

    .split(/\s+/)

    .filter((word) => /^[А-ЯЁ][а-яё]{1,20}$/.test(word))

    .filter((word) => !stopWords.includes(word));

  if (words.length === 0) {

    return null;

  }

  return words[words.length - 1];

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
      text.includes('налич') ||
      text.includes('нпс') ||
      text.includes('нрс') ||
      text.includes('нгс')
    ) {
      return 'Наличник';
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

    if (text.includes('нпс')) {
  return text.match(/нпс[-\s]?\d+/)?.[0].replace(/\s+/g, '-') || 'нпс';
}

if (text.includes('нрс')) {
  return text.match(/нрс[-\s]?\d+/)?.[0].replace(/\s+/g, '-') || 'нрс';
}

if (text.includes('нгс')) {
  return text.match(/нгс[-\s]?\d+/)?.[0].replace(/\s+/g, '-') || 'нгс';
}

if (text.includes('налич')) {
  return 'наличник';
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

  private needsProductClarification(message: string): boolean {
    const text = message.toLowerCase();

    const asksCleanGrade =
      text.includes('без сучков') ||
      text.includes('без сучка') ||
      text.includes('экстра') ||
      text.includes('сорт э');

    if (asksCleanGrade) {
      return false;
    }

    const asksAvailability =
      text.includes('есть') ||
      text.includes('сколько') ||
      text.includes('налич') ||
      text.includes('остат');

    const hasCategory =
      text.includes('щит') ||
      text.includes('брус') ||
      text.includes('доск') ||
      text.includes('слэб') ||
      text.includes('ступ') ||
      text.includes('тетив') ||
      text.includes('поруч') ||
      text.includes('баляс');

    const hasExactSize = /\d+\s*[xх]\s*\d+/.test(text);

    return asksAvailability && hasCategory && !hasExactSize;
  }

  private hasProductWords(text: string): boolean {
    const value = text.toLowerCase();

    return (
      value.includes('щит') ||
      value.includes('слэб') ||
      value.includes('доск') ||
      value.includes('брус') ||
      value.includes('ступ') ||
      value.includes('тетив') ||
      value.includes('поруч') ||
      value.includes('баляс') ||
      value.includes('налич') ||
      value.includes('мульч') ||
      value.includes('брикет')
    );
  }
}