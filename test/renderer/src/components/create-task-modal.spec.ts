import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CreateTaskModal from "@renderer/components/task/CreateTaskModal.vue";

describe("CreateTaskModal", () => {
  it("presents target hints as Project while emitting ordered Folder IDs", async () => {
    const wrapper = mount(CreateTaskModal, {
      props: {
        open: true,
        folders: [
          {
            folderId: "folder-a",
            folderName: "Repository A",
            folderPath: "/repos/a",
            pathMissing: false,
            isPrimary: true,
          },
          {
            folderId: "folder-b",
            folderName: "Repository B",
            folderPath: "/repos/b",
            pathMissing: false,
            isPrimary: false,
          },
        ],
      },
    });

    await wrapper.findAll("input")[0]!.setValue("Targeted task");
    await wrapper.get('[aria-label="选择目标 Project Repository B"]').setValue(true);
    await wrapper.get('[aria-label="选择目标 Project Repository A"]').setValue(true);
    const createButton = wrapper.findAll("button").find((node) => node.text().includes("创建任务"));
    await createButton?.trigger("click");

    expect(wrapper.emitted("create")?.[0]?.[0]).toMatchObject({
      title: "Targeted task",
      targetFolderIds: ["folder-b", "folder-a"],
    });
  });
});
