import { describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import SlashCommandMenu from "@renderer/components/chat/prompt/SlashCommandMenu.vue";

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
  props: ["groups", "searchTerm", "autofocus", "placeholder", "ui"],
  emits: ["update:modelValue", "update:open", "update:searchTerm"],
  template: `
    <div data-test="slash-menu" :class="$attrs.class" :data-ui-content="ui?.content">
      <template v-for="group in groups" :key="group.id">
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          @click="$emit('update:modelValue', item)"
        >
          {{ item.label }}
        </button>
      </template>
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

function mountMenu(): VueWrapper {
  return mount(SlashCommandMenu, {
    props: {
      commands: [{ name: "review", description: "Review code" }],
      open: false,
      searchTerm: "",
    },
    global: {
      stubs: {
        UButton: buttonStub,
        UPopover: popoverStub,
        Popover: popoverStub,
        UCommandPalette: commandPaletteStub,
        CommandPalette: commandPaletteStub,
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
      "w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-0"
    );
    expect(menu.attributes("data-ui-content")).toContain(
      "max-h-[min(24rem,calc(100vh-8rem))] overflow-y-auto"
    );
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
