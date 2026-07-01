import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ConfigOptionItem from "@renderer/components/chat/prompt/ConfigOptionItem.vue";
import type { AcpSessionConfigBoolean, AcpSessionConfigSelect } from "@shared/types/acp-config";

function mountItem(props: {
  option: AcpSessionConfigSelect | AcpSessionConfigBoolean;
  isPending?: boolean;
}): ReturnType<typeof mount> {
  return mount(ConfigOptionItem, {
    props: { isPending: false, ...props },
  });
}

describe("ConfigOptionItem", () => {
  it("renders flat select with the current value label only (no name in trigger)", () => {
    const wrapper = mountItem({
      option: {
        type: "select",
        id: "model",
        name: "Model",
        category: "model",
        currentValue: "sonnet",
        options: [
          { value: "sonnet", name: "Sonnet" },
          { value: "haiku", name: "Haiku" },
        ],
      },
    });

    const trigger = wrapper.get('[data-test="config-option-item-model"]');
    expect(trigger.text()).toBe("Sonnet");
    expect(trigger.text()).not.toContain("Model:");
    expect(wrapper.find('[data-test="dropdown-item-Sonnet"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="dropdown-item-Haiku"]').exists()).toBe(true);
  });

  it("emits change with the selected flat option value", async () => {
    const wrapper = mountItem({
      option: {
        type: "select",
        id: "model",
        name: "Model",
        currentValue: "sonnet",
        options: [
          { value: "sonnet", name: "Sonnet" },
          { value: "haiku", name: "Haiku" },
        ],
      },
    });

    await wrapper.find('[data-test="dropdown-item-Haiku"]').trigger("click");
    expect(wrapper.emitted("change")?.[0]).toEqual(["haiku"]);
  });

  it("flattens grouped options into the dropdown including the group label", () => {
    const wrapper = mountItem({
      option: {
        type: "select",
        id: "model",
        name: "Model",
        category: "model",
        currentValue: "haiku",
        options: [
          {
            group: "anthropic",
            name: "Anthropic",
            options: [
              { value: "sonnet", name: "Sonnet" },
              { value: "haiku", name: "Haiku" },
            ],
          },
        ],
      },
    });

    expect(wrapper.find('[data-test="dropdown-item-Anthropic"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="dropdown-item-Sonnet"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="dropdown-item-Haiku"]').exists()).toBe(true);
  });

  it("renders boolean as switch and emits change", async () => {
    const wrapper = mountItem({
      option: {
        type: "boolean",
        id: "stream",
        name: "Stream",
        category: "_custom",
        currentValue: false,
      },
    });

    const switchEl = wrapper.get('[data-test="config-option-item-stream"]');
    await switchEl.trigger("change");
    expect(wrapper.emitted("change")?.[0]).toEqual([true]);
  });

  it("uses the model icon for category=model in select trigger", () => {
    const wrapper = mountItem({
      option: {
        type: "select",
        id: "model",
        name: "Model",
        category: "model",
        currentValue: "sonnet",
        options: [{ value: "sonnet", name: "Sonnet" }],
      },
    });

    expect(wrapper.find('button[data-icon="i-lucide-cpu"]').exists()).toBe(true);
  });

  it("uses fallback icon for unknown category in select trigger", () => {
    const wrapper = mountItem({
      option: {
        type: "select",
        id: "x",
        name: "X",
        category: "foo",
        currentValue: "a",
        options: [{ value: "a", name: "A" }],
      },
    });

    expect(wrapper.find('button[data-icon="i-lucide-sliders"]').exists()).toBe(true);
  });

  it("disables the select trigger when isPending is true", () => {
    const wrapper = mountItem({
      option: {
        type: "select",
        id: "model",
        name: "Model",
        currentValue: "sonnet",
        options: [{ value: "sonnet", name: "Sonnet" }],
      },
      isPending: true,
    });
    expect(wrapper.find("button[disabled]").exists()).toBe(true);
  });

  it("shows option value description in a right-side tooltip and only renders the name in the item", () => {
    const UTooltipWithContent = {
      template:
        '<div data-test="tooltip-wrapper"><slot /><div v-if="$slots.content" data-test="tooltip-content"><slot name="content" /></div></div>',
    };
    const UDropdownMenuWithItemSlot = {
      props: ["items"],
      template: `
        <div>
          <slot />
          <template v-for="item in items" :key="item.label">
            <div v-if="item.type === 'label'" :data-test="\`dropdown-label-\${item.label}\`">{{ item.label }}</div>
            <button v-else type="button" :data-test="\`dropdown-item-\${item.label}\`" @click="item.onSelect?.()">
              <slot name="item-label" :item="item" />
            </button>
          </template>
        </div>
      `,
    };

    const wrapper = mount(ConfigOptionItem, {
      props: {
        isPending: false,
        option: {
          type: "select",
          id: "model",
          name: "Model",
          category: "model",
          currentValue: "sonnet",
          options: [
            { value: "sonnet", name: "Sonnet", description: "Fast and capable" },
            { value: "haiku", name: "Haiku" },
          ],
        },
      },
      global: {
        stubs: {
          UDropdownMenu: UDropdownMenuWithItemSlot,
          DropdownMenu: UDropdownMenuWithItemSlot,
          UTooltip: UTooltipWithContent,
          Tooltip: UTooltipWithContent,
        },
      },
    });

    const sonnetTooltip = wrapper.get(
      '[data-test="dropdown-item-Sonnet"] [data-test="tooltip-content"]'
    );
    expect(sonnetTooltip.text()).toContain("Fast and capable");

    expect(
      wrapper.find('[data-test="dropdown-item-Haiku"] [data-test="tooltip-content"]').exists()
    ).toBe(false);
  });
});
