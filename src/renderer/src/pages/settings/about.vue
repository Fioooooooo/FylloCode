<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useSettingsStore } from "@renderer/stores";

const settingsStore = useSettingsStore();

const aboutInfo = computed(() => settingsStore.aboutInfo);
const releaseCheckResult = computed(() => settingsStore.releaseCheckResult);
const changelogUrl = computed(() =>
  aboutInfo.value ? `${aboutInfo.value.repositoryUrl}/blob/main/CHANGELOG.md` : ""
);
const licenseUrl = computed(() =>
  aboutInfo.value ? `${aboutInfo.value.repositoryUrl}/blob/main/LICENSE` : ""
);
const releaseCheckButtonLabel = computed(() => {
  if (settingsStore.releaseCheckLoading) return "检测中…";
  if (settingsStore.releaseCheckError) return "重试";
  return "检查更新";
});

onMounted(() => {
  void settingsStore.ensureAboutInfoLoaded();
});

function checkLatestRelease(): void {
  void settingsStore.checkLatestRelease();
}

function formatPublishedAt(value: string | undefined): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString();
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-xl font-semibold tracking-tight text-highlighted">关于我们</h1>
      <p class="text-sm text-muted">了解 FylloCode 的版本、更新动态，以及获取帮助的入口。</p>
    </div>

    <AppEmptyState
      v-if="settingsStore.aboutInfoLoading"
      data-test="about-loading"
      icon="i-lucide-loader-circle"
      title="正在加载"
      description="正在加载应用信息…"
      compact
    />

    <AppEmptyState
      v-else-if="settingsStore.aboutInfoError"
      data-test="about-error"
      icon="i-lucide-triangle-alert"
      title="加载失败"
      :description="settingsStore.aboutInfoError"
      compact
    />

    <template v-else>
      <section data-test="about-section-version-info">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">版本信息</h3>
        <UiSurface padding="none">
          <div class="divide-y divide-default">
            <div
              class="flex items-center justify-between gap-4 px-4 py-4"
              data-test="about-row-version"
            >
              <div>
                <p class="text-sm font-medium text-highlighted">版本</p>
                <p class="text-xs text-muted">你正在使用的 FylloCode 版本。</p>
              </div>
              <div v-if="aboutInfo" class="text-sm text-highlighted">
                <span class="font-medium" data-test="about-version">v{{ aboutInfo.version }}</span>
              </div>
            </div>

            <div
              class="flex items-start justify-between gap-4 px-4 py-4"
              data-test="about-row-release-check"
            >
              <div class="min-w-0 space-y-1">
                <p class="text-sm font-medium text-highlighted">检查更新</p>
                <p
                  v-if="settingsStore.releaseCheckLoading"
                  class="text-xs text-muted"
                  data-test="release-check-loading"
                >
                  正在检查 GitHub 是否发布了新版本…
                </p>
                <p
                  v-else-if="settingsStore.releaseCheckError"
                  class="text-xs text-error"
                  data-test="release-check-error"
                >
                  {{ settingsStore.releaseCheckError }}
                </p>
                <p
                  v-else-if="releaseCheckResult?.status === 'update-available'"
                  class="text-xs text-muted"
                  data-test="release-check-update-available"
                >
                  发现新版本 v{{ releaseCheckResult.latestVersion }}
                  <span v-if="formatPublishedAt(releaseCheckResult.publishedAt)">
                    ，发布于 {{ formatPublishedAt(releaseCheckResult.publishedAt) }}
                  </span>
                  。可前往 GitHub Release 页面获取新版本。
                </p>
                <p
                  v-else-if="releaseCheckResult?.status === 'up-to-date'"
                  class="text-xs text-muted"
                  data-test="release-check-up-to-date"
                >
                  当前已是最新版本 v{{ releaseCheckResult.currentVersion }}。
                </p>
                <p v-else class="text-xs text-muted" data-test="release-check-idle">
                  检查是否有可用的 FylloCode 新版本。
                </p>
              </div>

              <div class="flex shrink-0 items-center gap-2">
                <a
                  v-if="releaseCheckResult?.status === 'update-available'"
                  :href="releaseCheckResult.releaseUrl"
                  class="text-sm font-medium text-primary hover:text-primary/80"
                  target="_blank"
                  rel="noreferrer"
                  data-test="release-check-open-release"
                >
                  查看新版本
                </a>
                <button
                  v-else
                  type="button"
                  class="text-sm font-medium text-primary hover:text-primary/80 disabled:cursor-not-allowed disabled:text-muted"
                  :disabled="settingsStore.releaseCheckLoading"
                  data-test="release-check-button"
                  @click="checkLatestRelease"
                >
                  {{ releaseCheckButtonLabel }}
                </button>
              </div>
            </div>
          </div>
        </UiSurface>
      </section>

      <section data-test="about-section-resources-support">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">资源与支持</h3>
        <UiSurface padding="none">
          <div class="divide-y divide-default">
            <div
              class="flex items-center justify-between gap-4 px-4 py-4"
              data-test="about-row-documentation"
            >
              <div>
                <p class="text-sm font-medium text-highlighted">官方文档</p>
                <p class="text-xs text-muted">了解功能用法、工作流与开发说明。</p>
              </div>
              <a
                href="https://fyllocode.cc"
                class="text-sm font-medium text-primary hover:text-primary/80"
                target="_blank"
                rel="noreferrer"
                data-test="about-link-documentation"
              >
                查看文档
              </a>
            </div>

            <div
              class="flex items-center justify-between gap-4 px-4 py-4"
              data-test="about-row-changelog"
            >
              <div>
                <p class="text-sm font-medium text-highlighted">更新日志</p>
                <p class="text-xs text-muted">查看各版本的新增内容与修复。</p>
              </div>
              <a
                v-if="aboutInfo"
                :href="changelogUrl"
                class="text-sm font-medium text-primary hover:text-primary/80"
                target="_blank"
                rel="noreferrer"
                data-test="about-link-changelog"
              >
                查看更新日志
              </a>
            </div>

            <div
              class="flex items-center justify-between gap-4 px-4 py-4"
              data-test="about-row-feedback"
            >
              <div>
                <p class="text-sm font-medium text-highlighted">反馈</p>
                <p class="text-xs text-muted">遇到问题或有想法？欢迎在 GitHub 告诉我们。</p>
              </div>
              <a
                v-if="aboutInfo"
                :href="aboutInfo.feedbackUrl"
                class="text-sm font-medium text-primary hover:text-primary/80"
                target="_blank"
                rel="noreferrer"
                data-test="about-link-feedback"
              >
                提交反馈
              </a>
            </div>
          </div>
        </UiSurface>
      </section>

      <section data-test="about-section-legal-info">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">法律信息</h3>
        <UiSurface padding="none">
          <div class="divide-y divide-default">
            <div
              class="flex items-center justify-between gap-4 px-4 py-4"
              data-test="about-row-license"
            >
              <div>
                <p class="text-sm font-medium text-highlighted">License</p>
                <p class="text-xs text-muted">查看 FylloCode 的开源许可条款。</p>
              </div>
              <a
                v-if="aboutInfo"
                :href="licenseUrl"
                class="text-sm font-medium text-primary hover:text-primary/80"
                target="_blank"
                rel="noreferrer"
                data-test="about-link-license"
              >
                查看 License
              </a>
            </div>

            <div
              class="flex items-center justify-between gap-4 px-4 py-4"
              data-test="about-row-copyright"
            >
              <div>
                <p class="text-sm font-medium text-highlighted">版权</p>
                <p class="text-xs text-muted">FylloCode 的版权归属信息。</p>
              </div>
              <div class="text-sm text-muted" data-test="about-copyright">
                {{ aboutInfo?.copyright ?? "" }}
              </div>
            </div>
          </div>
        </UiSurface>
      </section>
    </template>
  </div>
</template>
