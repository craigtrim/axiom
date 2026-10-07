/** A snapshot of the installed Electron menu, including its live state. */
export interface ChromeMenuItem {
  id: string;
  label: string;
  key: string;
  enabled: boolean;
  visible: boolean;
  separator?: boolean;
  checked?: boolean;
  radio?: boolean;
  accelerator?: string;
  children?: ChromeMenuItem[];
}
