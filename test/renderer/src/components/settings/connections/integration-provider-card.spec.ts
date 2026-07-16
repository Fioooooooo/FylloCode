import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import IntegrationProviderCard from "@renderer/components/settings/connections/IntegrationProviderCard.vue";
import { useIntegrationProvidersStore } from "@renderer/stores/platform/providers";

describe("IntegrationProviderCard", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("renders credential fields for an unconnected provider", async () => {
    const store = useIntegrationProvidersStore();
    vi.spyOn(store, "connectProvider").mockResolvedValue({ ok: true });

    const wrapper = mount(IntegrationProviderCard, {
      props: {
        provider: {
          id: "yunxiao",
          name: "云效",
          description: "研发平台",
          authType: "api-token",
          credentialFields: [
            {
              key: "x-yunxiao-token",
              label: "个人访问令牌",
              type: "password",
              required: true,
            },
          ],
          capabilities: [
            {
              stage: "project-management",
              resourceType: "projex-project",
              label: "Projex 项目",
              description: "任务来源",
            },
          ],
          logoIcon: "icon",
          logoColor: "text-primary",
          comingSoon: false,
          connection: null,
        },
      },
    });

    await wrapper.find("button").trigger("click");
    expect(wrapper.text()).toContain("个人访问令牌");
    expect(wrapper.text()).toContain("连接");
  });

  it("renders credential preview for a connected provider", async () => {
    const wrapper = mount(IntegrationProviderCard, {
      props: {
        provider: {
          id: "yunxiao",
          name: "云效",
          description: "研发平台",
          authType: "api-token",
          credentialFields: [],
          capabilities: [
            {
              stage: "project-management",
              resourceType: "projex-project",
              label: "Projex 项目",
              description: "任务来源",
            },
          ],
          logoIcon: "icon",
          logoColor: "text-primary",
          comingSoon: false,
          connection: {
            providerId: "yunxiao",
            state: "connected",
            accountName: "demo@example.com",
            credentialPreview: { "x-yunxiao-token": "toke****1234" },
          },
        },
      },
    });

    await wrapper.find("button").trigger("click");
    expect(wrapper.text()).toContain("已识别账户");
    expect(wrapper.text()).toContain("toke****1234");
  });
});
