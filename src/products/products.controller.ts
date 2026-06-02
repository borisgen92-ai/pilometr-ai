import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { Product } from './product.entity';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Body() data: Partial<Product>) {
    return this.productsService.create(data);
  }

  @Get()
  findAll(@Query('q') query?: string) {
    if (query) {
      return this.productsService.search(query);
    }

    return this.productsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }
}