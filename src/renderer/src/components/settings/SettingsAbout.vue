<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useSettingsStore } from "@renderer/stores/settings";

const settingsStore = useSettingsStore();

const aboutInfo = computed(() => settingsStore.aboutInfo);
const releaseCheckResult = computed(() => settingsStore.releaseCheckResult);
const releaseCheckButtonLabel = computed(() => {
  if (settingsStore.releaseCheckLoading) return "检测中…";
  if (settingsStore.releaseCheckError) return "重试";
  return "检查新版本";
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
      <h1 class="text-xl font-semibold tracking-tight text-highlighted">About</h1>
      <p class="text-sm text-muted">
        查看当前应用版本、发布渠道以及 FylloCode 项目的公开入口信息。
      </p>
    </div>

    <div data-test="about-card">
      <UiSurface padding="none">
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

        <div v-else class="divide-y divide-default" data-test="about-card-content">
          <div
            class="flex items-center justify-between gap-4 px-4 py-4"
            data-test="about-row-version"
          >
            <div>
              <p class="text-sm font-medium text-highlighted">版本</p>
              <p class="text-xs text-muted">当前运行中的桌面应用版本。</p>
            </div>
            <div v-if="aboutInfo" class="flex items-center gap-2 text-sm text-highlighted">
              <UBadge color="neutral" variant="soft" data-test="about-release-channel">
                {{ aboutInfo.releaseChannel }}
              </UBadge>
              <span class="font-medium" data-test="about-version">v{{ aboutInfo.version }}</span>
            </div>
          </div>

          <div
            class="flex items-start justify-between gap-4 px-4 py-4"
            data-test="about-row-release-check"
          >
            <div class="min-w-0 space-y-1">
              <p class="text-sm font-medium text-highlighted">新版本检测</p>
              <p
                v-if="settingsStore.releaseCheckLoading"
                class="text-xs text-muted"
                data-test="release-check-loading"
              >
                正在检测 GitHub 最新正式 Release…
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
                。可前往 GitHub Release 页面下载安装包。
              </p>
              <p
                v-else-if="releaseCheckResult?.status === 'up-to-date'"
                class="text-xs text-muted"
                data-test="release-check-up-to-date"
              >
                当前已是最新版本 v{{ releaseCheckResult.currentVersion }}。
              </p>
              <p v-else class="text-xs text-muted" data-test="release-check-idle">
                手动检查 GitHub Release 是否有新版本。
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

          <div
            class="flex items-center justify-between gap-4 px-4 py-4"
            data-test="about-row-copyright"
          >
            <div>
              <p class="text-sm font-medium text-highlighted">版权</p>
              <p class="text-xs text-muted">应用当前展示的版权文案。</p>
            </div>
            <div class="text-sm text-muted" data-test="about-copyright">
              {{ aboutInfo?.copyright ?? "" }}
            </div>
          </div>

          <div
            class="flex items-center justify-between gap-4 px-4 py-4"
            data-test="about-row-repository"
          >
            <div>
              <p class="text-sm font-medium text-highlighted">GitHub 首页</p>
              <p class="text-xs text-muted">查看项目仓库与发布信息。</p>
            </div>
            <a
              v-if="aboutInfo"
              :href="aboutInfo.repositoryUrl"
              class="text-sm font-medium text-primary hover:text-primary/80"
              target="_blank"
              rel="noreferrer"
              data-test="about-link-repository"
            >
              打开 GitHub
            </a>
          </div>

          <div
            class="flex items-center justify-between gap-4 px-4 py-4"
            data-test="about-row-feedback"
          >
            <div>
              <p class="text-sm font-medium text-highlighted">反馈</p>
              <p class="text-xs text-muted">前往 issue tracker 提交问题或建议。</p>
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
    </div>
  </div>
</template>
