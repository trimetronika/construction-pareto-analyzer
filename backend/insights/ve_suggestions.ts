import { api, APIError } from "encore.dev/api";
import { secret } from "encore.dev/config";
import Groq from "groq-sdk";

export interface VESuggestionsRequest {
  itemName: string;
  itemDescription: string;
  quantity: number;
  unitRate: number; // base unit rate in currency/unit
  totalCost: number; // base total cost (for validation)
  workCategory: string; // structure | finishing | mep | other
}

export interface OriginalItemSummary {
  itemName: string;
  description: string;
  quantity: number;
  unitRate: number;
  totalCost: number;
}

export interface VEAlternative {
  description: string;
  newUnitRate: number;
  newTotalCost: number;
  estimatedSaving: number;
  savingPercent: number;
  tradeOffs: string;
}

export interface VESuggestionsResponse {
  original: OriginalItemSummary;
  alternatives: VEAlternative[]; // 1-2 items
  notes: string[]; // validation or assumption notes
}

// Groq API configuration using Encore secrets
const groqKey = secret("GroqKey");
const groq = new Groq({ apiKey: groqKey() });

type ModelAlt = {
  description: string;
  savingPercent?: number; // model-proposed percentage (0-100)
  tradeOffs?: string;
};

type ModelPayload = {
  alternatives: ModelAlt[];
};

// Generate realistic Value Engineering (VE) suggestions using Groq
export const veSuggestions = api<VESuggestionsRequest, VESuggestionsResponse>(
  { expose: true, method: "POST", path: "/insights/ve" },
  async (req) => {
    // Validate input
    if (!req.itemName?.trim() || !req.itemDescription?.trim()) {
      throw APIError.invalidArgument("itemName and itemDescription are required");
    }
    if (req.quantity <= 0 || req.unitRate <= 0 || req.totalCost <= 0 || isNaN(req.quantity) || isNaN(req.unitRate) || isNaN(req.totalCost)) {
      throw APIError.invalidArgument("quantity, unitRate, and totalCost must be positive numbers");
    }

    const notes: string[] = [];
    const name = req.itemName.trim();
    const desc = req.itemDescription.trim() || (req.workCategory === "structure" ? "Pekerjaan beton struktural" : "Pekerjaan konstruksi umum");
    const category = (req.workCategory || "structure").toLowerCase();

    // Normalize base rates: ensure consistency between unitRate and totalCost
    const derivedUnit = req.totalCost / req.quantity;
    let baseUnitRate = req.unitRate;
    if (Math.abs(baseUnitRate - derivedUnit) / derivedUnit > 0.05) {
      notes.push("Menyesuaikan tarif unit untuk sesuai dengan total biaya dan kuantitas perhitungan internal.");
      baseUnitRate = derivedUnit;
    }
    const baseTotal = baseUnitRate * req.quantity;

    // Category bounds and suggested range (guides model and clamps results)
    const bounds = categoryBounds(category);
    const [suggestMinPct, suggestMaxPct] = suggestedRangePercent(category);
    const maxAllowedPct = (1 - bounds.minUnitFactor) * 100;

    // Build structured prompt for Groq
    const messages = buildPrompt({
      name,
      desc,
      quantity: req.quantity,
      unitRate: round2(baseUnitRate),
      totalCost: round2(baseTotal),
      category,
      suggestMinPct,
      suggestMaxPct,
      maxAllowedPct,
    });

    // Call Groq API
    let modelAlts: ModelAlt[] = [];
    try {
      const groqResponse = await groq.chat.completions.create({
        messages: messages,
        model: "llama-3.3-70b-versatile",
        temperature: 0.5,
        max_tokens: 800,
        response_format: { type: "json_object" },
      });

      const content = groqResponse.choices[0]?.message?.content;
      console.log("Respon mentah Groq:", content);
      const parsed = safeParseJSON(content) as ModelPayload | null;
      if (parsed?.alternatives?.length) {
        modelAlts = parsed.alternatives
          .slice(0, 2)
          .filter(alt => alt.description && alt.description.trim() && (alt.savingPercent ?? 0) >= 0 && alt.savingPercent <= 100);
        if (modelAlts.length === 0) {
          notes.push("Groq tidak mengembalikan alternatif terstruktur yang valid; menggunakan cadangan.");
        }
      } else {
        notes.push("Groq tidak mengembalikan alternatif terstruktur; menggunakan cadangan.");
      }
    } catch (e: any) {
      notes.push(`Gagal menghasilkan model dengan Groq: ${e.message}; menggunakan cadangan.`);
      console.error("Kesalahan API Groq:", e);
    }

    // Compute VE alternatives with clamping and floors
    const alts: VEAlternative[] = [];
    for (const m of modelAlts) {
      const descText = (m.description || "").trim();
      if (!descText) continue;

      let proposedPct =
        typeof m.savingPercent === "number" && isFinite(m.savingPercent)
          ? Math.max(0, Math.min(100, m.savingPercent))
          : (suggestMinPct + suggestMaxPct) / 2;

      const originalPct = proposedPct;
      proposedPct = Math.min(Math.max(proposedPct, suggestMinPct), suggestMaxPct);
      if (proposedPct !== originalPct) {
        notes.push(`Menyesuaikan persentase penghematan model dari ${round2(originalPct)}% ke ${round2(proposedPct)}% untuk sesuai dengan rentang kategori.`);
      }
      if (proposedPct > maxAllowedPct) {
        notes.push(`Membatasi persentase penghematan pada ${round2(maxAllowedPct)}% karena batas kategori.`);
        proposedPct = maxAllowedPct;
      }

      const proposedUnit = baseUnitRate * (1 - proposedPct / 100);
      const boundedUnit = Math.max(proposedUnit, baseUnitRate * bounds.minUnitFactor);
      let newUnitRate = round2(boundedUnit);
      let newTotalCost = round2(newUnitRate * req.quantity);
      let saving = round2(baseTotal - newTotalCost);

      if (saving < 0) {
        newUnitRate = round2(baseUnitRate);
        newTotalCost = round2(baseTotal);
        saving = 0;
      }

      const savingPercent = baseTotal > 0 ? round2((saving / baseTotal) * 100) : 0;

      alts.push({
        description: descText,
        newUnitRate,
        newTotalCost,
        estimatedSaving: saving,
        savingPercent,
        tradeOffs: (m.tradeOffs || "").trim() || "Tidak ada",
      });
    }

    // Category-specific fallbacks if no valid alternatives from Groq
    if (alts.length === 0) {
      const fallbackPct = Math.min(6.5, maxAllowedPct);
      const newUnit = Math.max(baseUnitRate * (1 - fallbackPct / 100), baseUnitRate * bounds.minUnitFactor);
      const newTotal = round2(newUnit * req.quantity);
      const saving = Math.max(0, round2(baseTotal - newTotal));
      const fallbackOptions = {
        structure: [
          "Gunakan campuran beton berkekuatan tinggi dengan desain tulangan yang dioptimalkan",
          "Terapkan sistem bekisting modular untuk percepatan konstruksi",
        ],
        finishing: [
          "Gunakan panel finishing prefabrikasi",
          "Kurangi elemen dekoratif dengan alternatif hemat biaya",
        ],
        mep: [
          "Optimalkan tata letak pipa untuk mengurangi penggunaan material",
          "Gunakan komponen MEP yang hemat energi",
        ],
        other: [
          "Standarisasi spesifikasi dan negosiasi dengan pemasok",
          "Adopsi teknik konstruksi lean",
        ],
      };
      const options = fallbackOptions[category] || fallbackOptions["structure"];
      alts.push({
        description: options[0],
        newUnitRate: round2(newUnit),
        newTotalCost: newTotal,
        estimatedSaving: saving,
        savingPercent: baseTotal > 0 ? round2((saving / baseTotal) * 100) : 0,
        tradeOffs: options[0].includes("beton") ? "Membutuhkan pengujian dan koordinasi pemasok" : "Membutuhkan koordinasi dengan kontraktor",
      });
      if (options[1]) {
        alts.push({
          description: options[1],
          newUnitRate: round2(newUnit * 0.98),
          newTotalCost: round2((newUnit * 0.98) * req.quantity),
          estimatedSaving: round2(baseTotal - (newUnit * 0.98) * req.quantity),
          savingPercent: baseTotal > 0 ? round2((baseTotal - (newUnit * 0.98) * req.quantity) / baseTotal * 100) : 0,
          tradeOffs: options[1].includes("beton") ? "Membutuhkan pengujian dan koordinasi pemasok" : "Membutuhkan koordinasi dengan kontraktor",
        });
      }
    }

    const response: VESuggestionsResponse = {
      original: {
        itemName: req.itemName,
        description: req.itemDescription,
        quantity: req.quantity,
        unitRate: round2(baseUnitRate),
        totalCost: round2(baseTotal),
      },
      alternatives: alts.slice(0, 2),
      notes,
    };

    return response;
  }
);

// ---------- Helpers ----------

function buildPrompt(input: {
  name: string;
  desc: string;
  quantity: number;
  unitRate: number;
  totalCost: number;
  category: string;
  suggestMinPct: number;
  suggestMaxPct: number;
  maxAllowedPct: number;
}) {
  const { name, desc, quantity, unitRate, totalCost, category, suggestMinPct, suggestMaxPct, maxAllowedPct } = input;

  return [
    {
      role: "system",
      content:
        "Anda adalah asisten optimasi biaya konstruksi. Usulkan alternatif value engineering (VE) yang mempertahankan fungsionalitas tetapi mengurangi biaya, disesuaikan dengan kategori pekerjaan tertentu (misalnya, struktur, finishing, MEP). Berikan saran yang beragam dan spesifik untuk kategori. Jawab semua teks dalam Bahasa Indonesia.",
    },
    {
      role: "user",
      content: [
        "Item Asli:",
        `- Nama: ${name}`,
        `- Deskripsi: ${desc}`,
        `- Kuantitas: ${quantity}`,
        `- Tarif Unit: ${unitRate}`,
        `- Total Biaya: ${totalCost}`,
        `- Kategori: ${category}`,
        "",
        "Tugas:",
        `Hasilkan 1–2 alternatif value engineering yang spesifik untuk kategori. Untuk masing-masing, berikan:`,
        `- deskripsi (spesifik untuk kategori, misalnya optimasi struktur untuk struktur, efisiensi material untuk finishing)`,
        `- savingPercent (angka, ${suggestMinPct}–${suggestMaxPct}, tidak boleh melebihi ${maxAllowedPct}%)`,
        `- tradeOffs (risiko/pertimbangan yang relevan dengan kategori)`,
        "",
        "Keluaran harus dalam format JSON yang ketat sesuai skema ini (tanpa teks tambahan):",
        `{"alternatives":[{"description":"...","savingPercent":12.5,"tradeOffs":"..."}]}`,
        "",
        "Batasan:",
        "- Pertahankan fungsionalitas inti dan standar keselamatan.",
        "- Usulkan metode spesifik untuk kategori (misalnya, optimasi desain untuk struktur, substitusi material untuk finishing).",
        "- Hindari saran umum kecuali relevan.",
      ].join("\n"),
    },
  ];
}

function safeParseJSON(s: string): any | null {
  try {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    const jsonString = start !== -1 && end !== -1 ? s.slice(start, end + 1).trim() : s.trim();
    return jsonString ? JSON.parse(jsonString.replace(/'/g, '"')) : null;
  } catch (e) {
    console.error("Kesalahan parsing JSON:", e, "Input:", s);
    return null;
  }
}

function categoryBounds(category: string): { minUnitFactor: number } {
  switch (category) {
    case "structure":
      return { minUnitFactor: 0.88 }; // hingga 12% potongan
    case "finishing":
      return { minUnitFactor: 0.7 }; // hingga 30% potongan
    case "mep":
      return { minUnitFactor: 0.75 }; // hingga 25% potongan
    default:
      return { minUnitFactor: 0.8 }; // hingga 20% potongan
  }
}

function suggestedRangePercent(category: string): [number, number] {
  switch (category) {
    case "structure":
      return [4, 10];
    case "finishing":
      return [10, 25];
    case "mep":
      return [8, 20];
    default:
      return [5, 18];
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}