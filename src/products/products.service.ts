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
  const normalizedQuery = query.toLowerCase();

  const qb = this.productsRepository
    .createQueryBuilder('product')
    .where('product.name ILIKE :query', { query: `%${query}%` })
    .orWhere('product.category ILIKE :query', { query: `%${query}%` })
    .orWhere('product.description ILIKE :query', { query: `%${query}%` });

  if (normalizedQuery.includes('щит') || normalizedQuery.includes('40')) {
    qb.orderBy(
      `
      CASE
        WHEN LOWER(product.name) LIKE '%щит мебельный%' AND product.height = 40 THEN 0
        WHEN LOWER(product.name) LIKE '%щит мебельный%' THEN 1
        WHEN LOWER(product.name) LIKE '%щит конструкционный%' THEN 2
        WHEN LOWER(product.category) LIKE '%мебельный щит%' THEN 3
        ELSE 4
      END
      `,
      'ASC',
    ).addOrderBy('product.stock', 'DESC');
  } else {
    qb.orderBy('product.stock', 'DESC');
  }

  return qb.take(10).getMany();
}

  findByDimensions(
    width: number,
    height: number,
    length: number,
    keyword?: string,
  ) {
    const normalizedKeyword = keyword?.toLowerCase() || '';

    if (normalizedKeyword.includes('слэб')) {
  return this.productsRepository
    .createQueryBuilder('product')
    .where(
      '(LOWER(product.name) LIKE :slab OR LOWER(product.category) LIKE :slab)',
      { slab: '%слэб%' },
    )
    .andWhere('product.height = :height', { height })
    .orderBy('product.length', 'DESC')
    .addOrderBy('product.stock', 'DESC')
    .take(10)
    .getMany();
}

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
    } else if (
      normalizedKeyword.includes('щит') ||
      normalizedKeyword.includes('мебельный')
    ) {
      qb.orderBy(
        `
        CASE
          WHEN LOWER(product.name) LIKE '%щит мебельный%' THEN 0
          WHEN LOWER(product.name) LIKE '%щит%' THEN 1
          WHEN LOWER(product.category) LIKE '%мебельный щит%' THEN 2
          ELSE 3
        END
        `,
        'ASC',
      ).addOrderBy('product.stock', 'DESC');

          } else if (
      normalizedKeyword.includes('поруч') ||
      normalizedKeyword.includes('перил') ||
      normalizedKeyword.includes('рукохват')
    ) {
      qb.orderBy(
        `
        CASE
          WHEN LOWER(product.name) LIKE '%поручень%' THEN 0
          WHEN LOWER(product.category) LIKE '%поруч%' THEN 1
          ELSE 2
        END
        `,
        'ASC',
      ).addOrderBy('product.stock', 'DESC');
    } else if (
      normalizedKeyword.includes('тетив') ||
      normalizedKeyword.includes('косоур')
    ) {
      qb.orderBy(
        `
        CASE
          WHEN LOWER(product.name) LIKE '%тетива%' THEN 0
          WHEN LOWER(product.category) LIKE '%тетив%' THEN 1
          ELSE 2
        END
        `,
        'ASC',
      ).addOrderBy('product.stock', 'DESC');
    } else if (
      normalizedKeyword.includes('рейка') ||
      normalizedKeyword.includes('рейки') ||
      normalizedKeyword.includes('расклад')
    ) {
      qb.orderBy(
        `
        CASE
          WHEN LOWER(product.name) LIKE '%рейка%' THEN 0
          WHEN LOWER(product.name) LIKE '%раскладка%' THEN 1
          WHEN LOWER(product.category) LIKE '%рейк%' THEN 2
          ELSE 3
        END
        `,
        'ASC',
      ).addOrderBy('product.stock', 'DESC');
    

    } else if (normalizedKeyword.includes('ступ')) {
      qb.orderBy(
        `
        CASE
          WHEN LOWER(product.name) LIKE '%ступень%' THEN 0
          WHEN LOWER(product.category) LIKE '%ступен%' THEN 1
          ELSE 2
        END
        `,
        'ASC',
      ).addOrderBy('product.stock', 'DESC');
    } else if (normalizedKeyword.includes('брус')) {
      qb.orderBy(
        `
        CASE
          WHEN LOWER(product.name) LIKE '%брус%' THEN 0
          WHEN LOWER(product.category) LIKE '%брус%' THEN 1
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

  async findSimilarProductsByPurpose(
  keyword: string,
  width?: number,
  height?: number,
  length?: number,
) {
  const text = keyword.toLowerCase();

  let searchWords: string[] = [];

  if (text.includes('рейк') || text.includes('расклад')) {
    searchWords = ['рейк', 'брус', 'расклад'];
  } else if (
    text.includes('поруч') ||
    text.includes('перил') ||
    text.includes('рукохват')
  ) {
    searchWords = ['поруч'];
  } else if (text.includes('тетив') || text.includes('косоур')) {
    searchWords = ['тетив'];
  } else if (
    text.includes('подоконник') ||
    text.includes('столешниц') ||
    text.includes('столешка')
  ) {
    searchWords = ['щит'];
  } else if (text.includes('ступ')) {
    searchWords = ['ступ'];
  } else if (text.includes('баляс')) {
    searchWords = ['баляс'];
  } else if (text.includes('налич') || text.includes('обналич')) {
    searchWords = ['налич'];
  } else {
    searchWords = [text];
  }

  const qb = this.productsRepository.createQueryBuilder('product');

  qb.where(
    searchWords
      .map(
        (_, index) =>
          `(LOWER(product.name) LIKE :word${index} OR LOWER(product.category) LIKE :word${index})`,
      )
      .join(' OR '),
    Object.fromEntries(
      searchWords.map((word, index) => [`word${index}`, `%${word}%`]),
    ),
  );

  if (width && height && length) {
    const requested = [width, height, length].sort((a, b) => a - b);
    const requestedMin = requested[0];
    const requestedMax = requested[2];

    const minSmall = Math.max(1, requestedMin - 10);
    const maxSmall = requestedMin + 10;

    const minLength = Math.max(1, requestedMax - 1000);
    const maxLength = requestedMax + 500;

    qb.andWhere(
      `
      (
        LEAST(product.width, product.height, product.length) BETWEEN :minSmall AND :maxSmall
        OR product.width BETWEEN :minSmall AND :maxSmall
        OR product.height BETWEEN :minSmall AND :maxSmall
      )
      `,
      { minSmall, maxSmall },
    );

    qb.andWhere(
      `
      (
        product.length BETWEEN :minLength AND :maxLength
        OR product.width BETWEEN :minLength AND :maxLength
        OR product.height BETWEEN :minLength AND :maxLength
      )
      `,
      { minLength, maxLength },
    );

    qb.orderBy(
      `
      CASE
        WHEN LEAST(product.width, product.height, product.length) BETWEEN :minSmall AND :maxSmall THEN 0
        ELSE 1
      END
      `,
      'ASC',
    );
  } else {
    qb.orderBy('product.stock', 'DESC');
  }

  return qb
    .addOrderBy('product.price', 'ASC')
    .addOrderBy('product.stock', 'DESC')
    .take(5)
    .getMany();
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
