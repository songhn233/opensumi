import * as fs from 'fs-extra';
import * as jschardet from 'jschardet';
import * as iconv from 'iconv-lite';
import { URI } from '@ali/ide-core-common';
import { FileUri } from '@ali/ide-core-node';
import { EncodingInfo } from '../common/encoding';

export const UTF8 = 'utf8';
export const UTF8_WITH_BOM = 'utf8bom';
export const UTF16BE = 'utf16be';
export const UTF16LE = 'utf16le';
export const UTF16BE_BOM = [0xFE, 0xFF];
export const UTF16LE_BOM = [0xFF, 0xFE];
export const UTF8_BOM = [0xEF, 0xBB, 0xBF];

function isUtf8(buffer: Buffer) {
  let i = 0;
  while (i < buffer.length) {
    if ((// ASCII
      buffer[i] === 0x09 ||
      buffer[i] === 0x0A ||
      buffer[i] === 0x0D ||
      (0x20 <= buffer[i] && buffer[i] <= 0x7E)
    )
    ) {
      i += 1;
      continue;
    }

    if ((// non-overlong 2-byte
      (0xC2 <= buffer[i] && buffer[i] <= 0xDF) &&
      (0x80 <= buffer[i + 1] && buffer[i + 1] <= 0xBF)
    )
    ) {
      i += 2;
      continue;
    }

    if ((// excluding overlongs
      buffer[i] === 0xE0 &&
      (0xA0 <= buffer[i + 1] && buffer[i + 1] <= 0xBF) &&
      (0x80 <= buffer[i + 2] && buffer[i + 2] <= 0xBF)
    ) ||
      (// straight 3-byte
        ((0xE1 <= buffer[i] && buffer[i] <= 0xEC) ||
          buffer[i] === 0xEE ||
          buffer[i] === 0xEF) &&
        (0x80 <= buffer[i + 1] && buffer[i + 1] <= 0xBF) &&
        (0x80 <= buffer[i + 2] && buffer[i + 2] <= 0xBF)
      ) ||
      (// excluding surrogates
        buffer[i] === 0xED &&
        (0x80 <= buffer[i + 1] && buffer[i + 1] <= 0x9F) &&
        (0x80 <= buffer[i + 2] && buffer[i + 2] <= 0xBF)
      )
    ) {
      i += 3;
      continue;
    }

    if ((// planes 1-3
      buffer[i] === 0xF0 &&
      (0x90 <= buffer[i + 1] && buffer[i + 1] <= 0xBF) &&
      (0x80 <= buffer[i + 2] && buffer[i + 2] <= 0xBF) &&
      (0x80 <= buffer[i + 3] && buffer[i + 3] <= 0xBF)
    ) ||
      (// planes 4-15
        (0xF1 <= buffer[i] && buffer[i] <= 0xF3) &&
        (0x80 <= buffer[i + 1] && buffer[i + 1] <= 0xBF) &&
        (0x80 <= buffer[i + 2] && buffer[i + 2] <= 0xBF) &&
        (0x80 <= buffer[i + 3] && buffer[i + 3] <= 0xBF)
      ) ||
      (// plane 16
        buffer[i] === 0xF4 &&
        (0x80 <= buffer[i + 1] && buffer[i + 1] <= 0x8F) &&
        (0x80 <= buffer[i + 2] && buffer[i + 2] <= 0xBF) &&
        (0x80 <= buffer[i + 3] && buffer[i + 3] <= 0xBF)
      )
    ) {
      i += 4;
      continue;
    }

    return false;
  }

  return true;
}

export function detectEncodingByBOMFromBuffer(buffer: Buffer | null): string | null {
  if (!buffer || buffer.length < 2) {
    return null;
  }

  const b0 = buffer.readUInt8(0);
  const b1 = buffer.readUInt8(1);

  // UTF-16 BE
  if (b0 === UTF16BE_BOM[0] && b1 === UTF16BE_BOM[1]) {
    return UTF16BE;
  }

  // UTF-16 LE
  if (b0 === UTF16LE_BOM[0] && b1 === UTF16LE_BOM[1]) {
    return UTF16LE;
  }

  if (buffer.length < 3) {
    return null;
  }

  const b2 = buffer.readUInt8(2);

  // UTF-8 BOM
  if (b0 === UTF8_BOM[0] && b1 === UTF8_BOM[1] && b2 === UTF8_BOM[2]) {
    return UTF8;
  }

  return null;
}

const JSCHARDET_TO_ICONV_ENCODINGS: { [name: string]: string } = {
  'ibm866': 'cp866',
  'big5': 'cp950',
};

export function detectEncodingByBuffer(buffer: Buffer): string | null {
  const result = detectEncodingByBOMFromBuffer(buffer);

  if (result) {
    return result;
  }

  if (isUtf8(buffer)) {
    return UTF8;
  }

  // Support encodings http://chardet.readthedocs.io/en/latest/supported-encodings.html
  const detected = jschardet.detect(buffer, { minimumThreshold: 0.5 });

  if (!detected || !detected.encoding) {
    return null;
  }
  const encoding = detected.encoding;
  const normalizedEncodingName = encoding.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const mapped = JSCHARDET_TO_ICONV_ENCODINGS[normalizedEncodingName];

  return mapped || normalizedEncodingName;
}

export function detectEncodingByURI(uri: URI): string | null {
  const filePath = FileUri.fsPath(uri);
  const fd = fs.openSync(filePath, 'r');
  const maxLength = 100;
  let buffer = Buffer.alloc(maxLength);
  const readLength = fs.readSync(fd, buffer, 0, maxLength, null);

  // Reset real length
  buffer = buffer.slice(0, readLength);
  fs.closeSync(fd);
  return detectEncodingByBuffer(buffer);
}

export function getEncodingInfo(encoding: string | null): null | EncodingInfo {
  if (!encoding) {
    return null;
  }
  const result = SUPPORTED_ENCODINGS[encoding] || {};

  return {
    id: encoding,
    labelLong: result.labelLong || encoding,
    labelShort: result.labelShort || encoding,
  };
}

export function decode(buffer: Buffer, encoding: string): string {
  return iconv.decode(buffer, toNodeEncoding(encoding));
}

export function encode(content: string, encoding: string, options?: { addBOM?: boolean }): Buffer {
  return iconv.encode(content, toNodeEncoding(encoding), options);
}

export function encodingExists(encoding: string): boolean {
  return iconv.encodingExists(toNodeEncoding(encoding));
}

export function decodeStream(encoding: string | null): NodeJS.ReadWriteStream {
  return iconv.decodeStream(toNodeEncoding(encoding));
}

export function encodeStream(encoding: string, options?: { addBOM?: boolean }): NodeJS.ReadWriteStream {
  return iconv.encodeStream(toNodeEncoding(encoding), options);
}

function toNodeEncoding(enc: string | null): string {
  if (enc === UTF8_WITH_BOM || enc === null) {
    return UTF8; // iconv does not distinguish UTF 8 with or without BOM, so we need to help it
  }

  return enc;
}

export const SUPPORTED_ENCODINGS: { [encoding: string]: { labelLong: string; labelShort: string; order: number; encodeOnly?: boolean; alias?: string } } = {
  utf8: {
    labelLong: 'UTF-8',
    labelShort: 'UTF-8',
    order: 1,
    alias: 'utf8bom',
  },
  utf8bom: {
    labelLong: 'UTF-8 with BOM',
    labelShort: 'UTF-8 with BOM',
    encodeOnly: true,
    order: 2,
    alias: 'utf8',
  },
  utf16le: {
    labelLong: 'UTF-16 LE',
    labelShort: 'UTF-16 LE',
    order: 3,
  },
  utf16be: {
    labelLong: 'UTF-16 BE',
    labelShort: 'UTF-16 BE',
    order: 4,
  },
  windows1252: {
    labelLong: 'Western (Windows 1252)',
    labelShort: 'Windows 1252',
    order: 5,
  },
  iso88591: {
    labelLong: 'Western (ISO 8859-1)',
    labelShort: 'ISO 8859-1',
    order: 6,
  },
  iso88593: {
    labelLong: 'Western (ISO 8859-3)',
    labelShort: 'ISO 8859-3',
    order: 7,
  },
  iso885915: {
    labelLong: 'Western (ISO 8859-15)',
    labelShort: 'ISO 8859-15',
    order: 8,
  },
  macroman: {
    labelLong: 'Western (Mac Roman)',
    labelShort: 'Mac Roman',
    order: 9,
  },
  cp437: {
    labelLong: 'DOS (CP 437)',
    labelShort: 'CP437',
    order: 10,
  },
  windows1256: {
    labelLong: 'Arabic (Windows 1256)',
    labelShort: 'Windows 1256',
    order: 11,
  },
  iso88596: {
    labelLong: 'Arabic (ISO 8859-6)',
    labelShort: 'ISO 8859-6',
    order: 12,
  },
  windows1257: {
    labelLong: 'Baltic (Windows 1257)',
    labelShort: 'Windows 1257',
    order: 13,
  },
  iso88594: {
    labelLong: 'Baltic (ISO 8859-4)',
    labelShort: 'ISO 8859-4',
    order: 14,
  },
  iso885914: {
    labelLong: 'Celtic (ISO 8859-14)',
    labelShort: 'ISO 8859-14',
    order: 15,
  },
  windows1250: {
    labelLong: 'Central European (Windows 1250)',
    labelShort: 'Windows 1250',
    order: 16,
  },
  iso88592: {
    labelLong: 'Central European (ISO 8859-2)',
    labelShort: 'ISO 8859-2',
    order: 17,
  },
  cp852: {
    labelLong: 'Central European (CP 852)',
    labelShort: 'CP 852',
    order: 18,
  },
  windows1251: {
    labelLong: 'Cyrillic (Windows 1251)',
    labelShort: 'Windows 1251',
    order: 19,
  },
  cp866: {
    labelLong: 'Cyrillic (CP 866)',
    labelShort: 'CP 866',
    order: 20,
  },
  iso88595: {
    labelLong: 'Cyrillic (ISO 8859-5)',
    labelShort: 'ISO 8859-5',
    order: 21,
  },
  koi8r: {
    labelLong: 'Cyrillic (KOI8-R)',
    labelShort: 'KOI8-R',
    order: 22,
  },
  koi8u: {
    labelLong: 'Cyrillic (KOI8-U)',
    labelShort: 'KOI8-U',
    order: 23,
  },
  iso885913: {
    labelLong: 'Estonian (ISO 8859-13)',
    labelShort: 'ISO 8859-13',
    order: 24,
  },
  windows1253: {
    labelLong: 'Greek (Windows 1253)',
    labelShort: 'Windows 1253',
    order: 25,
  },
  iso88597: {
    labelLong: 'Greek (ISO 8859-7)',
    labelShort: 'ISO 8859-7',
    order: 26,
  },
  windows1255: {
    labelLong: 'Hebrew (Windows 1255)',
    labelShort: 'Windows 1255',
    order: 27,
  },
  iso88598: {
    labelLong: 'Hebrew (ISO 8859-8)',
    labelShort: 'ISO 8859-8',
    order: 28,
  },
  iso885910: {
    labelLong: 'Nordic (ISO 8859-10)',
    labelShort: 'ISO 8859-10',
    order: 29,
  },
  iso885916: {
    labelLong: 'Romanian (ISO 8859-16)',
    labelShort: 'ISO 8859-16',
    order: 30,
  },
  windows1254: {
    labelLong: 'Turkish (Windows 1254)',
    labelShort: 'Windows 1254',
    order: 31,
  },
  iso88599: {
    labelLong: 'Turkish (ISO 8859-9)',
    labelShort: 'ISO 8859-9',
    order: 32,
  },
  windows1258: {
    labelLong: 'Vietnamese (Windows 1258)',
    labelShort: 'Windows 1258',
    order: 33,
  },
  gbk: {
    labelLong: 'Simplified Chinese (GBK)',
    labelShort: 'GBK',
    order: 34,
  },
  gb18030: {
    labelLong: 'Simplified Chinese (GB18030)',
    labelShort: 'GB18030',
    order: 35,
  },
  cp950: {
    labelLong: 'Traditional Chinese (Big5)',
    labelShort: 'Big5',
    order: 36,
  },
  big5hkscs: {
    labelLong: 'Traditional Chinese (Big5-HKSCS)',
    labelShort: 'Big5-HKSCS',
    order: 37,
  },
  shiftjis: {
    labelLong: 'Japanese (Shift JIS)',
    labelShort: 'Shift JIS',
    order: 38,
  },
  eucjp: {
    labelLong: 'Japanese (EUC-JP)',
    labelShort: 'EUC-JP',
    order: 39,
  },
  euckr: {
    labelLong: 'Korean (EUC-KR)',
    labelShort: 'EUC-KR',
    order: 40,
  },
  windows874: {
    labelLong: 'Thai (Windows 874)',
    labelShort: 'Windows 874',
    order: 41,
  },
  iso885911: {
    labelLong: 'Latin/Thai (ISO 8859-11)',
    labelShort: 'ISO 8859-11',
    order: 42,
  },
  koi8ru: {
    labelLong: 'Cyrillic (KOI8-RU)',
    labelShort: 'KOI8-RU',
    order: 43,
  },
  koi8t: {
    labelLong: 'Tajik (KOI8-T)',
    labelShort: 'KOI8-T',
    order: 44,
  },
  gb2312: {
    labelLong: 'Simplified Chinese (GB 2312)',
    labelShort: 'GB 2312',
    order: 45,
  },
  cp865: {
    labelLong: 'Nordic DOS (CP 865)',
    labelShort: 'CP 865',
    order: 46,
  },
  cp850: {
    labelLong: 'Western European DOS (CP 850)',
    labelShort: 'CP 850',
    order: 47,
  },
};
