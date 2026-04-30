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
    issue?: string;
    verdict?: string;
    score?: number;
    analysis?: string;
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
  verdict: "NÉT" | "MỜ";
  score: number;
  issue: string;
  analysis: string;
  issues: string[]; 
}

export const checkImageQuality = async (imageBase64: string): Promise<ImageQualityResult> => {
  const qualitySchema = {
    type: Type.OBJECT,
    properties: {
      is_strict_sharp: { type: Type.BOOLEAN },
      ocr_accuracy_score: { type: Type.NUMBER },
      issue: { type: Type.STRING },
      analysis: { type: Type.STRING }
    },
    required: ["is_strict_sharp", "ocr_accuracy_score", "issue", "analysis"]
  };

  const prompt = `**System Instructions:**

**Role:** Expert Digital Document Quality Auditor.

**Strict Core Task:** Analyze uploaded images of documents/invoices ONLY for pixel-level sharp clarity, specifically for OCR (Optical Character Recognition) quality. Disregard if you can understand the overall context. You must scrutinize the edges of the printed characters.

**Definition of "BLURRED" for this task:**
If a printed character (e.g., number '0' or letter 'a') does not have crisp, high-contrast, sharp boundaries, it is BLURRED. If there is a "soft transition" or a gray shadow between the black ink and white paper at 100% zoom, it is BLURRED.

**Analysis Steps:**
1. Zoom in digitally on fine text sections (like Addresses, Item Names, Unit Prices).
2. Look at the edge quality of the numbers and letters.
3. Determine if the transition is a steep gradient (sharp) or a gradual gradient (blurred/soft).

**Output Format (JSON strictly):**
{
  "is_strict_sharp": [true/false],
  "ocr_accuracy_score": [0-100],
  "issue": "Mô tả vấn đề cụ thể bằng tiếng Việt. VD: Nét chữ bị soft, nhòe vào nền, cam bẩn.",
  "analysis": "Describe the edge quality of characters at the pixel level."
}`;

  const ai = getAI();
  try {
    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
      isGood: parsed.is_strict_sharp,
      verdict: parsed.is_strict_sharp ? "NÉT" : "MỜ",
      score: parsed.ocr_accuracy_score,
      issue: parsed.issue,
      analysis: parsed.analysis,
      issues: parsed.is_strict_sharp ? [] : [parsed.issue]
    };
  } catch (error) {
    console.error("Gemini Check Quality Error:", error);
    return { 
      isGood: true, 
      verdict: "NÉT", 
      score: 100, 
      issue: "N/A",
      analysis: "N/A",
      issues: [] 
    };
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
          s: { type: Type.NUMBER },
          r: { type: Type.STRING },
          a: { type: Type.STRING }
        },
        required: ["g", "s", "r", "a"]
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

  const systemInstruction = `**System Instructions:**
**Role:** Expert Digital Document Quality Auditor & Invoice Scanner.

**Phase 1: Strict Quality Analysis**
- Scrutinize the edges of printed characters at a pixel level.
- BLURRED definition: Soft transition or gray shadow between ink and paper.
- Verdict: SHARP (Steep gradient), BLURRED (Gradual/Soft gradient).
- Map quality results to 'q' object: g (is_strict_sharp), s (ocr_accuracy_score), r (issue - Vietnamese), a (analysis - English).

**Phase 2: Deep Data Extraction**
- If q.g is true, extract based on MODE.
- **CRITICAL**: You must extract EVERY SINGLE LINE ITEM present in the document. Do not summarize or skip pages.

***EXTRACTION PROTOCOL***:
1. ITEM DATA (d):
   - **CRITICAL**: Extract EVERY single row from the table. Do not skip any items.
   - **Fields**:
     - n: STT (Number)
     - t: Tên hàng hóa / Tên HH (String)
     - l: Số lô (String)
     - h: Hạn sử dụng / HSD (Format: DD/MM/YYYY)
     - dv: Đơn vị tính / ĐVT (String)
     - q: Số lượng / S.lg (Number)
     - p: Đơn giá nhập (String. MODE SAPO: After Tax "xxx,xxx,xxx". MODE GPP: BEFORE TAX. ALWAYS format as "xxx,xxx,xxx.xx" with two decimal places. Example: if image says 231.884, output "231,884.00").
     - c: Chiết khấu / Tổng chiết khấu (String)
     - v: VAT % (Number, e.g., 5, 8, 10 or 0)
     - tt: Thành tiền (String)
2. TOTAL (tot): Final payable total amount.
3. HEADER IDENTIFICATION (CRITICAL for GPP):
   - **Seller (sn)**: Identify the entity usually at the very TOP. Keywords: "Đơn vị bán hàng", "Người bán", "Tên đơn vị". Look near the first "Mã số thuế" (tx).
   - **Buyer (bn)**: Identify the entity listed below the seller. Keywords: "Đơn vị mua hàng", "Khách hàng", "Người mua".
   - **Invoice Date (id)**: Format: DD/MM/YYYY. Look for "Ngày", "Ngày lập", "Ngày hóa đơn", "Ngày ký" or "Ngày... tháng... năm...". Usually found in the header or near the signatures.
   - **Invoice Number (in)**: Look for "Số", "Số hóa đơn", "Invoice No", "No.". Often found near labels like "Ký hiệu" or "Mẫu số".
   - **Entity Priority**: If both a person's name ("Nguyễn Văn A") and a Company name ("Công Ty TNHH...") are listed in the buyer section, extract the Company Name into 'bn'.

Return strictly valid JSON.`;

  try {
    const imageParts = imagesBase64.map(base64 => ({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64.split(',')[1] || base64,
      }
    }));

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
        verdict: minResult.q.g ? "NÉT" : "MỜ",
        score: minResult.q.s,
        issue: minResult.q.r,
        analysis: minResult.q.a
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
