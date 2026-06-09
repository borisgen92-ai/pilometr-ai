const xlsx = require('xlsx');
const { Client } = require('pg');
const iconv = require('iconv-lite');
require('dotenv').config();

function fixText(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return String(value);

  return iconv.decode(Buffer.from(value, 'latin1'), 'win1251');
}

function num(value) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function main() {
  const wb = xlsx.readFile('catalog.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });

  const headers = rows[0];

  const index = (name) => headers.indexOf(name);

  const idIndex = index('id');
  const nameIndex = index('name');
  const parentIdIndex = index('parent-id');
  const activeIndex = index('is-active');
  const priceIndex = index('price');
  const stockIndex = index('common_quantity');
const severStockIndex = index('volhov_storage');
const marinoStockIndex = index('lomonosov_storage');
const roshinoStockIndex = index('roshino_storage');
const ladogaStockIndex = index('ladoga_storage');                     
  const widthIndex = index('shirina');
  const lengthIndex = index('dlina');
  const heightIndex = index('tolshchina_mm');
  const materialIndex = index('material');
  const unitIndex = index('edinica_kratko');
  const descriptionIndex = index('descr');

  const allItems = rows.slice(3);

  const namesById = new Map();

  for (const row of allItems) {
    const id = row[idIndex];
    const name = fixText(row[nameIndex]);

    if (id && name) {
      namesById.set(String(id), name);
    }
  }

  const products = allItems
    .map((row) => {
      const price = num(row[priceIndex]);
      const name = fixText(row[nameIndex]);
      const parentId = row[parentIdIndex];

      return {
        name,
        category: namesById.get(String(parentId)) || 'Каталог',
        woodType: fixText(row[materialIndex]),
        width: num(row[widthIndex]),
        height: num(row[heightIndex]),
        length: num(row[lengthIndex]),
        price,
        stock: num(row[stockIndex]),
volhovStock: num(row[severStockIndex]),
lomonosovStock: num(row[marinoStockIndex]),
roshinoStock: num(row[roshinoStockIndex]),
ladogaStock: num(row[ladogaStockIndex]),
        unit: fixText(row[unitIndex]) || 'шт',
        description: fixText(row[descriptionIndex]),
        isActive: Number(row[activeIndex]) === 1,
      };
    })
    .filter((p) => p.name && p.isActive && p.price > 0);

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
  "ladogaStock",
  unit,
  description,
  "createdAt",
  "updatedAt"
)
     VALUES
(
  $1,
  $2,
  $3,
  $4,
  $5,
  $6,
  NULL,
  NULL,
  $7,
  $8,
  $9,
  $10,
  $11,
  $12,
  $13,
  $14,
  NOW(),
  NOW()
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
