import { config } from "@vue/test-utils";
import { vi } from "vitest";

// ─────────────────────────────────────────────
// Mock @nuxt/ui auto-imported composables
// 在 Vite 构建时 @nuxt/ui/vite 插件会自动注入 import 语句，
// 但在 vitest 中不经过该插件，因此需要手动 mock
// ─────────────────────────────────────────────
const mockToast = { add: vi.fn() };
const buttonStub = {
  template:
    '<button :data-color="color || \'neutral\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
  props: ["loading", "icon", "color", "variant", "size", "disabled"],
  emits: ["click"],
};
const dropdownMenuStub = {
  template:
    '<div><slot /><button v-for="item in items" :key="item.label" type="button" :data-test="`dropdown-item-${item.label}`" @click="item.onSelect?.()">{{ item.label }}</button></div>',
  props: ["items"],
};
const tooltipStub = {
  template: "<div><slot /></div>",
};

vi.mock("@nuxt/ui/composables", () => ({
  useToast: vi.fn(() => mockToast),
}));

// ─────────────────────────────────────────────
// Stub 全局自动注册的第三方组件
// @nuxt/ui 组件在 vite 构建时由插件自动导入注册，
// 测试中需手动 stub 以避免 "Failed to resolve component" 警告
// ─────────────────────────────────────────────
config.global.stubs = {
  // vue-router
  RouterView: true,

  // @nuxt/ui layout
  UApp: true,

  // @nuxt/ui components — 保留基础交互能力用于测试
  UButton: buttonStub,
  Button: buttonStub,
  UDropdownMenu: dropdownMenuStub,
  DropdownMenu: dropdownMenuStub,
  UTooltip: tooltipStub,
  Tooltip: tooltipStub,
  UInput: {
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue", "placeholder"],
    emits: ["update:modelValue"],
  },
  Input: {
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue", "placeholder"],
    emits: ["update:modelValue"],
  },
  UTextarea: {
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>',
    props: ["modelValue", "rows", "placeholder"],
    emits: ["update:modelValue"],
  },
  Textarea: {
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>',
    props: ["modelValue", "rows", "placeholder"],
    emits: ["update:modelValue"],
  },
  UFormField: {
    template:
      '<label><span v-if="label">{{ label }}</span><slot /><span v-if="error">{{ error }}</span></label>',
    props: ["label", "required", "error"],
  },
  FormField: {
    template:
      '<label><span v-if="label">{{ label }}</span><slot /><span v-if="error">{{ error }}</span></label>',
    props: ["label", "required", "error"],
  },
  UModal: {
    template:
      '<div v-if="open"><div v-if="title">{{ title }}</div><div v-if="description">{{ description }}</div><slot /><slot name="body" /><slot name="footer" /></div>',
    props: ["open", "title", "description"],
  },
  Modal: {
    template:
      '<div v-if="open"><div v-if="title">{{ title }}</div><div v-if="description">{{ description }}</div><slot /><slot name="body" /><slot name="footer" /></div>',
    props: ["open", "title", "description"],
  },
  UBadge: {
    template: "<span><slot /></span>",
  },
  Badge: {
    template: "<span><slot /></span>",
  },
  UTabs: {
    template:
      '<div><button v-for="item in items" :key="item[valueKey || \'value\']" type="button" :data-test="`tab-${item[valueKey || \'value\']}`" @click="$emit(\'update:modelValue\', item[valueKey || \'value\'])">{{ item.label }}</button></div>',
    props: ["items", "modelValue", "valueKey", "variant", "size"],
    emits: ["update:modelValue"],
  },
  Tabs: {
    template:
      '<div><button v-for="item in items" :key="item[valueKey || \'value\']" type="button" :data-test="`tab-${item[valueKey || \'value\']}`" @click="$emit(\'update:modelValue\', item[valueKey || \'value\'])">{{ item.label }}</button></div>',
    props: ["items", "modelValue", "valueKey", "variant", "size"],
    emits: ["update:modelValue"],
  },
  URadioGroup: {
    template:
      '<div><button v-for="item in items" :key="item[valueKey || \'value\']" type="button" :data-test="`radio-${item[valueKey || \'value\']}`" @click="$emit(\'update:modelValue\', item[valueKey || \'value\'])">{{ item.label }}</button></div>',
    props: ["items", "modelValue", "valueKey", "orientation", "color"],
    emits: ["update:modelValue"],
  },
  RadioGroup: {
    template:
      '<div><button v-for="item in items" :key="item[valueKey || \'value\']" type="button" :data-test="`radio-${item[valueKey || \'value\']}`" @click="$emit(\'update:modelValue\', item[valueKey || \'value\'])">{{ item.label }}</button></div>',
    props: ["items", "modelValue", "valueKey", "orientation", "color"],
    emits: ["update:modelValue"],
  },
  UIcon: true,
  Icon: true,
  USelect: true,
  UCheckbox: true,
  UCard: {
    template: '<div><slot name="header" /><slot /><slot name="footer" /></div>',
  },
  UAlert: true,
  UEditor: {
    template:
      '<div :data-content-type="contentType" :data-editable="String(editable)">{{ modelValue }}</div>',
    props: ["modelValue", "contentType", "editable"],
  },
};
