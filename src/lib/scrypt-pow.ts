import { scrypt } from "@noble/hashes/scrypt.js";

/** Litecoin / Dogecoin PoW: scrypt(N=1024,r=1,p=1) with header as key and salt. */
export function scryptHeader(header80: Uint8Array): Uint8Array {
  if (header80.length !== 80) throw new Error("header must be 80 bytes");
  return scrypt(header80, header80, { N: 1024, r: 1, p: 1, dkLen: 32 });
}
