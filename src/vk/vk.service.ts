import { Injectable } from '@nestjs/common';

@Injectable()
export class VkService {
  private readonly token = process.env.VK_GROUP_TOKEN;
  private readonly apiVersion = process.env.VK_API_VERSION || '5.199';

  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async sendMessage(peerId: number, message: string, keyboard?: any) {
    const url = 'https://api.vk.com/method/messages.send';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const params = new URLSearchParams({
          access_token: this.token || '',
          v: this.apiVersion,
          peer_id: String(peerId),
          message,
          random_id: String(Date.now() + attempt),
        });

        if (keyboard) {
          params.append('keyboard', JSON.stringify(keyboard));
        }

        const response = await fetch(url, {
          method: 'POST',
          body: params,
          signal: AbortSignal.timeout(20000),
        });

        const data = await response.json();

        console.log(`VK send response attempt ${attempt}:`, data);

        if (data?.error) {
          console.error('VK API ERROR:', data.error);
        }

        return data;
      } catch (error) {
        console.error(`VK SEND ERROR attempt ${attempt}:`, error);

        if (attempt === 3) {
          return {
            error: 'VK_SEND_FAILED',
            details: error,
          };
        }

        await this.delay(1500);
      }
    }
  }

  private getManagerPeerIds(): number[] {
    const ids =
      process.env.VK_MANAGER_PEER_IDS || process.env.VK_MANAGER_PEER_ID || '';

    return ids
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  private createLeadKeyboard(leadId: string) {
    return {
      inline: true,
      buttons: [
        [
          {
            action: {
              type: 'callback',
              label: '🔵 Принят к исполнению',
              payload: JSON.stringify({
                action: 'lead_status',
                leadId,
                status: 'in_progress',
              }),
            },
            color: 'primary',
          },
          {
            action: {
              type: 'callback',
              label: '🟡 Готов к выдаче',
              payload: JSON.stringify({
                action: 'lead_status',
                leadId,
                status: 'negotiation',
              }),
            },
            color: 'secondary',
          },
        ],
        [
          {
            action: {
              type: 'callback',
              label: '🟢 Выдан',
              payload: JSON.stringify({
                action: 'lead_status',
                leadId,
                status: 'won',
              }),
            },
            color: 'positive',
          },
          {
            action: {
              type: 'callback',
              label: '🔴 Отказ',
              payload: JSON.stringify({
                action: 'lead_status',
                leadId,
                status: 'lost',
              }),
            },
            color: 'negative',
          },
        ],
      ],
    };
  }

    async getUserName(userId: number): Promise<string | null> {
    const url = 'https://api.vk.com/method/users.get';

    try {
      const params = new URLSearchParams({
        access_token: this.token || '',
        v: this.apiVersion,
        user_ids: String(userId),
      });

      const response = await fetch(url, {
        method: 'POST',
        body: params,
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json();

      const user = data?.response?.[0];

      if (!user) {
        return null;
      }

      return `${user.first_name || ''} ${user.last_name || ''}`.trim() || null;
    } catch (error) {
      console.error('VK GET USER ERROR:', error);
      return null;
    }
  }
  
  async sendManagerNotification(message: string, leadId?: string) {
    const managerPeerIds = this.getManagerPeerIds();

    if (managerPeerIds.length === 0) {
      console.log('VK_MANAGER_PEER_IDS / VK_MANAGER_PEER_ID не указан');
      return null;
    }

    const keyboard = leadId ? this.createLeadKeyboard(leadId) : undefined;

    const results: { peerId: number; result: any }[] = [];

    for (const peerId of managerPeerIds) {
  let result = await this.sendMessage(peerId, message, keyboard);

  if (result?.error?.error_code === 912 && keyboard) {
    console.log(
      'VK callback buttons disabled. Sending manager notification without keyboard.',
    );

    result = await this.sendMessage(peerId, message);
  }

  results.push({ peerId, result });
}

    return results;
  }

  async answerMessageEvent(
    eventId: string,
    userId: number,
    peerId: number,
    text: string,
  ) {
    const url = 'https://api.vk.com/method/messages.sendMessageEventAnswer';

    try {
      const params = new URLSearchParams({
        access_token: this.token || '',
        v: this.apiVersion,
        event_id: eventId,
        user_id: String(userId),
        peer_id: String(peerId),
        event_data: JSON.stringify({
          type: 'show_snackbar',
          text,
        }),
      });

      const response = await fetch(url, {
        method: 'POST',
        body: params,
        signal: AbortSignal.timeout(20000),
      });

      const data = await response.json();

      console.log('VK event answer:', data);

      if (data?.error) {
        console.error('VK EVENT ANSWER ERROR:', data.error);
      }

      return data;
    } catch (error) {
      console.error('VK EVENT ANSWER SEND ERROR:', error);

      return {
        error: 'VK_EVENT_ANSWER_FAILED',
        details: error,
      };
    }
  }
}