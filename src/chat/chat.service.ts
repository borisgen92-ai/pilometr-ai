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

  async processMessage(
  message: string,
  sessionId = 'test-session',
  meta?: {
    vkPeerId?: string;
  },
) {
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

      const earlyPhone = this.extractPhone(message);

      const isConfirmationMessage =
  /в[ссёе]\s*верно|подтверждаю|да|оформляйте|можно оформлять/i.test(message);

const phoneFromHistoryForConfirmation = this.extractPhone(historyContext);

if (isConfirmationMessage && phoneFromHistoryForConfirmation) {
  const orderSummary =
    this.extractLastProductContext(historyContext) ||
    this.extractInterestFromHistory(historyContext) ||
    'Клиент подтвердил заявку';

  const phoneFromHistory = phoneFromHistoryForConfirmation;

  if (phoneFromHistory) {
    const orderQuantity = this.extractQuantity(orderSummary);
    const orderWarehouse = this.extractWarehouse(orderSummary);
    const orderDimensions = this.extractDimensions(orderSummary);

    let orderProduct: any = null;

    if (orderDimensions) {
      const foundProducts = await this.productsService.findByDimensions(
        orderDimensions.width,
        orderDimensions.height,
        orderDimensions.length,
        orderSummary,
      );

      orderProduct = this.pickBestProduct(foundProducts, orderSummary);
    }

    const lead = await this.leadsService.create({
      phone: phoneFromHistory,
      clientName: this.extractClientName(historyContext) || undefined,
      source: meta?.vkPeerId ? 'vk' : 'chat',
      vkPeerId: meta?.vkPeerId,
      aiSummary:
        `[Категория: Заказ]\n` +
        `Интерес: ${orderSummary}\n\n` +
        `История диалога:\n${historyContext}`,
      productInterest: orderSummary,

      items: orderProduct
        ? [
            {
              productId: orderProduct.id,
              productName: orderProduct.name,
              productPrice: orderProduct.price,
              productUnit: orderProduct.unit,
              requestedQuantity: orderQuantity || undefined,
              warehouseStock: {
                volhov: orderProduct.volhovStock ?? 0,
                sever: orderProduct.skotnoeStock ?? 0,
                marino: orderProduct.lomonosovStock ?? 0,
                roshino: orderProduct.roshinoStock ?? 0,
                ladoga: orderProduct.ladogaStock ?? 0,
              },
              bestWarehouse: orderWarehouse || undefined,
            },
          ]
        : undefined,

      productId: orderProduct?.id,
      productName: orderProduct?.name,
      productPrice: orderProduct?.price,
      productUnit: orderProduct?.unit,
      requestedQuantity: orderQuantity || undefined,
      bestWarehouse: orderWarehouse || undefined,
      budget: orderProduct && orderQuantity ? orderProduct.price * orderQuantity : undefined,
    });

    const response =
      'Спасибо, заявка создана. Менеджер свяжется с вами для подтверждения заказа.';

    return this.saveAndReturn(sessionId, response, {
      userMessage: message,
      sessionId,
      response,
      products: orderProduct ? [orderProduct] : [],
      lead,
      source: 'confirmed_order_created_from_history',
    });
  }
}

const earlyPhoneRawMatch = message.match(
  /(?:\+7|7|8)\s*\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/,
);

const earlyMessageWithoutPhone = earlyPhoneRawMatch
  ? message.replace(earlyPhoneRawMatch[0], '').trim()
  : message.trim();

const hasOrderInfoWithPhone =
  earlyMessageWithoutPhone.length > 0 &&
  (
    this.hasProductWords(earlyMessageWithoutPhone) ||
    this.extractDimensions(earlyMessageWithoutPhone) ||
    this.extractQuantity(earlyMessageWithoutPhone)
  );

  const orderLinesWithPhone = this.extractOrderLines(earlyMessageWithoutPhone);

  console.log('ORDER LINES WITH PHONE:', orderLinesWithPhone);
console.log('EARLY MESSAGE WITHOUT PHONE:', earlyMessageWithoutPhone);

if (earlyPhone && orderLinesWithPhone.length > 0) {
  const commonWarehouse = this.extractWarehouse(earlyMessageWithoutPhone);

  const orderItems = await Promise.all(
    orderLinesWithPhone.map(async (line) => {
      const lineDimensions = this.extractDimensions(line);
      const lineQuantity = this.extractQuantity(line);
      const lineWarehouse =
        this.extractWarehouse(line) || commonWarehouse;

      if (!lineDimensions) {
        return null;
      }

      const foundProducts = await this.productsService.findByDimensions(
        lineDimensions.width,
        lineDimensions.height,
        lineDimensions.length,
        line,
      );

      const lineProduct = this.pickBestProduct(foundProducts, line);

      if (!lineProduct) {
        return null;
      }

      return {
        productId: lineProduct.id,
        productName: lineProduct.name,
        productPrice: lineProduct.price,
        productUnit: lineProduct.unit,
        requestedQuantity: lineQuantity || undefined,
        warehouseStock: {
          volhov: lineProduct.volhovStock ?? 0,
          sever: lineProduct.skotnoeStock ?? 0,
          marino: lineProduct.lomonosovStock ?? 0,
          roshino: lineProduct.roshinoStock ?? 0,
          ladoga: lineProduct.ladogaStock ?? 0,
        },
        bestWarehouse: lineWarehouse || undefined,
      };
    }),
  ).then((items) =>
    items.filter(
      (item): item is NonNullable<typeof item> => item !== null,
    ),
  );

  const totalBudget = orderItems.reduce(
    (sum, item) =>
      sum + (item.productPrice || 0) * (item.requestedQuantity || 0),
    0,
  );

  const lead = await this.leadsService.create({
    phone: earlyPhone,
    clientName: this.extractClientName(message) || undefined,
    source: meta?.vkPeerId ? 'vk' : 'chat',
    vkPeerId: meta?.vkPeerId,
    aiSummary:
      `[Категория: Заказ]\n` +
      `Интерес: ${earlyMessageWithoutPhone}\n\n` +
      `История диалога:\n${historyContext}`,
    productInterest: earlyMessageWithoutPhone,
    items: orderItems,
    productId: orderItems[0]?.productId,
    productName: orderItems[0]?.productName,
    productPrice: orderItems[0]?.productPrice,
    productUnit: orderItems[0]?.productUnit,
    requestedQuantity: orderItems[0]?.requestedQuantity,
    warehouseStock: orderItems[0]?.warehouseStock,
    bestWarehouse: orderItems[0]?.bestWarehouse,
    budget: totalBudget || undefined,
  });

  const response =
    `Спасибо, заявка создана. Передал менеджеру ${orderItems.length} позиции.`;

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [],
    lead,
    source: 'multi_item_order_created_with_phone',
  });
}

if (
  earlyPhone &&
  message.replace(/\D/g, '').length >= 10 &&
  !hasOrderInfoWithPhone
) {
  const hasPickupStoreInHistory =
    /север|марьино|рощино|ладога/i.test(historyContext);

    const orderSummaryBeforePhone =
  this.extractLastProductContext(historyContext) ||
  this.extractInterestFromHistory(historyContext) ||
  earlyMessageWithoutPhone;

const orderDimensionsBeforePhone =
  this.extractDimensions(orderSummaryBeforePhone);

const orderSearchQueryBeforePhone =
  this.buildSearchQuery(orderSummaryBeforePhone);

let orderProductBeforePhone: any = null;

if (orderDimensionsBeforePhone) {
  const foundProducts = await this.productsService.findByDimensions(
    orderDimensionsBeforePhone.width,
    orderDimensionsBeforePhone.height,
    orderDimensionsBeforePhone.length,
    orderSummaryBeforePhone,
  );

  orderProductBeforePhone = this.pickBestProduct(
  foundProducts,
  orderSummaryBeforePhone,
);
} else {
  const foundProducts = await this.productsService.search(
    orderSearchQueryBeforePhone,
  );

  orderProductBeforePhone = foundProducts[0] || null;
}

console.log('PHONE HISTORY CONTEXT:', historyContext);
console.log('ORDER SUMMARY BEFORE PHONE:', orderSummaryBeforePhone);
console.log('ORDER DIMENSIONS BEFORE PHONE:', orderDimensionsBeforePhone);

if (!orderProductBeforePhone) {
  const response =
    'Не нашёл такой товар в каталоге. Уточните, пожалуйста, размер, толщину, сорт и нужное количество — после этого проверю наличие и помогу оформить заявку.';

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [],
    lead: null,
    source: 'phone_received_but_product_not_found',
  });
}

  if (!hasPickupStoreInHistory) {
    const response =
      'Спасибо, номер получил. Для оформления заявки выберите, пожалуйста, магазин для самовывоза:\n\n' +
      '📍 Север\n' +
      '📍 Марьино\n' +
      '📍 Рощино\n' +
      '📍 Ладога';

    return this.saveAndReturn(sessionId, response, {
      userMessage: message,
      sessionId,
      response,
      products: [],
      lead: null,
      source: 'phone_received_waiting_for_pickup_store',
    });
  }

  const response =
  'Спасибо, номер получил. Заявка передана менеджеру — он свяжется с вами для подтверждения заказа.';

const orderSummary =
  this.extractLastProductContext(historyContext) ||
  this.extractInterestFromHistory(historyContext) ||
  'Клиент оставил телефон после подбора товара';

  const orderLines = this.extractOrderLines(historyContext);
  
  console.log('FINAL ORDER SUMMARY:', orderSummary);

  const orderQuantity = this.extractQuantity(orderSummary);
const orderWarehouse = this.extractWarehouse(orderSummary);

const orderDimensions = this.extractDimensions(orderSummary);
const orderSearchQuery = this.buildSearchQuery(orderSummary);

let orderProduct: any = orderProductBeforePhone;

if (!orderProduct) {
  const response =
    'Не нашёл такой товар в каталоге. Уточните, пожалуйста, размер, толщину, сорт и нужное количество — после этого проверю наличие и помогу оформить заявку.';

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [],
    lead: null,
    source: 'early_phone_product_not_found',
  });
}

const selectedWarehouseStock = orderProduct
  ? this.getWarehouseStock(orderProduct, orderWarehouse)
  : null;

const orderBudget =
  orderProduct && orderQuantity
    ? orderProduct.price * orderQuantity
    : null;

const managerSummary =
  `[Категория: Заказ]\n` +
  `Интерес: ${orderSummary}\n\n` +
  `История диалога:\n${historyContext}`;

  const orderItems =
  orderLines.length > 1
    ? await Promise.all(
        orderLines.map(async (line) => {
          const lineDimensions = this.extractDimensions(line);
          const lineQuantity = this.extractQuantity(line);
          const lineWarehouse =
            this.extractWarehouse(line) || orderWarehouse;

          if (!lineDimensions) {
            return null;
          }

          const foundProducts = await this.productsService.findByDimensions(
            lineDimensions.width,
            lineDimensions.height,
            lineDimensions.length,
            line,
          );

          const lineProduct = this.pickBestProduct(foundProducts, line);

          if (!lineProduct) {
            return null;
          }

          return {
            productId: lineProduct.id,
            productName: lineProduct.name,
            productPrice: lineProduct.price,
            productUnit: lineProduct.unit,
            requestedQuantity: lineQuantity || undefined,
            warehouseStock: {
              volhov: lineProduct.volhovStock ?? 0,
              sever: lineProduct.skotnoeStock ?? 0,
              marino: lineProduct.lomonosovStock ?? 0,
              roshino: lineProduct.roshinoStock ?? 0,
              ladoga: lineProduct.ladogaStock ?? 0,
            },
            bestWarehouse: lineWarehouse || undefined,
          };
        }),
      ).then((items) =>
  items.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  ),
)
    : [];

const lead = await this.leadsService.create({
  phone: earlyPhone,
  clientName: this.extractClientName(message) || undefined,
  source: meta?.vkPeerId ? 'vk' : 'chat',
  vkPeerId: meta?.vkPeerId,
  aiSummary: managerSummary,
  productInterest: orderSummary,

  items:
  orderItems.length > 0
    ? orderItems
    : orderProduct
      ? [
          {
            productId: orderProduct.id,
            productName: orderProduct.name,
            productPrice: orderProduct.price,
            productUnit: orderProduct.unit,
            requestedQuantity: orderQuantity || undefined,
            warehouseStock: {
              volhov: orderProduct.volhovStock ?? 0,
              sever: orderProduct.skotnoeStock ?? 0,
              marino: orderProduct.lomonosovStock ?? 0,
              roshino: orderProduct.roshinoStock ?? 0,
              ladoga: orderProduct.ladogaStock ?? 0,
            },
            bestWarehouse: orderWarehouse || undefined,
          },
        ]
      : undefined,

  productId: orderProduct?.id,
  productName: orderProduct?.name,
  productPrice: orderProduct?.price,
  productUnit: orderProduct?.unit,
  requestedQuantity: orderQuantity || undefined,
  warehouseStock: orderProduct
  ? {
      volhov: orderProduct.volhovStock ?? 0,
      sever: orderProduct.skotnoeStock ?? 0,
      marino: orderProduct.lomonosovStock ?? 0,
      roshino: orderProduct.roshinoStock ?? 0,
      ladoga: orderProduct.ladogaStock ?? 0,
    }
  : undefined,
  bestWarehouse: orderWarehouse || undefined,
  budget: orderBudget ?? undefined,
});

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [],
    lead,
    source: 'early_phone_created_from_history',
  });
}

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

                const messageWithoutPhone = message
  .replace(/(\+?\d[\d\s\-()]{8,}\d)/g, '')
  .trim();

const isOnlyPhone = messageWithoutPhone.length === 0;

        if (isOnlyPhone) {
          lead = await this.leadsService.create({
  phone,
  clientName: clientName || undefined,
  source: meta?.vkPeerId ? 'vk' : 'chat',
  vkPeerId: meta?.vkPeerId,
            aiSummary: `[Категория: Контакт] ${historyInterest || historyContext}`,
productInterest:
  directInterest ||
  historyInterest ||
  'Клиент оставил телефон после подбора товара',
          });

          const response =
            'Спасибо, номер получил. Заявка передана менеджеру — он свяжется с вами для подтверждения заказа.';

          return this.saveAndReturn(sessionId, response, {
            userMessage: message,
            sessionId,
            intent,
            response,
            products: [],
            lead,
            source: 'intent_contact_created_from_history',
          });
        }

                const dimensions = this.extractDimensions(message);
        const searchQuery = this.buildSearchQuery(message);

        let products = dimensions
  ? await this.productsService.findByDimensions(
              dimensions.width,
              dimensions.height,
              dimensions.length,
              message,
            )
          : await this.productsService.search(searchQuery);

          if (message.toLowerCase().includes('слэб')) {
  products = products.filter((item) =>
    item.name.toLowerCase().includes('слэб'),
  );
}

        if (products.length === 0) {
          const response =
            'Не нашёл точный товар в каталоге по этому размеру. Уточните, пожалуйста: нужен именно слэб или другой товар? Можете написать примерный размер и количество — передам менеджеру после уточнения.';

          return this.saveAndReturn(sessionId, response, {
            userMessage: message,
            sessionId,
            intent,
            response,
            products: [],
            lead: null,
            source: 'intent_contact_product_not_found',
          });
        }

        const product = products[0];
        if (products.length > 1) {
          const options = products.slice(0, 5);

          const response =
            'Нашёл несколько похожих товаров. Уточните, пожалуйста, какой именно нужен:\n\n' +
            options
              .map(
                (item, index) =>
                  `${index + 1}. ${item.name}\n` +
                  `Цена: ${item.price} ₽/${this.formatUnit(item.unit)}\n` +
                  `Остаток: ${item.stock} ${this.formatUnit(item.unit)}`,
              )
              .join('\n\n') +
            '\n\nПосле выбора передам заявку менеджеру.';

          return this.saveAndReturn(sessionId, response, {
            userMessage: message,
            sessionId,
            intent,
            response,
            products: options,
            lead: null,
            source: 'intent_contact_need_product_choice',
          });
        }

        lead = await this.leadsService.create({
  phone,
  clientName: clientName || undefined,
  source: meta?.vkPeerId ? 'vk' : 'chat',
  vkPeerId: meta?.vkPeerId,
  aiSummary: `[Категория: Контакт] ${message}`,
  productInterest: product?.name || interest,

  items: product
  ? [
      {
        productId: product.id,
        productName: product.name,
        productPrice: product.price,
        productUnit: product.unit,
        requestedQuantity: this.extractQuantity(message) || undefined,
        warehouseStock: {
          volhov: product.volhovStock ?? 0,
          sever: product.skotnoeStock ?? 0,
          marino: product.lomonosovStock ?? 0,
          roshino: product.roshinoStock ?? 0,
          ladoga: product.ladogaStock ?? 0,
        },
        bestWarehouse: this.getBestWarehouse(product),
      },
    ]
  : undefined,

  productId: product?.id,
  productName: product?.name,
  productPrice: product?.price,
  productUnit: product?.unit,
  requestedQuantity: this.extractQuantity(message) || undefined,
  warehouseStock: product
    ? {
        volhov: product.volhovStock ?? 0,
        sever: product.skotnoeStock ?? 0,
        marino: product.lomonosovStock ?? 0,
        roshino: product.roshinoStock ?? 0,
        ladoga: product.ladogaStock ?? 0,
      }
    : undefined,
  bestWarehouse: product ? this.getBestWarehouse(product) : undefined,
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

    const hasQuantityAndStore =
  this.extractQuantity(message) &&
  this.extractWarehouse(message) &&
  !phone &&
  !dimensions &&
  !this.hasProductWords(message);

if (hasQuantityAndStore) {
  const response =
    'Понял, количество и магазин записал. Для оформления заявки укажите, пожалуйста, номер телефона для связи.';

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [],
    lead: null,
    source: 'quantity_and_store_waiting_for_phone',
  });
}

    const pickupStoreMatch =
  message.toLowerCase().match(/север|марьино|рощино|ладога/);

const hasProductInfoForPickup =
  !!dimensions ||
  /щит|брус|доск|слэб|ступ|тетив|поруч|баляс/i.test(message);

if (pickupStoreMatch && !phone && hasProductInfoForPickup) {
  const dimensionsForCheck = this.extractDimensions(message);

let productFromSearch: any = null;
let similarProducts: any[] = [];

if (dimensionsForCheck) {
  const productsByDimensions = await this.productsService.findByDimensions(
  dimensionsForCheck.width,
  dimensionsForCheck.height,
  dimensionsForCheck.length,
  message,
);

similarProducts = productsByDimensions;

productFromSearch = this.pickBestProduct(
  productsByDimensions,
  message,
);
} else {
  const searchQuery = this.buildSearchQuery(message);
  const productsBySearch = await this.productsService.search(searchQuery);

similarProducts = productsBySearch;

productFromSearch = this.pickBestProduct(
  productsBySearch,
  message,
);
}

  if (!productFromSearch) {
  const alternativesText = similarProducts.length
    ? '\n\nПохожие варианты:\n' +
      similarProducts
        .slice(0, 3)
        .map((p, index) => {
          const unit = this.formatUnit(p.unit);
          const stock = this.getWarehouseStock(
            p,
            this.extractWarehouse(message),
          );

          return (
            `${index + 1}. ${p.name}\n` +
            `💰 Цена: ${p.price} ₽/${unit}\n` +
            `📦 Остаток: ${
              stock !== null ? stock : p.stock
            } ${unit}`
          );
        })
        .join('\n\n') +
      '\n\nЕсли подходит один из вариантов — напишите его номер или название.'
    : '';

  const response =
    'Точного товара с таким сортом или размером не нашёл в каталоге.' +
    alternativesText;

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: similarProducts.slice(0, 3),
    lead: null,
    source: 'product_not_found_before_phone_request',
  });
}

  const response =
    'Для оформления заявки укажите, пожалуйста, номер телефона для связи. Менеджер проверит наличие и свяжется с вами для подтверждения заказа.';

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [productFromSearch],
    lead: null,
    source: 'need_phone_before_order_confirmation',
  });
}

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
        `📍 Ладога — ${Math.max(0, product.ladogaStock ?? 0)} ${this.formatUnit(product.unit)}`;

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
  source: meta?.vkPeerId ? 'vk' : 'chat',
  vkPeerId: meta?.vkPeerId,
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

            if (phone) {
  lead = await this.leadsService.create({
  phone,
  source: meta?.vkPeerId ? 'vk' : 'chat',
  vkPeerId: meta?.vkPeerId,
  aiSummary: `[Категория: ${this.detectLeadCategory(message)}] ${message}`,
    productInterest: this.cleanProductInterest(message),

    items: [
  {
    productId: product.id,
    productName: product.name,
    productPrice: product.price,
    productUnit: product.unit,
    requestedQuantity: quantity,
    warehouseStock: {
      volhov: product.volhovStock ?? 0,
      sever: product.skotnoeStock ?? 0,
      marino: product.lomonosovStock ?? 0,
      roshino: product.roshinoStock ?? 0,
      ladoga: product.ladogaStock ?? 0,
    },
    bestWarehouse: this.getBestWarehouse(product),
  },
],

    productId: product.id,
    productName: product.name,
    productPrice: product.price,
    productUnit: product.unit,
    requestedQuantity: quantity,
    warehouseStock: product.stock,
    bestWarehouse: this.getBestWarehouse(product),
    budget: totalCost,
  });
}

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

Никогда не предлагай клиенту Волхов как точку самовывоза.
Волхов — внутренний склад, клиентам его не показываем.

Если клиент хочет оформить заказ или спрашивает, как получить товар:
- сначала уточни количество;
- затем уточни способ получения: самовывоз или доставка;
- если самовывоз — обязательно попроси выбрать магазин:
  📍 Север
  📍 Марьино
  📍 Рощино
  📍 Ладога

Не создавай ощущение, что достаточно написать только "самовывоз".
Для самовывоза всегда нужен конкретный магазин.

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
      .replace(/(\+?\d[\d\s\-()]{8,}\d)/g, '')
      .replace(/[,.]/g, '')
      .replace(/имя клиента:.*$/gi, '')
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
📍 Север — ${item.skotnoeStock} ${this.formatUnit(item.unit)}
📍 Марьино — ${item.lomonosovStock} ${this.formatUnit(item.unit)}
📍 Рощино — ${item.roshinoStock} ${this.formatUnit(item.unit)}
📍 Ладога — ${Math.max(0, item.ladogaStock ?? 0)} ${this.formatUnit(item.unit)}
Размеры: ${item.height}х${item.width}х${item.length} мм`,
      )
      .join('\n\n');
  }

    private getBestWarehouse(product: any): string {
    const warehouses = [
      { name: 'Волхов', stock: product.volhovStock ?? 0 },
      { name: 'Север', stock: product.skotnoeStock ?? 0 },
      { name: 'Марьино', stock: product.lomonosovStock ?? 0 },
      { name: 'Рощино', stock: product.roshinoStock ?? 0 },
      { name: 'Ладога', stock: product.ladogaStock ?? 0 },
    ];

    const best = warehouses.sort((a, b) => b.stock - a.stock)[0];

    return best?.stock > 0 ? best.name : 'Нет положительного остатка';
  }

  private getWarehouseStock(product: any, warehouse: string | null): number | null {
  if (!warehouse) return null;

  const normalized = warehouse.toLowerCase();

  if (normalized.includes('север')) return product.skotnoeStock ?? 0;
  if (normalized.includes('марьино')) return product.lomonosovStock ?? 0;
  if (normalized.includes('рощино')) return product.roshinoStock ?? 0;
  if (normalized.includes('ладога')) return product.ladogaStock ?? 0;

  return null;
}

private extractWarehouse(message: string): string | null {
  const match = message.match(/север|марьино|рощино|ладога/i);
  return match ? match[0] : null;
}

  private formatWarehouseStock(product: any): string {
    return (
      `Остатки по точкам:\n` +
      `📍 Север — ${product.skotnoeStock} ${this.formatUnit(product.unit)}\n` +
      `📍 Марьино — ${product.lomonosovStock} ${this.formatUnit(product.unit)}\n` +
      `📍 Рощино — ${product.roshinoStock} ${this.formatUnit(product.unit)}\n` +
      `📍 Ладога — ${Math.max(0, product.ladogaStock ?? 0)} ${this.formatUnit(product.unit)}`
    );
  }

  private extractQuantity(message: string): number | null {
  const normalizedMessage = message
    .toLowerCase()
    .replace(/х/g, 'x')
    .replace(/×/g, 'x')
    .replace(/\*/g, 'x')
    .replace(/\s+на\s+/g, 'x')
    .replace(/[\\/]/g, 'x')
    .replace(/[-–—]/g, 'x');

  const withoutDimensions = normalizedMessage
    .replace(/\d+\s*x\s*\d+\s*x\s*\d+/gi, ' ')
    .replace(/(?:^|\D)\d{1,3}\s+\d{2,4}\s+\d{3,4}(?:\D|$)/gi, ' ');

  const directMatch = withoutDimensions.match(
  /(\d+)\s*(штук|штуки|штука|штуку|шт\.?|щит|щита|щитов|досок|доски|доска|бруса|брус|брусьев|слэб|слэба|слэбов|ступеней|ступени|ступень)(?=\s|,|\.|$)/i,
);

if (directMatch) {
  return Number(directMatch[1]);
}

const quantityWordMatch = withoutDimensions.match(
  /(?:кол-во|количество)\s*[:=\-]?\s*(\d+)/i,
);

if (quantityWordMatch) {
  return Number(quantityWordMatch[1]);
}

  return null;
}

  private extractDimensions(
  message: string,
): { width: number; height: number; length: number } | null {
  const normalizedMessage = message
    .toLowerCase()
    .replace(/х/g, 'x')
    .replace(/×/g, 'x')
    .replace(/\*/g, 'x')
    .replace(/\s+на\s+/g, 'x')
    .replace(/[\\/]/g, 'x')
    .replace(/[-–—]/g, 'x');

  const strictMatch = normalizedMessage.match(
    /(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i,
  );

  const freeMatch = normalizedMessage.match(
    /(?:^|\D)(\d{1,3})\s+(\d{2,4})\s+(\d{3,4})(?:\D|$)/i,
  );

  const match = strictMatch || freeMatch;

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
  const matches = message.matchAll(/(\+?\d[\d\s\-()]{8,}\d)/g);

  for (const match of matches) {
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
  }

  return null;
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
    if (text.includes('слэб')) {
      return 'слэб';
    }
    
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

 private extractInterestFromHistory(historyContext: string): string | null {
  const clientLines = historyContext
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith('клиент:'))
    .map((line) => line.replace(/^клиент:/i, '').trim());

  const orderParts: string[] = [];

  const productLine = [...clientLines]
    .reverse()
    .find((line) =>
      /щит|слэб|доска|брус|брусок|рейка|ступень|столешница|подоконник|мульча/i.test(
        line,
      ),
    );

  if (productLine) {
    orderParts.push(this.cleanProductInterest(productLine));
  }

  const dimensionsLine = [...clientLines]
    .reverse()
    .find((line) => /\d{2,4}\s*[хx]\s*\d{2,4}\s*[хx]\s*\d{2,4}/i.test(line));

  if (dimensionsLine && dimensionsLine !== productLine) {
    const match = dimensionsLine.match(
      /\d{2,4}\s*[хx]\s*\d{2,4}\s*[хx]\s*\d{2,4}/i,
    );

    if (match) {
      orderParts.push(match[0].replace(/\s+/g, ''));
    }
  }

  const sortLine = [...clientLines]
    .reverse()
    .find((line) => /сорт\s*[а-яa-z]|сорт|экстра|\bэ\b|\bа\b|\bб\b|\bв\b/i.test(line));

  if (sortLine) {
  const sortMatch = sortLine.match(
    /сорт\s*[а-яa-z]|экстра|\bэ\b|\bа\b|\bб\b|\bв\b/i,
  );

  if (sortMatch) {
    const sortText = `сорт ${sortMatch[0].replace(/сорт/i, '').trim()}`.trim();

    const alreadyHasSort = orderParts.some((part) =>
      part.toLowerCase().includes(sortText.toLowerCase()),
    );

    if (!alreadyHasSort) {
      orderParts.push(sortText);
    }
  }
}

  const quantityLine = [...clientLines]
    .reverse()
    .find((line) => /\d+\s*(шт|штук|штуки)/i.test(line));

  if (quantityLine) {
    const quantityMatch = quantityLine.match(/\d+\s*(шт|штук|штуки)/i);

    if (quantityMatch) {
      orderParts.push(quantityMatch[0]);
    }
  }

  const warehouseLine = [...clientLines]
    .reverse()
    .find((line) => /север|марьино|рощино|ладога/i.test(line));

  if (warehouseLine) {
    const warehouseMatch = warehouseLine.match(/север|марьино|рощино|ладога/i);

    if (warehouseMatch) {
      orderParts.push(warehouseMatch[0]);
    }
  }

  const result = orderParts
    .filter(Boolean)
    .join(', ')
    .replace(/\s+/g, ' ')
    .trim();

  return result || null;
}

private extractLastProductContext(historyContext: string): string | null {
  const clientLines = historyContext
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('Клиент:'))
    .map((line) => line.replace(/^Клиент:\s*/i, '').trim())
    .filter(Boolean);

  const productLineIndexes = clientLines
    .map((line, index) => ({
      line,
      index,
      hasProduct:
        /щит|брус|доск|слэб|ступ|тетив|поруч|баляс|\d+\s*[xх]\s*\d+\s*[xх]\s*\d+/i.test(
          line,
        ),
    }))
    .filter((item) => item.hasProduct);

  if (productLineIndexes.length === 0) {
    return null;
  }

  const lastProduct = productLineIndexes[productLineIndexes.length - 1];

  const details = clientLines
    .slice(lastProduct.index + 1)
    .filter((line) =>
      /\d+\s*шт|север|марьино|рощино|ладога/i.test(line),
    );

  return [lastProduct.line, ...details].join(' ');
}
private extractOrderLines(context: string): string[] {
  const rawLines = context
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^Клиент:\s*/i, '').trim())
    .filter((line) => !/^Бот:/i.test(line));

  const result: string[] = [];

  for (const rawLine of rawLines) {
    const cleanLine = rawLine
  .replace(/телефон\s*\+?\d[\d\s\-()]{8,}\d/gi, '')
  .replace(/\+?\d[\d\s\-()]{8,}\d/gi, '')
  .replace(/\bтелефон\b/gi, '')
  .trim();

    const commonWarehouse = this.extractWarehouse(cleanLine);

   const chunks = cleanLine
  .replace(/\.\s*и\s+/gi, '|ITEM|')
  .replace(/;\s*/g, '|ITEM|')
  .split('|ITEM|')
  .map((part) => part.trim())
  .filter(Boolean);

    for (const chunk of chunks) {
      const normalizedChunk = chunk
        .replace(/х/g, 'x')
        .replace(/Х/g, 'x')
        .replace(/×/g, 'x');

      const hasFullSize = !!this.extractDimensions(normalizedChunk);
      const hasQuantity = this.extractQuantity(normalizedChunk) !== null;
      const hasProductWord =
        /щит|брус|доск|слэб|ступ|тетив|поруч|баляс/i.test(normalizedChunk);

      if (hasFullSize && hasProductWord) {
        let finalLine = normalizedChunk;

        if (
          commonWarehouse &&
          !/север|марьино|рощино|ладога/i.test(finalLine)
        ) {
          finalLine = `${finalLine} ${commonWarehouse}`;
        }

        result.push(finalLine);
        continue;
      }

      const sizeMatches = [
        ...normalizedChunk.matchAll(/\d+\s*x\s*\d+\s*x\s*\d+/gi),
      ];

      if (sizeMatches.length > 1) {
        const commonProductWord =
          normalizedChunk.match(
            /щит|брус|доск|слэб|ступ|тетив|поруч|баляс/i,
          )?.[0] || '';

        for (let i = 0; i < sizeMatches.length; i++) {
          const current = sizeMatches[i];
          const next = sizeMatches[i + 1];

          const start = current.index ?? 0;
          const end = next?.index ?? normalizedChunk.length;

          let part = normalizedChunk.slice(start, end).trim();

          if (
            commonProductWord &&
            !/щит|брус|доск|слэб|ступ|тетив|поруч|баляс/i.test(part)
          ) {
            part = `${commonProductWord} ${part}`;
          }

          if (
            commonWarehouse &&
            !/север|марьино|рощино|ладога/i.test(part)
          ) {
            part = `${part} ${commonWarehouse}`;
          }

          if (
            this.extractDimensions(part) &&
            this.extractQuantity(part) !== null
          ) {
            result.push(part);
          }
        }
      }
    }
  }

  return Array.from(new Set(result));
}

private pickBestProduct(products: any[], context: string): any | null {
  if (!products || products.length === 0) {
    return null;
  }

  const text = context.toLowerCase();

  if (
    text.includes('сорт э') ||
    text.includes('сортэ') ||
    text.includes('экстра')
  ) {
    return (
      products.find((p) => p.name?.toLowerCase().includes('сорт э')) ||
      products.find((p) => p.name?.toLowerCase().includes('экстра')) ||
      null
    );
  }

  if (text.includes('сорт а') || text.includes('сорта')) {
    return (
      products.find((p) => p.name?.toLowerCase().includes('сорт а')) ||
      null
    );
  }

  if (text.includes('сорт в') || text.includes('сортв')) {
    return (
      products.find((p) => p.name?.toLowerCase().includes('сорт в')) ||
      null
    );
  }

  return products[0];
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