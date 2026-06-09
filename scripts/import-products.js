const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { Client } = require('pg');
const iconv = require('iconv-lite');
require('dotenv').config();

function fixText(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value).trim();
}

function num(value) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function productKey(product) {
  return [
    product.name,
    product.width,
    product.height,
    product.length,
    product.price,
  ].join('|');
}

async function main() {
  const fileBuffer = fs.readFileSync('catalog.xlsx');
  const content = iconv.decode(fileBuffer, 'win1251');

  const rows = parse(content, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  const namesById = new Map();

  for (const row of rows) {
    if (row.id && row.name) {
      namesById.set(String(row.id), fixText(row.name));
    }
  }

  const seen = new Set();

  const products = rows
    .map((row) => {
      const product = {
        name: fixText(row.name),
        category: namesById.get(String(row['parent-id'])) || 'Каталог',
        woodType: fixText(row.material),
        width: num(row.shirina),
        height: num(row.tolshchina_mm),
        length: num(row.dlina),
        price: num(row.price),
        stock: num(row.common_quantity),

        // Волхов — центральный склад / завод
        volhovStock: num(row.volhov_storage),

        // Точки выдачи
        lomonosovStock: num(row.lomonosov_storage), // Марьино
        roshinoStock: num(row.roshino_storage) || num(row.pulkovo_storage), // Рощино
        skotnoeStock: num(row.skotnoe_storage), // Север
        ladogaStock: num(row.ladoga_storage), // Ладога

        unit: fixText(row.edinica_kratko) || 'шт',
        description: fixText(row.descr),
        isActive: Number(row['is-active']) === 1,
      };

      return product;
    })
    .filter((p) => p.name && p.isActive && p.price > 0)
    .filter((p) => {
      const key = productKey(p);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'pilometr_ai',
  });

  await client.connect();

  await client.query('DELETE FROM products');

  for (const product of products) {
    await client.query(
      `
      INSERT INTO products
      (
        name,
        category,
        "woodType",
        width,
        height,
        length,
        grade,
        humidity,
        price,
        stock,
        "volhovStock",
        "lomonosovStock",
        "roshinoStock",
        "skotnoeStock",
        "ladogaStock",
        unit,
        description,
        "createdAt",
        "updatedAt"
      )
      VALUES
      (
        $1, $2, $3, $4, $5, $6,
        NULL, NULL,
        $7, $8, $9, $10, $11, $12, $13,
        $14, $15,
        NOW(), NOW()
      )
      `,
      [
        product.name,
        product.category,
        product.woodType,
        product.width,
        product.height,
        product.length,
        product.price,
        product.stock,
        product.volhovStock,
        product.lomonosovStock,
        product.roshinoStock,
        product.skotnoeStock,
        product.ladogaStock,
        product.unit,
        product.description,
      ],
    );
  }

  await client.end();

  console.log(`Импортировано товаров: ${products.length}`);
  console.log(products.slice(0, 5));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});