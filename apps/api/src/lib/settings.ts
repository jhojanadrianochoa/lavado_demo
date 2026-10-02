import { prisma } from './prisma.js';

export const DEFAULT_SETTINGS = {
  companyName: 'LavaControl',
  logoPath: '',
  autoDeductInventory: 'true',
  dueSoonHours: '24',
  requirePhotoOnComplete: 'false',
};
export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = Record<SettingKey, string>;

export async function getSettings(companyId: number): Promise<Settings> {
  const rows = await prisma.setting.findMany({ where: { companyId } });
  const result: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in result) result[row.key as SettingKey] = row.value;
  }
  return result;
}

export async function setSetting(companyId: number, key: SettingKey, value: string) {
  await prisma.setting.upsert({
    where: { companyId_key: { companyId, key } },
    create: { companyId, key, value },
    update: { value },
  });
}
