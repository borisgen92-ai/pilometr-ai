export type Intent =
  | 'search_product'
  | 'delivery'
  | 'consultation'
  | 'payment'
  | 'return'
  | 'order'
  | 'contact'
  | 'other';

export function detectIntent(message: string): Intent {
  const text = message.toLowerCase();

  // Доставка
  if (
    text.includes('доставка') ||
    text.includes('доставляете') ||
    text.includes('привезти') ||
    text.includes('привезёте') ||
    text.includes('деловые линии') ||
    text.includes('отправка') ||
    text.includes('транспортной компанией') ||
    text.includes('сколько доставка')
  ) {
    return 'delivery';
  }

  // Консультация
  if (
    text.includes('лестниц') ||
    text.includes('делаю') ||
    text.includes('что нужно') ||
    text.includes('посоветуй') ||
    text.includes('подскажи') ||
    text.includes('как лучше') ||
    text.includes('что выбрать') ||
    text.includes('для стола') ||
    text.includes('для полки') ||
    text.includes('для столешницы')
  ) {
    return 'consultation';
  }

  // Оплата
  if (
    text.includes('оплата') ||
    text.includes('оплатить') ||
    text.includes('картой') ||
    text.includes('сбп') ||
    text.includes('наличными') ||
    text.includes('счет') ||
    text.includes('счёт') ||
    text.includes('ндс') ||
    text.includes('безнал')
  ) {
    return 'payment';
  }

  // Возврат
  if (
    text.includes('возврат') ||
    text.includes('вернуть') ||
    text.includes('обмен') ||
    text.includes('брак') ||
    text.includes('дефект')
  ) {
    return 'return';
  }

  // Контакты
  if (
    text.includes('телефон') ||
    text.includes('номер') ||
    text.includes('контакт') ||
    text.includes('связаться') ||
    text.includes('почта')||
    text.match(/(\+?\d[\d\s\-()]{8,}\d)/)
  ) {
    return 'contact';
  }

  // Заказ
  if (
    text.includes('оформить') ||
    text.includes('заказать') ||
    text.includes('купить') ||
    text.includes('беру') ||
    text.includes('оставить заявку')
  ) {
    return 'order';
  }

  return 'search_product';
}