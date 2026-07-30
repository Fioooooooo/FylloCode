import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import Logo from "@renderer/components/shared/Logo.vue";

describe("Logo", () => {
  it("renders the generated multicolor icon by default", () => {
    const wrapper = mount(Logo, {
      props: {
        alt: "FylloCode",
      },
      attrs: {
        class: "size-6",
      },
    });

    const image = wrapper.get("img");
    expect(image.attributes("src")).toContain("icon.svg");
    expect(image.attributes("alt")).toBe("FylloCode");
    expect(image.classes()).toContain("size-6");
  });

  it("uses the generated icon as a currentColor mask in neutral mode", () => {
    const wrapper = mount(Logo, {
      props: {
        color: "neutral",
      },
      attrs: {
        class: "size-5 text-black",
      },
    });

    const mask = wrapper.get("span");
    expect(mask.attributes("style")).toContain("icon.svg");
    expect(mask.attributes("style")).toContain("currentcolor");
    expect(mask.attributes("aria-hidden")).toBe("true");
    expect(mask.classes()).toEqual(expect.arrayContaining(["size-5", "text-black"]));
    expect(wrapper.find("path").exists()).toBe(false);
  });
});
