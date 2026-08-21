declare module "@xhmikosr/decompress" {
  interface DecompressEntry {
    data: Buffer;
  }

  export default function decompress(input: string, output: string): Promise<DecompressEntry[]>;
}
