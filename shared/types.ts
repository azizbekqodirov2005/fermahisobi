export type AnimalStatus = 'active' | 'inactive';

export interface Animal {
  id: number;
  tagNumber: string;
  name: string;
  birthDate: string | null;
  ageYears: number | null;
  ageMonths: number | null;
  ageRecordedOn: string | null;
  dailyFeedKg: number;
  notes: string | null;
  status: AnimalStatus;
  dateAdded: string;
  createdAt: string;
  updatedAt: string;
  /** Hozirgi yosh (tug'ilgan sanadan yoki qo'lda kiritilgandan hisoblangan). */
  age: { years: number; months: number } | null;
  /** Mol bo'yicha sut/yemish yozuvlari mavjudmi (mavjud bo'lsa o'chirib bo'lmaydi, faqat nofaol qilinadi). */
  hasHistory: boolean;
}

export interface MilkRecord {
  id: number;
  animalId: number;
  animalName: string;
  animalTag: string;
  animalStatus: AnimalStatus;
  recordDate: string;
  morningL: number;
  eveningL: number;
  extraL: number;
  totalL: number;
  notes: string | null;
}

export interface FeedRecord {
  id: number;
  animalId: number;
  animalName: string;
  animalTag: string;
  animalStatus: AnimalStatus;
  recordDate: string;
  feedType: string;
  quantityKg: number;
  pricePerKg: number;
  totalCost: number;
  batchId: string | null;
  notes: string | null;
}

export interface MilkSale {
  id: number;
  saleDate: string;
  quantityL: number;
  pricePerL: number;
  totalRevenue: number;
  customerName: string | null;
  notes: string | null;
}

export interface Expense {
  id: number;
  expenseDate: string;
  category: string;
  amount: number;
  description: string | null;
}

export type PriceKind = 'milk' | 'feed';
export interface PriceRow { id: number; kind: PriceKind; price: number; effectiveFrom: string }

export interface Settings {
  farmName: string;
  currencyLabel: "so'm" | 'UZS';
  timezone: string;
  today: string;
  milkPrice: number;
  feedPrice: number;
  priceHistory: PriceRow[];
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface FeedType { id: number; name: string; pricePerKg: number }
export interface FeedByType { feedType: string; kg: number; cost: number; avgPrice: number }
