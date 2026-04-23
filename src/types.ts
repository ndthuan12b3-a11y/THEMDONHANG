export type PharmacyName = 'Hưng Thịnh' | 'Tuệ Thiện' | 'Phúc An' | 'HĐ THUOCSI';

export interface Order {
  id: string;
  imageUrls: string[];
  imageUrl?: string; // For backward compatibility
  orderName: string;
  senderName: string;
  pharmacy: PharmacyName;
  hasRecordedEntry: boolean;
  hasRecordedBatchInfo: boolean;
  note: string;
  timestamp: any;
  status?: 'pending' | 'completed';
  completed_at?: any;
}

export interface PharmacyConfig {
  name: PharmacyName;
  color: string;
  bg: string;
  border: string;
  text: string;
}

export interface PharmacyGroup {
  name: string;
  pharmacies: PharmacyConfig[];
}

export const PHARMACY_GROUPS: PharmacyGroup[] = [
  {
    name: 'TẤT CẢ',
    pharmacies: [
      { 
        name: 'Hưng Thịnh', 
        color: 'emerald', 
        bg: 'bg-emerald-500', 
        border: 'border-emerald-200', 
        text: 'text-emerald-700' 
      },
      { 
        name: 'Tuệ Thiện', 
        color: 'blue', 
        bg: 'bg-blue-500', 
        border: 'border-blue-200', 
        text: 'text-blue-700' 
      },
      { 
        name: 'Phúc An', 
        color: 'rose', 
        bg: 'bg-rose-600', 
        border: 'border-rose-200', 
        text: 'text-rose-700' 
      },
      { 
        name: 'HĐ THUOCSI', 
        color: 'purple', 
        bg: 'bg-purple-600', 
        border: 'border-purple-200', 
        text: 'text-purple-700' 
      },
    ]
  }
];

export const PHARMACIES = PHARMACY_GROUPS.flatMap(g => g.pharmacies);
