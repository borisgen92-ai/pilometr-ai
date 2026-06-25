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
        private pendingOrders = new Map<string, any>();
  private pendingGradeSelections = new Map<string, any>();
  private pendingAlternativeSelections = new Map<string, any>();
  private pendingMultiAlternativeSelections = new Map<string, any>();

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

    if (cleanMessage.includes('планкен')) {
  return {
    response:
      'Планкена сейчас нет в нашем ассортименте. Могу помочь подобрать другой товар из дерева: мебельный щит, брусок, рейку, наличник, поручень или ступень.',
    lead: null,
  };
}

if (
  cleanMessage.includes('рейк') &&
  (
    cleanMessage.includes('20х40х3000') ||
    cleanMessage.includes('20x40x3000') ||
    cleanMessage.includes('20 40 3000')
  )
) {
  return {
    response:
      'Точного размера рейки 20х40х3000 не нашёл, но могу предложить близкие варианты:\n\n' +
'• Брусок 19х40х3000\n' +
'• Брусок 19х40х2200\n' +
'• Брусок под обрешётку 20х45х2000 — недорогой вариант\n\n' +
'Подскажите, для каких целей будете использовать: обрешётка, каркас, декоративная отделка или что-то другое? Тогда подберу самый подходящий вариант.',
    lead: null,
  };
}

    const pendingOrder = this.pendingOrders.get(sessionId);

        const pendingGradeSelection = this.pendingGradeSelections.get(sessionId);

    if (pendingGradeSelection?.products?.length) {
      const selectedProduct =
        pendingGradeSelection.products.find((p) => {
          const name = String(p.name || '').toLowerCase();

          if (/сорт\s*э|экстра|\bэ\b/i.test(cleanMessage)) {
            return name.includes('сорт э') || name.includes('экстра');
          }

          if (/сорт\s*в|\bв\b/i.test(cleanMessage)) {
            return name.includes('сорт в');
          }

          if (/сорт\s*а|\bа\b/i.test(cleanMessage)) {
            return name.includes('сорт а');
          }

          return false;
        }) || null;

      if (selectedProduct) {
        this.pendingGradeSelections.delete(sessionId);

        const quantity = pendingGradeSelection.quantity || 1;
        const warehouse = pendingGradeSelection.warehouse;
        const total = (selectedProduct.price || 0) * quantity;

        const newPendingOrder = {
          phone: undefined,
          clientName: undefined,
          source: meta?.vkPeerId ? 'vk' : 'chat',
          vkPeerId: meta?.vkPeerId,
          aiSummary: `[Категория: Заказ] ${pendingGradeSelection.originalMessage}`,
          productInterest: pendingGradeSelection.originalMessage,
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          productPrice: selectedProduct.price,
          productUnit: selectedProduct.unit,
          requestedQuantity: quantity,
          bestWarehouse: warehouse || this.getBestWarehouse(selectedProduct),
          budget: total,
          needsPhone: true,
          warehouseStock: {
            volhov: selectedProduct.volhovStock ?? 0,
            sever: selectedProduct.skotnoeStock ?? 0,
            marino: selectedProduct.lomonosovStock ?? 0,
            roshino: selectedProduct.roshinoStock ?? 0,
            ladoga: selectedProduct.ladogaStock ?? 0,
          },
          items: [
            {
              productId: selectedProduct.id,
              productName: selectedProduct.name,
              productPrice: selectedProduct.price,
              productUnit: selectedProduct.unit,
              requestedQuantity: quantity,
              bestWarehouse: warehouse || this.getBestWarehouse(selectedProduct),
              warehouseStock: {
                volhov: selectedProduct.volhovStock ?? 0,
                sever: selectedProduct.skotnoeStock ?? 0,
                marino: selectedProduct.lomonosovStock ?? 0,
                roshino: selectedProduct.roshinoStock ?? 0,
                ladoga: selectedProduct.ladogaStock ?? 0,
              },
              total,
            },
          ],
        };

        this.pendingOrders.set(sessionId, newPendingOrder);

        const response =
          `Выбрали: ${selectedProduct.name}\n` +
          `Цена: ${selectedProduct.price} ₽/${selectedProduct.unit || 'шт'}\n\n` +
          'Укажите, пожалуйста, номер телефона для оформления заявки.';

        return this.saveAndReturn(sessionId, response, {
          userMessage: message,
          sessionId,
          response,
          products: [selectedProduct],
          lead: null,
          source: 'grade_selected_waiting_phone',
        });
      }
    }

    const pendingMultiAlternativeSelection =
  this.pendingMultiAlternativeSelections.get(sessionId);

if (pendingMultiAlternativeSelection) {
  console.log(
    'MULTI_ALTERNATIVE_SELECTION:',
    cleanMessage,
  );

  const selectedNumberMatch = cleanMessage.match(/^\s*(\d+)/);
const selectedNumber = selectedNumberMatch
  ? Number(selectedNumberMatch[1])
  : 0;

  const currentItem =
    pendingMultiAlternativeSelection.missingItems[
      pendingMultiAlternativeSelection.currentIndex
    ];

  const selectedAlternative =
    currentItem?.alternatives?.[selectedNumber - 1];

  if (selectedAlternative) {
    currentItem.selectedAlternative = selectedAlternative;

    pendingMultiAlternativeSelection.currentIndex++;

    if (
      pendingMultiAlternativeSelection.currentIndex <
      pendingMultiAlternativeSelection.missingItems.length
    ) {
      const nextItem =
        pendingMultiAlternativeSelection.missingItems[
          pendingMultiAlternativeSelection.currentIndex
        ];

            const hasAlternatives =
        Array.isArray(nextItem.alternatives) &&
        nextItem.alternatives.length > 0;

      const keyboard =
        meta?.vkPeerId && hasAlternatives
          ? {
              one_time: true,
              buttons: (nextItem.alternatives || []).map(
                (alt: any, index: number) => [
                  {
                    action: {
                      type: 'text',
                      label: `${index + 1}. ${alt.productName}`,
                      payload: JSON.stringify({
                        action: 'multi_alternative_select',
                        index,
                      }),
                    },
                    color: 'primary',
                  },
                ],
              ),
            }
          : undefined;

      const response = hasAlternatives
        ? `Не нашёл точный товар для позиции ${
            pendingMultiAlternativeSelection.currentIndex + 1
          }:\n\n` +
          `${nextItem.originalLine}\n\n` +
          `Выберите подходящий вариант кнопкой ниже.`
                : `Не нашёл точный товар для позиции ${
            pendingMultiAlternativeSelection.currentIndex + 1
          }:\n\n` +
          `${nextItem.originalLine}\n\n` +
          `Похожих вариантов в каталоге тоже не нашёл.\n\n` +
          `Укажите, пожалуйста, номер телефона — менеджер проверит эту позицию вручную.`;

        if (!hasAlternatives) {
          const selectedItems = pendingMultiAlternativeSelection.missingItems
            .filter((item: any) => item.selectedAlternative)
            .map((item: any) => {
              const alt = item.selectedAlternative;
              const quantity = item.requestedQuantity || 1;
              const warehouse = item.bestWarehouse;
              const total = (alt.productPrice || 0) * quantity;

              return {
                productId: alt.productId,
                productName: alt.productName,
                productPrice: alt.productPrice,
                productUnit: alt.productUnit,
                requestedQuantity: quantity,
                bestWarehouse: warehouse,
                warehouseStock: alt.warehouseStock,
                total,
              };
            });

          const manualItem = {
            productName: `Ручная проверка: ${nextItem.originalLine}`,
            requestedQuantity: nextItem.requestedQuantity || 1,
            bestWarehouse: nextItem.bestWarehouse,
            productPrice: 0,
            productUnit: 'шт',
            total: 0,
            manualCheck: true,
          };

          const allItems = [...selectedItems, manualItem];

          const totalBudget = allItems.reduce(
            (sum, item) =>
              sum + (item.productPrice || 0) * (item.requestedQuantity || 0),
            0,
          );

          this.pendingMultiAlternativeSelections.delete(sessionId);
          this.pendingOrders.set(sessionId, {
            phone: undefined,
            clientName: undefined,
            source: meta?.vkPeerId ? 'vk' : 'chat',
            vkPeerId: meta?.vkPeerId,
            aiSummary: `[Категория: Заказ] ${pendingMultiAlternativeSelection.originalMessage || ''}`,
            productInterest: pendingMultiAlternativeSelection.originalMessage || '',
            items: allItems,
            productName: allItems[0]?.productName,
            productPrice: allItems[0]?.productPrice,
            productUnit: allItems[0]?.productUnit,
            requestedQuantity: allItems[0]?.requestedQuantity,
            bestWarehouse: allItems[0]?.bestWarehouse,
            budget: totalBudget,
            needsPhone: true,
            manualCheck: true,
          });
        }

      return this.saveAndReturn(sessionId, response, {
        userMessage: message,
        sessionId,
        response,
        products: [],
        lead: null,
        keyboard,
        source: 'multi_alternative_next_position',
      });
    }

          const selectedItems = pendingMultiAlternativeSelection.missingItems
  .filter((item: any) => item.selectedAlternative)
  .map(
        (item: any) => {
          const alt = item.selectedAlternative;
          const quantity = item.requestedQuantity || 1;
          const warehouse = item.bestWarehouse;
          const total = (alt.productPrice || 0) * quantity;

          return {
            productId: alt.productId,
            productName: alt.productName,
            productPrice: alt.productPrice,
            productUnit: alt.productUnit,
            requestedQuantity: quantity,
            bestWarehouse: warehouse,
            warehouseStock: alt.warehouseStock,
            total,
          };
        },
      );

      const allItems = [
        ...(pendingMultiAlternativeSelection.foundItems || []),
        ...selectedItems,
      ];

      const totalBudget = allItems.reduce(
        (sum, item) =>
          sum + (item.productPrice || 0) * (item.requestedQuantity || 0),
        0,
      );

      const newPendingOrder = {
        phone: undefined,
        clientName: undefined,
        source: meta?.vkPeerId ? 'vk' : 'chat',
        vkPeerId: meta?.vkPeerId,
        aiSummary: `[Категория: Заказ] ${pendingMultiAlternativeSelection.originalMessage || ''}`,
        productInterest: pendingMultiAlternativeSelection.originalMessage || '',
        items: allItems,
        productId: allItems[0]?.productId,
        productName: allItems[0]?.productName,
        productPrice: allItems[0]?.productPrice,
        productUnit: allItems[0]?.productUnit,
        requestedQuantity: allItems[0]?.requestedQuantity,
        warehouseStock: allItems[0]?.warehouseStock,
        bestWarehouse: allItems[0]?.bestWarehouse,
        budget: totalBudget,
        needsPhone: true,
      };

      this.pendingMultiAlternativeSelections.delete(sessionId);
      this.pendingOrders.set(sessionId, newPendingOrder);

      const productsText = allItems
        .map(
          (item, index) =>
            `${index + 1}. ${item.productName}\n` +
            `Количество: ${item.requestedQuantity || 0} ${this.formatUnit(item.productUnit || 'шт')}\n` +
            `Сумма: ${((item.productPrice || 0) * (item.requestedQuantity || 0)).toLocaleString('ru-RU')} ₽`,
        )
        .join('\n\n');

        const clearKeyboard = meta?.vkPeerId
  ? {
      one_time: true,
      buttons: [],
    }
  : undefined;

      const response =
        `Выбраны варианты:\n\n${productsText}\n\n` +
        `Итого: ${totalBudget.toLocaleString('ru-RU')} ₽\n\n` +
        'Укажите, пожалуйста, номер телефона для оформления заявки.';

      return this.saveAndReturn(sessionId, response, {
        userMessage: message,
        sessionId,
        response,
        products: [],
        lead: null,
        keyboard: clearKeyboard,
        source: 'multi_alternatives_selected_waiting_phone',
      });
  }
}

        const pendingAlternativeSelection =
      this.pendingAlternativeSelections.get(sessionId);

    if (pendingAlternativeSelection?.products?.length) {

        console.log(
  'ALTERNATIVE_SELECTION:',
  cleanMessage,
  pendingAlternativeSelection?.products?.length,
);

                  const selectedNumber = Number(cleanMessage.replace(/\D/g, ''));
      const selectedProduct: any =
        selectedNumber > 0
          ? pendingAlternativeSelection.products[selectedNumber - 1] || null
          : pendingAlternativeSelection.products.find((p) => {
              const productName = String(p.name || '').toLowerCase();
              return productName && cleanMessage.includes(productName);
            }) || null;

              console.log(
          'ALTERNATIVE_PRODUCTS:',
          JSON.stringify(pendingAlternativeSelection.products, null, 2),
        );

        console.log(
          'ALTERNATIVE_SELECTED_PRODUCT:',
          JSON.stringify(selectedProduct, null, 2),
        );

      if (selectedProduct) {
        this.pendingAlternativeSelections.delete(sessionId);

                  const quantity = pendingAlternativeSelection.quantity || 1;
          const warehouse = pendingAlternativeSelection.warehouse;
          const total = (selectedProduct.price || 0) * quantity;

          const clientWarehouses = [
            { name: 'Север', stock: selectedProduct.skotnoeStock ?? 0 },
            { name: 'Марьино', stock: selectedProduct.lomonosovStock ?? 0 },
            { name: 'Рощино', stock: selectedProduct.roshinoStock ?? 0 },
            { name: 'Ладога', stock: selectedProduct.ladogaStock ?? 0 },
          ];

          const bestClientWarehouse = clientWarehouses.reduce((best, current) =>
            current.stock > best.stock ? current : best,
          );

          const selectedWarehouse = warehouse;
          const selectedStock = this.getWarehouseStock(selectedProduct, selectedWarehouse) ?? 0;
          const hasEnoughStock = selectedStock >= quantity;

        const newPendingOrder = {
          phone: undefined,
          clientName: undefined,
          source: meta?.vkPeerId ? 'vk' : 'chat',
          vkPeerId: meta?.vkPeerId,
          aiSummary: `[Категория: Заказ] ${pendingAlternativeSelection.originalMessage}`,
          productInterest: pendingAlternativeSelection.originalMessage,
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          productPrice: selectedProduct.price,
          productUnit: selectedProduct.unit,
          requestedQuantity: quantity,
                      bestWarehouse: selectedWarehouse,
            availableQuantity: selectedStock,
            budget: total,
            needsPhone: hasEnoughStock,
            needsStockDecision: !hasEnoughStock,
          warehouseStock: {
            volhov: selectedProduct.volhovStock ?? 0,
            sever: selectedProduct.skotnoeStock ?? 0,
            marino: selectedProduct.lomonosovStock ?? 0,
            roshino: selectedProduct.roshinoStock ?? 0,
            ladoga: selectedProduct.ladogaStock ?? 0,
          },
          items: [
            {
              productId: selectedProduct.id,
              productName: selectedProduct.name,
              productPrice: selectedProduct.price,
              productUnit: selectedProduct.unit,
              requestedQuantity: quantity,
                              bestWarehouse: selectedWarehouse,
                availableQuantity: selectedStock,
              warehouseStock: {
                volhov: selectedProduct.volhovStock ?? 0,
                sever: selectedProduct.skotnoeStock ?? 0,
                marino: selectedProduct.lomonosovStock ?? 0,
                roshino: selectedProduct.roshinoStock ?? 0,
                ladoga: selectedProduct.ladogaStock ?? 0,
              },
              total,
            },
          ],
        };

          if (!warehouse) {
            newPendingOrder.bestWarehouse = undefined;
            newPendingOrder.availableQuantity = 0;
            newPendingOrder.needsPhone = false;
            newPendingOrder.needsStockDecision = true;

            if (Array.isArray(newPendingOrder.items) && newPendingOrder.items[0]) {
              newPendingOrder.items[0].bestWarehouse = undefined;
              newPendingOrder.items[0].availableQuantity = 0;
            }

            this.pendingOrders.set(sessionId, newPendingOrder);

            const warehousesText = clientWarehouses
              .map(
                (item) =>
                  `📍 ${item.name} — ${item.stock} ${this.formatUnit(selectedProduct.unit || 'шт')}`,
              )
              .join('\n');

            const warehouseKeyboard = meta?.vkPeerId
              ? {
                  one_time: true,
                  buttons: clientWarehouses
                    .filter((item) => item.stock > 0)
                    .map((item) => [
                      {
                        action: {
                          type: 'text',
                          label: `📍 ${item.name} — ${item.stock} ${this.formatUnit(selectedProduct.unit || 'шт')}`,
                          payload: JSON.stringify({
                            action: 'select_warehouse',
                            warehouse: item.name,
                          }),
                        },
                        color: item.stock >= quantity ? 'positive' : 'secondary',
                      },
                    ]),
                }
              : undefined;

            const response =
              `Выбрали: ${selectedProduct.name}\n` +
              `Нужно: ${quantity} ${this.formatUnit(selectedProduct.unit || 'шт')}\n\n` +
              `Остатки по точкам:\n${warehousesText}\n\n` +
              'Выберите магазин для самовывоза.';

            return this.saveAndReturn(sessionId, response, {
              userMessage: message,
              sessionId,
              response,
              products: [selectedProduct],
              lead: null,
              keyboard: warehouseKeyboard,
              source: 'alternative_selected_choose_warehouse',
            });
          }

        this.pendingOrders.set(sessionId, newPendingOrder);

                  if (!hasEnoughStock) {
            const shortage = Math.max(0, quantity - selectedStock);

                          const shortageKeyboard = meta?.vkPeerId
                ? {
                    one_time: true,
                    buttons: [
                      [
                        {
                          action: {
                            type: 'text',
                            label: '✅ Оформить доступное количество',
                            payload: JSON.stringify({
                              action: 'available_stock',
                            }),
                          },
                          color: 'positive',
                        },
                      ],
                      [
                        {
                          action: {
                            type: 'text',
                            label: '📦 Уточнить срок поставки',
                            payload: JSON.stringify({
                              action: 'supply_request',
                            }),
                          },
                          color: 'primary',
                        },
                      ],
                    ],
                  }
                : undefined;

                          const warehouseStockText =
                `Остатки по точкам:\n` +
                `📍 Север — ${selectedProduct.skotnoeStock ?? 0} ${this.formatUnit(selectedProduct.unit || 'шт')}\n` +
                `📍 Марьино — ${selectedProduct.lomonosovStock ?? 0} ${this.formatUnit(selectedProduct.unit || 'шт')}\n` +
                `📍 Рощино — ${selectedProduct.roshinoStock ?? 0} ${this.formatUnit(selectedProduct.unit || 'шт')}\n` +
                `📍 Ладога — ${selectedProduct.ladogaStock ?? 0} ${this.formatUnit(selectedProduct.unit || 'шт')}`;


const response =
  `Выбрали: ${selectedProduct.name}\n` +
  `Нужно: ${quantity} ${this.formatUnit(selectedProduct.unit || 'шт')}\n` +
  `В наличии: ${selectedStock} ${this.formatUnit(selectedProduct.unit || 'шт')}\n` +
  `Не хватает: ${shortage} ${this.formatUnit(selectedProduct.unit || 'шт')}\n\n` +
  `${warehouseStockText}\n\n` +
  'Оформить доступное количество или уточнить срок поставки недостающего товара?';

            return this.saveAndReturn(sessionId, response, {
              userMessage: message,
              sessionId,
              response,
              products: [selectedProduct],
              lead: null,
                              keyboard: shortageKeyboard,
              source: 'alternative_selected_stock_shortage',
            });
          }

        const response =
          `Выбрали: ${selectedProduct.name}\n` +
          `Количество: ${quantity} ${this.formatUnit(selectedProduct.unit || 'шт')}\n` +
          (warehouse ? `Магазин: ${warehouse}\n` : '') +
          `Цена: ${selectedProduct.price} ₽/${this.formatUnit(selectedProduct.unit || 'шт')}\n` +
          `Сумма: ${total.toLocaleString('ru-RU')} ₽\n\n` +
          'Укажите, пожалуйста, номер телефона для оформления заявки.';

        return this.saveAndReturn(sessionId, response, {
          userMessage: message,
          sessionId,
          response,
          products: [selectedProduct],
          lead: null,
          source: 'alternative_selected_waiting_phone',
        });
      }
    }

    if (/отменить|отмена|cancel_order/i.test(cleanMessage)) {
  this.pendingOrders.delete(sessionId);

  const response =
    'Заказ отменён. Если понадобится помощь — напишите новый запрос.';

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [],
    lead: null,
    source: 'order_cancelled',
  });
}

if (
  pendingOrder?.needsStockDecision &&
  /оформить|доступн|available_stock/i.test(cleanMessage)
) {
  const availableQuantity = pendingOrder.availableQuantity || 1;
  const unit = pendingOrder.productUnit || 'шт';

  pendingOrder.requestedQuantity = availableQuantity;
  pendingOrder.budget = (pendingOrder.productPrice || 0) * availableQuantity;
  pendingOrder.needsStockDecision = false;
  pendingOrder.needsPhone = true;

  if (Array.isArray(pendingOrder.items) && pendingOrder.items[0]) {
    pendingOrder.items[0].requestedQuantity = availableQuantity;
    pendingOrder.items[0].total =
      (pendingOrder.items[0].productPrice || 0) * availableQuantity;
  }

  this.pendingOrders.set(sessionId, pendingOrder);

  const response =
    `Хорошо, оформим доступное количество: ${availableQuantity} ${unit}.\n\n` +
    'Укажите, пожалуйста, номер телефона для оформления заявки.';

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [],
    lead: null,
    source: 'stock_shortage_confirm_available_waiting_phone',
  });
}

if (
  pendingOrder?.needsStockDecision &&
  /другой магазин|подобрать|choose_another_warehouse/i.test(cleanMessage)
) {
  const stock = pendingOrder.warehouseStock || {};
  const unit = pendingOrder.productUnit || 'шт';
  const requestedQuantity = pendingOrder.requestedQuantity || 1;

  const warehouseOptions = [
    { name: 'Север', value: stock.sever || 0 },
    { name: 'Марьино', value: stock.marino || 0 },
    { name: 'Рощино', value: stock.roshino || 0 },
    { name: 'Ладога', value: stock.ladoga || 0 },
  ];

  const warehouseKeyboard = meta?.vkPeerId
    ? {
        one_time: true,
        buttons: warehouseOptions
          .filter((item) => item.value > 0)
          .map((item) => [
            {
              action: {
                type: 'text',
                label: `📍 ${item.name} — ${item.value} ${unit}`,
                payload: JSON.stringify({
                  action: 'select_warehouse',
                  warehouse: item.name,
                }),
              },
              color:
                item.value >= requestedQuantity ? 'positive' : 'secondary',
            },
          ])
          .concat([
            [
              {
                action: {
                  type: 'text',
                  label: '❌ Отменить',
                  payload: JSON.stringify({
                    action: 'cancel_order',
                  }),
                },
                color: 'negative',
              },
            ],
          ]),
      }
    : undefined;

  const warehousesText = warehouseOptions
    .map((item) => `📍 ${item.name} — ${item.value} ${unit}`)
    .join('\n');

  const totalAvailable = warehouseOptions.reduce(
    (sum, item) => sum + item.value,
    0,
  );

  const response =
    `По магазинам сейчас доступно:\n\n${warehousesText}\n\n` +
    `Нужно: ${requestedQuantity} ${unit}\n` +
    `Всего по магазинам: ${totalAvailable} ${unit}\n\n` +
    'Выберите магазин для самовывоза.';

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [],
    lead: null,
    keyboard: warehouseKeyboard,
    source: 'stock_shortage_choose_another_warehouse',
  });
}

if (
  pendingOrder?.needsStockDecision &&
  /север|марьино|рощино|ладога/i.test(cleanMessage)
) {
  const selectedWarehouse = this.extractWarehouse(message);
  const stock = pendingOrder.warehouseStock || {};
  const unit = pendingOrder.productUnit || 'шт';
  const requestedQuantity = pendingOrder.requestedQuantity || 1;

  const selectedStock =
    selectedWarehouse?.toLowerCase().includes('север')
      ? stock.sever || 0
      : selectedWarehouse?.toLowerCase().includes('марьино')
        ? stock.marino || 0
        : selectedWarehouse?.toLowerCase().includes('рощино')
          ? stock.roshino || 0
          : selectedWarehouse?.toLowerCase().includes('ладога')
            ? stock.ladoga || 0
            : 0;

      if (selectedStock >= requestedQuantity) {
      pendingOrder.bestWarehouse = selectedWarehouse;
      pendingOrder.availableQuantity = selectedStock;
      pendingOrder.requestedQuantity = requestedQuantity;
      pendingOrder.budget = (pendingOrder.productPrice || 0) * requestedQuantity;
      pendingOrder.needsStockDecision = false;
      pendingOrder.needsPhone = true;

      if (Array.isArray(pendingOrder.items) && pendingOrder.items[0]) {
        pendingOrder.items[0].bestWarehouse = selectedWarehouse;
        pendingOrder.items[0].availableQuantity = selectedStock;
        pendingOrder.items[0].requestedQuantity = requestedQuantity;
        pendingOrder.items[0].total =
          (pendingOrder.items[0].productPrice || 0) * requestedQuantity;
      }

      this.pendingOrders.set(sessionId, pendingOrder);

      const response =
        `Отлично, в магазине ${selectedWarehouse} доступно ${selectedStock} ${unit}. Оформим ${requestedQuantity} ${unit}.\n\n` +
        'Укажите, пожалуйста, номер телефона для оформления заявки.';

      return this.saveAndReturn(sessionId, response, {
        userMessage: message,
        sessionId,
        response,
        products: [],
        lead: null,
        source: 'stock_selected_warehouse_waiting_phone',
      });
    }

    const shortage = Math.max(0, requestedQuantity - selectedStock);

    pendingOrder.bestWarehouse = selectedWarehouse;
    pendingOrder.availableQuantity = selectedStock;
    pendingOrder.needsStockDecision = true;
    pendingOrder.needsPhone = false;

    if (Array.isArray(pendingOrder.items) && pendingOrder.items[0]) {
      pendingOrder.items[0].bestWarehouse = selectedWarehouse;
      pendingOrder.items[0].availableQuantity = selectedStock;
      pendingOrder.items[0].requestedQuantity = requestedQuantity;
      pendingOrder.items[0].total =
        (pendingOrder.items[0].productPrice || 0) * requestedQuantity;
    }

    this.pendingOrders.set(sessionId, pendingOrder);

    const shortageKeyboard = meta?.vkPeerId
      ? {
          one_time: true,
          buttons: [
            [
              {
                action: {
                  type: 'text',
                  label: `✅ Оформить доступное количество`,
                  payload: JSON.stringify({
                    action: 'available_stock',
                  }),
                },
                color: 'positive',
              },
            ],
            [
              {
                action: {
                  type: 'text',
                  label: '📦 Уточнить срок поставки',
                  payload: JSON.stringify({
                    action: 'supply_request',
                  }),
                },
                color: 'primary',
              },
            ],
          ],
        }
      : undefined;

    const response =
      `В магазине ${selectedWarehouse} доступно ${selectedStock} ${unit}.\n` +
      `Нужно: ${requestedQuantity} ${unit}\n` +
      `Не хватает: ${shortage} ${unit}.\n\n` +
      'Оформить доступное количество или уточнить срок поставки недостающего товара?';

    return this.saveAndReturn(sessionId, response, {
      userMessage: message,
      sessionId,
      response,
      products: [],
      lead: null,
      keyboard: shortageKeyboard,
      source: 'stock_selected_warehouse_shortage_decision',
    });
}

if (
  pendingOrder?.needsStockDecision &&
  /срок|поставк|уточнить|ask_supply_time/i.test(cleanMessage)
) {
  const unit = pendingOrder.productUnit || 'шт';
  const requestedQuantity = pendingOrder.requestedQuantity || 1;
  const availableQuantity = pendingOrder.availableQuantity || 0;
  const shortage = Math.max(0, requestedQuantity - availableQuantity);

  pendingOrder.needsStockDecision = false;
  pendingOrder.needsPhone = true;
  pendingOrder.supplyRequest = true;
  pendingOrder.aiSummary =
    `[Категория: Заказ]\n` +
    `Клиент просит уточнить срок поставки.\n` +
    `Товар: ${pendingOrder.productName}\n` +
    `Нужно: ${requestedQuantity} ${unit}\n` +
    `Есть: ${availableQuantity} ${unit}\n` +
    `Не хватает: ${shortage} ${unit}\n\n` +
    `Исходный запрос: ${pendingOrder.productInterest || message}`;

    pendingOrder.budget =
  (pendingOrder.productPrice || 0) * requestedQuantity;

if (Array.isArray(pendingOrder.items) && pendingOrder.items[0]) {
  pendingOrder.items[0].requestedQuantity = requestedQuantity;
  pendingOrder.items[0].total =
    (pendingOrder.items[0].productPrice || 0) * requestedQuantity;
}

  this.pendingOrders.set(sessionId, pendingOrder);

  const response =
    `Понял. Передам менеджеру запрос на уточнение срока поставки недостающего количества.\n\n` +
    `Нужно: ${requestedQuantity} ${unit}\n` +
    `Сейчас доступно: ${availableQuantity} ${unit}\n` +
    `Не хватает: ${shortage} ${unit}\n\n` +
    `Укажите, пожалуйста, номер телефона для связи.`;

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [],
    lead: null,
    source: 'supply_time_request_waiting_phone',
  });
}

console.log(
  'PENDING ORDER:',
  JSON.stringify(pendingOrder, null, 2),
);

    if (
  pendingOrder &&
  /сколько|наличи|остаток|есть|доступно/i.test(cleanMessage)
) {
  const items = Array.isArray(pendingOrder.items) ? pendingOrder.items : [];

  const stockText = items
    .map((item, index) => {
      const stock = item.warehouseStock as any;
      const warehouse = item.bestWarehouse || pendingOrder.bestWarehouse || 'Не указан';

      const selectedStock =
        warehouse.toLowerCase().includes('север')
          ? stock?.sever
          : warehouse.toLowerCase().includes('марьино')
            ? stock?.marino
            : warehouse.toLowerCase().includes('рощино')
              ? stock?.roshino
              : warehouse.toLowerCase().includes('ладога')
                ? stock?.ladoga
                : null;

      return `${index + 1}. ${item.productName}
📍 ${warehouse}: ${selectedStock ?? 'не указан'} ${item.productUnit || 'шт'}`;
    })
    .join('\n\n');

  const response =
    `По вашему заказу сейчас в наличии:\n\n${stockText}\n\n` +
    `Если всё верно — нажмите кнопку или напишите "Подтверждаю".`;

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [],
    lead: null,
    source: 'pending_order_stock_answer',
  });
}

if (
  !pendingOrder &&
  /confirm_order|подтверждаю|подтвердить|верно|всё верно|все верно|да/i.test(
    cleanMessage,
  )
) {
  const response =
    'Не нашёл активный заказ для подтверждения. Если хотите оформить заказ — напишите товар, количество и магазин.';

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [],
    lead: null,
    source: 'confirm_without_pending_order_blocked',
  });
}

if (
  pendingOrder &&
  /подтверждаю|подтвердить|верно|всё верно|все верно|да/i.test(
    cleanMessage,
  )
) {
    if (pendingOrder.needsPhone) {
  const response =
    'Отлично. Укажите, пожалуйста, номер телефона для оформления заявки.';

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [],
    lead: null,
    source: 'review_confirmed_waiting_phone',
  });
}
  const lead = await this.leadsService.create(pendingOrder);

  this.pendingOrders.delete(sessionId);

const response =
  `Спасибо, заказ подтверждён.\n\n` +
  `Номер заказа: ${lead.orderNumber || lead.id}\n\n` +
  `Заявка создана и передана менеджеру.`;

return this.saveAndReturn(sessionId, response, {
  userMessage: pendingOrder.productInterest || message,
  sessionId,
  response,
  products: [],
  lead,
  source: 'order_confirmed_created',
});
}

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

      if (
  !earlyPhone &&
  /сколько|наличи|остаток|есть|доступно/i.test(cleanMessage)
) {
  const lastProductText =
    this.extractLastProductContext(historyContext) ||
    this.extractInterestFromHistory(historyContext);

    console.log('LAST PRODUCT TEXT:', lastProductText);
console.log('HISTORY CONTEXT:', historyContext);

  const lastDimensions = lastProductText
    ? this.extractDimensions(lastProductText)
    : null;

  if (lastProductText && lastDimensions) {
    const foundProducts = await this.productsService.findByDimensions(
      lastDimensions.width,
      lastDimensions.height,
      lastDimensions.length,
      lastProductText,
    );

    const product = this.pickBestProduct(foundProducts, lastProductText);
    const warehouse = this.extractWarehouse(lastProductText);

    const selectedStock =
  warehouse?.toLowerCase().includes('север')
    ? product.skotnoeStock
    : warehouse?.toLowerCase().includes('марьино')
      ? product.lomonosovStock
      : warehouse?.toLowerCase().includes('рощино')
        ? product.roshinoStock
        : warehouse?.toLowerCase().includes('ладога')
          ? product.ladogaStock
          : null;

      const response =
        selectedStock !== null
          ? `${product.name}\n\n📍 ${warehouse}: ${selectedStock} шт`
          : `${product.name}\n\n` +
            `Север: ${product.skotnoeStock ?? 0} шт\n` +
`Марьино: ${product.lomonosovStock ?? 0} шт\n` +
`Рощино: ${product.roshinoStock ?? 0} шт\n` +
`Ладога: ${product.ladogaStock ?? 0} шт`;

      return this.saveAndReturn(sessionId, response, {
        userMessage: message,
        sessionId,
        response,
        products: [product],
        lead: null,
        source: 'stock_answer_from_history',
      });
    }
  }

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

const earlyMessageWithoutPhone = (
  earlyPhoneRawMatch
    ? message.replace(earlyPhoneRawMatch[0], '').trim()
    : message.trim()
)
  .replace(/Имя клиента:\s*.+$/gim, '')
  .trim();

const hasOrderInfoWithPhone =
  earlyMessageWithoutPhone.length > 0 &&
  (
    this.hasProductWords(earlyMessageWithoutPhone) ||
    this.extractDimensions(earlyMessageWithoutPhone) ||
    this.extractQuantity(earlyMessageWithoutPhone)
  );

  const orderLinesWithPhone = this.extractOrderLines(earlyMessageWithoutPhone);

  console.log('ORDER LINES WITH PHONE:', orderLinesWithPhone);

  console.log('ORDER LINES WITH PHONE:', orderLinesWithPhone);
console.log('EARLY MESSAGE WITHOUT PHONE:', earlyMessageWithoutPhone);

const orderLinesWithoutPhone = this.extractOrderLines(
  `Клиент: ${earlyMessageWithoutPhone}`,
);

const quickMultiLines =
  orderLinesWithoutPhone.length > 1
    ? orderLinesWithoutPhone
    : earlyMessageWithoutPhone
    .replace(
      /\n+\s*и?\s*(?=(щит|мебельный|слэб|доска|брус|брусок|рейка|ступень))/gi,
      '|ITEM|',
    )
    .replace(
      /\s+и\s+(?=(щит|мебельный|слэб|доска|брус|брусок|рейка|ступень))/gi,
      '|ITEM|',
    )
        .split('|ITEM|')
    .map((part) => part.trim())
    .filter(Boolean)
        .map((part, index, arr) => {
          if (
            index > 0 &&
            !/(щит|мебельный|слэб|доска|брус|брусок|рейка|ступень)/i.test(part)
          ) {
            const productWordMatch = arr[0].match(
              /(щит\s+мебельный|мебельный\s+щит|щит|слэб|доска|брусок|брус|рейка|ступень)/i,
            );

            return `${productWordMatch?.[1] || ''} ${part}`.trim();
          }

          return part;
        });

console.log('ORDER LINES WITHOUT PHONE RAW:', quickMultiLines);

if (!earlyPhone && quickMultiLines.length === 1) {
  console.log('SINGLE LINE PRODUCT CHECK:', quickMultiLines[0]);

  const dimensions = this.extractDimensions(quickMultiLines[0]);

  if (dimensions) {
    const relaxedProducts = await this.productsService.findByDimensions(
      dimensions.width,
      dimensions.height,
      dimensions.length,
      quickMultiLines[0].replace(/сорт\s*[ааввээ]|экстра/gi, '').trim(),
    );

    console.log(
      'SINGLE LINE RELAXED PRODUCTS:',
      relaxedProducts.map((p) => p.name),
    );
  }
}

if (!earlyPhone && quickMultiLines.length > 1) {
  const commonWarehouse = this.extractWarehouse(earlyMessageWithoutPhone);

  const orderItems = await Promise.all(
    quickMultiLines.map(async (line) => {
        console.log('MULTI LINE START:', line);

const lineDimensions = this.extractDimensions(line);
const lineQuantity = this.extractQuantity(line);

console.log('MULTI DIMENSIONS START:', lineDimensions);
console.log('MULTI QUANTITY START:', lineQuantity);
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

      console.log('MULTI LINE:', line);
console.log('MULTI DIMENSIONS:', lineDimensions);
console.log('MULTI QUANTITY:', lineQuantity);
console.log('MULTI FOUND:', foundProducts.map((p) => p.name));
console.log('MULTI PICKED:', lineProduct?.name);

              if (!lineProduct) {

                const relaxedProducts = await this.productsService.findByDimensions(
  lineDimensions.width,
  lineDimensions.height,
  lineDimensions.length,
  line.replace(/сорт\s*[ааввээ]|экстра/gi, '').trim(),
);

let alternativeProducts =
  relaxedProducts.length > 0
    ? relaxedProducts
    : foundProducts;

if (alternativeProducts.length === 0) {
  const wider3000Products = await this.productsService.findByDimensions(
    1200,
    lineDimensions.height,
    3000,
    line.replace(/сорт\s*[ааввээ]|экстра/gi, '').trim(),
  );

  const beautifulAProducts = await this.productsService.findByDimensions(
    900,
    lineDimensions.height,
    2900,
    line.replace(/сорт\s*[ааввээ]|экстра/gi, '').trim(),
  );

  alternativeProducts = [
    ...wider3000Products,
    ...beautifulAProducts,
  ];
}

          return {
            missing: true,
            originalLine: line,
            requestedQuantity: lineQuantity || undefined,
            bestWarehouse: lineWarehouse || undefined,
            alternatives: alternativeProducts
  .filter((p) => {
    const name = String(p.name || '').toLowerCase();
    return name.includes('щит мебельный') || name.includes('мебельный щит');
  })
  .slice(0, 3)
  .map((p) => ({
              productId: p.id,
              productName: p.name,
              productPrice: p.price,
              productUnit: p.unit,
              warehouseStock: {
                volhov: p.volhovStock ?? 0,
                sever: p.skotnoeStock ?? 0,
                marino: p.lomonosovStock ?? 0,
                roshino: p.roshinoStock ?? 0,
                ladoga: p.ladogaStock ?? 0,
              },
            })),
          };
        }

      const premiumAlternative = foundProducts.find(
  (p) =>
    p.id !== lineProduct.id &&
    /сорт\s*э|экстра/i.test(p.name),
);

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
  premiumAlternative: premiumAlternative
    ? {
        productName: premiumAlternative.name,
        productPrice: premiumAlternative.price,
        productUnit: premiumAlternative.unit,
        warehouseStock: {
          volhov: premiumAlternative.volhovStock ?? 0,
          sever: premiumAlternative.skotnoeStock ?? 0,
          marino: premiumAlternative.lomonosovStock ?? 0,
          roshino: premiumAlternative.roshinoStock ?? 0,
          ladoga: premiumAlternative.ladogaStock ?? 0,
        },
      }
    : undefined,
};
    }),
  ).then((items) =>
    items.filter(
      (item): item is NonNullable<typeof item> => item !== null,
    ),
  );

      const missingItems = orderItems.filter((item: any) => item.missing);
    const foundItems = orderItems.filter((item: any) => !item.missing);

    if (missingItems.length > 0) {
      const missingText = missingItems
        .map((item: any, index) => {
          const alternativesText = item.alternatives?.length
            ? item.alternatives
                .map(
                  (alt, altIndex) =>
                    `${altIndex + 1}. ${alt.productName}\n` +
                    `Цена: ${alt.productPrice} ₽/${this.formatUnit(alt.productUnit || 'шт')}`,
                )
                .join('\n\n')
            : 'Похожих вариантов не нашёл.';

          return (
            `Позиция ${index + 1}: ${item.originalLine}\n` +
            `Нужно: ${item.requestedQuantity || 0} шт\n\n` +
            `Похожие варианты:\n${alternativesText}`
          );
        })
        .join('\n\n');

              this.pendingMultiAlternativeSelections.set(sessionId, {
        missingItems,
        foundItems,
                  originalMessage: message,
        currentIndex: 0,
      });

      const firstItem = missingItems[0];

      const keyboard = meta?.vkPeerId
        ? {
            one_time: true,
        
            buttons: [
              ...(firstItem.alternatives || []).map((alt: any, index: number) => [
                {
                  action: {
                    type: 'text',
                    label: `${index + 1}. ${alt.productName}`,
                    payload: JSON.stringify({
                      action: 'multi_alternative_select',
                      index,
                    }),
                  },
                  color: 'primary',
                },
              ]),
            ],
          }
        : undefined;

            const response =
        `Не нашёл точный товар для позиции 1:\n\n` +
        `${firstItem.originalLine}\n\n` +
        `Выберите подходящий вариант кнопкой ниже.`;

      return this.saveAndReturn(sessionId, response, {
        userMessage: message,
        sessionId,
        response,
        products: [],
        lead: null,
keyboard,
source: 'multi_item_missing_with_alternatives',
      });
    }

  if (orderItems.length > 1) {
    const formatStock = (stock?: any) =>
  stock
    ? `Остатки:\n` +
      `📍 Север — ${stock.sever ?? 0} шт\n` +
      `📍 Марьино — ${stock.marino ?? 0} шт\n` +
      `📍 Рощино — ${stock.roshino ?? 0} шт\n` +
      `📍 Ладога — ${stock.ladoga ?? 0} шт`
    : '';

const productsText = orderItems
  .map((item: any, index) => {
    const mainText =
      `${index + 1}. ${item.productName}\n` +
      `Количество: ${item.requestedQuantity || 0} шт\n` +
      `Цена: ${item.productPrice?.toLocaleString('ru-RU') || 0} ₽/шт\n` +
      `Сумма: ${(
        (item.productPrice || 0) *
        (item.requestedQuantity || 0)
      ).toLocaleString('ru-RU')} ₽\n` +
      `${formatStock(item.warehouseStock)}`;

    const alternativeText = item.premiumAlternative
      ? `\n\nТакже по этому размеру есть вариант чище:\n` +
        `${item.premiumAlternative.productName}\n` +
        `Цена: ${item.premiumAlternative.productPrice?.toLocaleString('ru-RU') || 0} ₽/шт\n` +
        `${formatStock(item.premiumAlternative.warehouseStock)}`
      : '';

    return mainText + alternativeText;
  })
  .join('\n\n');

    const totalBudget = orderItems.reduce(
      (sum, item) =>
        sum + (item.productPrice || 0) * (item.requestedQuantity || 0),
      0,
    );

    const response =
      `Нашёл товары по вашему запросу:\n\n${productsText}\n\n` +
      `Итого: ${totalBudget.toLocaleString('ru-RU')} ₽\n\n` +
      `Для оформления заявки оставьте, пожалуйста, номер телефона.`;

    return this.saveAndReturn(sessionId, response, {
      userMessage: message,
      sessionId,
      response,
      products: [],
      lead: null,
      source: 'multi_item_found_waiting_phone',
    });
  }
}

if (!pendingOrder?.needsPhone && earlyPhone && orderLinesWithPhone.length > 0) {
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

  const leadData = {
  phone: earlyPhone,
  clientName: this.extractClientName(message) || undefined,
  source: meta?.vkPeerId ? 'vk' : 'chat',
  vkPeerId: meta?.vkPeerId,
  aiSummary:
    `[Категория: Заказ]\n` +
    `Интерес: ${earlyMessageWithoutPhone}\n\n` +
    `История диалога:\nКлиент: ${earlyMessageWithoutPhone}`,
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
};

this.pendingOrders.set(sessionId, leadData);

const confirmationKeyboard = meta?.vkPeerId
  ? {
      one_time: true,
      buttons: [
        [
          {
            action: {
              type: 'text',
              label: '✅ Подтверждаю заказ',
              payload: JSON.stringify({
                action: 'confirm_order',
              }),
            },
            color: 'positive',
          },
        ],
        [
          {
            action: {
              type: 'text',
              label: '✏️ Изменить заказ',
              payload: JSON.stringify({
                action: 'change_order',
              }),
            },
            color: 'secondary',
          },
        ],
                [
          {
            action: {
              type: 'text',
              label: '❌ Отменить заказ',
              payload: JSON.stringify({
                action: 'cancel_order',
              }),
            },
            color: 'negative',
          },
        ],
      ],
    }
  : undefined;

const productsText = orderItems
  .map(
    (item, index) =>
      `${index + 1}. ${item.productName}\n` +
      `Количество: ${item.requestedQuantity || 0} шт\n` +
      `Сумма: ${(
        (item.productPrice || 0) *
        (item.requestedQuantity || 0)
      ).toLocaleString('ru-RU')} ₽`,
  )
  .join('\n\n');

const response =
  `Проверьте заказ:\n\n${productsText}\n\n` +
  `Итого: ${totalBudget.toLocaleString('ru-RU')} ₽\n\n` +
  `Если всё верно — нажмите кнопку подтверждения.`;

return this.saveAndReturn(sessionId, response, {
  userMessage: message,
  sessionId,
  response,
  products: [],
  lead: null,
  keyboard: confirmationKeyboard,
  source: 'waiting_confirmation',
});
}

if (
  pendingOrder?.needsPhone &&
  earlyPhone &&
  message.replace(/\D/g, '').length >= 10
) {
  pendingOrder.phone = earlyPhone;
  pendingOrder.needsPhone = false;

  if (pendingOrder.supplyRequest) {
  const lead = await this.leadsService.create({
    ...pendingOrder,
    phone: earlyPhone,
    aiSummary:
      pendingOrder.aiSummary ||
      `[Категория: Заказ]\nКлиент просит уточнить срок поставки.`,
    productInterest:
      `Запрос срока поставки\n\n` +
      `${pendingOrder.productInterest || ''}`,
    status: 'new',
  });

  this.pendingOrders.delete(sessionId);

  const response =
    `Спасибо, заявка создана и передана менеджеру.\n\n` +
    `Номер заявки: ${lead.orderNumber || lead.id}\n\n` +
    `Менеджер уточнит срок поставки и свяжется с вами.`;

  return this.saveAndReturn(sessionId, response, {
    userMessage: pendingOrder.productInterest || message,
    sessionId,
    response,
    products: [],
    lead,
    source: 'supply_request_created',
  });
}

  if (Array.isArray(pendingOrder.items)) {
    pendingOrder.items = pendingOrder.items.map((item) => {
      const qty = item.requestedQuantity || pendingOrder.requestedQuantity || 1;

      return {
        ...item,
        requestedQuantity: qty,
        total: (item.productPrice || 0) * qty,
      };
    });
  }

  const totalBudget = Array.isArray(pendingOrder.items)
    ? pendingOrder.items.reduce(
        (sum, item) =>
          sum + (item.productPrice || 0) * (item.requestedQuantity || 0),
        0,
      )
    : (pendingOrder.productPrice || 0) *
      (pendingOrder.requestedQuantity || 0);

  pendingOrder.budget = totalBudget;

  this.pendingOrders.set(sessionId, pendingOrder);

  const confirmationKeyboard = meta?.vkPeerId
    ? {
        one_time: true,
        buttons: [
          [
            {
              action: {
                type: 'text',
                label: '✅ Подтверждаю заказ',
                payload: JSON.stringify({
                  action: 'confirm_order',
                }),
              },
              color: 'positive',
            },
          ],
          [
            {
              action: {
                type: 'text',
                label: '✏️ Изменить заказ',
                payload: JSON.stringify({
                  action: 'change_order',
                }),
              },
              color: 'secondary',
            },
          ],
          [
            {
              action: {
                type: 'text',
                label: '❌ Отменить заказ',
                payload: JSON.stringify({
                  action: 'cancel_order',
                }),
              },
              color: 'negative',
            },
          ],
        ],
      }
    : undefined;

    const shortageItems = (pendingOrder.items || []).filter((item) => {
  const quantity = item.requestedQuantity || 0;
  const stock =
    item.bestWarehouse && item.warehouseStock
      ? this.getStockFromWarehouseObject(
          item.warehouseStock,
          item.bestWarehouse,
        )
      : null;

  return stock !== null && quantity > stock;
});

    const productsText = (pendingOrder.items || [])
    .map((item, index) => {
      const quantity = item.requestedQuantity || 0;
      const unit = this.formatUnit(item.productUnit || 'шт');
      const warehouse = item.bestWarehouse;
      const stock =
        warehouse && item.warehouseStock
          ? this.getStockFromWarehouseObject(item.warehouseStock, warehouse)
          : null;
      const shortage =
        stock !== null ? Math.max(0, quantity - stock) : 0;

      return (
        `${index + 1}. ${item.productName}\n` +
        `Количество: ${quantity} ${unit}\n` +
        (warehouse ? `Магазин: ${warehouse}\n` : '') +
        (stock !== null ? `В наличии: ${stock} ${unit}\n` : '') +
        (shortage > 0 ? `Не хватает: ${shortage} ${unit}\n` : '') +
        `Сумма: ${((item.productPrice || 0) * quantity).toLocaleString('ru-RU')} ₽`
      );
    })
    .join('\n\n');

        if (shortageItems.length > 0 && !pendingOrder.shortageAccepted) {
      const shortageText = shortageItems
        .map((item, index) => {
          const quantity = item.requestedQuantity || 0;
          const unit = this.formatUnit(item.productUnit || 'шт');
          const stock = this.getStockFromWarehouseObject(
            item.warehouseStock,
            item.bestWarehouse,
          );
          const shortage = Math.max(0, quantity - (stock || 0));

          return (
            `${index + 1}. ${item.productName}\n` +
            `Нужно: ${quantity} ${unit}\n` +
            `В наличии: ${stock || 0} ${unit}\n` +
            `Не хватает: ${shortage} ${unit}`
          );
        })
        .join('\n\n');

      const shortageDecisionKeyboard = meta?.vkPeerId
        ? {
            one_time: true,
            buttons: [
              [
                {
                  action: {
                    type: 'text',
                    label: '✅ Да, оформить заявку',
                    payload: JSON.stringify({
                      action: 'accept_shortage',
                    }),
                  },
                  color: 'positive',
                },
              ],
              [
                {
                  action: {
                    type: 'text',
                    label: '✏️ Подобрать замену',
                    payload: JSON.stringify({
                      action: 'change_shortage',
                    }),
                  },
                  color: 'primary',
                },
              ],
            ],
          }
        : undefined;

      const response =
        `⚠️ По выбранным товарам есть нехватка:\n\n${shortageText}\n\n` +
        `Продолжить оформление заявки?`;

      return this.saveAndReturn(sessionId, response, {
        userMessage: pendingOrder.productInterest || message,
        sessionId,
        response,
        products: [],
        lead: null,
        keyboard: shortageDecisionKeyboard,
        source: 'pending_order_shortage_decision',
      });
    }

  const response =
    `Проверьте заказ:\n\n${productsText}\n\n` +
    `Итого: ${totalBudget.toLocaleString('ru-RU')} ₽\n\n` +
    `Если всё верно — нажмите кнопку подтверждения.`;

  return this.saveAndReturn(sessionId, response, {
    userMessage: pendingOrder.productInterest || message,
    sessionId,
    response,
    products: [],
    lead: null,
    keyboard: confirmationKeyboard,
    source: 'pending_order_phone_received_waiting_confirmation',
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

  console.log(
  'PHONE STEP ORDER LINES:',
  JSON.stringify(orderLines, null, 2),
);
  
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

const finalOrderItems =
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
      : [];

const totalBudget = finalOrderItems.reduce(
  (sum, item) =>
    sum + (item.productPrice || 0) * (item.requestedQuantity || 0),
  0,
);

const leadData = {
  phone: earlyPhone,
  clientName: this.extractClientName(message) || undefined,
  source: meta?.vkPeerId ? 'vk' : 'chat',
  vkPeerId: meta?.vkPeerId,
  aiSummary: managerSummary,
  productInterest:
  orderLines.length > 1
    ? orderLines.join('\n')
    : orderSummary,
  items: finalOrderItems,
  productId: finalOrderItems[0]?.productId,
  productName: finalOrderItems[0]?.productName,
  productPrice: finalOrderItems[0]?.productPrice,
  productUnit: finalOrderItems[0]?.productUnit,
  requestedQuantity: finalOrderItems[0]?.requestedQuantity,
  warehouseStock: finalOrderItems[0]?.warehouseStock,
  bestWarehouse: finalOrderItems[0]?.bestWarehouse,
  budget: totalBudget || undefined,
};

this.pendingOrders.set(sessionId, leadData);

const confirmationKeyboard = meta?.vkPeerId
  ? {
      one_time: true,
      buttons: [
        [
          {
            action: {
              type: 'text',
              label: '✅ Подтверждаю заказ',
              payload: JSON.stringify({
                action: 'confirm_order',
              }),
            },
            color: 'positive',
          },
        ],
        [
          {
            action: {
              type: 'text',
              label: '✏️ Изменить заказ',
              payload: JSON.stringify({
                action: 'change_order',
              }),
            },
            color: 'secondary',
          },
        ],
                [
          {
            action: {
              type: 'text',
              label: '❌ Отменить заказ',
              payload: JSON.stringify({
                action: 'cancel_order',
              }),
            },
            color: 'negative',
          },
        ],
      ],
    }
  : undefined;

const productsText = finalOrderItems
  .map(
    (item, index) =>
      `${index + 1}. ${item.productName}\n` +
      `Количество: ${item.requestedQuantity || 0} шт\n` +
      `Сумма: ${(
        (item.productPrice || 0) *
        (item.requestedQuantity || 0)
      ).toLocaleString('ru-RU')} ₽`,
  )
  .join('\n\n');

const confirmResponse =
  `Проверьте заказ:\n\n${productsText}\n\n` +
  `Итого: ${totalBudget.toLocaleString('ru-RU')} ₽\n\n` +
  `Если всё верно — нажмите кнопку подтверждения.`;

return this.saveAndReturn(sessionId, confirmResponse, {
  userMessage: message,
  sessionId,
  response: confirmResponse,
  products: [],
  lead: null,
  keyboard: confirmationKeyboard,
  source: 'early_phone_waiting_confirmation',
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

if (
  dimensions &&
  product &&
  !product.name.includes(String(dimensions.width))
) {
  const response =
    `Точного товара ${dimensions.width}x${dimensions.height}x${dimensions.length} не нашёл.\n\n` +
    `Ближайший найденный вариант:\n${product.name}\n\n` +
    'Подходит этот вариант?';

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    intent,
    response,
    products: [product],
    lead: null,
    source: 'dimension_mismatch',
  });
}

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

    if (
  dimensions &&
  !phone &&
  (
    cleanMessage.includes('рейк') ||
    cleanMessage.includes('расклад') ||
    cleanMessage.includes('поруч') ||
    cleanMessage.includes('перил') ||
    cleanMessage.includes('рукохват') ||
    cleanMessage.includes('тетив') ||
    cleanMessage.includes('косоур') ||
    cleanMessage.includes('подоконник') ||
    cleanMessage.includes('столешниц') ||
    cleanMessage.includes('столешка')
  )
) {
  const similarProductsByPurpose =
    await this.productsService.findSimilarProductsByPurpose(
      message,
      dimensions.width,
      dimensions.height,
      dimensions.length,
    );

  if (similarProductsByPurpose.length > 0) {
    const similarText = similarProductsByPurpose
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
      .join('\n\n');

    const response =
      'Нашёл близкие варианты из каталога:\n\n' +
      similarText +
      '\n\nЕсли подходит один из вариантов — напишите количество и магазин для самовывоза.';

    return this.saveAndReturn(sessionId, response, {
      userMessage: message,
      sessionId,
      response,
      products: similarProductsByPurpose,
      lead: null,
      source: 'similar_products_by_purpose_before_store',
    });
  }
}

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

const hasGradeInMessage =
  /сорт\s*[авэ]|сорт\s*а|сорт\s*в|сорт\s*э|экстра|без сучков/i.test(message);

const gradeOptions = productsByDimensions.filter((item) =>
  /сорт\s*[авэ]|сорт\s*а|сорт\s*в|сорт\s*э|экстра/i.test(item.name),
);

const uniqueGrades = Array.from(
  new Set(
    gradeOptions
      .map((item) => {
        const name = item.name.toLowerCase();

        if (name.includes('сорт э') || name.includes('экстра')) {
          return 'Э';
        }

        if (name.includes('сорт а')) {
          return 'А';
        }

        if (name.includes('сорт в')) {
          return 'В';
        }

        return null;
      })
      .filter(Boolean),
  ),
);

if (!hasGradeInMessage && uniqueGrades.length > 1) {
  const gradeKeyboard = meta?.vkPeerId
    ? {
        one_time: true,
        buttons: uniqueGrades.map((grade) => [
          {
            action: {
              type: 'text',
              label: `Сорт ${grade}`,
              payload: JSON.stringify({
                action: 'select_grade',
                grade,
              }),
            },
            color: 'secondary',
          },
        ]),
      }
    : undefined;

  const optionsText = gradeOptions
    .map(
      (item, index) =>
        `${index + 1}. ${item.name}\n` +
        `Цена: ${item.price} ₽/${this.formatUnit(item.unit)}\n` +
        `Остаток: ${item.stock} ${this.formatUnit(item.unit)}`,
    )
    .join('\n\n');

  const response =
    'Нашёл несколько вариантов этого размера с разными сортами:\n\n' +
    optionsText +
    '\n\nУточните, пожалуйста, какой сорт нужен.';

        this.pendingGradeSelections.set(sessionId, {
      products: gradeOptions,
      originalMessage: message,
      quantity: this.extractQuantity(message) || 1,
      warehouse: this.extractWarehouse(message),
    });

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: gradeOptions,
    lead: null,
    keyboard: gradeKeyboard,
    source: 'need_grade_clarification_before_order',
  });
}

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

if (
  dimensions &&
  (
    message.toLowerCase().includes('рейк') ||
    message.toLowerCase().includes('расклад') ||
    message.toLowerCase().includes('поруч') ||
    message.toLowerCase().includes('перил') ||
    message.toLowerCase().includes('рукохват') ||
    message.toLowerCase().includes('тетив') ||
    message.toLowerCase().includes('косоур') ||
    message.toLowerCase().includes('подоконник') ||
    message.toLowerCase().includes('столешниц') ||
    message.toLowerCase().includes('столешка')
  )
) {
  const similarProductsByPurpose =
    await this.productsService.findSimilarProductsByPurpose(
      message,
      dimensions.width,
      dimensions.height,
      dimensions.length,
    );

  if (similarProductsByPurpose.length > 0) {
    const similarText = similarProductsByPurpose
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
      .join('\n\n');

    const response =
      'Нашёл близкие варианты из каталога:\n\n' +
      similarText +
      '\n\nЕсли подходит один из вариантов — напишите количество и магазин для самовывоза.';

    return this.saveAndReturn(sessionId, response, {
      userMessage: message,
      sessionId,
      response,
      products: similarProductsByPurpose,
      lead: null,
      source: 'similar_products_by_purpose',
    });
  }
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

    

if (
  dimensions &&
  (
    message.toLowerCase().includes('рейк') ||
    message.toLowerCase().includes('расклад') ||
    message.toLowerCase().includes('поруч') ||
    message.toLowerCase().includes('перил') ||
    message.toLowerCase().includes('рукохват') ||
    message.toLowerCase().includes('тетив') ||
    message.toLowerCase().includes('косоур') ||
    message.toLowerCase().includes('подоконник') ||
    message.toLowerCase().includes('столешниц') ||
    message.toLowerCase().includes('столешка')
  )
) {
  const similarRailsOrBars =
    await this.productsService.findSimilarProductsByPurpose(
  message,
  dimensions.width,
  dimensions.height,
  dimensions.length,
);

  if (similarRailsOrBars.length > 0) {
    const railsText = similarRailsOrBars
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
      .join('\n\n');

    const response =
      'Точного товара с таким размером не нашёл, но могу предложить близкие варианты:\n\n' +
      railsText +
      '\n\nПодскажите, для каких целей будете использовать: обрешётка, каркас, декоративная отделка или что-то другое? Тогда подберу самый подходящий вариант.';

    return this.saveAndReturn(sessionId, response, {
      userMessage: message,
      sessionId,
      response,
      products: similarRailsOrBars,
      lead: null,
      source: 'rail_not_found_similar_bars',
    });
  }
}

console.log('RELAXED SINGLE CHECK:', dimensions, message);

if (dimensions) {
  const relaxedProducts = await this.productsService.findByDimensions(
  dimensions.width,
  dimensions.height,
  dimensions.length,
  message.replace(/сорт\s*[ааввээ]|экстра/gi, '').trim(),
);

console.log(
  'RELAXED SINGLE FOUND:',
  relaxedProducts.map((p) => p.name),
);

  const relaxedAlternatives = relaxedProducts.filter((p) => {
    const name = String(p.name || '').toLowerCase();
    return name.includes('щит мебельный') || name.includes('мебельный щит');
  });

  if (relaxedAlternatives.length > 0) {
    const relaxedText = relaxedAlternatives
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
          `📦 Остаток: ${stock !== null ? stock : p.stock} ${unit}`
        );
      })
      .join('\n\n');

    const response =
      'Точного товара с таким сортом не нашёл.\n\n' +
      'Могу предложить такие варианты этого размера:\n\n' +
      relaxedText +
      '\n\nЕсли подходит один из вариантов — напишите его номер или название.';

    this.pendingAlternativeSelections.set(sessionId, {
      products: relaxedAlternatives.slice(0, 3),
      originalMessage: message,
      quantity: this.extractQuantity(message) || 1,
      warehouse: this.extractWarehouse(message),
    });

    return this.saveAndReturn(sessionId, response, {
      userMessage: message,
      sessionId,
      response,
      products: relaxedAlternatives.slice(0, 3),
      lead: null,
      source: 'single_item_relaxed_grade_alternatives',
    });
  }
}

const response =
  'Точного товара с таким сортом или размером не нашёл в каталоге.' +
  alternativesText;

    if (similarProducts.length > 0) {
    this.pendingAlternativeSelections.set(sessionId, {
      products: similarProducts.slice(0, 3),
      originalMessage: message,
      quantity: this.extractQuantity(message) || 1,
      warehouse: this.extractWarehouse(message),
    });
  }

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: similarProducts.slice(0, 3),
    lead: null,
    source: 'product_not_found_before_phone_request',
  });
}

  const quantity = this.extractQuantity(message) || 1;
const warehouse = this.extractWarehouse(message);
const total = productFromSearch.price * quantity;

if (warehouse) {
  const selectedStock = this.getWarehouseStock(productFromSearch, warehouse);

  if (selectedStock !== null && quantity > selectedStock) {
    const shortage = quantity - selectedStock;

    const shortageKeyboard = meta?.vkPeerId
      ? {
          one_time: true,
          buttons: [
            [
              {
                action: {
                  type: 'text',
                  label: `✅ Оформить ${selectedStock} шт`,
                  payload: JSON.stringify({
                    action: 'order_available_stock',
                  }),
                },
                color: 'positive',
              },
            ],
            [
              {
                action: {
                  type: 'text',
                  label: '🏬 Подобрать другой магазин',
                  payload: JSON.stringify({
                    action: 'choose_another_warehouse',
                  }),
                },
                color: 'secondary',
              },
            ],
            [
              {
                action: {
                  type: 'text',
                  label: '📅 Уточнить срок поставки',
                  payload: JSON.stringify({
                    action: 'ask_supply_time',
                  }),
                },
                color: 'secondary',
              },
            ],
            [
              {
                action: {
                  type: 'text',
                  label: '❌ Отменить',
                  payload: JSON.stringify({
                    action: 'cancel_order',
                  }),
                },
                color: 'negative',
              },
            ],
          ],
        }
      : undefined;

    this.pendingOrders.set(sessionId, {
      source: meta?.vkPeerId ? 'vk' : 'chat',
      vkPeerId: meta?.vkPeerId,
      productInterest: message,
      productId: productFromSearch.id,
      productName: productFromSearch.name,
      productPrice: productFromSearch.price,
      productUnit: productFromSearch.unit,
      requestedQuantity: quantity,
      availableQuantity: selectedStock,
      bestWarehouse: warehouse,
      budget: productFromSearch.price * selectedStock,
      needsStockDecision: true,
      warehouseStock: {
        volhov: productFromSearch.volhovStock ?? 0,
        sever: productFromSearch.skotnoeStock ?? 0,
        marino: productFromSearch.lomonosovStock ?? 0,
        roshino: productFromSearch.roshinoStock ?? 0,
        ladoga: productFromSearch.ladogaStock ?? 0,
      },
      items: [
        {
          productId: productFromSearch.id,
          productName: productFromSearch.name,
          productPrice: productFromSearch.price,
          productUnit: productFromSearch.unit,
          requestedQuantity: quantity,
          availableQuantity: selectedStock,
          bestWarehouse: warehouse,
          warehouseStock: {
            volhov: productFromSearch.volhovStock ?? 0,
            sever: productFromSearch.skotnoeStock ?? 0,
            marino: productFromSearch.lomonosovStock ?? 0,
            roshino: productFromSearch.roshinoStock ?? 0,
            ladoga: productFromSearch.ladogaStock ?? 0,
          },
        },
      ],
    });

    const response =
      `В магазине ${warehouse} сейчас доступно ${selectedStock} ${this.formatUnit(productFromSearch.unit)}.\n` +
      `Для заказа ${quantity} ${this.formatUnit(productFromSearch.unit)} не хватает ${shortage} ${this.formatUnit(productFromSearch.unit)}.\n\n` +
      'Что сделать?';

    return this.saveAndReturn(sessionId, response, {
      userMessage: message,
      sessionId,
      response,
      products: [productFromSearch],
      lead: null,
      keyboard: shortageKeyboard,
      source: 'warehouse_stock_shortage',
    });
  }
}

const reviewKeyboard = meta?.vkPeerId
  ? {
      one_time: true,
      buttons: [
        [
          {
            action: {
              type: 'text',
              label: '✅ Всё верно',
              payload: JSON.stringify({
                action: 'review_order_ok',
              }),
            },
            color: 'positive',
          },
        ],
        [
          {
            action: {
              type: 'text',
              label: '✏️ Изменить заказ',
              payload: JSON.stringify({
                action: 'review_order_edit',
              }),
            },
            color: 'secondary',
          },
        ],
        [
          {
            action: {
              type: 'text',
              label: '❌ Отменить',
              payload: JSON.stringify({
                action: 'review_order_cancel',
              }),
            },
            color: 'negative',
          },
        ],
      ],
    }
  : undefined;

const response =
  'Проверьте, пожалуйста, что я правильно понял заказ:\n\n' +
  `📦 ${productFromSearch.name}\n` +
  `Количество: ${quantity} ${this.formatUnit(productFromSearch.unit)}\n` +
  (warehouse ? `Магазин: ${warehouse}\n` : '') +
  `Цена: ${productFromSearch.price} ₽/${this.formatUnit(productFromSearch.unit)}\n` +
  `Сумма: ${total} ₽\n\n` +
  'Всё верно?';

this.pendingOrders.set(sessionId, {
  phone: undefined,
  clientName: undefined,
  source: meta?.vkPeerId ? 'vk' : 'chat',
  vkPeerId: meta?.vkPeerId,
  aiSummary: `[Категория: Заказ] ${message}`,
  productInterest: message,
  productId: productFromSearch.id,
  productName: productFromSearch.name,
  productPrice: productFromSearch.price,
  productUnit: productFromSearch.unit,
  requestedQuantity: quantity,
  bestWarehouse: warehouse || this.getBestWarehouse(productFromSearch),
  budget: total,
  needsPhone: true,
  items: [
    {
      productId: productFromSearch.id,
      productName: productFromSearch.name,
      productPrice: productFromSearch.price,
      productUnit: productFromSearch.unit,
      requestedQuantity: quantity,
      bestWarehouse: warehouse || this.getBestWarehouse(productFromSearch),
      warehouseStock: {
        volhov: productFromSearch.volhovStock ?? 0,
        sever: productFromSearch.skotnoeStock ?? 0,
        marino: productFromSearch.lomonosovStock ?? 0,
        roshino: productFromSearch.roshinoStock ?? 0,
        ladoga: productFromSearch.ladogaStock ?? 0,
      },
    },
  ],
  warehouseStock: {
    volhov: productFromSearch.volhovStock ?? 0,
    sever: productFromSearch.skotnoeStock ?? 0,
    marino: productFromSearch.lomonosovStock ?? 0,
    roshino: productFromSearch.roshinoStock ?? 0,
    ladoga: productFromSearch.ladogaStock ?? 0,
  },
});

  return this.saveAndReturn(sessionId, response, {
    userMessage: message,
    sessionId,
    response,
    products: [productFromSearch],
    lead: null,
    source: 'order_review_before_phone',
keyboard: reviewKeyboard,
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
          } else {
            const options = products.slice(0, 5);

            const response =
              'Точного товара с сортом А не нашёл. Нашёл похожие варианты:\n\n' +
              options
                .map(
                  (product, index) =>
                    `${index + 1}. ${product.name}\n` +
                    `Цена: ${product.price} ₽/${this.formatUnit(product.unit)}\n` +
                    `Север: ${product.skotnoeStock} ${this.formatUnit(product.unit)}`,
                )
                .join('\n\n') +
              '\n\nЕсли подходит один из вариантов — напишите его номер.';

            return this.saveAndReturn(sessionId, response, {
              userMessage: message,
              sessionId,
              searchQuery,
              response,
              products: options,
              lead: null,
              source: 'rules_requested_grade_a_not_found',
            });
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

          const product = this.pickBestProduct(products, message);

      if (!product) {
        const options = products.slice(0, 5);

        const response =
          'Точного товара по вашему запросу не нашёл. Нашёл похожие варианты:\n\n' +
          options
            .map(
              (item, index) =>
               `${index + 1}. ${item.name}\n` +
`Цена: ${item.price} ₽/${this.formatUnit(item.unit)}\n` +
`Остатки по точкам:\n` +
`📍 Север — ${item.skotnoeStock ?? 0} ${this.formatUnit(item.unit)}\n` +
`📍 Марьино — ${item.lomonosovStock ?? 0} ${this.formatUnit(item.unit)}\n` +
`📍 Рощино — ${item.roshinoStock ?? 0} ${this.formatUnit(item.unit)}\n` +
`📍 Ладога — ${item.ladogaStock ?? 0} ${this.formatUnit(item.unit)}`, 
            )
            .join('\n\n') +
          '\n\nЕсли подходит один из вариантов — напишите его номер.';

        this.pendingAlternativeSelections.set(sessionId, {
          products: options,
          quantity,
                    warehouse: this.extractWarehouse(message),
          originalMessage: message,
          source: 'grade_not_found',
        });

        return this.saveAndReturn(sessionId, response, {
          userMessage: message,
          sessionId,
          searchQuery,
          response,
          products: options,
          lead: null,
          source: 'rules_product_grade_not_found',
        });
      }

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
  Для оформления заявки не проси имя клиента.
Достаточно номера телефона.
Если нужен контакт — проси только номер телефона.

Не пиши "оставьте ваше имя и номер телефона".
Пиши только: "Оставьте, пожалуйста, номер телефона для оформления заказа."

Не создавай ощущение, что достаточно написать только "самовывоз".
Для самовывоза всегда нужен конкретный магазин.

Если клиент указал несколько размеров и для каждого товара хватает остатка:
- не говори "нет в наличии";
- не говори "не хватает количества";
- перечисли подходящие товары и их остатки;
- предложи оформить заказ.

Если клиент указал несколько позиций:
- считай каждую позицию отдельно;
- не сравнивай количество одной позиции с остатком другой;
- не делай вывод об отсутствии товара, пока не проверил каждую позицию отдельно.

Если по позиции остаток на нужном складе равен или больше запрошенного количества:
- считай товар доступным для заказа.

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

private getStockFromWarehouseObject(
  stock: any,
  warehouse?: string,
): number | null {
  if (!stock || !warehouse) {
    return null;
  }

  const normalized = warehouse.toLowerCase();

  if (normalized.includes('север')) return stock.sever ?? 0;
  if (normalized.includes('марьино')) return stock.marino ?? 0;
  if (normalized.includes('рощино')) return stock.roshino ?? 0;
  if (normalized.includes('ладога')) return stock.ladoga ?? 0;

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

  const meterLengthMatch = normalizedMessage.match(
  /(\d{1,3})\s*x\s*(\d+(?:[.,]\d+)?)\s*м(?:\s|$)/i,
);

if (meterLengthMatch) {
  const height = Number(meterLengthMatch[1]);
  const lengthMeters = Number(meterLengthMatch[2].replace(',', '.'));

  return {
    height,
    width: 900,
    length: Math.round(lengthMeters * 1000),
  };
}

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
    
    if (
  text.includes('стол') ||
  text.includes('столешниц') ||
  text.includes('столешница') ||
  text.includes('столешка') ||
  text.includes('щит на стол') ||
  text.includes('заготовка для стола') ||
  text.includes('заготовка на стол') ||
  text.includes('барная стойка') ||
  text.includes('барная столешница')
) {
  return 'щит 40';
}

if (
  text.includes('подоконник') ||
  text.includes('подоконная доска')
) {
  return 'щит';
}

if (
  text.includes('полка') ||
  text.includes('полочка')
) {
  return 'щит';
}

if (
  text.includes('ступенька') ||
  text.includes('ступени')
) {
  return 'ступень';
}

if (
  text.includes('тетива') ||
  text.includes('косоур')
) {
  return 'тетива';
}

if (
  text.includes('лавка') ||
  text.includes('скамья') ||
  text.includes('скамейка') ||
  text.includes('сиденье') ||
  text.includes('сидушка')
) {
  return 'щит 40';
}

if (
  text.includes('подступенок') ||
  text.includes('подступенки')
) {
  return 'ступень';
}

if (
  text.includes('ограждение') ||
  text.includes('балясина') ||
  text.includes('балясины')
) {
  return 'баляс';
}

if (
  text.includes('перила') ||
  text.includes('перило') ||
  text.includes('поручень') ||
  text.includes('рукохват')
) {
  return 'поручень';
}

if (
  text.includes('рейка') ||
  text.includes('рейки') ||
  text.includes('раскладка') ||
  text.includes('раскладки')
) {
  return 'рейка';
}

if (
  text.includes('наличник') ||
  text.includes('наличники') ||
  text.includes('обналичка') ||
  text.includes('обналичник')
) {
  return 'наличник';
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
  const clientLines: string[] = [];
let currentClientLine = '';

for (const rawLine of context.split('\n')) {
  const line = rawLine.trim();

  if (!line) continue;

  if (/^Клиент:/i.test(line)) {
    if (currentClientLine.trim()) {
      clientLines.push(currentClientLine.trim());
    }

    currentClientLine = line.replace(/^Клиент:\s*/i, '').trim();
    continue;
  }

  if (/^(Бот:|Имя клиента:)/i.test(line)) {
    if (currentClientLine.trim()) {
      clientLines.push(currentClientLine.trim());
      currentClientLine = '';
    }

    continue;
  }

  if (currentClientLine) {
    currentClientLine += `\n${line}`;
  }
}

if (currentClientLine.trim()) {
  clientLines.push(currentClientLine.trim());
}

  const phoneLineIndex = clientLines.findIndex((line) =>
    /\+?\d[\d\s\-()]{8,}\d/.test(line),
  );

  const linesBeforePhone =
    phoneLineIndex > 0 ? clientLines.slice(0, phoneLineIndex) : clientLines;

  const productLinesBeforePhone = linesBeforePhone.filter(
    (line) =>
      this.hasProductWords(line) ||
      this.extractDimensions(line) ||
      this.extractQuantity(line) ||
      this.extractWarehouse(line),
  );

  const lastProductLineIndex = productLinesBeforePhone
  .map((line, index) => ({
    line,
    index,
  }))
  .reverse()
  .find((item) => this.hasProductWords(item.line) || this.extractDimensions(item.line))
  ?.index;

const rawLines =
  lastProductLineIndex !== undefined
    ? productLinesBeforePhone.slice(lastProductLineIndex)
    : clientLines;

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
  .replace(/\n+\s*и\s+/gi, '|ITEM|')
.replace(/\r\n/g, '|ITEM|')
  .replace(
    /\.\s*(?=(щит|мебельный|слэб|доска|брус|брусок|рейка|ступень))/gi,
    '|ITEM|',
  )
  .replace(
    /\s+и\s+(?=(щит|мебельный|слэб|доска|брус|брусок|рейка|ступень|\d+\s*[xх×]\s*\d))/gi,
    '|ITEM|',
  )
  .replace(/;\s*/g, '|ITEM|')
  .split('|ITEM|')
  .map((part) => part.trim())
  .filter(Boolean);

const baseProductWordMatch = cleanLine.match(
  /(щит\s+мебельный|мебельный\s+щит|щит|слэб|доска|брусок|брус|рейка|ступень)/i,
);
const baseProductWord = baseProductWordMatch?.[1] || '';

for (const chunk of chunks) {
    const normalizedChunk = chunk
  .replace(/х/g, 'x')
  .replace(/Х/g, 'x')
  .replace(/×/g, 'x')
  .replace(/\bмебельный\s+(\d+\s*x\s*\d+\s*x\s*\d+)/gi, 'щит мебельный $1');

      const hasFullSize = !!this.extractDimensions(normalizedChunk);
      const hasQuantity = this.extractQuantity(normalizedChunk) !== null;
      const hasProductWord =
  /щит|мебельный|брус|доск|слэб|ступ|тетив|поруч|баляс/i
    .test(normalizedChunk);

      if (hasFullSize && hasProductWord) {
        let finalLine = normalizedChunk;

        if (
  baseProductWord &&
  !/(щит|мебельный|слэб|доска|брус|брусок|рейка|ступень)/i.test(finalLine)
) {
  finalLine = `${baseProductWord} ${finalLine}`;
}

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
            /щит|мебельный|брус|доск|слэб|ступ|тетив|поруч|баляс/i,
          )?.[0] || '';

        for (let i = 0; i < sizeMatches.length; i++) {
          const current = sizeMatches[i];
          const next = sizeMatches[i + 1];

          const start = current.index ?? 0;
          const end = next?.index ?? normalizedChunk.length;

          let part = normalizedChunk.slice(start, end).trim();

          if (
            commonProductWord &&
            !/щит|мебельный|брус|доск|слэб|ступ|тетив|поруч|баляс/i.test(part)
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