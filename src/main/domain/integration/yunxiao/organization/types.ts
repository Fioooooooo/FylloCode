/** 组织信息 */
export interface Organization {
  /** 组织 ID */
  id: string;
  /** 组织名称 */
  name: string;
  /** 组织描述 */
  description: string;
  /** 组织创建者用户 ID */
  creatorId: string;
  /** 默认角色 ID */
  defaultRole: string;
  /** 创建时间，ISO 8601 格式 */
  createdAt: string;
  /** 更新时间，ISO 8601 格式 */
  updateAt: string;
}

/** 当前令牌对应的用户信息 */
export interface YunxiaoUser {
  /** 用户 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** 昵称 */
  nickName: string;
  /** 登录账号名 */
  username: string;
  /** 邮箱 */
  email: string;
  /** 工号 */
  staffId: string;
  /** 上次登录的组织 ID */
  lastOrganization: string;
  /** 所属部门 ID 列表 */
  sysDeptIds: string[];
  /** 创建时间，ISO 8601 格式 */
  createdAt: string;
  /** 删除时间，ISO 8601 格式 */
  deletedAt: string;
}

/** listOrganizations 查询参数 */
export interface ListOrganizationsOptions {
  /**
   * 用户 ID。
   * 标准版：此参数无效，始终返回令牌用户加入的组织列表；
   * 专属版：为空返回所有组织，不为空返回该用户加入的组织。
   */
  userId?: string;
}
