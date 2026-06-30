import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { MessagesService } from '../messages/messages.service';

export type AiSalesAnalysis = {
  dealScore: number;
  nextAction: string;
  project: string;
  summary: string;
  callPlan: string[];
  mustCheck: string[];
  managerQuestions: string[];
  upsell: string[];
  risks: string[];
  criticalAlerts: string[];
  firstPhrase: string;
};

@Injectable()
export class AiSalesService {
  constructor(
    private readonly aiService: AiService,
    private readonly messagesService: MessagesService,
  ) {}
  async analyzeLead(lead: any): Promise<AiSalesAnalysis> {
    const items = lead.items || [];
    const sessionId = lead.vkPeerId || lead.telegramId || lead.id;
    const dialogHistory = sessionId
      ? await this.messagesService.buildContext(String(sessionId))
      : '';

    const input = {
      lead: {
        id: lead.id,
        orderNumber: lead.orderNumber,
        clientName: lead.clientName,
        phone: lead.phone,
        source: lead.source,
        status: lead.status,
        productInterest: lead.productInterest,
        bestWarehouse: lead.bestWarehouse,
        budget: lead.budget,
        createdAt: lead.createdAt,
      },
      dialogHistory,
      items: items.map((item: any) => {
        const selectedWarehouse = item.bestWarehouse || lead.bestWarehouse;
        const stock = item.warehouseStock || {};
        const stockKey =
          selectedWarehouse === 'Север'
            ? 'sever'
            : selectedWarehouse === 'Марьино'
              ? 'marino'
              : selectedWarehouse === 'Рощино'
                ? 'roshino'
                : selectedWarehouse === 'Ладога'
                  ? 'ladoga'
                  : null;

        const selectedWarehouseStock = stockKey ? Number(stock[stockKey] || 0) : null;
        const quantity = Number(item.quantity || 0);
        const shortage =
          selectedWarehouseStock === null
            ? null
            : Math.max(0, quantity - selectedWarehouseStock);

        return {
          productName: item.productName,
          quantity,
          price: item.price,
          total: item.total,
          unit: item.productUnit,
          bestWarehouse: selectedWarehouse,
          selectedWarehouseStock,
          shortage,
          stockByStores: {
            Север: stock.sever || 0,
            Марьино: stock.marino || 0,
            Рощино: stock.roshino || 0,
            Ладога: stock.ladoga || 0,
          },
        };
      }),
    };

    return this.aiService.analyzeSales(input);
  }
}
