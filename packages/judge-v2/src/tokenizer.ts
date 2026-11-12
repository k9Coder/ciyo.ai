// Port of models/judge-v2/judge/tokenize.py on top of @huggingface/tokenizers (which has no offset mapping, so
// offsets are rebuilt from each token's bytes).
import { Tokenizer } from "@huggingface/tokenizers";

export interface JudgeConfig {
  instructions: string;
  rule_prefix: string;
  verdict_suffix: string;
  temperature: number;
  max_chunk_tokens: number;
  max_message_tokens: number;
  window_overlap_tokens: number;
  model_version: string;
}

const utf8 = new TextEncoder();

// GPT-2 byte-level alphabet: printable bytes map to themselves, the rest to U+0100 onwards.
function byteLevelDecoder(): Map<string, number> {
  const bs: number[] = [];
  for (let b = 33; b <= 126; b++) bs.push(b);
  for (let b = 161; b <= 172; b++) bs.push(b);
  for (let b = 174; b <= 255; b++) bs.push(b);
  const cs = [...bs];
  let n = 0;
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n); n++; }
  return new Map(bs.map((b, i) => [String.fromCodePoint(cs[i]!), b]));
}

/**
 * UTF-16 [start, end) of each token, given each token's raw bytes. A token covering part of a character gets the
 * whole character, as HF fast tokenizers do. Null when the bytes do not reassemble the text exactly.
 */
export function tokenOffsets(text: string, pieces: Uint8Array[]): [number, number][] | null {
  // byte index -> [utf16 start, utf16 end] of the character holding it
  const charStart: number[] = [], charEnd: number[] = [];
  let u = 0;
  for (const ch of text) {
    const len = utf8.encode(ch).length, w = ch.length;
    for (let i = 0; i < len; i++) { charStart.push(u); charEnd.push(u + w); }
    u += w;
  }
  const total = pieces.reduce((n, p) => n + p.length, 0);
  if (total !== charStart.length) return null;
  const bytes = utf8.encode(text);
  const out: [number, number][] = [];
  let b = 0;
  for (const p of pieces) {
    for (let i = 0; i < p.length; i++) if (p[i] !== bytes[b + i]) return null;
    if (p.length === 0) { out.push([charStart[b] ?? u, charStart[b] ?? u]); continue; }
    out.push([charStart[b]!, charEnd[b + p.length - 1]!]);
    b += p.length;
  }
  return out;
}

export class JudgeTokenizer {
  private readonly tok: Tokenizer;
  private readonly idToPiece: Map<number, string>;
  private readonly byteLevel: Map<string, number> | null;
  private readonly bosId: number | null;
  private readonly normalizeNfc: boolean;

  constructor(tokenizerJson: string, tokenizerConfigJson: string, private readonly cfg: JudgeConfig) {
    const tj = JSON.parse(tokenizerJson);
    const tc = JSON.parse(tokenizerConfigJson);
    this.tok = new Tokenizer(tj, tc);
    this.idToPiece = new Map([...this.tok.get_vocab(true)].map(([piece, id]) => [id, piece]));
    this.byteLevel = tj.decoder?.type === "ByteLevel" ? byteLevelDecoder() : null;
    const bos = typeof tc.bos_token === "string" ? tc.bos_token : tc.bos_token?.content;
    this.bosId = bos ? (this.tok.token_to_id(bos) ?? null) : null;
    this.normalizeNfc = tj.normalizer?.type === "NFC";
  }

  private encode(text: string): number[] {
    return this.tok.encode(text, { add_special_tokens: false }).ids;
  }

  prefixIds(): number[] {
    return [...(this.bosId === null ? [] : [this.bosId]), ...this.encode(this.cfg.instructions)];
  }

  messageIds(text: string): number[] {
    return this.encode(text);
  }

  ruleIds(text: string): number[] {
    const rule = text.trim();
    if (!rule) throw new Error("rule text is empty");
    return this.encode(this.cfg.rule_prefix + rule + this.cfg.verdict_suffix);
  }

  private pieceBytes(id: number): Uint8Array {
    const piece = this.idToPiece.get(id) ?? "";
    if (this.byteLevel) return Uint8Array.from([...piece], (c) => this.byteLevel!.get(c) ?? 0);
    const m = /^<0x([0-9A-Fa-f]{2})>$/.exec(piece);
    if (m) return Uint8Array.of(parseInt(m[1]!, 16));
    return utf8.encode(piece.replaceAll("▁", " "));
  }

  /** UTF-16 offsets aligned one to one with messageIds(text); null if they cannot be rebuilt. */
  messageOffsets(text: string, ids = this.messageIds(text)): [number, number][] | null {
    if (this.normalizeNfc && text.normalize("NFC") !== text) return null;
    return tokenOffsets(text, ids.map((id) => this.pieceBytes(id)));
  }
}
