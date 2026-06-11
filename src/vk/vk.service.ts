import { Injectable } from '@nestjs/common';

@Injectable()
export class VkService {
  private readonly token = process.env.VK_GROUP_TOKEN;
  private readonly apiVersion = process.env.VK_API_VERSION || '5.199';

  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async sendMessage(peerId: number, message: string) {
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

  async sendManagerNotification(message: string) {
    const managerPeerId = process.env.VK_MANAGER_PEER_ID;

    if (!managerPeerId) {
      console.log('VK_MANAGER_PEER_ID не указан');
      return null;
    }

    return this.sendMessage(Number(managerPeerId), message);
  }
}