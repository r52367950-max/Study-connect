/**
 * Seed data for stage-1 development:
 *   - 50 popular middle-school records across 5 cities (10 each)
 *   - Pinyin first-letter index for autocomplete prefix search
 *
 * Run via:  npm run prisma:migrate  then  npx prisma db seed   (or)   ts-node prisma/seed.ts
 *
 * Sample materials are intentionally omitted here: stage-3 frontend will
 * upload through the real /materials API path so file storage + scanning
 * stays consistent. If you need fixtures for /materials/recommend testing,
 * upload via the existing admin flow.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SchoolSeed = { name: string; city: string; pinyin: string };

const SCHOOLS: SchoolSeed[] = [
  // —— 北京 ——
  { name: '北京市第四中学', city: '北京', pinyin: 'bjsdszx' },
  { name: '中国人民大学附属中学', city: '北京', pinyin: 'zgrmdxfsxx' },
  { name: '北京师范大学附属实验中学', city: '北京', pinyin: 'bjsfdxfssyzx' },
  { name: '清华大学附属中学', city: '北京', pinyin: 'qhdxfszx' },
  { name: '北京大学附属中学', city: '北京', pinyin: 'bjdxfszx' },
  { name: '北京市第十一学校', city: '北京', pinyin: 'bjssyxx' },
  { name: '北京市第八中学', city: '北京', pinyin: 'bjsdbzx' },
  { name: '北京市第一〇一中学', city: '北京', pinyin: 'bjsdyolzx' },
  { name: '首都师范大学附属中学', city: '北京', pinyin: 'sdsfdxfszx' },
  { name: '北京市汇文中学', city: '北京', pinyin: 'bjshwzx' },

  // —— 上海 ——
  { name: '上海中学', city: '上海', pinyin: 'shzx' },
  { name: '华东师范大学第二附属中学', city: '上海', pinyin: 'hdsfdxdefszx' },
  { name: '复旦大学附属中学', city: '上海', pinyin: 'fddxfszx' },
  { name: '上海交通大学附属中学', city: '上海', pinyin: 'shjtdxfszx' },
  { name: '上海市七宝中学', city: '上海', pinyin: 'shsqbzx' },
  { name: '上海市建平中学', city: '上海', pinyin: 'shsjpzx' },
  { name: '上海市南洋模范中学', city: '上海', pinyin: 'shsnymfzx' },
  { name: '上海市格致中学', city: '上海', pinyin: 'shsgzzx' },
  { name: '上海市市西中学', city: '上海', pinyin: 'shssxzx' },
  { name: '上海外国语大学附属外国语学校', city: '上海', pinyin: 'shwgydxfswgyxx' },

  // —— 广州 ——
  { name: '华南师范大学附属中学', city: '广州', pinyin: 'hnsfdxfszx' },
  { name: '广东实验中学', city: '广州', pinyin: 'gdsyzx' },
  { name: '广州市执信中学', city: '广州', pinyin: 'gzszxzx' },
  { name: '广州市第二中学', city: '广州', pinyin: 'gzsdezx' },
  { name: '广州市第六中学', city: '广州', pinyin: 'gzsdlzx' },
  { name: '广州市育才中学', city: '广州', pinyin: 'gzsyczx' },
  { name: '广州大学附属中学', city: '广州', pinyin: 'gzdxfszx' },
  { name: '广州市铁一中学', city: '广州', pinyin: 'gzstyzx' },
  { name: '广州市真光中学', city: '广州', pinyin: 'gzszgzx' },
  { name: '广州市天河中学', city: '广州', pinyin: 'gzsthzx' },

  // —— 深圳 ——
  { name: '深圳中学', city: '深圳', pinyin: 'szzx' },
  { name: '深圳实验学校', city: '深圳', pinyin: 'szsyxx' },
  { name: '深圳外国语学校', city: '深圳', pinyin: 'szwgyxx' },
  { name: '深圳高级中学', city: '深圳', pinyin: 'szgjzx' },
  { name: '深圳市第三高级中学', city: '深圳', pinyin: 'szsdsgjzx' },
  { name: '深圳市育才中学', city: '深圳', pinyin: 'szsyczx' },
  { name: '深圳市福田中学', city: '深圳', pinyin: 'szsftzx' },
  { name: '深圳市第二高级中学', city: '深圳', pinyin: 'szsdegjzx' },
  { name: '深圳市红岭中学', city: '深圳', pinyin: 'szshlzx' },
  { name: '深圳市宝安中学', city: '深圳', pinyin: 'szsbazx' },

  // —— 成都 ——
  { name: '四川省成都市第七中学', city: '成都', pinyin: 'scscdsdqzx' },
  { name: '成都市石室中学', city: '成都', pinyin: 'cdsssszx' },
  { name: '成都树德中学', city: '成都', pinyin: 'cdsdzx' },
  { name: '成都市第二十中学', city: '成都', pinyin: 'cdsdesszx' },
  { name: '成都外国语学校', city: '成都', pinyin: 'cdwgyxx' },
  { name: '成都实验外国语学校', city: '成都', pinyin: 'cdsywgyxx' },
  { name: '电子科技大学实验中学', city: '成都', pinyin: 'dzkjdxsyzx' },
  { name: '成都七中嘉祥外国语学校', city: '成都', pinyin: 'cdqzjxwgyxx' },
  { name: '四川大学附属中学', city: '成都', pinyin: 'scdxfszx' },
  { name: '成都市玉林中学', city: '成都', pinyin: 'cdsylzx' },
];

async function main() {
  for (const school of SCHOOLS) {
    await prisma.school.upsert({
      where: { city_name: { city: school.city, name: school.name } },
      update: { pinyin: school.pinyin },
      create: school,
    });
  }
  console.info(`seeded ${SCHOOLS.length} schools`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
