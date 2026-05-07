/** 云效用户基础信息 */
export interface MrUser {
  /** 云效用户 ID */
  userId: string;
  /** 用户登录名 */
  username: string;
  /** 用户显示名称 */
  name: string;
  /** 用户邮箱 */
  email: string;
  /** 用户头像地址 */
  avatar: string;
  /** 用户状态：active - 激活可用；blocked - 阻塞暂不可用 */
  state: string;
}

/** 合并请求评审人信息 */
export interface MrReviewer extends MrUser {
  /** 是否已评论过 */
  hasCommented: boolean;
  /** 是否已评审过 */
  hasReviewed: boolean;
  /** 评审意见：PASS - 通过；NOT_PASS - 不通过 */
  reviewOpinionStatus: string;
  /** 评审时间，ISO 8601 格式 */
  reviewTime: string;
}

/** 合并请求（Change Request）详情 */
export interface ChangeRequest {
  /** 源分支领先目标分支的 commit 数量 */
  ahead: number;
  /** 目标分支领先源分支的 commit 数量 */
  behind: number;
  /** 是否所有卡点项通过 */
  allRequirementsPass: boolean;
  /** 合并请求作者 */
  author: MrUser;
  /** 是否能 Revert 或 CherryPick */
  canRevertOrCherryPick: boolean;
  /** 冲突检测状态：CHECKING / HAS_CONFLICT / NO_CONFLICT / FAILED */
  conflictCheckStatus: string;
  /** 创建来源：WEB - 页面创建；COMMAND_LINE - 命令行创建 */
  createFrom: string;
  /** 创建时间，ISO 8601 格式 */
  createTime: string;
  /** 描述 */
  description: string;
  /** 合并请求详情页地址 */
  detailUrl: string;
  /** 是否 Revert 过 */
  hasReverted: boolean;
  /** 局部 ID（在代码库内唯一） */
  localId: number;
  /** 合并版本（提交 ID），仅已合并状态才有值 */
  mergedRevision: string;
  /** 合并请求类型：CODE_REVIEW - 代码评审；REF_REVIEW - 分支标签评审 */
  mrType: string;
  /** 代码库 ID */
  projectId: number;
  /** 评审人列表 */
  reviewers: MrReviewer[];
  /** 源分支名称 */
  sourceBranch: string;
  /** 源库 ID */
  sourceProjectId: number;
  /** 合并请求状态：UNDER_DEV / UNDER_REVIEW / TO_BE_MERGED / CLOSED / MERGED */
  status: string;
  /** 订阅人列表 */
  subscribers: MrUser[];
  /** 是否支持 fast-forward-only 合并 */
  supportMergeFastForwardOnly: boolean;
  /** 目标分支名称 */
  targetBranch: string;
  /** 目标库 ID */
  targetProjectId: number;
  /** 目标库名称（含完整父路径） */
  targetProjectNameWithNamespace: string;
  /** 目标库路径（含完整父路径） */
  targetProjectPathWithNamespace: string;
  /** 标题 */
  title: string;
  /** 总评论数 */
  totalCommentCount: number;
  /** 未解决评论数 */
  unResolvedCommentCount: number;
  /** 更新时间，ISO 8601 格式 */
  updateTime: string;
  /** 合并请求页面地址 */
  webUrl: string;
}

/** createChangeRequest 请求参数 */
export interface CreateChangeRequestParams {
  /** 组织 ID（中心版必填） */
  organizationId: string;
  /** 代码库 ID 或 URL-Encoder 编码的全路径 */
  repositoryId: string;
  /** 源分支名称 */
  sourceBranch: string;
  /** 源库 ID */
  sourceProjectId: number;
  /** 目标分支名称 */
  targetBranch: string;
  /** 目标库 ID */
  targetProjectId: number;
  /** 标题，不超过 256 个字符 */
  title: string;
  /** 描述，不超过 10000 个字符 */
  description?: string;
  /** 创建来源，默认 WEB */
  createFrom?: "WEB" | "COMMAND_LINE";
  /** 评审人用户 ID 列表 */
  reviewerUserIds?: string[];
  /** 是否触发 AI 评审，默认 false */
  triggerAIReviewRun?: boolean;
  /** 关联工作项 ID 列表，逗号分隔的字符串 */
  workItemIds?: string;
}
