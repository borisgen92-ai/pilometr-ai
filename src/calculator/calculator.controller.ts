import { Body, Controller, Post } from '@nestjs/common';
import { CalculatorService } from './calculator.service';

@Controller('calculator')
export class CalculatorController {
  constructor(
    private readonly calculatorService: CalculatorService,
  ) {}

  @Post('wood-volume')
  calculate(@Body() body: any) {
    const { width, height, length, quantity } = body;

    return this.calculatorService.calculateWoodVolume(
      width,
      height,
      length,
      quantity,
    );
  }
}