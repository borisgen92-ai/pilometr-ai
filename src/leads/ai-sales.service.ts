import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';

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
  firstPhrase: string;
};

@Injectable()
export class AiSalesService {
  constructor(private readonly aiService: AiService) {}
  async analyzeLead(lead: any): Promise<AiSalesAnalysis> {
    const items = lead.items || [];

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
      items: items.map((item: any) => ({
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        unit: item.productUnit,
        bestWarehouse: item.bestWarehouse,
        warehouseStock: item.warehouseStock,
      })),
    };

    return this.aiService.analyzeSales(input);
  }
}
