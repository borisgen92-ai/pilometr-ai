import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Not, Repository } from 'typeorm';

import { Product } from './product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  create(data: Partial<Product>) {
    const product = this.productsRepository.create(data);
    return this.productsRepository.save(product);
  }

  findAll() {
    return this.productsRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  search(query: string) {
    return this.productsRepository.find({
      where: [
        { name: ILike(`%${query}%`) },
        { category: ILike(`%${query}%`) },
        { description: ILike(`%${query}%`) },
      ],
      order: {
        createdAt: 'DESC',
      },
    });
  }

  findAlternatives(category: string, excludeProductId?: string) {
    return this.productsRepository.find({
      where: {
        category,
        ...(excludeProductId ? { id: Not(excludeProductId) } : {}),
      },
      order: {
        stock: 'DESC',
      },
      take: 5,
    });
  }

  async findOne(id: string) {
    const product = await this.productsRepository.findOne({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }
}