import { Injectable } from '@nestjs/common';

@Injectable()
export class VkService {
  private readonly token = process.env.VK_GROUP_TOKEN;
  private readonly apiVersion = process.env.VK_API_VERSION || '5.199';

  async sendMessage(peerId: number, message: string) {
    const url = 'https://api.vk.com/method/messages.send';

    const params = new URLSearchParams({
      access_token: this.token || '',
      v: this.apiVersion,
      peer_id: String(peerId),
      message,
      random_id: String(Date.now()),
    });

    const response = await fetch(url, {
      method: 'POST',
      body: params,
    });

    const data = await response.json();

    console.log('VK send response:', data);

    return data;
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