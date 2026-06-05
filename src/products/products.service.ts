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
        stock: 'DESC',
      },
      take: 10,
    });
  }

  findByDimensions(
    width: number,
    height: number,
    length: number,
    keyword?: string,
  ) {
    const normalizedKeyword = keyword?.toLowerCase() || '';

    const qb = this.productsRepository
      .createQueryBuilder('product')
      .where(
        `
        (
          product.width = :width
          OR product.width = :height
          OR product.width = :length
        )
        AND (
          product.height = :width
          OR product.height = :height
          OR product.height = :length
        )
        AND (
          product.length = :width
          OR product.length = :height
          OR product.length = :length
        )
        `,
        { width, height, length },
      );

    if (normalizedKeyword.includes('слэб')) {
      qb.orderBy(
        `
        CASE
          WHEN LOWER(product.name) LIKE '%слэб%' THEN 0
          WHEN LOWER(product.category) LIKE '%слэб%' THEN 1
          ELSE 2
        END
        `,
        'ASC',
      ).addOrderBy('product.stock', 'DESC');
    } else {
      qb.orderBy('product.stock', 'DESC');
    }

    return qb.take(10).getMany();
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