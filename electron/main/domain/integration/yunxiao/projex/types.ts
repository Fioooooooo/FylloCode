/** 工作项中的用户引用 */
export interface WorkitemUser {
  /** 用户 ID */
  id: string;
  /** 用户显示名称 */
  name: string;
}

/** 工作项标签 */
export interface WorkitemLabel {
  /** 标签 ID */
  id: string;
  /** 标签名称 */
  name: string;
  /** 标签颜色 */
  color: string;
}

/** 工作项状态 */
export interface WorkitemStatus {
  /** 状态 ID */
  id: string;
  /** 状态名称 */
  name: string;
  /** 状态英文名称 */
  nameEn: string;
  /** 状态显示名称 */
  displayName: string;
  /** 状态阶段 ID */
  statusStageId?: string;
}

/** 通用 ID + 名称引用（迭代、空间、版本、工作项类型等） */
export interface WorkitemRef {
  /** ID */
  id: string;
  /** 名称 */
  name: string;
}

/** 自定义字段值条目 */
export interface CustomFieldValue {
  /** 字段 ID */
  fieldId: string;
  /** 字段名称 */
  fieldName: string;
  /** 字段类型，如 User、string 等 */
  fieldFormat: string;
  /** 字段值列表 */
  values: {
    /** 值的唯一标识 */
    identifier: string;
    /** 显示名称 */
    displayValue: string;
  }[];
}

/** 工作项详情 */
export interface Workitem {
  /** 工作项 ID */
  id: string;
  /** 工作项标题 */
  subject: string;
  /** 工作项描述 */
  description: string;
  /** 描述格式：RICHTEXT 或 MARKDOWN */
  formatType: string;
  /** 工作项分类 ID，如 Req、Task、Bug */
  categoryId: string;
  /** 工作项编号，如 PROJ-123 */
  serialNumber: string;
  /** 逻辑状态：normal - 正常；archived - 归档 */
  logicalStatus: string;
  /** 父工作项 ID */
  parentId: string;
  /** 工作项 ID 路径，逗号分隔 */
  idPath: string;
  /** 创建时间 */
  gmtCreate: string;
  /** 最后修改时间 */
  gmtModified: string;
  /** 状态最后更新时间 */
  updateStatusAt: string;
  /** 指派人 */
  assignedTo: WorkitemUser;
  /** 创建人 */
  creator: WorkitemUser;
  /** 最后修改人 */
  modifier: WorkitemUser;
  /** 验证人 */
  verifier: WorkitemUser;
  /** 所属空间（项目或项目集） */
  space: WorkitemRef;
  /** 关联迭代 */
  sprint: WorkitemRef;
  /** 当前状态 */
  status: WorkitemStatus;
  /** 工作项类型 */
  workitemType: WorkitemRef;
  /** 标签列表 */
  labels: WorkitemLabel[];
  /** 参与人列表 */
  participants: WorkitemUser[];
  /** 跟踪人列表 */
  trackers: WorkitemUser[];
  /** 关联版本列表 */
  versions: WorkitemRef[];
  /** 自定义字段值列表 */
  customFieldValues: CustomFieldValue[];
}

/** searchWorkitems 请求参数 */
export interface SearchWorkitemsParams {
  /** 组织 ID（中心版必填） */
  organizationId: string;
  /** 项目 ID 或项目集 ID */
  spaceId: string;
  /**
   * 搜索的工作项类型，多值用逗号隔开。
   * 常见值：Req（需求）、Task（任务）、Bug（缺陷）
   */
  category: string;
  /**
   * 过滤条件，JSON 字符串，格式：
   * {"conditionGroups":[[filterObject, ...]]}
   * 每个 filterObject 包含 fieldIdentifier、operator、value 等字段
   */
  conditions?: string;
  /** 空间类型，默认 Project */
  spaceType?: "Project" | "Program";
  /** 排序字段，默认 gmtCreate；可选 gmtCreate / name */
  orderBy?: string;
  /** 排序方式，默认 desc */
  sort?: "asc" | "desc";
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页大小，范围 0-200，默认 20 */
  perPage?: number;
}

/** createWorkitem 请求参数 */
export interface CreateWorkitemParams {
  /** 组织 ID */
  organizationId: string;
  /** 空间 ID（项目 ID） */
  spaceId: string;
  /** 工作项标题 */
  subject: string;
  /** 工作项类型 ID */
  workitemTypeId: string;
  /** 指派人用户 ID */
  assignedTo: string;
  /** 工作项描述 */
  description?: string;
  /** 父工作项 ID */
  parentId?: string;
  /** 关联迭代 ID */
  sprint?: string;
  /** 关联标签 ID 列表 */
  labels?: string[];
  /** 参与人用户 ID 列表 */
  participants?: string[];
  /** 抄送人用户 ID 列表 */
  trackers?: string[];
  /** 验证人用户 ID */
  verifier?: string;
  /** 关联版本 ID 列表 */
  versions?: string[];
  /**
   * 自定义字段值，格式：{"fieldId": "value"}
   * 多值用逗号隔开：{"fieldId": "value1,value2"}
   */
  customFieldValues?: Record<string, string>;
}

/** createWorkitem 返回结果 */
export interface CreateWorkitemResult {
  /** 新建工作项 ID */
  id: string;
}

/** updateWorkitem 请求参数 */
export interface UpdateWorkitemParams {
  /** 组织 ID */
  organizationId: string;
  /** 工作项 ID */
  id: string;
  /**
   * 要更新的字段，格式：{"fieldId": "value"} 或多值 {"fieldId": ["v1", "v2"]}
   * 常见字段：subject（标题）、status（状态 ID）、assignedTo（负责人 ID）、priority（优先级 ID）
   */
  fields: Record<string, unknown>;
}
