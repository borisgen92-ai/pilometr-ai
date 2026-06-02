import { Injectable } from '@nestjs/common';

@Injectable()
export class CalculatorService {
  calculateWoodVolume(
    width: number,
    height: number,
    length: number,
    quantity: number,
  ) {
    const volumeOnePiece =
      (width / 1000) *
      (height / 1000) *
      (length / 1000);

    const totalVolume =
      volumeOnePiece * quantity;

    return {
      width,
      height,
      length,
      quantity,
      volumeOnePiece: Number(volumeOnePiece.toFixed(4)),
      totalVolume: Number(totalVolume.toFixed(4)),
    };
  }

  calculateCost(
    pricePerM3: number,
    volume: number,
  ) {
    return Number(
      (pricePerM3 * volume).toFixed(2),
    );
  }
}