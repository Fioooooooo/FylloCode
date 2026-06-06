import { nextTick, ref, watch, type ComponentPublicInstance, type Ref } from "vue";
import type { AcpAvailableCommand } from "@shared/types/chat";
import {
  applyCommandSelection,
  isCursorAtLineStart,
  type CommandTriggerSource,
} from "@renderer/utils/chat-prompt";

export function useChatPrompt(options: {
  hasAvailableCommands: Ref<boolean>;
  onSubmit: (text: string) => Promise<boolean | void> | boolean | void;
  canSubmit?: () => boolean;
}): {
  input: Ref<string>;
  setPromptShellRef: (element: Element | ComponentPublicInstance | null) => void;
  commandMenuOpen: Ref<boolean>;
  commandSearchTerm: Ref<string>;
  temporaryPlaceholder: Ref<string | undefined>;
  handleSubmit: () => Promise<void>;
  handlePromptFocusOut: (event: FocusEvent) => void;
  handlePromptKeydown: (event: KeyboardEvent) => void;
  handleSlashButtonClick: () => void;
  handleCommandSelect: (command: AcpAvailableCommand) => void;
} {
  const { hasAvailableCommands, onSubmit } = options;

  const input = ref("");
  const promptShellRef = ref<HTMLElement | null>(null);
  const commandMenuOpen = ref(false);
  const commandSearchTerm = ref("");
  const commandTriggerSource = ref<CommandTriggerSource | null>(null);
  const pendingSlashOpen = ref(false);
  const temporaryPlaceholder = ref<string | undefined>(undefined);
  const hintBaseline = ref<string | null>(null);

  function setPromptShellRef(element: Element | ComponentPublicInstance | null): void {
    promptShellRef.value = element instanceof HTMLElement ? element : null;
  }

  function getPromptTextarea(): HTMLTextAreaElement | null {
    return promptShellRef.value?.querySelector("textarea") ?? null;
  }

  function focusPromptTextarea(cursor?: number): void {
    const textarea = getPromptTextarea();
    if (!textarea) {
      return;
    }

    textarea.focus();
    if (typeof cursor === "number") {
      textarea.setSelectionRange(cursor, cursor);
    }
  }

  function clearTemporaryPlaceholder(): void {
    temporaryPlaceholder.value = undefined;
    hintBaseline.value = null;
  }

  function applyTemporaryPlaceholder(hint: string | undefined, baseline: string): void {
    if (typeof hint !== "string" || hint.trim() === "") {
      clearTemporaryPlaceholder();
      return;
    }

    temporaryPlaceholder.value = hint;
    hintBaseline.value = baseline;
  }

  function openCommandMenu(source: CommandTriggerSource): void {
    if (!hasAvailableCommands.value) {
      return;
    }

    commandTriggerSource.value = source;
    commandSearchTerm.value = "";
    commandMenuOpen.value = true;
  }

  function closeCommandMenu(): void {
    commandMenuOpen.value = false;
  }

  function handleSlashButtonClick(): void {
    openCommandMenu("button");
  }

  function handleCommandSelect(command: AcpAvailableCommand): void {
    const textarea = getPromptTextarea();
    const currentValue = input.value;
    const selectionStart = textarea?.selectionStart ?? currentValue.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const triggerSource = commandTriggerSource.value ?? "button";
    const nextState = applyCommandSelection({
      currentValue,
      selectionStart,
      selectionEnd,
      commandName: command.name,
      triggerSource,
    });

    input.value = nextState.value;
    closeCommandMenu();
    commandTriggerSource.value = null;
    applyTemporaryPlaceholder(command.hint, nextState.value);

    void nextTick(() => {
      focusPromptTextarea(nextState.cursor);
    });
  }

  function handlePromptKeydown(event: KeyboardEvent): void {
    if (event.key !== "/" || !hasAvailableCommands.value) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }

    const cursor = target.selectionStart ?? 0;
    if (!isCursorAtLineStart(target.value, cursor)) {
      return;
    }

    pendingSlashOpen.value = true;
    commandTriggerSource.value = "slash";
    void nextTick(() => {
      if (!pendingSlashOpen.value) {
        return;
      }

      pendingSlashOpen.value = false;
      openCommandMenu("slash");
    });
  }

  function handlePromptFocusOut(event: FocusEvent): void {
    if (event.target instanceof HTMLTextAreaElement) {
      clearTemporaryPlaceholder();
    }
  }

  async function handleSubmit(): Promise<void> {
    const text = input.value.trim();
    if (!text && options.canSubmit?.() !== true) {
      return;
    }

    const submitted = await onSubmit(input.value);
    if (submitted === false) {
      return;
    }

    input.value = "";
    clearTemporaryPlaceholder();
  }

  watch(input, (value) => {
    if (hintBaseline.value !== null && value !== hintBaseline.value) {
      clearTemporaryPlaceholder();
    }
  });

  watch(hasAvailableCommands, (nextHasCommands) => {
    if (!nextHasCommands) {
      closeCommandMenu();
    }
  });

  watch(commandMenuOpen, (isOpen, wasOpen) => {
    if (!isOpen && wasOpen) {
      commandSearchTerm.value = "";
      commandTriggerSource.value = null;
      void nextTick(() => {
        focusPromptTextarea();
      });
    }
  });

  return {
    input,
    setPromptShellRef,
    commandMenuOpen,
    commandSearchTerm,
    temporaryPlaceholder,
    handleSubmit,
    handlePromptFocusOut,
    handlePromptKeydown,
    handleSlashButtonClick,
    handleCommandSelect,
  };
}
