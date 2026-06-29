import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TaskCreateAction from "@renderer/components/shared/fyllo-action/TaskCreateAction.vue";

describe("TaskCreateAction", () => {
  it("renders task.create payload fields with task-specific labels", () => {
    const wrapper = mount(TaskCreateAction, {
      props: {
        payload: {
          title: "补齐错误处理",
          description: "整理异常分支",
        },
      },
    });

    expect(wrapper.text()).toContain("任务标题");
    expect(wrapper.text()).toContain("补齐错误处理");
    expect(wrapper.text()).toContain("任务描述");
    expect(wrapper.text()).toContain("整理异常分支");
  });

  it("renders an explicit empty description state", () => {
    const wrapper = mount(TaskCreateAction, {
      props: {
        payload: {
          title: "补齐错误处理",
        },
      },
    });

    expect(wrapper.text()).toContain("无描述");
  });
});
