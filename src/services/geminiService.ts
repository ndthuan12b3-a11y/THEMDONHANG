import { GoogleGenAI, Type } from "@google/genai";

const getAPIKey = () => process.env.GEMINI_API_KEY;

let aiClient: any = null;
const getAI = () => {
  if (!aiClient) {
    const key = getAPIKey();
    if (!key) throw new Error("GEMINI_API_KEY is not configured. Please add it in the Secrets panel.");
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
};

/**
 * Robustly extract text from Gemini response candidates
 */
const extractText = (response: any): string => {
  if (typeof response.text === 'string') return response.text;
  if (typeof response.text === 'function') return response.text();
  
  const candidate = response.candidates?.[0];
  const part = candidate?.content?.parts?.[0];
  if (part?.text) return part.text;
  
  console.error("Unknown response structure:", JSON.stringify(response, null, 2));
  throw new Error("Could not extract text from AI response.");
};

const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> => {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isTransient = 
        error?.status === 503 || 
        error?.status === 500 || 
        error?.message?.includes("503") ||
        error?.message?.includes("overloaded") ||
        error?.message?.includes("high demand") ||
        error?.message?.includes("Try again later");
      
      if (!isTransient || i === maxRetries - 1) break;
      
      const delay = initialDelay * Math.pow(2, i);
      console.warn(`Gemini API transient error, retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
};

export interface ScanResult {
  quality: {
    isGood: boolean;
    reason?: string;
  };
  data: any[];
  total_amount: string;
  invoice_date?: string;
  invoice_no?: string;
  tax_code?: string;
  supplier_name?: string;
  buyer_name?: string;
  buyer_tax_code?: string;
}

export interface ImageQualityResult {
  isGood: boolean;
  issues: string[]; // e.g. ["Mờ", "Lóa", "Không thấy chữ"]
}

export const checkImageQuality = async (imageBase64: string): Promise<ImageQualityResult> => {
  const qualitySchema = {
    type: Type.OBJECT,
    properties: {
      g: { type: Type.BOOLEAN },
      i: { 
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    },
    required: ["g", "i"]
  };

  const prompt = `Bạn là chuyên gia kiểm định hình ảnh cho hệ thống OCR y tế. 
Nhiệm vụ: Đánh giá xem ảnh hóa đơn này có đủ độ nét để trích xuất dữ liệu chính xác (tên thuốc, số lô, hạn dùng) hay không.

TIÊU CHUẨN CỰC KỲ KHẮT KHE:
1. Độ nét (Blur): Nếu các dòng chữ nhỏ nhất bị nhòe, không phân biệt được chữ 'o' và 'e', hoặc 'i' và 'l' -> g=false, i=["Mờ"].
2. Độ lóa (Glare): Nếu có ánh đèn flash phản chiếu làm mất chi tiết ở bất kỳ khu vực chứa chữ nào -> g=false, i=["Lóa"].
3. Ánh sáng: Nếu ảnh quá tối dẫn đến nhiễu hạt che mất nét chữ -> g=false, i=["Thiếu sáng"].
4. Góc chụp: Nếu ảnh bị cắt mất góc hóa đơn hoặc quá nghiêng khiến chữ bị biến dạng -> g=false, i=["Góc chụp"].

Trả về JSON:
- g: true nếu ảnh HOÀN HẢO, nét căng.
- g: false nếu có bất kỳ lỗi nào trên.
- i: Danh sách các lỗi bằng tiếng Việt (tối đa 2 lỗi quan trọng nhất).

HÃY CỰC KỲ KHẮT KHE. Nếu nghi ngờ ảnh không đủ nét, hãy trả về false.`;

  const ai = getAI();
  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64.split(',')[1] || imageBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: qualitySchema,
      }
    }));

    const parsed = JSON.parse(extractText(response));
    return {
      isGood: parsed.g,
      issues: parsed.i || []
    };
  } catch (error) {
    console.error("Gemini Check Quality Error:", error);
    return { isGood: true, issues: [] };
  }
};

export const scanInvoice = async (
  imagesBase64: string[],
  mode: 'SAPO' | 'GPP'
): Promise<ScanResult> => {
  const ai = getAI();
  const minifiedSchema = {
    type: Type.OBJECT,
    properties: {
      q: {
        type: Type.OBJECT,
        properties: {
          g: { type: Type.BOOLEAN },
          r: { type: Type.STRING }
        },
        required: ["g"]
      },
      tot: { type: Type.STRING },
      id: { type: Type.STRING },
      in: { type: Type.STRING },
      tx: { type: Type.STRING },
      sn: { type: Type.STRING },
      bn: { type: Type.STRING },
      btx: { type: Type.STRING },
      d: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            n: { type: Type.NUMBER },
            t: { type: Type.STRING },
            l: { type: Type.STRING },
            h: { type: Type.STRING },
            dv: { type: Type.STRING },
            q: { type: Type.NUMBER },
            p: { type: Type.STRING },
            c: { type: Type.STRING },
            v: { type: Type.NUMBER },
            tt: { type: Type.STRING }
          },
          required: ["t", "q", "p", "tt", "l", "h"]
        }
      }
    },
    required: ["q", "d"]
  };

  const systemInstruction = `You are a professional invoice scanner for pharmacies in Vietnam.
Step 1: Check quality. If bad, set q.g=false and reason in q.r.
Step 2: If good, extract data based on MODE.

***CRITICAL RULES***:
1. ITEM EXTRACTION (d):
   - YOU MUST EXTRACT 'số lô' (l) AND 'hạn dùng' (h) FOR EVERY SINGLE ITEM. 
   - If not found, output 'N/A'. DO NOT leave blank.
   - HSD format: DD/MM/YYYY. If only month/year or year, convert to DD/MM/YYYY (e.g. 12/2025 -> 01/12/2025).
   - MODE SAPO: 
     * Prices (p) MUST be AFTER TAX (Giá sau thuế). 
     * Format (p): Extract exactly as "xxx,xxx,xxx" (integer string with comma separators).
   - MODE GPP: 
     * Prices (p) MUST be BEFORE TAX (Giá trước thuế).
     * Format (p): Extract exactly as "xxx,xxx,xxx.xx" (string with comma separators for thousands and dot for decimal).
     * Extract VAT (v) as a percentage number (e.g. 5, 8, 10).
2. PRECISION: Ensure unit quantities (q) and unit prices (p) are exactly as printed. Do not round numbers.
3. HEADER EXTRACTION:
   - MODE GPP: Extract invoice_date (id), invoice_no (in), tax_code (tx), supplier_name (sn), buyer_name (bn), buyer_tax_code (btx).
   - MODE SAPO: IGNORE headers (sn, tx, bn, btx). ONLY extract 'tot' (Final Total) and 'id/in' (Date/No) if clearly visible for reference.

3. FINAL TOTAL: Extract the explicitly stated "Tổng cộng" / "Tổng tiền thanh toán" into 'tot'.

Return valid JSON.`;

  try {
    const imageParts = imagesBase64.map(base64 => ({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64.split(',')[1] || base64,
      }
    }));

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: {
        parts: [
          ...imageParts,
          {
            text: `Scan invoice MODE ${mode}. Merge all pages into 'd'. Extract all unit prices as raw numeric strings.`,
          },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: minifiedSchema,
      },
    }));

    const minResult = JSON.parse(extractText(response));

    // Inflate minified result back to standard ScanResult format for Frontend
    const mappedData = minResult.d.map((item: any) => {
      if (mode === 'SAPO') {
        return {
          stt: item.n,
          ten_san_pham: item.t,
          so_lo: item.l,
          hsd: item.h,
          don_vi: item.dv,
          sl_nhap: item.q,
          don_gia: item.p,
          chiet_khau: item.c,
          thanh_tien: item.tt
        };
      } else {
        return {
          ten_hh: item.t,
          so_lo: item.l,
          hsd: item.h,
          dvt: item.dv,
          sl: item.q,
          don_gia_nhap: item.p,
          chiet_khau: item.c,
          vat: item.v,
          thanh_tien: item.tt
        };
      }
    });

    const result: ScanResult = {
      quality: {
        isGood: minResult.q.g,
        reason: minResult.q.r
      },
      total_amount: minResult.tot || "0",
      invoice_date: minResult.id,
      invoice_no: minResult.in,
      tax_code: minResult.tx,
      supplier_name: minResult.sn,
      buyer_name: minResult.bn,
      buyer_tax_code: minResult.btx,
      data: mappedData
    };

    return result;
  } catch (error: any) {
    console.error("Gemini Scan Error:", error);
    
    // Intercept transient errors (503, high demand)
    const isTransient = 
      error?.status === 503 || 
      error?.message?.includes("503") ||
      error?.message?.includes("overloaded") ||
      error?.message?.includes("high demand") ||
      error?.message?.includes("Try again later");

    if (isTransient) {
      throw new Error("Hệ thống AI đang quá tải (High Demand). Vui lòng đợi vài giây và thử lại.");
    }

    // Intercept 429 Resource Exhausted / Quota Exceeded
    if (error?.status === 429 || error?.message?.toLowerCase().includes("quota") || error?.message?.toLowerCase().includes("exhausted")) {
      throw new Error("Tài khoản AI đang tạm dừng do giới hạn API. Nếu bạn dùng API Key cá nhân, vui lòng kiểm tra lại hạn mức trên Google Cloud.");
    }
    throw error;
  }
};
