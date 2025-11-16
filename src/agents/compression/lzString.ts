/*
 * 경량화된 LZ-String 구현 (MIT 라이선스 호환)
 * 원본 프로젝트: https://github.com/pieroxy/lz-string
 * 외부 패키지 설치 없이 URL 세이프 압축/해제를 제공한다.
 */

const keyStrUriSafe = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';
const baseReverseDic: Record<string, Record<string, number>> = {};

function getBaseValue(alphabet: string, character: string): number {
  if (!baseReverseDic[alphabet]) {
    baseReverseDic[alphabet] = {};
    for (let i = 0; i < alphabet.length; i++) {
      baseReverseDic[alphabet][alphabet.charAt(i)] = i;
    }
  }

  const value = baseReverseDic[alphabet][character];
  if (value === undefined) {
    throw new Error(`Invalid LZ-String character: ${character}`);
  }
  return value;
}

function compress(uncompressed: string, bitsPerChar: number, getCharFromInt: (value: number) => string): string {
  if (uncompressed == null) return '';

  let i: number;
  let value: number;
  const contextDictionary: Record<string, number> = {};
  const contextDictionaryToCreate: Record<string, boolean> = {};
  let contextC = '';
  let contextWC = '';
  let contextW = '';
  let contextEnlargeIn = 2;
  let contextDictSize = 3;
  let contextNumBits = 2;
  const contextData: string[] = [];
  let contextDataVal = 0;
  let contextDataPosition = 0;

  for (let ii = 0; ii < uncompressed.length; ii++) {
    contextC = uncompressed.charAt(ii);

    if (!Object.prototype.hasOwnProperty.call(contextDictionary, contextC)) {
      contextDictionary[contextC] = contextDictSize++;
      contextDictionaryToCreate[contextC] = true;
    }

    contextWC = contextW + contextC;
    if (Object.prototype.hasOwnProperty.call(contextDictionary, contextWC)) {
      contextW = contextWC;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(contextDictionaryToCreate, contextW)) {
      if (contextW.charCodeAt(0) < 256) {
        for (i = 0; i < contextNumBits; i++) {
          contextDataVal <<= 1;
          if (contextDataPosition === bitsPerChar - 1) {
            contextDataPosition = 0;
            contextData.push(getCharFromInt(contextDataVal));
            contextDataVal = 0;
          } else {
            contextDataPosition++;
          }
        }
        value = contextW.charCodeAt(0);
        for (i = 0; i < 8; i++) {
          contextDataVal = (contextDataVal << 1) | (value & 1);
          if (contextDataPosition === bitsPerChar - 1) {
            contextDataPosition = 0;
            contextData.push(getCharFromInt(contextDataVal));
            contextDataVal = 0;
          } else {
            contextDataPosition++;
          }
          value >>= 1;
        }
      } else {
        value = 1;
        for (i = 0; i < contextNumBits; i++) {
          contextDataVal = (contextDataVal << 1) | value;
          if (contextDataPosition === bitsPerChar - 1) {
            contextDataPosition = 0;
            contextData.push(getCharFromInt(contextDataVal));
            contextDataVal = 0;
          } else {
            contextDataPosition++;
          }
          value = 0;
        }
        value = contextW.charCodeAt(0);
        for (i = 0; i < 16; i++) {
          contextDataVal = (contextDataVal << 1) | (value & 1);
          if (contextDataPosition === bitsPerChar - 1) {
            contextDataPosition = 0;
            contextData.push(getCharFromInt(contextDataVal));
            contextDataVal = 0;
          } else {
            contextDataPosition++;
          }
          value >>= 1;
        }
      }
      contextEnlargeIn--;
      if (contextEnlargeIn === 0) {
        contextEnlargeIn = 2 ** contextNumBits;
        contextNumBits++;
      }
      delete contextDictionaryToCreate[contextW];
    } else {
      value = contextDictionary[contextW];
      for (i = 0; i < contextNumBits; i++) {
        contextDataVal = (contextDataVal << 1) | (value & 1);
        if (contextDataPosition === bitsPerChar - 1) {
          contextDataPosition = 0;
          contextData.push(getCharFromInt(contextDataVal));
          contextDataVal = 0;
        } else {
          contextDataPosition++;
        }
        value >>= 1;
      }
    }

    contextEnlargeIn--;
    if (contextEnlargeIn === 0) {
      contextEnlargeIn = 2 ** contextNumBits;
      contextNumBits++;
    }

    contextDictionary[contextWC] = contextDictSize++;
    contextW = String(contextC);
  }

  if (contextW !== '') {
    if (Object.prototype.hasOwnProperty.call(contextDictionaryToCreate, contextW)) {
      if (contextW.charCodeAt(0) < 256) {
        for (i = 0; i < contextNumBits; i++) {
          contextDataVal <<= 1;
          if (contextDataPosition === bitsPerChar - 1) {
            contextDataPosition = 0;
            contextData.push(getCharFromInt(contextDataVal));
            contextDataVal = 0;
          } else {
            contextDataPosition++;
          }
        }
        value = contextW.charCodeAt(0);
        for (i = 0; i < 8; i++) {
          contextDataVal = (contextDataVal << 1) | (value & 1);
          if (contextDataPosition === bitsPerChar - 1) {
            contextDataPosition = 0;
            contextData.push(getCharFromInt(contextDataVal));
            contextDataVal = 0;
          } else {
            contextDataPosition++;
          }
          value >>= 1;
        }
      } else {
        value = 1;
        for (i = 0; i < contextNumBits; i++) {
          contextDataVal = (contextDataVal << 1) | value;
          if (contextDataPosition === bitsPerChar - 1) {
            contextDataPosition = 0;
            contextData.push(getCharFromInt(contextDataVal));
            contextDataVal = 0;
          } else {
            contextDataPosition++;
          }
          value = 0;
        }
        value = contextW.charCodeAt(0);
        for (i = 0; i < 16; i++) {
          contextDataVal = (contextDataVal << 1) | (value & 1);
          if (contextDataPosition === bitsPerChar - 1) {
            contextDataPosition = 0;
            contextData.push(getCharFromInt(contextDataVal));
            contextDataVal = 0;
          } else {
            contextDataPosition++;
          }
          value >>= 1;
        }
      }
      contextEnlargeIn--;
      if (contextEnlargeIn === 0) {
        contextEnlargeIn = 2 ** contextNumBits;
        contextNumBits++;
      }
      delete contextDictionaryToCreate[contextW];
    } else {
      value = contextDictionary[contextW];
      for (i = 0; i < contextNumBits; i++) {
        contextDataVal = (contextDataVal << 1) | (value & 1);
        if (contextDataPosition === bitsPerChar - 1) {
          contextDataPosition = 0;
          contextData.push(getCharFromInt(contextDataVal));
          contextDataVal = 0;
        } else {
          contextDataPosition++;
        }
        value >>= 1;
      }
    }
    contextEnlargeIn--;
    if (contextEnlargeIn === 0) {
      contextEnlargeIn = 2 ** contextNumBits;
      contextNumBits++;
    }
  }

  value = 2;
  for (i = 0; i < contextNumBits; i++) {
    contextDataVal = (contextDataVal << 1) | (value & 1);
    if (contextDataPosition === bitsPerChar - 1) {
      contextDataPosition = 0;
      contextData.push(getCharFromInt(contextDataVal));
      contextDataVal = 0;
    } else {
      contextDataPosition++;
    }
    value >>= 1;
  }

  while (true) {
    contextDataVal <<= 1;
    if (contextDataPosition === bitsPerChar - 1) {
      contextData.push(getCharFromInt(contextDataVal));
      break;
    }
    contextDataPosition++;
  }

  return contextData.join('');
}

function decompress(length: number, resetValue: number, getNextValue: (index: number) => number): string | null {
  const dictionary: string[] = [];
  let next: number;
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  const result: string[] = [];
  let i: number;
  let w: string;
  let bits: number;
  let resb: number;
  let maxpower: number;
  let power: number;

  const data = {
    value: getNextValue(0),
    position: resetValue,
    index: 1,
  };

  for (i = 0; i < 3; i++) {
    dictionary[i] = String.fromCharCode(i);
  }

  bits = 0;
  maxpower = 2 ** 2;
  power = 1;
  while (power !== maxpower) {
    resb = data.value & data.position;
    data.position >>= 1;
    if (data.position === 0) {
      data.position = resetValue;
      data.value = getNextValue(data.index++);
    }
    bits |= (resb > 0 ? 1 : 0) * power;
    power <<= 1;
  }

  switch (bits) {
    case 0:
      bits = 0;
      maxpower = 2 ** 8;
      power = 1;
      while (power !== maxpower) {
        resb = data.value & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.value = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      next = bits;
      break;
    case 1:
      bits = 0;
      maxpower = 2 ** 16;
      power = 1;
      while (power !== maxpower) {
        resb = data.value & data.position;
        data.position >>= 1;
        if (data.position === 0) {
          data.position = resetValue;
          data.value = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
      }
      next = bits;
      break;
    case 2:
    default:
      return '';
  }

  dictionary[3] = String.fromCharCode(next);
  w = String.fromCharCode(next);
  result.push(w);

  while (true) {
    if (data.index > length) {
      return '';
    }

    bits = 0;
    maxpower = 2 ** numBits;
    power = 1;
    while (power !== maxpower) {
      resb = data.value & data.position;
      data.position >>= 1;
      if (data.position === 0) {
        data.position = resetValue;
        data.value = getNextValue(data.index++);
      }
      bits |= (resb > 0 ? 1 : 0) * power;
      power <<= 1;
    }

    switch (bits) {
      case 0:
        bits = 0;
        maxpower = 2 ** 8;
        power = 1;
        while (power !== maxpower) {
          resb = data.value & data.position;
          data.position >>= 1;
          if (data.position === 0) {
            data.position = resetValue;
            data.value = getNextValue(data.index++);
          }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        dictionary[dictSize++] = String.fromCharCode(bits);
        next = dictSize - 1;
        enlargeIn--;
        break;
      case 1:
        bits = 0;
        maxpower = 2 ** 16;
        power = 1;
        while (power !== maxpower) {
          resb = data.value & data.position;
          data.position >>= 1;
          if (data.position === 0) {
            data.position = resetValue;
            data.value = getNextValue(data.index++);
          }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        dictionary[dictSize++] = String.fromCharCode(bits);
        next = dictSize - 1;
        enlargeIn--;
        break;
      case 2:
        return result.join('');
      default:
        next = bits;
        break;
    }

    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }

    let entryValue: string;
    if (next < dictionary.length && dictionary[next] !== undefined) {
      entryValue = dictionary[next];
    } else if (next === dictSize) {
      entryValue = w + w.charAt(0);
    } else {
      return null;
    }

    result.push(entryValue);

    dictionary[dictSize++] = w + entryValue.charAt(0);
    enlargeIn--;
    w = entryValue;

    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
  }
}

export function compressToEncodedURIComponent(input: string): string {
  if (input == null) return '';
  return compress(input, 6, (value) => keyStrUriSafe.charAt(value)).replace(/ /g, '+');
}

export function decompressFromEncodedURIComponent(compressed: string): string {
  if (compressed == null || compressed === '') return '';
  const cleaned = compressed.replace(/\s+/g, '').replace(/\+/g, ' ');
  const result = decompress(cleaned.length, 32, (index) => getBaseValue(keyStrUriSafe, cleaned.charAt(index)));
  return result ?? '';
}
