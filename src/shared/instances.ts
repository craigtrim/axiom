export interface InstanceRow {
  iri: string;
  label: string;
  classes: string[];
  reference?: string;
  branch?: string;
  price?: number;
  customer?: string;
}
export interface InstancePage {
  iri: string;
  label: string;
  total: number;
  filtered: number;
  start: number;
  rows: InstanceRow[];
}
export const INSTANCE_PAGE_SIZE = 100;
