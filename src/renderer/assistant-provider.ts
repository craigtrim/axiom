import { useEffect, useState } from "react";
import { panel, savePanel, command, onCommand } from "./client";
import type { AssistantId } from "../shared/research";
export function useAssistantProvider(): [
  AssistantId,
  (provider: AssistantId) => void,
] {
  const read = () => panel<AssistantId>("assistant.provider", "claude");
  const [provider, set] = useState(read);
  useEffect(
    () =>
      onCommand((id) => {
        if (id === "assistant.provider.changed") set(read());
      }),
    [],
  );
  return [
    provider,
    (value) => {
      savePanel("assistant.provider", value, false);
      set(value);
      command("assistant.provider.changed");
    },
  ];
}
