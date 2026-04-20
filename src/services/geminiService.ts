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
}

export const scanInvoice = async (
  imagesBase64: string[],
  mode: 'SAPO' | 'GPP'
): Promise<ScanResult> => {
  if (!API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured. Please add it in the Secrets panel.");
  }

  // Cost-Optimization: Heavily minified schema to save on Output Tokens
  const minifiedSapoSchema = {
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
            tt: { type: Type.STRING }
          },
          required: ["t", "q", "p", "tt"]
        }
      }
    },
    required: ["q", "d"]
  };

  const minifiedGppSchema = {
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
      d: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
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
          required: ["t", "q", "p", "tt"]
        }
      }
    },
    required: ["q", "d"]
  };

  const systemInstruction = `You are a professional invoice scanner for pharmacies in Vietnam.
Step 1: Check quality. If bad, set q.g=false and reason in q.r.
Step 2: If good, extract items based on mode.

***CRITICAL RULE FOR PRICES***: 
- MODE SAPO: ALWAYS extract the AFTER TAX prices.
- MODE GPP: ALWAYS extract the BEFORE TAX prices for unit price and line total. Extract VAT rate.
- FINAL TOTAL: Extract the explicitly stated "Tổng cộng" / "Tổng tiền thanh toán" into 'tot'.

Combine all items in order into the single 'd' array.

MODE SAPO mapping:
n: stt, t: tên sản phẩm, l: số lô, h: hsd (DD/MM/YYYY), dv: đơn vị, q: số lượng, p: đơn giá, c: chiết khấu, tt: thành tiền.
Format: xxx,xxx,xxx

MODE GPP mapping:
t: tên hàng, l: số lô, h: hsd (DD/MM/YYYY), dv: đơn vị tính, q: số lượng, p: đơn giá nhập, c: chiết khấu, v: vat %, tt: thành tiền.
Format: xxx,xxx,xxx.xx

Return valid JSON.`;

  try {
    const imageParts = imagesBase64.map(base64 => ({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64.split(',')[1] || base64,
      }
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Official stable flash replacement model
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
        responseSchema: mode === 'SAPO' ? minifiedSapoSchema : minifiedGppSchema,
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
      data: mappedData
    };

    return result;
  } catch (error: any) {
    console.error("Gemini Scan Error:", error);
    // Intercept 429 Resource Exhausted / Quota Exceeded
    if (error?.status === 429 || error?.message?.toLowerCase().includes("quota") || error?.message?.toLowerCase().includes("exhausted")) {
      throw new Error("TÀI KHOẢN ĐÃ HẾT TIỀN. Số dư AI đã vượt quá hạn mức 10.000 VNĐ. Vui lòng nạp thêm để tiếp tục.");
    }
    throw error;
  }
};
