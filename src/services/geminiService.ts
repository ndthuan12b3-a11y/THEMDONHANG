import { GoogleGenAI, Type } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: API_KEY! });

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
  if (!API_KEY) throw new Error("GEMINI_API_KEY is not configured.");

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

  try {
    const response = await ai.models.generateContent({
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
    });

    const parsed = JSON.parse(response.text);
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
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured. Please add it in the Secrets panel.");
  }

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
   - MODE SAPO: Prices are AFTER TAX.
   - MODE GPP: Prices are BEFORE TAX, extract VAT (v) %.

2. HEADER EXTRACTION:
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

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: {
        parts: [
          ...imageParts,
          {
            text: `Scan invoice MODE ${mode}. Merge all pages into 'd'.`,
          },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: minifiedSchema,
      },
    });

    const minResult = JSON.parse(response.text);

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
    // Intercept 429 Resource Exhausted / Quota Exceeded
    if (error?.status === 429 || error?.message?.toLowerCase().includes("quota") || error?.message?.toLowerCase().includes("exhausted")) {
      throw new Error("Hệ thống AI đang quá tải hoặc tạm dừng do hết hạn mức. Vui lòng thử lại sau.");
    }
    throw error;
  }
};
