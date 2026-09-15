declare module "rdf-canonize" {
 export function canonize(input: string, options: { algorithm: string; inputFormat: string; maxDeepIterations?: number }): Promise<string>;
}
