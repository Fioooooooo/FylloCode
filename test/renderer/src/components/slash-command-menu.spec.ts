import { describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import SlashCommandMenu from "@renderer/components/chat/prompt/SlashCommandMenu.vue";
import type { AcpAvailableCommand } from "@shared/types/chat";

const buttonStub = {
  inheritAttrs: false,
  props: ["loading", "icon", "color", "variant", "size", "disabled"],
  emits: ["click"],
  template:
    '<button v-bind="$attrs" :data-color="color || \'neutral\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
};

const popoverStub = {
  props: ["open", "portal", "content", "ui"],
  emits: ["update:open"],
  template: `
    <div :data-ui-content="ui?.content">
      <slot />
      <slot v-if="open" name="content" />
    </div>
  `,
};

const commandPaletteStub = {
  props: ["groups", "searchTerm", "autofocus", "placeholder", "ui", "fuse", "preserveGroupOrder"],
  emits: ["highlight", "update:modelValue", "update:open", "update:searchTerm"],
  template: `
    <div
      data-test="slash-menu"
      :class="$attrs.class"
      :data-ui-content="ui?.content"
      :data-fuse-result-limit="fuse?.resultLimit"
      :data-fuse-should-sort="String(fuse?.fuseOptions?.shouldSort)"
      :data-fuse-match-empty="String(fuse?.matchAllWhenSearchEmpty)"
      :data-fuse-keys="fuse?.fuseOptions?.keys?.join('|')"
      :data-preserve-group-order="String(preserveGroupOrder)"
    >
      <template v-for="group in groups" :key="group.id">
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          :data-test="'command-item-' + item.id"
          @mouseenter="$emit('highlight', { ref: $event.currentTarget, value: item })"
          @focus="$emit('highlight', { ref: $event.currentTarget, value: item })"
          @click="$emit('update:modelValue', item)"
        >
          <span :data-test="'command-item-label-' + item.id">{{ item.label }}</span>
          <span v-if="'description' in item" data-test="command-item-description">
            {{ item.description }}
          </span>
          <span v-if="'hint' in item" data-test="command-item-hint">{{ item.hint }}</span>
        </button>
      </template>
      <button data-test="command-highlight-clear" type="button" @click="$emit('highlight', undefined)" />
    </div>
  `,
};

const tooltipStub = {
  props: ["open", "reference", "content", "ui"],
  template: `
    <div
      v-if="open"
      data-test="command-details-tooltip"
      :data-reference-test="reference?.dataset?.test"
      :data-content-side="content?.side"
      :data-ui-content="ui?.content"
    >
      <slot name="content" />
    </div>
  `,
};

// Expose the Transition enter/leave class props as data attributes so tests can
// assert the button is wrapped and uses the same transition as ConfigOptionsBar.
const transitionStub = {
  props: [
    "enterActiveClass",
    "enterFromClass",
    "enterToClass",
    "leaveActiveClass",
    "leaveFromClass",
    "leaveToClass",
  ],
  template: `
    <div
      data-test="slash-transition"
      :data-enter-active="enterActiveClass"
      :data-enter-from="enterFromClass"
      :data-enter-to="enterToClass"
      :data-leave-active="leaveActiveClass"
      :data-leave-from="leaveFromClass"
      :data-leave-to="leaveToClass"
    >
      <slot />
    </div>
  `,
};

function makeCommand(input: {
  name: string;
  description?: string;
  hint?: string;
}): AcpAvailableCommand {
  return { description: "", ...input } as AcpAvailableCommand;
}

function mountMenu(
  props: Partial<{
    commands: AcpAvailableCommand[];
    open: boolean;
    searchTerm: string;
  }> = {}
): VueWrapper {
  return mount(SlashCommandMenu, {
    props: {
      commands: [makeCommand({ name: "review", description: "Review code" })],
      open: false,
      searchTerm: "",
      ...props,
    },
    global: {
      stubs: {
        UButton: buttonStub,
        UPopover: popoverStub,
        Popover: popoverStub,
        UCommandPalette: commandPaletteStub,
        CommandPalette: commandPaletteStub,
        UTooltip: tooltipStub,
        Tooltip: tooltipStub,
        Transition: transitionStub,
      },
    },
  });
}

describe("SlashCommandMenu", () => {
  it("shows the button only when commands exist", async () => {
    const wrapper = mountMenu();
    expect(wrapper.find('[data-test="slash-button"]').exists()).toBe(true);

    await wrapper.setProps({ commands: [] });
    expect(wrapper.find('[data-test="slash-button"]').exists()).toBe(false);
  });

  it("applies width and height constraints to the menu", async () => {
    const wrapper = mountMenu();
    await wrapper.setProps({ open: true });

    const menu = wrapper.get('[data-test="slash-menu"]');
    const menuClass = menu.attributes("class");

    expect(menuClass).toContain("max-h-[min(24rem,calc(100vh-8rem))]");
    expect(menuClass).toContain("overflow-hidden");
    expect(wrapper.html()).toContain(
      "w-[min(13.333rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-0"
    );
    expect(menu.attributes("data-ui-content")).toContain(
      "max-h-[min(24rem,calc(100vh-8rem))] overflow-y-auto"
    );
  });

  it("configures palette search to keep command count and original order", () => {
    const commands = Array.from({ length: 14 }, (_, index) =>
      makeCommand({
        name: `cmd-${index}`,
        description: `Description ${index}`,
        hint: `[arg-${index}]`,
      })
    );
    const wrapper = mountMenu({ commands, open: true });
    const menu = wrapper.get('[data-test="slash-menu"]');

    expect(menu.attributes("data-fuse-result-limit")).toBe("14");
    expect(menu.attributes("data-fuse-should-sort")).toBe("false");
    expect(menu.attributes("data-fuse-match-empty")).toBe("true");
    expect(menu.attributes("data-fuse-keys")).toBe("label|command.description|command.hint");
    expect(menu.attributes("data-preserve-group-order")).toBe("true");
    expect(
      wrapper.findAll('[data-test^="command-item-label-"]').map((item) => item.text())
    ).toEqual(commands.map((command) => `/${command.name}`));
  });

  it("renders command labels without description or hint list content", () => {
    const wrapper = mountMenu({
      open: true,
      commands: [
        makeCommand({ name: "review", description: "Review code", hint: "[path]" }),
        makeCommand({ name: "plan", description: "Create a plan", hint: "[topic]" }),
      ],
    });

    expect(wrapper.text()).toContain("/review");
    expect(wrapper.text()).toContain("/plan");
    expect(wrapper.text()).not.toContain("Review code");
    expect(wrapper.text()).not.toContain("[path]");
    expect(wrapper.find('[data-test="command-item-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="command-item-hint"]').exists()).toBe(false);
  });

  it("shows tooltip details for description and hint combinations", async () => {
    const wrapper = mountMenu({
      open: true,
      commands: [
        makeCommand({
          name: "description",
          description:
            "Describe command with enough detail to verify the tooltip keeps a bounded readable size.",
        }),
        makeCommand({ name: "hint", description: "   ", hint: "[target]" }),
        makeCommand({ name: "both", description: "Initialize", hint: "[path]" }),
        makeCommand({ name: "full", description: "   ", hint: "/full [path]" }),
        makeCommand({ name: "empty", description: "   ", hint: "\t" }),
      ],
    });

    await wrapper.get('[data-test="command-item-description"]').trigger("mouseenter");
    const detailsTooltip = wrapper.get('[data-test="command-details-tooltip"]');
    expect(detailsTooltip.text()).toContain("Describe command");
    expect(detailsTooltip.attributes("data-ui-content")).toContain("w-80");
    expect(detailsTooltip.attributes("data-ui-content")).toContain(
      "max-w-[min(20rem,calc(100vw-2rem))]"
    );
    expect(detailsTooltip.attributes("data-ui-content")).toContain(
      "max-h-[min(18rem,calc(100vh-4rem))]"
    );
    expect(detailsTooltip.attributes("data-ui-content")).toContain("overflow-y-auto");

    await wrapper.get('[data-test="command-item-hint"]').trigger("mouseenter");
    expect(wrapper.get('[data-test="command-details-tooltip"]').text()).toContain(
      "用法: /hint [target]"
    );

    await wrapper.get('[data-test="command-item-both"]').trigger("mouseenter");
    expect(wrapper.get('[data-test="command-details-tooltip"]').text()).toContain("Initialize");
    expect(wrapper.get('[data-test="command-details-tooltip"]').text()).toContain(
      "用法: /both [path]"
    );

    await wrapper.get('[data-test="command-item-full"]').trigger("mouseenter");
    expect(wrapper.get('[data-test="command-details-tooltip"]').text()).toContain(
      "用法: /full [path]"
    );
    expect(wrapper.get('[data-test="command-details-tooltip"]').text()).not.toContain(
      "/full /full"
    );

    await wrapper.get('[data-test="command-item-empty"]').trigger("mouseenter");
    expect(wrapper.find('[data-test="command-details-tooltip"]').exists()).toBe(false);
  });

  it("uses the same highlight state for hover and keyboard focus", async () => {
    const wrapper = mountMenu({
      open: true,
      commands: [
        makeCommand({ name: "review", description: "Review code" }),
        makeCommand({ name: "plan", description: "Create a plan" }),
      ],
    });

    await wrapper.get('[data-test="command-item-review"]').trigger("mouseenter");
    expect(
      wrapper.get('[data-test="command-details-tooltip"]').attributes("data-reference-test")
    ).toBe("command-item-review");
    expect(wrapper.get('[data-test="command-details-tooltip"]').text()).toContain("Review code");

    await wrapper.get('[data-test="command-item-plan"]').trigger("focus");
    expect(
      wrapper.get('[data-test="command-details-tooltip"]').attributes("data-reference-test")
    ).toBe("command-item-plan");
    expect(wrapper.get('[data-test="command-details-tooltip"]').text()).toContain("Create a plan");
  });

  it("clears tooltip state when highlight clears, commands empty, or a command is selected", async () => {
    const wrapper = mountMenu({ open: true });

    await wrapper.get('[data-test="command-item-review"]').trigger("mouseenter");
    expect(wrapper.find('[data-test="command-details-tooltip"]').exists()).toBe(true);

    await wrapper.get('[data-test="command-highlight-clear"]').trigger("click");
    expect(wrapper.find('[data-test="command-details-tooltip"]').exists()).toBe(false);

    await wrapper.get('[data-test="command-item-review"]').trigger("mouseenter");
    await wrapper.get('[data-test="command-item-review"]').trigger("click");
    expect(wrapper.find('[data-test="command-details-tooltip"]').exists()).toBe(false);
    expect(wrapper.emitted("select")?.[0]).toEqual([
      { name: "review", description: "Review code" },
    ]);

    await wrapper.get('[data-test="command-item-review"]').trigger("mouseenter");
    await wrapper.setProps({ commands: [] });
    expect(wrapper.find('[data-test="command-details-tooltip"]').exists()).toBe(false);
  });

  it("wraps the trigger button in a Transition matching ConfigOptionsBar", () => {
    const wrapper = mountMenu();
    const transition = wrapper.get('[data-test="slash-transition"]');

    // Same class constants as ConfigOptionsBar.vue.
    expect(transition.attributes("data-enter-active")).toBe("transition duration-150 ease-out");
    expect(transition.attributes("data-enter-from")).toBe("opacity-0 translate-y-1");
    expect(transition.attributes("data-enter-to")).toBe("opacity-100 translate-y-0");
    expect(transition.attributes("data-leave-active")).toBe("transition duration-150 ease-out");
    expect(transition.attributes("data-leave-from")).toBe("opacity-100 translate-y-0");
    expect(transition.attributes("data-leave-to")).toBe("opacity-0 translate-y-1");

    // The button lives inside the transition wrapper.
    expect(transition.find('[data-test="slash-button"]').exists()).toBe(true);
  });

  it("unmounts the button without error when commands become empty", async () => {
    const wrapper = mountMenu();
    expect(wrapper.find('[data-test="slash-button"]').exists()).toBe(true);

    await wrapper.setProps({ commands: [] });

    expect(wrapper.find('[data-test="slash-button"]').exists()).toBe(false);
    // Popover wrapper still renders (anchor present) and no error thrown.
    expect(wrapper.find('[data-test="slash-transition"]').exists()).toBe(true);
  });
});
