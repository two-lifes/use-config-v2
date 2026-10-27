import type { KeyboardEvent } from "react";

// Arrow keys move focus between the select buttons of a list; Enter or Space
// then selects one
export function moveFocus(selector: string) {
  return (event: KeyboardEvent<HTMLUListElement>) => {
    const step =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0 || !(event.target instanceof HTMLElement)) return;
    const item = event.target.closest("li");
    const sibling =
      step > 0 ? item?.nextElementSibling : item?.previousElementSibling;
    const button = sibling?.querySelector<HTMLButtonElement>(selector);
    if (!button) return;
    event.preventDefault();
    button.focus();
  };
}
